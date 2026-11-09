export const GUEST_STORAGE_KEY = 'auratrack.guest.v1';

export function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Month navigation uses the first day to avoid overflowing short months.
export function moveMonth(date, offset) {
    return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

export function readGuestData(storage) {
    const raw = storage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return { habits: [], completions: {} };
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.habits) || !data.completions || typeof data.completions !== 'object' || Array.isArray(data.completions)) {
        throw new Error('Guest data has an unsupported format');
    }
    return { habits: data.habits, completions: data.completions };
}

export function writeGuestData(storage, data) {
    storage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ version: 1, ...data }));
}

/** Current streak ends today or yesterday. Longest streak uses all recorded days. */
export function calculateStreak(completions, today = new Date()) {
    const dates = Object.keys(completions).sort();
    if (dates.length === 0) return { current: 0, longest: 0 };

    const head = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!completions[formatDate(head)]) head.setDate(head.getDate() - 1);
    let current = 0;
    while (completions[formatDate(head)]) {
        current++;
        head.setDate(head.getDate() - 1);
    }

    let longest = 1;
    let run = 1;
    for (let i = 1; i < dates.length; i++) {
        // ISO date-only strings are parsed in UTC, avoiding local DST shifts.
        const difference = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400000;
        run = difference === 1 ? run + 1 : 1;
        longest = Math.max(longest, run);
    }
    return { current, longest };
}
