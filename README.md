# AuraTrack

AuraTrack is a habit tracker built with React, Vite, Tailwind CSS, Supabase Auth and PostgreSQL. Check in from the Today view, rename or archive habits, add notes, export your data, and review streaks in a monthly calendar.

## Getting started

Use Node.js 22.22.2+ (22.x), 24.15+ (24.x), or 26+ and npm:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Guest mode works without Supabase: habits and completions are stored in browser local storage. This data is specific to the browser and device and can be lost if browser data is cleared. A storage warning appears if it cannot be read or saved. The app checks for changes from other tabs and stops saving on a detected conflict; export the current guest view if needed, then reload. This is best-effort detection, not an atomic multi-tab merge, so avoid editing guest data in multiple tabs at once. If guest data cannot be read, the app will not produce a misleading empty guest export.

### Supabase accounts

Copy `.env.example` to `.env` and fill in your Supabase project URL and **publishable** key. The project must have the SQL migrations in `supabase/migrations` applied and email/password auth configured. Restart Vite after changing the environment. Never put a service-role or secret key in frontend environment variables. Browser configuration is public; Row Level Security and database permissions are essential.

The current workspace is configured for a separate staging project. Its auth redirect URLs are configured for the current preview and local Vite origin; they must be changed for other deployment URLs. Email confirmation is enabled. Supabase's default email service has delivery restrictions; configure and test an appropriate SMTP provider before inviting general users.

Signing in does not automatically import guest data. Choose **Import guest data** to copy active guest habits and notes into the account. Archived guest habits remain on the device and are not imported; sign out and restore them before importing. Archive state is not synchronized between guest and account copies, including previously imported habits. Import is transactional, keeps the guest originals, creates separate habits even if names match, and skips previously imported records rather than overwriting them. It is limited to 200 habits and 5,000 completions per import. If an imported account habit is deleted, previously imported records remain skipped; importing new guest history for that deleted habit will fail instead of silently recreating it.

Archiving hides a habit from Today, the calendar and progress overview but retains its completions and notes; restore it from **Archived habits**. Streaks are based on actual completed calendar days, so missed days while archived can break a current streak. JSON export includes archived habits and their history.

## Commands

```sh
npm test            # Unit and UI tests (remote services mocked in UI tests)
npm run lint        # ESLint
npm run build       # Production build
npm run preview
npm run test:rules  # Legacy Firebase rules tests via third-party Fireemu
npx playwright install chromium # Install browser for the isolated browser suite
npm run test:e2e   # Real Chromium, guest flows and mocked Supabase HTTP
```

The Playwright suite starts two isolated local servers: one without Supabase and one with a synthetic endpoint intercepted by the browser. It does not contact staging or test real Auth, email delivery, RLS or the public API. CI installs Chromium and runs the suite; mobile coverage uses device emulation, not a physical device.

`supabase/tests/security.sql` contains rollback-only database authorization and import checks for a disposable local or staging database. It requires database administration access; never run it against an unreviewed production database.

## Current limitations

- Supabase is connected to **staging**, not a production rollout. Database checks have been run with simulated authenticated roles, but full browser sign-up, email delivery and real-user API isolation still need verification.
- Account changes require a connection. Refresh the dashboard to see changes made on another device. Account reads and exports page through records but are not a single atomic snapshot while other devices are writing.
- The current app does not migrate Firebase data or identities. The user confirmed that existing Firebase data need not be preserved; the legacy Firebase code and rules remain in the repository for now, but are not the active app entry point.
- Habits currently use daily schedules; custom schedules, export restoration and account deletion are not implemented. Account export excludes private import markers and is not a complete database backup.
- If the signed-in identity changes during an account export, the app cancels the download; account exports still are not atomic snapshots.
- Changing a completion to incomplete deletes its note after confirmation. The app checks that the note has not changed since it was displayed, but fuller multi-device conflict handling is still needed.
- `npm audit` currently reports high-severity findings in legacy Firebase’s `@grpc/grpc-js` dependency. The active Supabase entry does not import Firebase, but the dependency remains for rollback and legacy tests; resolve and validate it before shipping.
- Backups, monitoring, abuse prevention, legal information, accessibility review and a production deployment plan are required before launch.

See [ROADMAP.md](ROADMAP.md), [the Supabase migration plan](docs/SUPABASE_MIGRATION.md), and [SECURITY.md](SECURITY.md).
