# Product roadmap

AuraTrack's first priority is trustworthy everyday tracking. This roadmap is a proposed sequence, not a claim that the app is production-ready.

## Supabase migration (staging)

- [x] Create a separate staging project and apply the initial schema and RLS policies.
- [x] Connect the app to the Supabase staging project with authentication, tracking and guest import.
- [ ] Test authenticated user isolation and constraints against the staging API.
- [x] Integrate staging authentication, data access and transactional guest import.
- [x] Confirm existing Firebase data does not need to be migrated.
- [ ] Establish backup, retention and rollback plans before production cutover.
- [ ] Rehearse the cutover before changing the live app. See [the migration plan](docs/SUPABASE_MIGRATION.md).

## 1. Trust and data safety

The Firebase-specific tasks below apply only to the retained legacy implementation; the active app now uses Supabase staging.

- [x] Persist guest habits and notes in versioned browser storage; warn on storage failure.
- [x] Detect common cross-tab guest storage conflicts and stop saving the stale view.
- [ ] Provide atomic cross-tab guest coordination or merging; current detection is best-effort.
- [x] Allow guest use without Firebase configuration.
- [x] Fix month navigation and note-modal interaction; confirm habit deletion.
- [x] Report Firebase listener errors and remove the misleading in-memory offline fallback.
- [x] Draft Firestore ownership/validation rules and add local emulator security tests.
- [ ] Verify with the official emulator and deployed staging data, then review and deploy rules/indexes.
- [x] Detect duplicate completion days and lock affected cells to protect their notes.
- [ ] Design deterministic completion IDs, audit existing duplicates, and migrate existing account data safely.
- [ ] Make cloud deletion recoverable, including large histories and partial failures.
- [x] Add explicit guest-to-account import with retained source and retry markers.
- [ ] Verify imports and marker rules against the official emulator and a staging Firebase project.
- [x] Display whether account snapshots are cached or have pending writes.
- [ ] Specify date, timezone, sync and conflict behavior and add integration tests.

## 2. Core product

- [x] Add a mobile-friendly Today view and general-purpose starter suggestions.
- [ ] Add a guided onboarding flow.
- [x] Support renaming habits without losing history.
- [x] Support archiving and restoring habits without deleting history.
- [ ] Support reordering habits.
- [ ] Add daily and selected-weekday schedules with documented historical streak rules.
- [x] Add focus trapping, Escape handling and focus restoration to dialogs.
- [ ] Complete accessibility and screen-reader testing across the application.
- [x] Add password reset and JSON data export.
- [ ] Add email verification, JSON import/restore and account deletion.

## 3. Launch readiness

- [ ] Split UI, domain logic and storage adapters into maintainable modules.
- [x] Add initial component tests and CI.
- [x] Add isolated desktop and mobile-emulated browser tests for guest flows and mocked account HTTP.
- [x] Add candidate Firestore rules tests against Fireemu and configure an official-emulator CI run.
- [ ] Verify official-emulator CI and add real staging Auth/API integration and end-to-end tests.
- [ ] Set up staging, monitoring, usage alerts, backups, rollback and a support process.
- [ ] Publish appropriate privacy and terms information; review dependency advisories.
- [ ] Load history in bounded ranges while retaining correct streak calculations.

## 4. After validation

Consider optional reminders, weekly summaries, more flexible schedules and installable/offline experiences based on user feedback. Defer social features, AI coaching and native apps until the core is reliable and validated.
