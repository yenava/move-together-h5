import { randomUUID } from 'node:crypto';

// Legacy teams/users and report payloads remain untouched for audit and rollback.
export function migrateProjectTeams(db, date, tracks) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_teams_v4 (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, track TEXT NOT NULL,
      name TEXT NOT NULL, slogan TEXT, color TEXT, captain_id TEXT REFERENCES users(id),
      demo INTEGER DEFAULT 0, created INTEGER, legacy_id TEXT REFERENCES teams(id),
      UNIQUE(id,date,track), UNIQUE(date,track,name)
    );
    CREATE TABLE IF NOT EXISTS team_members_v4 (
      team_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
      date TEXT NOT NULL, track TEXT NOT NULL, created INTEGER,
      PRIMARY KEY(user_id,date,track),
      FOREIGN KEY(team_id,date,track) REFERENCES project_teams_v4(id,date,track),
      FOREIGN KEY(user_id,date,track) REFERENCES enrollments_v2(user_id,date,track)
    );
    CREATE INDEX IF NOT EXISTS team_members_v4_team ON team_members_v4(team_id);
    CREATE TABLE IF NOT EXISTS project_team_migrations_v4 (date TEXT PRIMARY KEY, created INTEGER);
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('SELECT 1 FROM project_team_migrations_v4 WHERE date=?').get(date)) {
      const oldTeams = db.prepare('SELECT * FROM teams ORDER BY created,id').all();
      for (const team of oldTeams) for (const track of tracks) {
        const members = db.prepare(`SELECT u.id,e.created FROM users u JOIN enrollments_v2 e ON e.user_id=u.id
          WHERE u.team_id=? AND e.date=? AND e.track=? ORDER BY u.created,u.id`).all(team.id,date,track.id);
        if (!members.length) continue;
        const id = randomUUID();
        db.prepare('INSERT INTO project_teams_v4 VALUES (?,?,?,?,?,?,?,?,?,?)').run(
          id,date,track.id,team.name,team.slogan,team.color,
          members.some(m=>m.id===team.captain_id) ? team.captain_id : members[0].id,
          team.demo,team.created,team.id);
        for (const m of members) db.prepare('INSERT INTO team_members_v4 VALUES (?,?,?,?,?)').run(id,m.id,date,track.id,m.created);
      }
      db.prepare('INSERT INTO project_team_migrations_v4 VALUES (?,?)').run(date,Date.now());
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
