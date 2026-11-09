import { collection, doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';

import { prepareGuestImport } from './importValidation.js';
export { prepareGuestImport } from './importValidation.js';

async function importKey(habitId) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(habitId));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Import as independent, retryable transactions. A private immutable marker and
 * its corresponding record are created atomically; source data is never deleted.
 */
export async function importGuestData(db, uid, guest, assertCurrentUser = () => {}) {
    const source = prepareGuestImport(guest);
    const counts = { habitsCreated: 0, habitsSkipped: 0, completionsCreated: 0, completionsSkipped: 0 };
    const entriesByHabit = new Map();
    for (const entry of source.entries) {
        const entries = entriesByHabit.get(entry.habitId) || [];
        entries.push(entry);
        entriesByHabit.set(entry.habitId, entries);
    }
    for (const habit of source.habits) {
        assertCurrentUser();
        const key = await importKey(habit.id);
        const marker = doc(db, 'users', uid, 'imports', key);
        const newHabit = doc(collection(db, 'habits'));
        const habitResult = await runTransaction(db, async transaction => {
            const existing = await transaction.get(marker);
            if (existing.exists()) return { id: existing.data().habitId, created: false };
            transaction.set(newHabit, { userId: uid, name: habit.name, createdAt: serverTimestamp() });
            transaction.set(marker, { habitId: newHabit.id, createdAt: serverTimestamp() });
            return { id: newHabit.id, created: true };
        });
        counts[habitResult.created ? 'habitsCreated' : 'habitsSkipped']++;
        for (const entry of entriesByHabit.get(habit.id) || []) {
            assertCurrentUser();
            const completionMarker = doc(marker, 'completions', entry.dateKey);
            const newCompletion = doc(collection(db, 'completions'));
            const created = await runTransaction(db, async transaction => {
                const existing = await transaction.get(completionMarker);
                if (existing.exists()) return false;
                transaction.set(newCompletion, { userId: uid, habitId: habitResult.id, date: Timestamp.fromDate(entry.date), note: entry.note });
                transaction.set(completionMarker, { completionId: newCompletion.id, createdAt: serverTimestamp() });
                return true;
            });
            counts[created ? 'completionsCreated' : 'completionsSkipped']++;
        }
    }
    return counts;
}
