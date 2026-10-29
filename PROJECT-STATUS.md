# Implementation status

Objective: reproduce the approved prototypes in the unified Next.js app and connect the complete Express/MySQL backend. User authorized independent completion and local database creation `nuansua-api` (local root, empty password).

## Decisions

- `prototypes/` remains the visual reference and is not overwritten.
- Public portfolio and admin share `apps/web`, API remains in `apps/api`.
- MySQL for content, owner sessions, publishing snapshots, messages, and aggregated analytics. No extra SQLite service.
- Public content comes only from immutable published snapshots. Draft saves never change the public site.
- English default, Indonesian persisted; retain all current CSS, typography, animations, and responsive layouts.
- Real owner access uses a generated password and TOTP; private enrollment credentials in ignored `.local/`, never source control.
- Production credentials/domain/VPS access have not been provided. Prepare deployment files and test locally; never claim an external deployment.

## Progress

- [x] Workspace setup, Next.js/Express, base checks.
- [x] Read complete backend specification and current prototypes.
- [x] Verify local MySQL root access.
- [x] Database schema, migrations, faithful sample seed.
- [x] Authentication, CSRF, lockout, session expiry.
- [x] Content CRUD, translations, media.
- [x] Snapshot diff, publish, rollback, revalidation.
- [x] Contact, Messages, analytics, retention.
- [x] React public design migration, routes, interactions.
- [x] React admin design migration and live API integration.
- [x] Visual comparison, functional/security tests, production build.
- [x] Deployment preparation, backup/restore documentation and operational scripts.

## Verification completed — 29 October 2026

- `npm run check`: lint, TypeScript, all nine API integration tests, API build and Next.js production build passed.
- `npm audit`: zero reported vulnerabilities at verification time.
- `node scripts/browser-check.cjs`: real password/TOTP login through the Next.js proxy, public routes/filter/locales, Contact → Messages, draft editing/review and admin navigation passed. Test records cleaned up.
- Approved prototype versus Next.js hero: 0.000% differing pixels at the comparison threshold (12) for 1440 px and 390 px, light and dark. Private evidence: `.local/visual-check.json` and screenshots.
- Public projects, experience, certificates and contact checked at desktop/mobile in English/Indonesian, with certificate dialog, assistant and command menu. No page overflow or JavaScript errors. Evidence: `.local/section-check.json`.
- Admin mobile sections checked for overflow and JavaScript errors. Mobile navigation scrolls horizontally with spaced targets.
- Built public homepage, project list and project detail returned cached HTTP 200 while the API was stopped. Dashboard and contact correctly require the API.
- Revalidation webhook rejects a missing secret and accepts the configured secret.
- Backup and restore scripts exercised against a disposable restore database, including uploaded file recovery; temporary database removed.
- Owner database after test cleanup: three initial projects, zero test messages, one initial publication.

## Handover

Run `npm run dev`; portfolio is at `http://localhost:3000`, admin at `/admin`, API health at `http://localhost:4000/healthz`. Private password and authenticator enrollment instructions are in `.local/OWNER-ACCESS.md`. They are excluded from Git.

External deployment is not performed: Vercel/VPS/domain access has not been supplied. Follow `deploy/README.md` using the supplied deployment artifacts. Replace example portfolio content and contact details with the owner's real information before announcing the site. Source remains uncommitted for review.

## Admin UI revision — 29 October 2026

Media cards now use consistent image frames, asset metadata and copy/delete actions with feedback. The upload picker follows the admin design. Authenticator entry uses six visual slots backed by one accessible input, supports paste/autofill and keyboard editing, and focuses automatically. History was removed from sidebar, command menu, data fetching and page rendering; `/admin/history` returns 404. Existing backend publication data is preserved. Manual cache refresh moved to Review & publish.

## Owner account settings — 29 October 2026

Login fields now start empty and show placeholders. Settings → Account & security provides username, private login email and optional password changes, confirmed with the current password and a fresh authenticator code. Credentials remain separate from published content. The backend validates the input, rejects replay, rotates the current session/CSRF token, revokes other sessions and outstanding login challenges, and records only the event in the audit log. Username is stored in MySQL through migration 0002; seed preserves an existing owner after their email changes.

TypeScript and all ten integration tests pass, including CSRF/origin/reauthentication/replay, edited username/email, old credential rejection, blank-password preservation and session revocation. Browser checks verified the credential form, mismatch validation, feedback, secret clearing and mobile layout without changing the real owner's password.
