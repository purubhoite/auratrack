// The caller supplies a configured client; authentication and RLS are enforced by Supabase.
const HABITS = 'auratrack_habits';
const COMPLETIONS = 'auratrack_completions';
const HABIT_FIELDS = 'id,name,archived,created_at';
const COMPLETION_FIELDS = 'id,habit_id,completed_on,note,created_at';

function unwrap(result) {
    if (result.error) throw result.error;
    return result.data;
}

function validDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function listAll(client, table, fields) {
    const size = 500;
    const all = [];
    for (let offset = 0; ; offset += size) {
        const rows = unwrap(await client.from(table).select(fields).order('id', { ascending: true }).range(offset, offset + size - 1));
        all.push(...rows);
        if (rows.length < size) return all;
    }
}

export function createSupabaseRepository(client) {
    return {
        async listHabits() {
            return listAll(client, HABITS, HABIT_FIELDS);
        },
        async listCompletions() {
            return listAll(client, COMPLETIONS, COMPLETION_FIELDS);
        },
        async createHabit(name, userId) {
            const trimmed = typeof name === 'string' ? name.trim() : '';
            if (!trimmed || trimmed.length > 80) throw new Error('Habit name must contain 1–80 characters.');
            if (!userId) throw new Error('Sign in to create a habit.');
            return unwrap(await client.from(HABITS).insert({ name: trimmed, user_id: userId }).select(HABIT_FIELDS).single());
        },
        async renameHabit(id, name) {
            const trimmed = typeof name === 'string' ? name.trim() : '';
            if (!trimmed || trimmed.length > 80) throw new Error('Habit name must contain 1–80 characters.');
            return unwrap(await client.from(HABITS).update({ name: trimmed }).eq('id', id).select(HABIT_FIELDS).single());
        },
        async setArchived(id, archived) {
            if (typeof archived !== 'boolean') throw new Error('Archive state must be true or false.');
            return unwrap(await client.from(HABITS).update({ archived }).eq('id', id).select(HABIT_FIELDS).single());
        },
        async deleteHabit(id) {
            // Database foreign keys delete the habit and its completions atomically.
            return unwrap(await client.from(HABITS).delete().eq('id', id).select('id'));
        },
        async complete(habitId, dateKey, userId) {
            if (!validDateKey(dateKey)) throw new Error('Completion date must be a valid YYYY-MM-DD date.');
            if (!userId) throw new Error('Sign in to complete a habit.');
            const inserted = await client.from(COMPLETIONS).insert({ user_id: userId, habit_id: habitId, completed_on: dateKey, note: '' }).select(COMPLETION_FIELDS).single();
            if (!inserted.error) return { created: true, completion: inserted.data };
            if (inserted.error.code !== '23505') throw inserted.error;
            // Do not upsert: a concurrent or existing completion may have a note.
            const existing = unwrap(await client.from(COMPLETIONS).select(COMPLETION_FIELDS).eq('habit_id', habitId).eq('completed_on', dateKey).maybeSingle());
            if (!existing) throw inserted.error;
            return { created: false, completion: existing };
        },
        async updateNote(id, note, previousNote) {
            if (typeof note !== 'string' || note.length > 10000) throw new Error('Note must contain at most 10,000 characters.');
            const result = unwrap(await client.from(COMPLETIONS).update({ note }).eq('id', id).eq('note', previousNote).select(COMPLETION_FIELDS).maybeSingle());
            if (!result) throw new Error('This note changed or was removed on another device. Refresh before editing it.');
            return result;
        },
        async deleteCompletion(id, previousNote) {
            const result = unwrap(await client.from(COMPLETIONS).delete().eq('id', id).eq('note', previousNote).select('id'));
            if (!result.length) throw new Error('This completion changed or was removed on another device. Refresh before changing it.');
            return result;
        },
    };
}
