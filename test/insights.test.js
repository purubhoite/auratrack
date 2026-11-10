import test from 'node:test';
import assert from 'node:assert/strict';
import { activitySummary, parseDateKey, recentNotes } from '../src/domain/insights.js';

test('activity counts rolling local-calendar days including leap day and today', () => {
    const habits = [{ id: 'a', name: 'Read' }, { id: 'b', name: 'Move' }];
    const completions = {
        a: { '2024-02-28': { note: '' }, '2024-02-29': { note: '' }, '2024-03-01': { note: '' }, '2024-03-02': { note: '' } },
        b: { '2024-02-29': { note: '' }, '2024-03-01': { note: '' } },
        archived: { '2024-02-29': { note: '' } },
    };
    const result = activitySummary(habits, completions, new Date(2024, 2, 1, 23), 7);
    assert.deepEqual(result.daily.map(day => day.key), ['2024-02-24', '2024-02-25', '2024-02-26', '2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01']);
    assert.deepEqual(result.daily.map(day => day.count), [0, 0, 0, 0, 1, 2, 2]);
    assert.equal(result.total, 5);
    assert.equal(result.activeDays, 3);
    assert.equal(activitySummary([], completions, new Date(2024, 2, 1), 30).total, 0);
});

test('date-only parsing rejects invalid dates and preserves calendar days', () => {
    assert.equal(parseDateKey('2023-02-29'), null);
    assert.equal(parseDateKey('2024-13-01'), null);
    assert.equal(parseDateKey('2024-1-01'), null);
    assert.equal(parseDateKey('0001-01-01'), null);
    const date = parseDateKey('2024-02-29');
    assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2024, 1, 29]);
});

test('notes are ordered, active-habit only, dated through today and skip unsafe entries', () => {
    const habits = [{ id: 'a', name: 'Read' }, { id: 'b', name: 'Move' }];
    const completions = {
        a: { '2024-02-28': { note: 'older' }, '2024-02-29': { note: 'Read note' }, '2024-03-02': { note: 'future' }, 'not-date': { note: 'invalid' } },
        b: { '2024-02-29': { note: 'Move note' }, '2024-03-01': { note: 'unsafe', unsafe: true }, '2024-02-27': { note: '   ' } },
        archived: { '2024-03-01': { note: 'hidden' } },
    };
    const notes = recentNotes(habits, completions, new Date(2024, 2, 1));
    assert.deepEqual(notes.map(n => n.note), ['Move note', 'Read note', 'older']);
    assert.equal(notes[0].dateKey, '2024-02-29');
});

test('rolling days use calendar dates across DST and year boundaries', () => {
    const yearEnd = activitySummary([], {}, new Date(2025, 0, 2, 12), 7);
    assert.deepEqual(yearEnd.daily.map(day => day.key), ['2024-12-27', '2024-12-28', '2024-12-29', '2024-12-30', '2024-12-31', '2025-01-01', '2025-01-02']);
    const spring = activitySummary([], {}, new Date(2025, 2, 11, 12), 7);
    assert.deepEqual(spring.daily.map(day => day.key), ['2025-03-05', '2025-03-06', '2025-03-07', '2025-03-08', '2025-03-09', '2025-03-10', '2025-03-11']);
});
