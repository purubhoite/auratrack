import { formatDate } from './tracking.js';

/** Parse a date-only key as a local calendar date, rejecting invalid or normalized dates. */
export function parseDateKey(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const [year, month, day] = key.split('-').map(Number);
    if (year < 100) return null;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** Rolling local-calendar days, including today. Only current active habits count. */
export function activitySummary(habits, completions, today, days) {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daily = Array.from({ length: days }, (_, index) => {
        const date = new Date(end);
        date.setDate(end.getDate() - (days - index - 1));
        const key = formatDate(date);
        return { date, key, count: habits.reduce((count, habit) => count + (completions[habit.id]?.[key] ? 1 : 0), 0) };
    });
    const total = daily.reduce((sum, day) => sum + day.count, 0);
    return { daily, total, activeDays: daily.filter(day => day.count > 0).length };
}

/** Notes from currently active habits through today, most recent first. */
export function recentNotes(habits, completions, today) {
    const todayKey = formatDate(today);
    const result = [];
    for (const habit of habits) {
        for (const [dateKey, completion] of Object.entries(completions[habit.id] || {})) {
            if (!parseDateKey(dateKey) || dateKey > todayKey || !completion || completion.unsafe || completion.records?.length > 1 || typeof completion.note !== 'string' || !completion.note.trim()) continue;
            result.push({ habit, dateKey, note: completion.note });
        }
    }
    return result.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.habit.name.localeCompare(b.habit.name) || String(a.habit.id).localeCompare(String(b.habit.id)));
}
