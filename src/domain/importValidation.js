// Validate the entire source before making any cloud writes.
export function prepareGuestImport(guest) {
    if (!guest || !Array.isArray(guest.habits) || !guest.completions || typeof guest.completions !== 'object' || Array.isArray(guest.completions)) {
        throw new Error('Guest data is invalid. Export a copy and check it before importing.');
    }
    const ids = new Set();
    const habits = guest.habits.map(habit => {
        if (!habit || typeof habit.id !== 'string' || !habit.id || ids.has(habit.id) || typeof habit.name !== 'string' || !habit.name.trim() || habit.name.trim().length > 80) {
            throw new Error('A guest habit has an invalid or duplicate ID or name. No data was imported.');
        }
        ids.add(habit.id);
        return { id: habit.id, name: habit.name.trim() };
    });
    const entries = [];
    for (const [habitId, days] of Object.entries(guest.completions)) {
        if (!ids.has(habitId) || !days || typeof days !== 'object' || Array.isArray(days)) {
            throw new Error('Guest history contains an invalid or missing habit. No data was imported.');
        }
        for (const [dateKey, completion] of Object.entries(days)) {
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
            if (!match || Number(match[1]) < 100) throw new Error('Guest history contains an invalid date. No data was imported.');
            const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
            if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) {
                throw new Error('Guest history contains an invalid date. No data was imported.');
            }
            const note = completion?.note ?? '';
            if (!completion || typeof completion !== 'object' || Array.isArray(completion) || typeof note !== 'string' || note.length > 10000) {
                throw new Error('Guest history contains an invalid or oversized note. No data was imported.');
            }
            entries.push({ habitId, dateKey, date, note });
        }
    }
    return { habits, entries };
}
