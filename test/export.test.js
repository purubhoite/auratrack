import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudExport, createGuestExport } from '../src/domain/export.js';

const now = new Date('2025-01-02T12:00:00.000Z');

test('guest export preserves notes, IDs and date keys', () => {
    const habits = [{ id: 'local-1', name: 'Read' }];
    const completions = { 'local-1': { '2025-01-02': { id: 'c1', note: 'private' } } };
    const backup = createGuestExport(habits, completions, now);
    assert.equal(backup.format, 'auratrack-backup');
    assert.equal(backup.version, 1);
    assert.equal(backup.source, 'guest');
    assert.equal(backup.exportedAt, now.toISOString());
    assert.deepEqual(backup.data, { habits, completions });
    assert.deepEqual(JSON.parse(JSON.stringify(backup)).data.completions, completions);
});

test('cloud export preserves duplicate and orphaned completion documents', () => {
    const snapshot = documents => ({ docs: documents.map(([id, data]) => ({ id, data: () => data })) });
    const habits = snapshot([['a', { name: 'Read', userId: 'u' }]]);
    const completions = snapshot([
        ['one', { habitId: 'a', date: { seconds: 123, nanoseconds: 0 }, note: 'first' }],
        ['two', { habitId: 'a', date: { seconds: 123, nanoseconds: 0 }, note: 'second' }],
        ['orphan', { habitId: 'deleted', note: 'orphan' }],
    ]);
    const backup = createCloudExport(habits, completions, now);
    assert.equal(backup.source, 'firebase');
    assert.deepEqual(backup.data.completions.map(item => item.id), ['one', 'two', 'orphan']);
    assert.equal(backup.data.completions[1].data.note, 'second');
});
