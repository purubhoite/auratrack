# Legacy Firebase security checklist

The active app now uses Supabase staging; see [the Supabase migration plan](docs/SUPABASE_MIGRATION.md). The Firebase material below is retained for the legacy implementation and is not a statement about Supabase security.

The Firebase configuration in a web app identifies a project; it is not an authorization mechanism or administrative credential. Treat all browser-side configuration as public. Access control must be enforced server-side with Firestore Security Rules and appropriate Firebase project settings.

## Candidate rules

`firestore.rules` and `firestore.indexes.json` are **candidates**, not evidence of what is currently deployed. The rules cover the current top-level `habits` and `completions` schema and private `users/{uid}/imports` markers; other paths are denied. They:

- Require authentication and matching `userId` for reads and deletes; queries must constrain `userId`.
- Validate new habit and completion fields, associate new completions with an existing owned habit, and prevent changing ownership or completion identity.
- Allow a habit's name or a completion's note to be updated without rejecting unrelated fields on legacy documents. Notes are limited to 10,000 characters.
- Restrict import markers to their owner, validate links to owned records, and keep markers immutable for retry safety.
- Permit owners to delete orphaned completions. Deleting a habit and its history is not atomic in the current client.

These rules do not guarantee one completion per habit per day or prevent an owner from deleting a habit while completions exist. Date/timezone migration, uniqueness, deletion recovery, abuse prevention and full accessibility still need work. Rule validation cannot repair existing malformed data.

## Local verification

`npm run test:rules` runs the security suite against **Fireemu**, a third-party emulator. It uses a demo project and local ephemeral data. Fireemu does not guarantee complete parity with Firebase; a passing result is not proof of production behavior. CI is also configured to run the same suite against the official Firebase emulator using Java and the Firebase CLI; verify that CI actually passes before relying on it. You can run the official check on a machine with Java 21 and network access:

```sh
npx --yes firebase-tools@14.27.0 emulators:exec --project demo-auratrack --only firestore "node --test tests/security/firestore.test.js"
```

## Before deploying

1. Identify the correct Firebase project and existing deployed rules, indexes, clients and data. The supplied web config does not grant access to review these.
2. Make and verify a backup using an appropriate Firebase/Google Cloud process; export and save the existing rules for rollback. The in-app JSON export is not a database backup.
3. Test the candidate rules and indexes in a **separate staging project** using representative legacy data and all supported clients. Test user isolation, queries, signup, reset, creation, notes, guest import including retries, export and deletion. Review the emulator tests and check their official-emulator results.
4. Review changes and the deployment target with the project owner; deploy the indexes and rules using authorized administrative tooling and monitor errors. Keep the previous rules and a rollback procedure ready. Do not deploy automatically from this repository.
5. Confirm Firebase Auth authorized domains, email/password settings, App Check/abuse protections, data retention, backups, alerts, and support/privacy requirements for the intended launch.

The candidate rules have **not** been deployed by this project. Never assume they protect a live database until the actual deployed configuration has been independently verified.
