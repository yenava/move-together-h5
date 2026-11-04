# Project Teams Implementation Plan

**Goal:** Implement the approved project-specific team flow and deploy to /sports/.

**Architecture:** Add dated project teams and memberships; leave legacy tables and frozen reports unchanged. Migrate each legacy team into its enrolled track groups once per activity date. All create/join operations atomically enroll participants; rankings read project membership.

**Tech Stack:** React 19, Vite 6, Express 5, node:sqlite, Node 22 production.

## 1. Membership and migration
- Create server/project-teams.js and server/project-teams.test.js.
- Add unique user/date/track membership and fixed team/date/track foreign key; migrate only existing enrolled legacy members transactionally.
- Verify idempotence, unchanged legacy data/snapshots, preserved averages, and one membership per project.
- Update server/index.js state, registration, create/join, admin data; update server/rules.js team calculations.

## 2. Mobile participation flows
- Modify src/main.jsx: nickname-only onboarding; project participation choice; scoped create/join/detail; invitations with explicit confirmation and full/invalid handling.
- Scope team plaza to project tabs, sort own team first. Show mode/team per project on homepage and My. Update ranking highlighting and admin team names.
- Add compact mobile styles in src/day.css; retain existing check-in and camera behavior.

## 3. Validation
- Update server/integration.test.js and server/rules.test.js to assert auto-enrollment, independent project teams, full/duplicate rollback, pause/final locking, existing scores and frozen reports.
- Run npm test and npm run build.
- Exercise isolated browser journeys at 320/360/390/430px and desktop; check invitation confirmation, creation, joining, check-in, ranking and overflow.

## 4. Deployment
- Back up production application, database, images. Test migration on a copied production database and compare old/new per-track team counts/scores and untouched core table fingerprints.
- Build BASE_PATH=/sports/, deploy app/server only, run tests under Node 22, restart service.
- Verify health, assets, new project state, retained records/reports/images and unchanged main website. Production UI checks remain read-only.

## Completed verification and release

- 18 automated tests passed on local Node 24 and production Node 22.22.2.
- Isolated browser validated nickname entry, personal score before team creation, independent steps/water teams, confirmed invitations, full/invalid invitation fallbacks; 320/360/390/430/1280px layouts had no horizontal overflow or page errors.
- Migration validated on an isolated database copy; original tables and team averages unchanged. Migration idempotent.
- Deployed to the configured /sports/ subpath after backing up the app, SQLite database and evidence. Production host and backup identifiers are omitted.
- Live read-only browser verified four views at 320/390/1280px and all 5 projects × 3 ranking modes, with zero writes and page errors. Live assets match build: index-Dl0yazIo.js / index-CcqUJDZq.css.
- Main site hash unchanged; evidence rejects anonymous access; time limits remain disabled.
