import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseImage } from "./ocr.js";

export function evidenceStore(db, dataDir, date) {
  const directory = path.join(dataDir, "evidence");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  db.exec(`CREATE TABLE IF NOT EXISTS evidence_v3 (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL,
    track TEXT NOT NULL, slot TEXT, kind TEXT NOT NULL, filename TEXT NOT NULL,
    mime TEXT NOT NULL, created INTEGER NOT NULL, captured_at INTEGER, client_id TEXT,
    UNIQUE(user_id,date,client_id)
  ); CREATE INDEX IF NOT EXISTS evidence_owner_date ON evidence_v3(user_id,date);`);
  const metadata = (row) => {
    const { filename, mime, client_id, ...publicFields } = row;
    return publicFields;
  };
  return {
    directory,
    metadata,
    list(userId) {
      return db.prepare("SELECT * FROM evidence_v3 WHERE date=? AND user_id=? ORDER BY created DESC, rowid DESC")
        .all(date, userId).map(metadata);
    },
    get(id) {
      return typeof id === "string"
        ? db.prepare("SELECT * FROM evidence_v3 WHERE id=? AND date=?").get(id, date)
        : undefined;
    },
    byClient(userId, clientId) {
      return db.prepare("SELECT * FROM evidence_v3 WHERE user_id=? AND date=? AND client_id=?")
        .get(userId, date, clientId);
    },
    image(row) {
      return `data:${row.mime};base64,${readFileSync(path.join(directory, row.filename)).toString("base64")}`;
    },
    discard(row) {
      rmSync(path.join(directory, row.filename), { force: true });
    },
    save({ userId, track, slot = null, kind = "screenshot", image, capturedAt = null, clientId = null }) {
      parseImage(image);
      const count = db.prepare("SELECT count(*) AS n FROM evidence_v3 WHERE user_id=? AND date=?").get(userId, date).n;
      if (count >= 200) throw Object.assign(new Error("今日上传较多，请联系管理员核对"), { status: 429 });
      const mime = image.slice(5, image.indexOf(";"));
      const id = randomUUID(), filename = `${id}.${mime === "image/jpeg" ? "jpg" : mime.split("/")[1]}`;
      const row = { id, user_id: userId, date, track, slot, kind, filename, mime,
        created: Date.now(), captured_at: capturedAt, client_id: clientId };
      writeFileSync(path.join(directory, filename), Buffer.from(image.split(",")[1], "base64"), { flag: "wx", mode: 0o600 });
      try {
        db.prepare("INSERT INTO evidence_v3 VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(id, userId, date, track, slot, kind, filename, mime, row.created, capturedAt, clientId);
      } catch (error) {
        this.discard(row);
        throw error;
      }
      return row;
    },
  };
}
