import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { shanghaiDate } from "./rules.js";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDQAAAABJRU5ErkJggg==";
const waterPhoto = () => ({ image: png, clientId: randomUUID(), capturedAt: Date.now() });
async function fixture(t, initial = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "move-day-test-"));
  let child, origin;
  async function stop() {
    if (child?.exitCode === null && !child.killed) {
      const done = once(child, "exit");
      child.kill("SIGTERM");
      await done;
    }
  }
  async function start(overrides = {}) {
    child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        DATA_DIR: dir,
        PORT: "0",
        SEED_DEMO: "false",
        ADMIN_KEY: "isolated-test-admin",
        DEEPSEEK_API_KEY: "",
        ACTIVITY_DATE: shanghaiDate(),
        ACTIVITY_OPEN: "00:00",
        ACTIVITY_CLOSE: "23:59",
        ACTIVITY_TIME_LIMITS: "true",
        ...initial,
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("startup timeout")),
        10000,
      );
      child.stdout.on("data", (b) => {
        const m = String(b).match(/http:\/\/localhost:\d+/);
        if (m) {
          clearTimeout(timer);
          resolve(m[0]);
        }
      });
      child.once("error", reject);
      child.once("exit", (c) => {
        clearTimeout(timer);
        reject(new Error("server exited " + c));
      });
    });
  }
  t.after(async () => {
    await stop();
    await rm(dir, { recursive: true, force: true });
  });
  await start();
  async function request(route, body, cookie = "", header = true) {
    const r = await fetch(origin + "/api" + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(header ? { "X-Requested-With": "MoveTogether" } : {}),
        Cookie: cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const bytes = Buffer.from(await r.arrayBuffer());
    const raw = bytes.toString("utf8");
    return {
      status: r.status,
      bytes,
      headers: r.headers,
      data: r.headers.get("content-type")?.includes("json")
        ? JSON.parse(raw)
        : raw,
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  async function register(name, tracks = ["steps"], teamId) {
    const r = await request("/register", { name, tracks, teamId });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return { id: r.data.me.id, cookie: r.cookie };
  }
  return { request, register, stop, start, dir };
}
test("one-day multi-track registration, teams, admin reports and durable final lock", async (t) => {
  const f = await fixture(t),
    { request: r, register } = f;
  assert.equal((await r("/state")).data.users.length, 0);
  assert.equal((await r("/admin/data")).status, 401);
  assert.equal(
    (await r("/register", { name: "A", tracks: ["steps"] }, "", false)).status,
    403,
  );
  assert.equal((await r("/register", { name: "A", tracks: ["invalid"] })).status, 400);
  assert.equal((await r("/register", null)).status, 400);
  const a = await register("甲", ["steps", "loss", "gain", "water"]),
    b = await register("乙", ["steps", "water"]),
    c = await register("丙", ["steps"]);
  assert.equal(
    (await r("/records", { track: "water", value: 5 }, c.cookie)).status,
    400,
  );
  assert.equal(
    (await r("/records", { track: "steps", value: "8000" }, a.cookie)).status,
    400,
  );
  let x = await r("/records", { track: "steps", value: 8000 }, a.cookie);
  assert.equal(x.data.boards.steps.personal[0].score, 8000);
  x = await r("/records", { track: "steps", value: 9000 }, a.cookie);
  assert.equal(x.data.me.records.length, 1);
  assert.equal(x.data.boards.steps.personal[0].score, 9000);
  await r("/records", { track: "loss", morning: 120, evening: 122 }, a.cookie);
  await r(
    "/records",
    { track: "gain", morning: 120, evening: 118.5 },
    a.cookie,
  );
  for (let i = 0; i < 7; i++) assert.equal((await r("/water/checkins", waterPhoto(), a.cookie)).status, 200);
  x = await r("/state", undefined, a.cookie);
  assert.equal(x.data.boards.loss.personal[0].score, 2);
  assert.equal(x.data.boards.gain.personal[0].score, 1.5);
  assert.equal(x.data.me.records.length, 4);
  const publicState = (await r("/state")).data;
  assert.equal(JSON.stringify(publicState).includes("morning"), false);
  assert.equal(publicState.me, null);
  assert.equal(
    (
      await r(
        "/recognize",
        { track: "steps", image: "https://example.com/x.png" },
        a.cookie,
      )
    ).status,
    400,
  );
  assert.equal((await r("/challenges", { track: "steps", mode: "personal", target: b.id }, a.cookie)).status, 404);
  assert.equal("challenges" in publicState, false);
  x = await r("/teams", { name: "甲队", track:"steps" }, a.cookie);
  const teamA = x.data.me.team_ids.steps;
  x = await r("/teams", { name: "乙队", track:"steps" }, b.cookie);
  const teamB = x.data.me.team_ids.steps;
  assert.equal((await r(`/teams/${teamA}/join`, {}, c.cookie)).status, 200);
  x = await r("/state");
  assert.equal(
    x.data.boards.steps.team.find((t) => t.id === teamA).score,
    4500,
  );
  assert.equal(x.data.boards.water.team.length, 0);
  const others = [];
  for (let i = 0; i < 4; i++) others.push(await register("队员" + i));
  const joins = await Promise.all(
    others.map((u) => r(`/teams/${teamA}/join`, {}, u.cookie)),
  );
  assert.equal(joins.filter((x) => x.status === 200).length, 3);
  assert.equal(joins.filter((x) => x.status === 400).length, 1);
  assert.equal((await r("/admin/login", { key: "wrong" })).status, 401);
  x = await r("/admin/login", { key: "isolated-test-admin" });
  assert.equal(x.data.admin, true);
  const admin = x.cookie;
  assert.equal(
    (await r("/admin/data", undefined, admin)).data.participants
      .find((u) => u.id === a.id)
      .records.find((e) => e.track === "loss").morning,
    120,
  );
  x = await r("/admin/reports", { title: "中午战报", pause: true }, admin);
  const reportId = x.data.reportId;
  assert.equal(x.data.activity.status, "paused");
  const snapshot = (await r("/reports/" + reportId)).data;
  assert.equal(
    (await r("/records", { track: "steps", value: 10000 }, a.cookie)).status,
    400,
  );
  assert.equal(
    (await r("/register", { name: "暂停报名", tracks: ["steps"] })).status,
    400,
  );
  await r("/admin/pause", { paused: false }, admin);
  await r("/records", { track: "steps", value: 12000 }, a.cookie);
  assert.deepEqual(
    (await r("/reports/" + reportId)).data.boards,
    snapshot.boards,
  );
  const csv = (await r("/admin/export?report=" + reportId, undefined, admin))
    .data;
  assert.match(csv, /中午战报/);
  assert.match(csv, /9000/);
  assert.doesNotMatch(csv, /12000/);
  assert.match(csv, /团队人均/);
  assert.equal((await r("/admin/export?report=" + reportId)).status, 401);
  await f.stop();
  await f.start();
  assert.equal((await r("/state", undefined, a.cookie)).data.me.id, a.id);
  assert.equal(
    (await r("/reports/" + reportId)).data.boards.steps.personal[0].score,
    9000,
  );
  x = await r("/admin/finalize", {}, admin);
  assert.equal(x.status, 200);
  const finalId = x.data.reportId;
  assert.equal(x.data.activity.status, "final");
  assert.equal((await r("/admin/finalize", {}, admin)).data.reportId, finalId);
  for (const [route, body, cookie] of [
    ["/records", { track: "water", value: 8 }, a.cookie],
    ["/enrollments", { tracks: ["smoke"] }, a.cookie],
    ["/teams", { name: "结榜队" }, others[3].cookie],
    ["/register", { name: "晚到", tracks: ["steps"] }, ""],
    ["/admin/pause", { paused: false }, admin],
  ])
    assert.equal((await r(route, body, cookie)).status, 400, route);
  await f.stop();
  await f.start();
  assert.equal((await r("/state")).data.activity.finalId, finalId);
  assert.equal(
    (await r("/reports/" + finalId)).data.boards.steps.personal[0].score,
    12000,
  );
  await r("/admin/logout", {}, admin);
  assert.equal((await r("/admin/data", undefined, admin)).status, 401);
});
test("cutoff generates final snapshot even without admin interaction", async (t) => {
  const { request: r } = await fixture(t, { ACTIVITY_DATE: "2020-01-01" });
  const x = await r("/state");
  assert.equal(x.data.activity.status, "final");
  assert.equal(x.data.reports.length, 1);
  assert.equal(
    (await r("/reports/" + x.data.activity.finalId)).data.kind,
    "final",
  );
  assert.equal(
    (await r("/register", { name: "晚到", tracks: ["steps"] })).status,
    400,
  );
});
test("before start permits enrollment and refuses checkins; admin login throttled", async (t) => {
  const { request: r, register } = await fixture(t, {
    ACTIVITY_DATE: "2099-01-01",
  });
  const a = await register("提前报名", ["water"]);
  assert.equal((await r("/state")).data.activity.status, "upcoming");
  assert.equal(
    (await r("/records", { track: "water", value: 4 }, a.cookie)).status,
    400,
  );
  for (let i = 0; i < 10; i++)
    assert.equal((await r("/admin/login", { key: "bad" })).status, 401);
  assert.equal(
    (await r("/admin/login", { key: "isolated-test-admin" })).status,
    429,
  );
});

test("nickname entry, project teams, atomic enrollment, independent memberships and persistence", async (t) => {
  const f = await fixture(t), r = f.request;
  const a=await f.register("队长",[]), b=await f.register("队员",[]);
  let x=await r("/state",undefined,a.cookie);
  assert.deepEqual(x.data.me.tracks,[]); assert.deepEqual(x.data.me.team_ids,{});
  assert.equal((await r("/teams",{name:"未选项目"},a.cookie)).status,400);
  x=await r("/teams",{name:"晨光小队",track:"steps"},a.cookie);
  assert.equal(x.status,200); const steps=x.data.me.team_ids.steps;
  assert.deepEqual(x.data.me.tracks,["steps"]);
  await r("/enrollments",{tracks:["steps"]},b.cookie);
  await r("/records",{track:"steps",value:8000},b.cookie);
  const image=await r("/evidence",{track:"steps",image:png},b.cookie);
  x=await r(`/teams/${steps}/join`,{},b.cookie);
  assert.equal(x.status,200); assert.equal(x.data.boards.steps.team[0].score,4000);
  assert.equal(x.data.me.evidence[0].id,image.data.evidence.id);
  assert.equal((await r(`/teams/${steps}/join`,{},b.cookie)).status,400);
  assert.equal((await r("/teams",{name:"不能重复",track:"steps"},b.cookie)).status,400);
  x=await r("/teams",{name:"晨光小队",track:"water"},b.cookie);
  assert.equal(x.status,200); const water=x.data.me.team_ids.water;
  assert.notEqual(water,steps); assert.equal(x.data.teams.length,2);
  assert.equal(x.data.boards.steps.team.length,1); assert.equal(x.data.boards.water.team.length,1);
  assert.equal((await r(`/teams/${water}/join`,{track:"steps"},a.cookie)).status,400);
  assert.equal((await r("/state",undefined,a.cookie)).data.me.tracks.includes("water"),false);
  x=await r(`/teams/${water}/join`,{track:"water"},a.cookie);
  assert.equal(x.status,200); assert.equal(x.data.boards.water.team[0].count,2);
  assert.equal(x.data.teams.find(t=>t.id===water).members.length,2);
  const absent=await f.register("空白",[]);
  assert.equal((await r("/teams/missing/join",{},absent.cookie)).status,400);
  assert.deepEqual((await r("/state",undefined,absent.cookie)).data.me.tracks,[]);
  const candidates=await Promise.all(Array.from({length:4},(_,i)=>f.register("候选"+i,[])));
  const joined=await Promise.all(candidates.map(u=>r(`/teams/${steps}/join`,{},u.cookie)));
  assert.equal(joined.filter(x=>x.status===200).length,3);
  const failed=candidates[joined.findIndex(x=>x.status===400)];
  assert.deepEqual((await r("/state",undefined,failed.cookie)).data.me.tracks,[]);
  const admin=(await r("/admin/login",{key:"isolated-test-admin"})).cookie;
  await r("/admin/pause",{paused:true},admin);
  assert.equal((await r(`/teams/${water}/join`,{},absent.cookie)).status,400);
  assert.equal((await r("/teams",{name:"暂停创建",track:"loss"},absent.cookie)).status,400);
  await r("/admin/pause",{paused:false},admin);
  await r("/admin/finalize",{},admin);
  assert.equal((await r(`/teams/${water}/join`,{},absent.cookie)).status,400);
  await f.stop(); await f.start();
  x=await r("/state",undefined,a.cookie);
  assert.deepEqual(x.data.me.team_ids,{steps,water});
  assert.equal(x.data.teams.length,2);
});
test("disabled time limits permit checkins before opening and after cutoff, manual controls still lock", async (t) => {
  const f=await fixture(t,{ACTIVITY_TIME_LIMITS:"false",ACTIVITY_DATE:"2099-01-01"}),r=f.request;
  const a=await f.register("验证",["steps"]);
  let x=await r("/records",{track:"steps",value:1234},a.cookie);
  assert.equal(x.status,200); assert.equal(x.data.activity.status,"active"); assert.equal(x.data.activity.timeLimited,false);
  await f.stop(); await f.start({ACTIVITY_DATE:"2020-01-01"});
  assert.equal((await r("/state")).data.reports.length,0);
  assert.equal((await r("/state")).data.activity.status,"active");
  await r("/enrollments",{tracks:["steps"]},a.cookie);
  assert.equal((await r("/records",{track:"steps",value:5678},a.cookie)).status,200);
  const admin=(await r("/admin/login",{key:"isolated-test-admin"})).cookie;
  await r("/admin/pause",{paused:true},admin);
  assert.equal((await r("/records",{track:"steps",value:6000},a.cookie)).status,400);
  await r("/admin/pause",{paused:false},admin);
  x=await r("/admin/finalize",{},admin); assert.equal(x.data.activity.status,"final");
  assert.equal((await r("/records",{track:"steps",value:6000},a.cookie)).status,400);
  await f.stop(); await f.start({ACTIVITY_DATE:"2020-01-01"});
  assert.equal((await r("/state")).data.activity.status,"final");
});

test("evidence survives OCR failure, record edits and restart; images remain owner/admin only", async (t) => {
  const f = await fixture(t), r = f.request;
  const a = await f.register("图片所有者", ["steps", "loss"]), b = await f.register("其他人", ["steps"]);
  const body = { track: "steps", image: png };
  assert.equal((await r("/evidence", body)).status, 401);
  assert.equal((await r("/evidence", { ...body, image: "data:image/png;base64,YWJj" }, a.cookie)).status, 400);
  assert.equal((await r("/evidence", { ...body, track: "smoke" }, a.cookie)).status, 400);
  assert.equal((await r("/evidence", { ...body, track: "loss", slot: "bad" }, a.cookie)).status, 400);
  let x = await r("/evidence", body, a.cookie);
  assert.equal(x.status, 200);
  const id = x.data.evidence.id;
  assert.equal("filename" in x.data.evidence, false);
  assert.equal((await r("/recognize", { track: "steps", evidenceId: id }, a.cookie)).status, 503);
  assert.equal((await r("/recognize", { track: "steps", evidenceId: id }, b.cookie)).status, 400);
  assert.equal((await r("/recognize", { track: "loss", slot: "morning", evidenceId: id }, a.cookie)).status, 400);
  assert.equal((await r("/evidence/" + id)).status, 401);
  assert.equal((await r("/evidence/" + id, undefined, b.cookie)).status, 404);
  x = await r("/evidence/" + id, undefined, a.cookie);
  assert.equal(x.status, 200);
  assert.deepEqual(x.bytes, Buffer.from(png.split(",")[1], "base64"));
  assert.equal(x.headers.get("cache-control"), "no-store");
  assert.equal(x.headers.get("x-content-type-options"), "nosniff");
  x = await r(`/evidence/${id}?download=1`, undefined, a.cookie);
  assert.match(x.headers.get("content-disposition"), /^attachment;/);
  await r("/records", { track: "steps", value: 777 }, a.cookie);
  await r("/records", { track: "steps", value: 888 }, a.cookie);
  assert.equal((await r("/state", undefined, a.cookie)).data.me.evidence.length, 1);
  const publicState = (await r("/state")).data;
  assert.equal(JSON.stringify(publicState).includes(id), false);
  assert.equal(publicState.boards.steps.personal.find(u => u.id === a.id).imageChecked, true);
  assert.equal(publicState.boards.steps.personal.find(u => u.id === b.id).imageChecked, false);
  assert.equal(publicState.boards.loss.personal[0].imageChecked, false);
  assert.equal(publicState.boards.steps.combined.find(u => u.id === a.id).kind, "personal");
  assert.equal(JSON.stringify((await r("/state", undefined, b.cookie)).data).includes(id), false);
  const admin = (await r("/admin/login", { key: "isolated-test-admin" })).cookie;
  assert.equal((await r("/evidence/" + id, undefined, admin)).status, 200);
  const users = (await r("/admin/data", undefined, admin)).data.participants;
  assert.equal(users.find(u => u.id === a.id).evidence[0].id, id);
  const report = (await r("/admin/reports", { title: "凭证不公开" }, admin)).data.reportId;
  assert.equal(JSON.stringify((await r("/reports/" + report)).data).includes(id), false);
  await r("/evidence", body, b.cookie);
  await r("/records", {track:"steps",value:999}, b.cookie);
  const frozen = (await r("/reports/" + report)).data;
  assert.equal(frozen.boards.steps.personal.find(u => u.id === b.id).imageChecked, false);
  assert.equal(frozen.boards.steps.combined.find(u => u.id === b.id).score, 0);
  const exported = await r("/admin/export?report=" + report, undefined, admin);
  assert.match(exported.data, /综合·个人/);
  assert.equal(exported.data.includes(id), false);
  // Old snapshots have no combined list; derive it exclusively from their frozen rows.
  await f.stop();
  const oldDb = new DatabaseSync(path.join(f.dir, "activity.sqlite"));
  const oldPayload = JSON.parse(oldDb.prepare("SELECT payload FROM reports_v2 WHERE id=?").get(report).payload);
  for (const board of Object.values(oldPayload.boards)) delete board.combined;
  oldDb.prepare("UPDATE reports_v2 SET payload=? WHERE id=?").run(JSON.stringify(oldPayload), report);
  oldDb.close();
  await f.start();
  const legacy = (await r("/reports/" + report)).data;
  assert.equal(legacy.boards.steps.combined.find(u=>u.id===b.id).score, 0);
  assert.equal(legacy.boards.steps.combined.find(u=>u.id===b.id).imageChecked, false);
  await f.stop(); await f.start();
  assert.equal((await r("/state", undefined, a.cookie)).data.me.evidence[0].id, id);
  assert.equal((await r("/evidence/" + id, undefined, a.cookie)).status, 200);
});

test("water photos increment once atomically, bypass OCR and manual entry, retain all photos and legacy totals", async (t) => {
  const f = await fixture(t), r = f.request;
  const a = await f.register("喝水", ["water"]), b = await f.register("未报名", ["steps"]);
  assert.equal((await r("/water/checkins", waterPhoto(), b.cookie)).status, 400);
  assert.equal((await r("/water/checkins", waterPhoto())).status, 401);
  assert.equal((await r("/records", {track: "water", value: 20}, a.cookie)).status, 400);
  assert.equal((await r("/recognize", {track: "water", image: png}, a.cookie)).status, 400);
  assert.equal((await r("/evidence", {track: "water", image: png}, a.cookie)).status, 400);
  for (const body of [{...waterPhoto(),image:"invalid"},{...waterPhoto(),clientId:"bad"},{...waterPhoto(),capturedAt:0}])
    assert.equal((await r("/water/checkins", body, a.cookie)).status, 400);
  assert.equal((await r("/state", undefined, a.cookie)).data.me.evidence.length, 0);
  const photo = waterPhoto();
  const results = await Promise.all(Array.from({length: 6}, () => r("/water/checkins", photo, a.cookie)));
  for (const result of results) {
    assert.equal(result.status, 200);
    assert.equal(result.data.me.records[0].value, 1);
    assert.equal(result.data.me.evidence.length, 1);
  }
  const second = await r("/water/checkins", waterPhoto(), a.cookie);
  assert.equal(second.data.me.records[0].value, 2);
  assert.equal(second.data.me.evidence.length, 2);
  assert.equal(second.data.me.evidence[0].kind, "water");
  assert.equal(second.data.boards.water.personal[0].score, 2);
  await f.stop();
  const db = new DatabaseSync(path.join(f.dir, "activity.sqlite"));
  db.prepare("UPDATE entries_v2 SET value=8 WHERE user_id=? AND track='water'").run(a.id);
  db.close();
  await f.start();
  const next = await r("/water/checkins", waterPhoto(), a.cookie);
  assert.equal(next.data.me.records[0].value, 9);
  assert.equal(next.data.me.evidence.length, 3);
  assert.equal((await r("/water/checkins", photo, a.cookie)).data.me.records[0].value, 9);
  const admin = (await r("/admin/login", { key: "isolated-test-admin" })).cookie;
  await r("/admin/pause", {paused:true}, admin);
  assert.equal((await r("/water/checkins", waterPhoto(), a.cookie)).status, 400);
  assert.equal((await r("/water/checkins", photo, a.cookie)).data.me.records[0].value, 9);
  await r("/admin/pause", {paused:false}, admin);
  await r("/admin/finalize", {}, admin);
  assert.equal((await r("/water/checkins", waterPhoto(), a.cookie)).status, 400);
  assert.equal((await r("/evidence", { track: "steps", image: png }, b.cookie)).status, 400);
  assert.equal((await r("/evidence/" + next.data.me.evidence[0].id, undefined, a.cookie)).status, 200);
});
