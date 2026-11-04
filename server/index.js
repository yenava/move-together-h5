import express from "express";
import { DatabaseSync } from "node:sqlite";
import {
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TRACKS,
  shanghaiDate,
  validateRecord,
  scoreFor,
  buildBoards,
  withCombinedBoards,
  csvCell,
} from "./rules.js";
import { recognizeScreenshot } from "./ocr.js";
import { evidenceStore } from "./evidence.js";
import { migrateProjectTeams } from "./project-teams.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, "data"));
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "activity.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, slogan TEXT, color TEXT, captain_id TEXT, demo INTEGER DEFAULT 0, created INTEGER);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, team_id TEXT REFERENCES teams(id), demo INTEGER DEFAULT 0, created INTEGER);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS enrollments_v2 (user_id TEXT REFERENCES users(id), date TEXT, track TEXT, created INTEGER, PRIMARY KEY(user_id,date,track));
CREATE TABLE IF NOT EXISTS entries_v2 (user_id TEXT REFERENCES users(id), date TEXT, track TEXT, value REAL, morning REAL, evening REAL, updated INTEGER, PRIMARY KEY(user_id,date,track));
CREATE TABLE IF NOT EXISTS duels_v2 (id TEXT PRIMARY KEY,date TEXT,track TEXT,mode TEXT,challenger TEXT,target TEXT,created INTEGER);
CREATE TABLE IF NOT EXISTS activity_v2 (date TEXT PRIMARY KEY, paused INTEGER DEFAULT 0, final_id TEXT);
CREATE TABLE IF NOT EXISTS reports_v2 (id TEXT PRIMARY KEY,date TEXT,title TEXT,kind TEXT,created INTEGER,payload TEXT);
CREATE TABLE IF NOT EXISTS admin_sessions_v2 (token TEXT PRIMARY KEY,expires INTEGER);
`);
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "mode")) {
  db.exec("ALTER TABLE users ADD COLUMN mode TEXT NOT NULL DEFAULT 'personal'");
  db.exec("UPDATE users SET mode='team' WHERE team_id IS NOT NULL");
}
const timeLimited = process.env.ACTIVITY_TIME_LIMITS !== "false";
const date = process.env.ACTIVITY_DATE || "2026-11-01";
const evidence = evidenceStore(db, dataDir, date);
const startTime = process.env.ACTIVITY_OPEN || "08:00",
  endTime = process.env.ACTIVITY_CLOSE || "18:00";
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
  !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
  !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
  startTime >= endTime ||
  !Number.isFinite(Date.parse(`${date}T${startTime}:00+08:00`))
)
  throw new Error("活动日期或起止时间无效");
const opens = Date.parse(`${date}T${startTime}:00+08:00`),
  closes = Date.parse(`${date}T${endTime}:00+08:00`);
db.prepare("INSERT OR IGNORE INTO activity_v2(date) VALUES (?)").run(date);
const secretFile = path.join(dataDir, "admin-key.txt");
let adminKey = process.env.ADMIN_KEY;
if (!adminKey) {
  if (!existsSync(secretFile))
    writeFileSync(secretFile, randomBytes(18).toString("base64url"), {
      mode: 0o600,
    });
  adminKey = readFileSync(secretFile, "utf8").trim();
}
if (adminKey.length < 8) throw new Error("ADMIN_KEY 至少需要 8 个字符");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const colors = ["sage", "orange", "blue", "purple", "gold"];
const demo =
  process.env.SEED_DEMO === "true" ||
  (process.env.NODE_ENV !== "production" && process.env.SEED_DEMO !== "false");
if (demo && !db.prepare("SELECT id FROM users LIMIT 1").get()) {
  for (let i = 0; i < 3; i++)
    db.prepare("INSERT INTO teams VALUES (?,?,?,?,?,?,?)").run(
      `team-${i + 1}`,
      ["追风者联盟", "元气满满队", "快乐多巴胺"][i],
      [
        "步履不停，热爱不止",
        "让健康成为今天的主角",
        "一个人走得快，一群人走得远",
      ][i],
      colors[i],
      `demo-${i * 5 + 1}`,
      1,
      Date.now() + i,
    );
  [
    "陈一鸣",
    "林晓",
    "王子涵",
    "周予安",
    "赵晨",
    "李佳宁",
    "张亦然",
    "许知远",
    "孙悦",
    "吴思雨",
    "刘星辰",
    "苏小满",
    "郑远",
  ].forEach((name, i) =>
    db
      .prepare("INSERT INTO users (id,name,color,team_id,demo,created,mode) VALUES (?,?,?,?,?,?,?)")
      .run(
        `demo-${i + 1}`,
        name,
        colors[i % 5],
        `team-${Math.floor(i / 5) + 1}`,
        1,
        Date.now() + i,
        "team",
      ),
  );
}
// Only demo participants receive sample entries. Existing real users choose their tracks afresh.
if (demo)
  for (const [i, u] of db
    .prepare("SELECT * FROM users WHERE demo=1 ORDER BY created")
    .all()
    .entries()) {
    for (const track of TRACKS.filter((t, j) => j === 0 || (i + j) % 3 !== 0)) {
      if (
        db
          .prepare(
            "SELECT 1 FROM enrollments_v2 WHERE user_id=? AND date=? AND track=?",
          )
          .get(u.id, date, track.id)
      )
        continue;
      db.prepare("INSERT INTO enrollments_v2 VALUES (?,?,?,?)").run(
        u.id,
        date,
        track.id,
        u.created,
      );
      const value =
        track.id === "steps"
          ? 15680 - i * 493
          : track.id === "water"
            ? Math.max(2, 9 - (i % 7))
            : track.id === "smoke"
              ? Math.max(1, 9 - (i % 6))
              : null;
      const morning = track.weight ? 120 + i * 2 : null;
      const evening =
        track.id === "loss"
          ? morning - (i % 5) * 0.3
          : track.id === "gain"
            ? morning + (i % 4) * 0.2
            : null;
      db.prepare("INSERT INTO entries_v2 VALUES (?,?,?,?,?,?,?)").run(
        u.id,
        date,
        track.id,
        value,
        morning,
        evening,
        Date.now(),
      );
    }
  }
migrateProjectTeams(db, date, TRACKS);
const app = express();
app.disable("x-powered-by");
app.use(["/api/recognize", "/api/evidence", "/api/water/checkins"], express.json({ limit: "6mb" }));
app.use(express.json({ limit: "16kb" }));
const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const clean = (v) =>
  typeof v === "string" ? v.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
const cookiePath = process.env.COOKIE_PATH || "/";
if (!/^\/[A-Za-z0-9/_-]*$/.test(cookiePath))
  throw new Error("COOKIE_PATH 必须为合法的站内路径");
const cookie = (req, name) =>
  req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1);
const setCookie = (res, name, token, maxAge) =>
  res.setHeader(
    "Set-Cookie",
    `${name}=${token}; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`,
  );
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (
    req.method !== "GET" &&
    (!req.body || Array.isArray(req.body) || typeof req.body !== "object")
  )
    return next(Object.assign(new Error("请求内容无效"), { status: 400 }));
  if (req.method !== "GET" && req.get("X-Requested-With") !== "MoveTogether")
    return next(Object.assign(new Error("请从活动页面操作"), { status: 403 }));
  const raw = cookie(req, "move_session");
  if (raw) {
    const session = db
      .prepare("SELECT user_id FROM sessions WHERE token=? AND expires>?")
      .get(hash(raw), Date.now());
    if (session)
      req.user = db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(session.user_id);
  }
  const admin = cookie(req, "move_admin");
  req.admin = !!(
    admin &&
    db
      .prepare("SELECT 1 FROM admin_sessions_v2 WHERE token=? AND expires>?")
      .get(hash(admin), Date.now())
  );
  ensureFinal();
  next();
});
const user = (req, res, next) =>
  req.user
    ? next()
    : next(
        Object.assign(new Error("先填昵称，选择想参加的项目吧"), {
          status: 401,
        }),
      );
const admin = (req, res, next) =>
  req.admin
    ? next()
    : next(Object.assign(new Error("请先输入管理口令"), { status: 401 }));
const control = () =>
  db.prepare("SELECT * FROM activity_v2 WHERE date=?").get(date);
function activity() {
  const c = control();
  return {
    name: "会议健康运动挑战",
    date,
    startTime,
    endTime,
    opens,
    closes,
    timeLimited,
    today: shanghaiDate(),
    status: c.final_id
      ? "final"
      : c.paused
        ? "paused"
        : timeLimited && Date.now() < opens
          ? "upcoming"
          : "active",
    finalId: c.final_id,
    serverNow: Date.now(),
  };
}
function openRoster() {
  const c = control();
  if (c.final_id) fail("已最终结榜，报名和队伍已锁定");
  if (c.paused) fail("活动暂时停表，请等待管理员恢复");
}
function writable() {
  openRoster();
  if (timeLimited && Date.now() < opens)
    fail(`打卡将于 ${date} ${startTime} 开放，先报名集结吧`);
}
function selected(value, allowEmpty = false) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && !value.length) ||
    value.length > 5 ||
    value.some((t) => !TRACKS.some((x) => x.id === t)) ||
    new Set(value).size !== value.length
  )
    fail("请至少选择一个有效项目");
  return value;
}
function rawData() {
  const memberships = db.prepare("SELECT * FROM team_members_v4 WHERE date=?").all(date);
  return {
    users: db.prepare("SELECT * FROM users ORDER BY created").all().map(u => ({...u,
      team_ids: Object.fromEntries(memberships.filter(m=>m.user_id===u.id).map(m=>[m.track,m.team_id]))})),
    teams: db.prepare("SELECT * FROM project_teams_v4 WHERE date=? ORDER BY created").all(date),
    enrollments: db.prepare("SELECT * FROM enrollments_v2 WHERE date=?").all(date),
    records: db.prepare("SELECT * FROM entries_v2 WHERE date=?").all(date),
  };
}
function livePayload() {
  const d = rawData(),
    boards = buildBoards(d.users, d.teams, d.enrollments, d.records,
      db.prepare("SELECT DISTINCT user_id,track FROM evidence_v3 WHERE date=?").all(date));
  return {
    activity: activity(),
    tracks: TRACKS,
    boards,
    stats: {
      participants: d.users.length,
      teams: d.teams.length,
      checkins: d.records.length,
    },
    demo: d.users.some((u) => u.demo === 1),
  };
}
function reportList() {
  return db
    .prepare(
      "SELECT id,title,kind,created FROM reports_v2 WHERE date=? ORDER BY created DESC",
    )
    .all(date);
}
function saveReport(kind, title) {
  const id = randomUUID();
  const payload = livePayload();
  db.prepare("INSERT INTO reports_v2 VALUES (?,?,?,?,?,?)").run(
    id,
    date,
    title,
    kind,
    Date.now(),
    JSON.stringify(payload),
  );
  return id;
}
function finalReport(title = "晚宴最终榜") {
  const c = control();
  if (c.final_id) return c.final_id;
  db.exec("BEGIN IMMEDIATE");
  try {
    const id = saveReport("final", title);
    db.prepare("UPDATE activity_v2 SET final_id=?,paused=0 WHERE date=?").run(
      id,
      date,
    );
    db.exec("COMMIT");
    return id;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function ensureFinal() {
  if (timeLimited && Date.now() >= closes && !control().final_id)
    finalReport("晚宴最终榜 · 截止结算");
}
function state(req) {
  const d = rawData(),
    live = livePayload();
  const me = req.user ? d.users.find((u) => u.id === req.user.id) : null;
  const users = d.users.map((u) => ({
    id: u.id,
    name: u.name,
    color: u.color,
    team_ids: u.team_ids,
    demo: u.demo,
    tracks: d.enrollments.filter((e) => e.user_id === u.id).map((e) => e.track),
  }));
  const teams = d.teams.map((t) => ({
    ...t,
    members: users.filter((u) => u.team_ids[t.track] === t.id),
  }));
  return {
    ...live,
    me: me
      ? {
          ...users.find((u) => u.id === me.id),
          records: d.records.filter((r) => r.user_id === me.id),
          evidence: evidence.list(me.id),
        }
      : null,
    users,
    teams,
    reports: reportList(),
    admin: !!req.admin,
  };
}
app.get("/api/state", (req, res) => res.json(state(req)));
app.post("/api/register", (req, res) => {
  openRoster();
  if (req.user) fail("已经报名，可直接增加项目");
  const name = clean(req.body.name);
  const tracks = selected(req.body.tracks ?? [], true);
  if (name.length < 1 || name.length > 16 || /[<>\x00-\x1f]/.test(name))
    fail("昵称请填 1–16 个字符");
  if (req.body.teamId || req.body.newTeam) fail("请先填写昵称，再选择项目战队");
  const id = randomUUID(),
    token = randomBytes(32).toString("hex");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO users (id,name,color,team_id,demo,created,mode) VALUES (?,?,?,?,?,?,?)").run(
      id, name, colors[Math.floor(Math.random() * colors.length)], null, 0, Date.now(), "personal",
    );
    for (const track of tracks)
      db.prepare("INSERT INTO enrollments_v2 VALUES (?,?,?,?)").run(
        id,
        date,
        track,
        Date.now(),
      );
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
      hash(token),
      id,
      Date.now() + 30 * 86400000,
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  setCookie(res, "move_session", token, 30 * 86400);
  req.user = { id };
  res.json(state(req));
});
app.post("/api/enrollments", user, (req, res) => {
  openRoster();
  const tracks = selected(req.body.tracks);
  for (const track of tracks)
    db.prepare("INSERT OR IGNORE INTO enrollments_v2 VALUES (?,?,?,?)").run(
      req.user.id,
      date,
      track,
      Date.now(),
    );
  res.json(state(req));
});
app.post("/api/records", user, (req, res) => {
  writable();
  const { track } = req.body;
  if (
    typeof track !== "string" ||
    !db
      .prepare(
        "SELECT 1 FROM enrollments_v2 WHERE user_id=? AND date=? AND track=?",
      )
      .get(req.user.id, date, track)
  )
    fail("请先报名这个项目");
  let r;
  if (track === "water") fail("喝水挑战请使用水印相机拍照打卡，每次计 1 杯");
  try {
    r = validateRecord(track, req.body);
  } catch (e) {
    fail(e.message);
  }
  db.prepare(
    "INSERT INTO entries_v2 VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,date,track) DO UPDATE SET value=excluded.value,morning=excluded.morning,evening=excluded.evening,updated=excluded.updated",
  ).run(req.user.id, date, track, r.value, r.morning, r.evening, Date.now());
  res.json(state(req));
});
function requireEnrollment(userId, track) {
  if (!TRACKS.some((t) => t.id === track) || !db.prepare(
    "SELECT 1 FROM enrollments_v2 WHERE user_id=? AND date=? AND track=?",
  ).get(userId, date, track)) fail("请先报名这个项目");
}
app.post("/api/evidence", user, (req, res) => {
  writable();
  const { track, slot, image } = req.body;
  requireEnrollment(req.user.id, track);
  if (track === "water") fail("请使用水印相机完成喝水打卡");
  const weight = TRACKS.find((t) => t.id === track).weight;
  if (weight && !["morning", "evening"].includes(slot)) fail("请选择早称或晚称凭证");
  const row = evidence.save({ userId: req.user.id, track, slot: weight ? slot : null, image });
  res.json({ evidence: evidence.metadata(row) });
});
app.get("/api/evidence/:id", (req, res) => {
  if (!req.user && !req.admin) fail("请先报名或进入管理页查看凭证", 401);
  const row = evidence.get(req.params.id);
  if (!row || (!req.admin && row.user_id !== req.user?.id)) fail("凭证不存在", 404);
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Type", row.mime);
  res.set("Content-Disposition", `${req.query.download === "1" ? "attachment" : "inline"}; filename="${row.track}-${row.id}.${row.filename.split(".").at(-1)}"`);
  res.sendFile(path.join(evidence.directory, row.filename), { cacheControl: false });
});
app.post("/api/water/checkins", user, (req, res) => {
  requireEnrollment(req.user.id, "water");
  const { image, clientId, capturedAt } = req.body;
  if (typeof clientId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(clientId)) fail("照片标识无效，请重新拍摄");
  // A retry of a committed photo must never add another cup, even after a pause.
  if (evidence.byClient(req.user.id, clientId)) return res.json(state(req));
  writable();
  if (!Number.isSafeInteger(capturedAt) || Math.abs(capturedAt - Date.now()) > 24 * 3600 * 1000)
    fail("拍摄时间无效，请重新拍摄");
  const previous = db.prepare("SELECT value FROM entries_v2 WHERE user_id=? AND date=? AND track='water'").get(req.user.id, date);
  const value = (previous?.value || 0) + 1;
  if (value > TRACKS.find((t) => t.id === "water").max) fail("今日杯数已达上限，请按自身需要适量饮水");
  let saved;
  db.exec("BEGIN IMMEDIATE");
  try {
    saved = evidence.save({ userId: req.user.id, track: "water", kind: "water", image, capturedAt, clientId });
    db.prepare("INSERT INTO entries_v2 VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,date,track) DO UPDATE SET value=excluded.value,updated=excluded.updated")
      .run(req.user.id, date, "water", value, null, null, Date.now());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    if (saved) evidence.discard(saved);
    throw error;
  }
  res.json(state(req));
});
const ocrLimits = new Map();
const ocrBusy = new Set();
app.post("/api/recognize", user, async (req, res) => {
  writable();
  const { track } = req.body;
  if (track === "water") fail("喝水挑战使用水印拍照，不需要截图识别");
  if (
    typeof track !== "string" ||
    !db
      .prepare(
        "SELECT 1 FROM enrollments_v2 WHERE user_id=? AND date=? AND track=?",
      )
      .get(req.user.id, date, track)
  )
    fail("请先报名这个项目");
  if (ocrBusy.has(req.user.id)) fail("上一张截图正在识别，请稍候", 429);
  const now = Date.now(),
    attempt = ocrLimits.get(req.user.id);
  if (attempt && now < attempt.until && attempt.count >= 8)
    fail("识别次数较多，请一分钟后重试或手动填写", 429);
  if (ocrLimits.size > 2000)
    for (const [id, entry] of ocrLimits)
      if (entry.until < now) ocrLimits.delete(id);
  ocrLimits.set(req.user.id, {
    until: attempt && now < attempt.until ? attempt.until : now + 60000,
    count: attempt && now < attempt.until ? attempt.count + 1 : 1,
  });
  ocrBusy.add(req.user.id);
  try {
    let row;
    if (req.body.evidenceId) {
      row = evidence.get(req.body.evidenceId);
      if (!row || row.user_id !== req.user.id || row.track !== track || row.slot !== (TRACKS.find((t) => t.id === track).weight ? req.body.slot : null))
        fail("截图凭证与当前项目不一致");
    } else {
      const weight = TRACKS.find((t) => t.id === track).weight;
      if (weight && !["morning", "evening"].includes(req.body.slot)) fail("请选择早称或晚称");
      row = evidence.save({ userId: req.user.id, track, slot: weight ? req.body.slot : null, image: req.body.image });
    }
    res.json(await recognizeScreenshot({ track, slot: req.body.slot, image: evidence.image(row) }));
  } finally {
    ocrBusy.delete(req.user.id);
  }
});
function validateTeam(name, slogan, track) {
  if (name.length < 2 || name.length > 12 || /[<>\x00-\x1f]/.test(name)) fail("队名请填 2–12 个字符");
  if (slogan.length > 30) fail("宣言最多 30 字");
  if (db.prepare("SELECT id FROM project_teams_v4 WHERE date=? AND track=? AND name=?").get(date,track,name))
    fail("本项目已有同名战队，换个名字吧");
}
function addMember(team, userId) {
  if (db.prepare("SELECT 1 FROM team_members_v4 WHERE user_id=? AND date=? AND track=?").get(userId,date,team.track))
    fail("你已加入本项目的战队");
  if (db.prepare("SELECT count(*) n FROM team_members_v4 WHERE team_id=?").get(team.id).n >= 5)
    fail("这支队伍已满，请选择本项目其他战队");
  db.prepare("INSERT OR IGNORE INTO enrollments_v2 VALUES (?,?,?,?)").run(userId,date,team.track,Date.now());
  db.prepare("INSERT INTO team_members_v4 VALUES (?,?,?,?,?)").run(team.id,userId,date,team.track,Date.now());
}
app.post("/api/teams", user, (req, res) => {
  openRoster();
  const track = selected([req.body.track])[0], name = clean(req.body.name), slogan = clean(req.body.slogan);
  db.exec("BEGIN IMMEDIATE");
  try {
    validateTeam(name, slogan, track);
    const id = randomUUID();
    db.prepare("INSERT INTO project_teams_v4 VALUES (?,?,?,?,?,?,?,?,?,?)").run(
      id,date,track,name,slogan || "一起把健康变成今天的小成就",
      colors[Math.floor(Math.random()*colors.length)],req.user.id,0,Date.now(),null);
    addMember({id,track},req.user.id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json(state(req));
});
app.post("/api/teams/:id/join", user, (req, res) => {
  openRoster();
  db.exec("BEGIN IMMEDIATE");
  try {
    const team = db.prepare("SELECT * FROM project_teams_v4 WHERE id=? AND date=?").get(req.params.id,date);
    if (!team) fail("队伍不存在或不属于本次活动");
    if (req.body.track && req.body.track !== team.track) fail("队伍与所选项目不一致");
    addMember(team,req.user.id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json(state(req));
});
const attempts = new Map();
app.post("/api/admin/login", (req, res) => {
  const ip = req.socket.remoteAddress,
    now = Date.now();
  const attempt = attempts.get(ip) || { n: 0, until: now + 60000 };
  if (now > attempt.until) {
    attempt.n = 0;
    attempt.until = now + 60000;
  }
  attempts.set(ip, attempt);
  if (attempt.n >= 10) fail("尝试过于频繁，请一分钟后重试", 429);
  const input = typeof req.body.key === "string" ? req.body.key : "";
  if (!timingSafeEqual(Buffer.from(hash(input)), Buffer.from(hash(adminKey)))) {
    attempt.n++;
    fail("管理口令不正确", 401);
  }
  attempts.delete(ip);
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO admin_sessions_v2 VALUES (?,?)").run(
    hash(token),
    now + 12 * 3600000,
  );
  setCookie(res, "move_admin", token, 12 * 3600);
  req.admin = true;
  res.json(state(req));
});
app.post("/api/admin/logout", admin, (req, res) => {
  db.prepare("DELETE FROM admin_sessions_v2 WHERE token=?").run(
    hash(cookie(req, "move_admin")),
  );
  setCookie(res, "move_admin", "", 0);
  res.json({ ok: true });
});
app.get("/api/admin/data", admin, (req, res) => {
  const d = rawData();
  res.json({
    ...state(req),
    participants: d.users
      .filter((u) => d.enrollments.some((e) => e.user_id === u.id))
      .map((u) => ({
        ...u,
        tracks: d.enrollments
          .filter((e) => e.user_id === u.id)
          .map((e) => e.track),
        records: d.records.filter((r) => r.user_id === u.id),
        evidence: evidence.list(u.id),
      })),
  });
});
app.post("/api/admin/pause", admin, (req, res) => {
  if (control().final_id) fail("已经最终结榜");
  if (typeof req.body.paused !== "boolean") fail("状态无效");
  db.prepare("UPDATE activity_v2 SET paused=? WHERE date=?").run(
    req.body.paused ? 1 : 0,
    date,
  );
  res.json(state(req));
});
app.post("/api/admin/reports", admin, (req, res) => {
  if (control().final_id) fail("已经最终结榜，请使用最终榜");
  const title = clean(req.body.title) || "阶段战报";
  if (title.length > 30) fail("战报标题最多 30 字");
  if (req.body.pause === true)
    db.prepare("UPDATE activity_v2 SET paused=1 WHERE date=?").run(date);
  const id = saveReport("stage", title);
  res.json({ ...state(req), reportId: id });
});
app.post("/api/admin/finalize", admin, (req, res) => {
  const id = finalReport();
  res.json({ ...state(req), reportId: id });
});
app.get("/api/reports/:id", (req, res) => {
  const r = db
    .prepare("SELECT * FROM reports_v2 WHERE id=? AND date=?")
    .get(req.params.id, date);
  if (!r) fail("战报不存在", 404);
  res.json({
    id: r.id,
    title: r.title,
    kind: r.kind,
    created: r.created,
    ...withCombinedBoards(JSON.parse(r.payload)),
  });
});
app.get("/api/admin/export", admin, (req, res) => {
  const id = req.query.report;
  let payload, title, created;
  if (id) {
    const r = db
      .prepare("SELECT * FROM reports_v2 WHERE id=? AND date=?")
      .get(id, date);
    if (!r) fail("战报不存在", 404);
    payload = withCombinedBoards(JSON.parse(r.payload));
    title = r.title;
    created = r.created;
  } else {
    payload = livePayload();
    title = "实时战报";
    created = Date.now();
  }
  const lines = [
    [
      "战报",
      title,
      "北京时间",
      new Date(created).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
    ],
    [
      "赛道",
      "类型",
      "排名",
      "昵称/队名",
      "成绩",
      "单位",
      "赛道人数",
      "完成打卡人数",
      "数据类型",
    ],
  ];
  for (const t of TRACKS)
    for (const type of ["combined", "personal", "team"])
      for (const row of payload.boards[t.id][type])
        lines.push([
          t.name,
          (type === "combined" ? "综合·" : "") + (type === "team" || row.kind === "team" ? "团队人均" : "个人"),
          row.rank,
          row.name,
          row.score,
          t.unit,
          type === "team" || row.kind === "team" ? row.count : 1,
          type === "team" || row.kind === "team" ? row.checked : row.checked ? 1 : 0,
          row.demo ? "演示" : "真实",
        ]);
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set(
    "Content-Disposition",
    `attachment; filename="move-report-${date}.csv"`,
  );
  res.send(
    "\uFEFF" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n"),
  );
});
app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
}
app.use((err, req, res, next) => {
  if (!err.status) console.error("Unexpected API error:", err.name);
  res.status(err.status || 500).json({
    error:
      !err.status || (err.status >= 500 && ![502, 503].includes(err.status))
        ? "服务暂时不可用"
        : err.status === 413
          ? "图片过大，请选择较小的截图"
          : err.message || "请求无效",
  });
});
const timer = setInterval(ensureFinal, 15000);
timer.unref();
ensureFinal();
const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || "0.0.0.0", () =>
  console.log(
    `Move Together API listening on http://localhost:${server.address().port}\nAdmin access: configure ADMIN_KEY or read ${secretFile}`,
  ),
);
