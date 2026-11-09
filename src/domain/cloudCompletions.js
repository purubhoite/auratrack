import { formatDate } from './tracking.js';

// Keep every document ID so duplicate records cannot be silently overwritten
// or deleted as though there were only one. Malformed records stay exportable.
export function groupCloudCompletions(documents) {
    const grouped = Object.create(null);
    let invalidCount = 0;
    let duplicateDays = 0;
    for (const document of documents) {
        const data = document.data();
        let date;
        try {
            date = data.date?.toDate?.();
            if (!(date instanceof Date) || !Number.isFinite(date.getTime()) || typeof data.habitId !== 'string' || !data.habitId) throw new Error('Invalid completion');
        } catch {
            invalidCount++;
            continue;
        }
        const day = formatDate(date);
        const habit = grouped[data.habitId] ||= Object.create(null);
        const invalidNote = data.note != null && typeof data.note !== 'string';
        if (invalidNote) invalidCount++;
        const entry = { id: document.id, note: typeof data.note === 'string' ? data.note : '', invalid: invalidNote };
        if (!habit[day]) {
            habit[day] = { ...entry, unsafe: invalidNote, records: [entry] };
        } else {
            if (habit[day].records.length === 1) duplicateDays++;
            habit[day].records.push(entry);
            habit[day].unsafe ||= invalidNote;
        }
    }
    for (const days of Object.values(grouped)) {
        for (const completion of Object.values(days)) {
            completion.records.sort((a, b) => a.id.localeCompare(b.id));
            completion.id = completion.records[0].id;
            completion.note = completion.records[0].note;
        }
    }
    return { completions: grouped, invalidCount, duplicateDays };
}
