export function shanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export const TRACKS = [
  {
    id: "steps",
    name: "走路步数",
    short: "步数",
    unit: "步",
    goal: 8000,
    color: "green",
    hint: "每一步，都是今天的小成就",
    rule: "按当天累计步数排名，同一天更新覆盖，不累加。",
    max: 100000,
    step: 1,
  },
  {
    id: "loss",
    name: "减重挑战",
    short: "减重",
    unit: "斤",
    goal: 1,
    color: "orange",
    hint: "记录变化，照顾好自己",
    rule: "成绩 = |早称 − 晚称|，无论升降均取绝对值；单位为斤。",
    max: 600,
    step: 0.1,
    weight: true,
  },
  {
    id: "gain",
    name: "增重挑战",
    short: "增重",
    unit: "斤",
    goal: 1,
    color: "gold",
    hint: "朝着自己的目标慢慢来",
    rule: "成绩 = |早称 − 晚称|，无论升降均取绝对值；单位为斤。",
    max: 600,
    step: 0.1,
    weight: true,
  },
  {
    id: "smoke",
    name: "戒烟挑战",
    short: "戒烟",
    unit: "小时",
    goal: 8,
    color: "purple",
    hint: "少一支烟，多一份轻松",
    rule: "填写活动当天累计未吸烟时长，最多 24 小时。",
    max: 24,
    step: 0.5,
  },
  {
    id: "water",
    name: "喝水挑战",
    short: "喝水",
    unit: "杯",
    goal: 8,
    color: "blue",
    hint: "忙碌间隙，记得喝杯水",
    rule: "每次拍照添加水印并确认打卡计 1 杯，自动累计。一杯约 250 mL，按需适量饮水。",
    max: 40,
    step: 1,
  },
];
export const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export function validateRecord(track, body) {
  const t = TRACKS.find((t) => t.id === track);
  if (!t) throw new Error("项目不存在");
  const numeric = (n, min, max) =>
    typeof n === "number" &&
    Number.isFinite(n) &&
    n >= min &&
    n <= max &&
    Math.abs(n * 10 - Math.round(n * 10)) < 1e-7;
  if (t.weight) {
    if (!numeric(body.morning, 20, 600))
      throw new Error("早称体重需为 20–600 斤，最多一位小数");
    if (body.evening !== null && !numeric(body.evening, 20, 600))
      throw new Error("晚称体重需为 20–600 斤，最多一位小数；未晚称可先留空");
    return { morning: body.morning, evening: body.evening, value: null };
  }
  if (
    !numeric(body.value, 0, t.max) ||
    (["steps", "water"].includes(track) && !Number.isInteger(body.value))
  )
    throw new Error(
      `${t.name}应为 0–${t.max} ${t.unit}${["steps", "water"].includes(track) ? "之间的整数" : "，最多一位小数"}`,
    );
  return { value: body.value, morning: null, evening: null };
}
export function scoreFor(track, record) {
  if (!record) return 0;
  if (["loss", "gain"].includes(track)) {
    if (record.morning == null || record.evening == null) return 0;
    return round(Math.abs(record.morning - record.evening));
  }
  return record.value || 0;
}
export function completeRecord(track, record) {
  return (
    !!record && (!["loss", "gain"].includes(track) || record.evening != null)
  );
}
export function rankRows(rows) {
  const sorted = [...rows].sort(
    (a, b) => b.score - a.score || a.created - b.created,
  );
  let rank = 0;
  return sorted.map((row, i) => {
    if (i === 0 || row.score !== sorted[i - 1].score) rank = i + 1;
    return { ...row, rank };
  });
}
export function combinedRows(board) {
  return rankRows([
    ...board.personal.map((row) => ({ ...row, kind: "personal" })),
    ...board.team.map((row) => ({ ...row, kind: "team" })),
  ]);
}
export function withCombinedBoards(payload) {
  return { ...payload, boards: Object.fromEntries(Object.entries(payload.boards).map(
    ([id, board]) => [id, { ...board, combined: combinedRows(board) }],
  )) };
}
export function buildBoards(users, teams, enrollments, records, images = []) {
  const imageKeys = new Set(images.map((image) => `${image.user_id}:${image.track}`));
  return Object.fromEntries(
    TRACKS.map((track) => {
      const people = enrollments
        .filter((e) => e.track === track.id)
        .map((e) => {
          const u = users.find((u) => u.id === e.user_id),
            r = records.find(
              (r) => r.user_id === e.user_id && r.track === track.id,
            );
          return {
            id: u.id,
            name: u.name,
            color: u.color,
            team_id: u.team_ids?.[track.id] || null,
            demo: u.demo,
            created: e.created,
            score: scoreFor(track.id, r),
            checked: completeRecord(track.id, r),
            imageChecked: imageKeys.has(`${u.id}:${track.id}`),
            updated: r?.updated || null,
          };
        });
      const groups = teams
        .filter((team) => team.track === track.id)
        .map((team) => {
          const members = people.filter((u) => u.team_id === team.id);
          return {
            id: team.id,
            name: team.name,
            color: team.color,
            demo: team.demo,
            created: team.created,
            members,
            count: members.length,
            checked: members.filter((m) => m.checked).length,
            score: members.length
              ? round(members.reduce((n, m) => n + m.score, 0) / members.length)
              : 0,
          };
        })
        .filter((t) => t.count > 0);
      const board = { personal: rankRows(people), team: rankRows(groups) };
      return [track.id, { ...board, combined: combinedRows(board) }];
    }),
  );
}
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
