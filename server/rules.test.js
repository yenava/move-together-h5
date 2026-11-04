import test from "node:test";
import assert from "node:assert/strict";
import {
  shanghaiDate,
  validateRecord,
  scoreFor,
  completeRecord,
  buildBoards,
  csvCell,
  rankRows,
} from "./rules.js";
import { parseImage, parseRecognition, recognizeScreenshot } from "./ocr.js";
test("Shanghai calendar uses UTC+8", () => {
  assert.equal(shanghaiDate(new Date("2026-10-31T16:01:00Z")), "2026-11-01");
  assert.equal(shanghaiDate(new Date("2026-10-31T15:59:00Z")), "2026-10-31");
});
test("both weight tracks score absolute change in either direction; incomplete weighs zero", () => {
  for (const t of ["loss", "gain"]) {
    assert.equal(scoreFor(t, { morning: 120, evening: 121.3 }), 1.3);
    assert.equal(scoreFor(t, { morning: 120, evening: 118.7 }), 1.3);
    assert.equal(scoreFor(t, { morning: 120, evening: null }), 0);
    assert.equal(completeRecord(t, { morning: 120, evening: null }), false);
  }
});
test("validation rejects wrong types, out of bounds and incorrect precision", () => {
  for (const value of [-1, 1.2, 100001, "8000", null, NaN])
    assert.throws(() => validateRecord("steps", { value }));
  for (const value of [2.2, 41, "8"])
    assert.throws(() => validateRecord("water", { value }));
  for (const value of [24.1, 2.33])
    assert.throws(() => validateRecord("smoke", { value }));
  for (const body of [
    { morning: 120 },
    { morning: 19, evening: null },
    { morning: 120, evening: 601 },
    { morning: 120.22, evening: 120 },
  ])
    assert.throws(() => validateRecord("loss", body));
  assert.equal(validateRecord("smoke", { value: 7.5 }).value, 7.5);
  assert.equal(
    validateRecord("loss", { morning: 120, evening: null }).evening,
    null,
  );
});
test("tracks remain isolated, teams average all enrolled members including missing records", () => {
  const users = [
    { id: "a", name: "A", team_ids: {steps:"x",water:"w",loss:"l"}, created: 1 },
    { id: "b", name: "B", team_ids: {steps:"x",water:"w",loss:"l"}, created: 2 },
    { id: "c", name: "C", team_ids: {steps:"x",water:"w",loss:"l"}, created: 3 },
  ];
  const teams = [ ["x","steps"], ["w","water"], ["l","loss"] ].map(([id,track])=>({id,track,name:"Team",created:1}));
  const enrollments = [
    { user_id: "a", track: "steps", created: 1 },
    { user_id: "b", track: "steps", created: 2 },
    { user_id: "a", track: "water", created: 1 },
    { user_id: "c", track: "loss", created: 3 },
  ];
  const records = [
    { user_id: "a", track: "steps", value: 8000 },
    { user_id: "a", track: "water", value: 6 },
    { user_id: "c", track: "loss", morning: 120, evening: 122 },
  ];
  const b = buildBoards(users, teams, enrollments, records);
  assert.equal(b.steps.team[0].score, 4000);
  assert.equal(b.steps.team[0].count, 2);
  assert.equal(b.steps.team[0].checked, 1);
  assert.equal(b.water.team[0].score, 6);
  assert.equal(b.water.team[0].count, 1);
  assert.equal(b.loss.team[0].score, 2);
  assert.equal(b.gain.personal.length, 0);
  assert.equal(JSON.stringify(b).includes("morning"), false);
});
test("equal scores share competition rank without modifying input", () => {
  const rows = [
    { score: 8, created: 2 },
    { score: 9, created: 3 },
    { score: 8, created: 1 },
    { score: 0, created: 0 },
  ];
  assert.deepEqual(
    rankRows(rows).map((r) => r.rank),
    [1, 2, 2, 4],
  );
  assert.equal(rows[0].score, 8);
});
test("CSV quotes and prevents spreadsheet formulas", () => {
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell(" @SUM(A1)"), '"\' @SUM(A1)"');
});
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDQAAAABJRU5ErkJggg==";
test("screenshot validation refuses remote URLs, fake formats and empty data", () => {
  assert.equal(parseImage(png), png);
  for (const image of [
    "https://localhost/a.png",
    "data:image/png;base64,YWJj",
    "",
    null,
  ])
    assert.throws(() => parseImage(image));
});
test("OCR parses constrained data and converts kg to jin before manual confirmation", () => {
  assert.equal(
    parseRecognition('{"value":60.5,"unit":"kg"}', "gain", "evening").value,
    121,
  );
  assert.equal(
    parseRecognition('{"value":8432,"unit":"步"}', "steps").value,
    8432,
  );
  for (const text of [
    "not json",
    '{"value":null}',
    '{"value":"8000","unit":"步"}',
    '{"value":5,"unit":"km"}',
    '{"value":100001,"unit":"步"}',
  ])
    assert.throws(() => parseRecognition(text, "steps"));
});
test("official DeepSeek image request and upstream failures are handled safely", async () => {
  let called;
  const result = await recognizeScreenshot(
    { track: "steps", image: png },
    {
      key: "test-secret",
      fetchImpl: async (url, options) => {
        called = { url, options };
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"value":8432,"unit":"步"}' } }],
          }),
        };
      },
    },
  );
  assert.equal(result.value, 8432);
  assert.equal(called.url, "https://api.deepseek.com/chat/completions");
  const b = JSON.parse(called.options.body);
  assert.equal(b.model, "deepseek-flash");
  assert.equal(b.messages[0].content[1].image_url.url, png);
  for (const status of [401, 402, 429, 500])
    await assert.rejects(
      () =>
        recognizeScreenshot(
          { track: "steps", image: png },
          {
            key: "test-secret",
            fetchImpl: async () => ({ ok: false, status }),
          },
        ),
      (e) => e.status === 502 && !e.message.includes("test-secret"),
    );
});

test("combined board compares personal scores with team averages within each track and marks images without exposing files", () => {
  const users = [{id:"same", name:"个人甲", team_ids:{steps:"same"}}, {id:"b", name:"个人乙", team_ids:{steps:"same"}}];
  const teams = [{id:"same", name:"队伍", track:"steps", created:0}];
  const enrollments = [
    {user_id:"same",track:"steps",created:1}, {user_id:"b",track:"steps",created:2},
    {user_id:"same",track:"water",created:1},
  ];
  const records = [{user_id:"same",track:"steps",value:8000}, {user_id:"same",track:"water",value:2}];
  const boards = buildBoards(users, teams, enrollments, records, [{user_id:"same",track:"steps",id:"private-file-id",filename:"private.png"}]);
  assert.deepEqual(boards.steps.combined.map(r=>[r.kind,r.score,r.rank]), [
    ["personal",8000,1], ["team",4000,2], ["personal",0,3],
  ]);
  assert.equal(boards.steps.personal[0].imageChecked, true);
  assert.equal(boards.steps.personal[1].imageChecked, false);
  assert.equal(boards.water.personal[0].imageChecked, false);
  assert.deepEqual(boards.water.combined.map(r=>r.rank), [1]);
  assert.equal(JSON.stringify(boards).includes("private"), false);
  assert.equal("kind" in boards.steps.personal[0], false);
  assert.equal("rank" in records[0], false);
});
