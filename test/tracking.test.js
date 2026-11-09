import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStreak, formatDate, moveMonth, readGuestData, writeGuestData, GUEST_STORAGE_KEY } from '../src/domain/tracking.js';

function memoryStorage(initial = {}) {
    const values = { ...initial };
    return {
        getItem: key => values[key] ?? null,
        setItem: (key, value) => { values[key] = value; },
    };
}

test('month navigation does not overflow short months or year boundaries', () => {
    assert.equal(formatDate(moveMonth(new Date(2024, 0, 31), 1)), '2024-02-01');
    assert.equal(formatDate(moveMonth(new Date(2025, 2, 31), -1)), '2025-02-01');
    assert.equal(formatDate(moveMonth(new Date(2025, 0, 31), -1)), '2024-12-01');
});

test('guest data round trips with a versioned format', () => {
    const storage = memoryStorage();
    assert.deepEqual(readGuestData(storage), { habits: [], completions: {} });
    const data = { habits: [{ id: 'a', name: 'Read' }], completions: { a: { '2025-01-01': { id: 'c', note: 'A note' } } } };
    writeGuestData(storage, data);
    assert.deepEqual(readGuestData(storage), data);
    assert.equal(JSON.parse(storage.getItem(GUEST_STORAGE_KEY)).version, 1);
});

test('corrupt and unsupported guest data is rejected rather than replaced', () => {
    assert.throws(() => readGuestData(memoryStorage({ [GUEST_STORAGE_KEY]: '{' })));
    assert.throws(() => readGuestData(memoryStorage({ [GUEST_STORAGE_KEY]: '{"version":2,"habits":[],"completions":{}}' })));
});

test('storage failures are propagated to the caller', () => {
    assert.throws(() => readGuestData({ getItem() { throw new Error('blocked'); } }));
    assert.throws(() => writeGuestData({ setItem() { throw new Error('full'); } }, { habits: [], completions: {} }));
});


test('daily streak stays active through yesterday and resets after a missed day', () => {
    const history = { '2025-03-07': {}, '2025-03-08': {}, '2025-03-09': {} };
    assert.deepEqual(calculateStreak(history, new Date(2025, 2, 9)), { current: 3, longest: 3 });
    assert.deepEqual(calculateStreak(history, new Date(2025, 2, 10)), { current: 3, longest: 3 });
    assert.deepEqual(calculateStreak(history, new Date(2025, 2, 11)), { current: 0, longest: 3 });
});

test('longest streak handles leap days, gaps and year boundaries', () => {
    const history = { '2023-12-31': {}, '2024-01-01': {}, '2024-02-27': {}, '2024-02-28': {}, '2024-02-29': {}, '2024-03-01': {} };
    assert.deepEqual(calculateStreak(history, new Date(2024, 2, 1)), { current: 4, longest: 4 });
    assert.deepEqual(calculateStreak({}, new Date(2024, 2, 1)), { current: 0, longest: 0 });
});
