import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseRepository } from '../src/data/supabaseRepository.js';

function mockClient(responses) {
    const calls = [];
    const client = { from(table) {
        calls.push(['from', table]);
        const response = responses.shift();
        const chain = {};
        for (const name of ['insert', 'update', 'delete', 'select', 'eq', 'order', 'range']) {
            chain[name] = (...args) => { calls.push([name, ...args]); return chain; };
        }
        chain.single = chain.maybeSingle = () => Promise.resolve(response);
        chain.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject);
        return chain;
    } };
    return { client, calls };
}

test('creation validates and trims the habit name', async () => {
    const fake = mockClient([{ data: { id: 'h', name: 'Read' }, error: null }]);
    const repo = createSupabaseRepository(fake.client);
    assert.equal((await repo.createHabit(' Read ', 'user')).name, 'Read');
    assert.deepEqual(fake.calls.find(call => call[0] === 'insert'), ['insert', { name: 'Read', user_id: 'user' }]);
    await assert.rejects(repo.createHabit('  '), /name/);
});

test('a duplicate completion is returned without overwriting its note', async () => {
    const existing = { id: 'c', habit_id: 'h', completed_on: '2024-02-29', note: 'Keep this' };
    const fake = mockClient([{ data: null, error: { code: '23505' } }, { data: existing, error: null }]);
    const result = await createSupabaseRepository(fake.client).complete('h', '2024-02-29', 'user');
    assert.deepEqual(result, { created: false, completion: existing });
    assert.equal(fake.calls.filter(call => call[0] === 'update').length, 0);
    assert.equal(fake.calls.filter(call => call[0] === 'insert').length, 1);
});

test('invalid dates and database failures are surfaced', async () => {
    const error = { code: '42501', message: 'permission denied' };
    const fake = mockClient([{ data: null, error }]);
    const repo = createSupabaseRepository(fake.client);
    await assert.rejects(repo.complete('h', '2023-02-29', 'user'), /valid YYYY-MM-DD/);
    await assert.rejects(repo.complete('h', '2024-02-29', 'user'), err => err === error);
});

test('duplicate error is not hidden if no existing completion is visible', async () => {
    const error = { code: '23505' };
    const fake = mockClient([{ data: null, error }, { data: null, error: null }]);
    await assert.rejects(createSupabaseRepository(fake.client).complete('h', '2024-02-29', 'user'), err => err === error);
});

test('note updates and deletes reject stale data instead of overwriting it', async () => {
    const update = mockClient([{ data: null, error: null }]);
    await assert.rejects(createSupabaseRepository(update.client).updateNote('id', 'new', 'old'), /changed or was removed/);
    assert.deepEqual(update.calls.filter(call => call[0] === 'eq'), [['eq', 'id', 'id'], ['eq', 'note', 'old']]);
    const deletion = mockClient([{ data: [], error: null }]);
    await assert.rejects(createSupabaseRepository(deletion.client).deleteCompletion('id', 'old'), /changed or was removed/);
    assert.deepEqual(deletion.calls.filter(call => call[0] === 'eq'), [['eq', 'id', 'id'], ['eq', 'note', 'old']]);
});


test('listing fetches all pages in a stable order', async () => {
    const first = Array.from({ length: 500 }, (_, id) => ({ id: String(id) }));
    const fake = mockClient([{ data: first, error: null }, { data: [{ id: 'last' }], error: null }]);
    const result = await createSupabaseRepository(fake.client).listCompletions();
    assert.equal(result.length, 501);
    assert.deepEqual(fake.calls.filter(call => call[0] === 'range'), [['range', 0, 499], ['range', 500, 999]]);
});


test('archive changes only the archive flag and rejects non-boolean values', async () => {
    const fake = mockClient([{ data: { id: 'h', name: 'Read', archived: true }, error: null }]);
    const repo = createSupabaseRepository(fake.client);
    assert.equal((await repo.setArchived('h', true)).archived, true);
    assert.deepEqual(fake.calls.find(call => call[0] === 'update'), ['update', { archived: true }]);
    assert.deepEqual(fake.calls.find(call => call[0] === 'eq'), ['eq', 'id', 'h']);
    await assert.rejects(repo.setArchived('h', 'false'), /true or false/);
});
