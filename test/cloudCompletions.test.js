import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCloudCompletions } from '../src/domain/cloudCompletions.js';

const record = (id, data) => ({ id, data: () => data });
const timestamp = (year, month, day) => ({ toDate: () => new Date(year, month - 1, day) });

test('groups duplicate days without losing their individual IDs and notes', () => {
    const records = [record('z', { habitId: 'a', date: timestamp(2025, 1, 2), note: 'second' }), record('b', { habitId: 'a', date: timestamp(2025, 1, 2), note: 'first' }), record('c', { habitId: 'a', date: timestamp(2025, 1, 3) })];
    const { completions, duplicateDays, invalidCount } = groupCloudCompletions(records);
    assert.equal(duplicateDays, 1);
    assert.equal(invalidCount, 0);
    assert.equal(completions.a['2025-01-02'].id, 'b');
    assert.deepEqual(completions.a['2025-01-02'].records, [{ id: 'b', note: 'first', invalid: false }, { id: 'z', note: 'second', invalid: false }]);
    assert.equal(completions.a['2025-01-03'].records.length, 1);
});

test('reports malformed records rather than crashing the listener', () => {
    const { invalidCount, completions } = groupCloudCompletions([
        record('a', { habitId: 'x', date: null }), record('b', { habitId: 'x', date: { toDate() { throw new Error('bad'); } } }),
        record('c', { habitId: '', date: timestamp(2025, 1, 1) }), record('d', { habitId: 'valid', date: timestamp(2025, 1, 1) }),
    ]);
    assert.equal(invalidCount, 3);
    assert.equal(completions.valid['2025-01-01'].id, 'd');
});


test('keeps a known day with a malformed note visible but unsafe to edit', () => {
    const { completions, invalidCount } = groupCloudCompletions([record('x', { habitId: 'a', date: timestamp(2025, 1, 2), note: { private: true } })]);
    assert.equal(invalidCount, 1);
    assert.equal(completions.a['2025-01-02'].unsafe, true);
    assert.equal(completions.a['2025-01-02'].id, 'x');
});
