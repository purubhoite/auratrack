# Supabase migration: staging first

## Current state

A separate free **AuraTrack Staging** project was created in the Mumbai region. The SQL migrations in `supabase/migrations` are applied there. They provide owner-scoped habits and completions, row-level security, a unique habit/day constraint, date-only completions, atomic cascade deletion, reversible habit archiving, and a transactional, retry-safe guest import.

The app entry point now uses Supabase. Its local `.env` points at staging using a publishable key; the existing Firebase project and its data were not changed. The user confirmed that existing Firebase data does not need to be preserved. Guest browser data remains in the same local-storage format and can be explicitly imported after signing in. Only active habits are imported: archived guest habits and their history remain on the device, and must be restored in guest mode before import. Guest and account archive states are independent; retries do not update previously imported habits.

Database tests were executed in rollback-only transactions on staging using simulated authenticated roles. They covered owner isolation, duplicate completions, cascade deletion, import retries, note preservation, import account guards, and archive/restore authorization and history preservation. These are not full end-to-end tests through real Auth and the public API. UI tests mock the Supabase client. The Playwright suite runs in a real browser against isolated local servers; its account flow intercepts Supabase HTTP with synthetic responses and is not a real Auth or API test.

The staging auth redirect configuration currently points to the Arena preview and local Vite origin. The preview URL is temporary. Supabase's default email service has delivery restrictions; SMTP and real confirmation/recovery emails need to be verified before wider testing.

## Remaining work

1. Test sign-up, email verification, password reset, sign-in, sign-out, guest import and all tracking actions in the browser against staging. Test RLS through the API with two independent authenticated users and an unauthenticated client.
2. Validate behavior across devices, especially simultaneous note edits and refreshes. Finish accessibility and responsive testing. Add end-to-end tests and operational monitoring.
3. Set up a production Supabase project, apply reviewed migrations, run the same isolation checks, configure a permanent domain, auth redirects and SMTP, and set up backups and alerts.
4. Decide on production cutover and rollback. No Firebase data is planned for migration, but do not delete the old project without explicit confirmation and a retention decision.

The in-app JSON export is not a complete database backup and does not include import markers or authentication accounts. Never expose a Supabase service-role key in client code.
