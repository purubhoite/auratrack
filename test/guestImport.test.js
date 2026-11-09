import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareGuestImport } from '../src/domain/guestImport.js';

const guest = () => ({ habits: [{ id: 'local-1', name: ' Read ' }], completions: { 'local-1': { '2024-02-29': { id: 'c', note: 'note' } } } });
test('prepares guest habits and local date-only completions', () => {
    const source = prepareGuestImport(guest());
    assert.equal(source.habits[0].name, 'Read');
    assert.equal(source.entries[0].dateKey, '2024-02-29');
    assert.equal(source.entries[0].date.getDate(), 29);
    assert.equal(source.entries[0].note, 'note');
});
test('rejects malformed source before importing', () => {
    const duplicate = guest(); duplicate.habits.push({ id: 'local-1', name: 'Walk' });
    const invalidDate = guest(); invalidDate.completions['local-1'] = { '2023-02-29': { note: '' } };
    const orphan = guest(); orphan.completions.deleted = {};
    const tooLong = guest(); tooLong.completions['local-1']['2024-02-29'].note = 'x'.repeat(10001);
    for (const invalid of [duplicate, invalidDate, orphan, tooLong]) assert.throws(() => prepareGuestImport(invalid));
});
