import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { importGuestData } from '../../src/domain/guestImport.js';
import process from 'node:process';
import { after, before, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';

const projectId = 'demo-auratrack';
let env;
const own = () => env.authenticatedContext('alice').firestore();
const other = () => env.authenticatedContext('bob').firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run this suite with a Firestore emulator, never against a real project.');
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile('firestore.rules', 'utf8') } });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'habits/a'), { userId: 'alice', name: 'Read', createdAt: Timestamp.now(), legacy: true });
    await setDoc(doc(db, 'habits/b'), { userId: 'bob', name: 'Run', createdAt: Timestamp.now() });
    await setDoc(doc(db, 'completions/c'), { userId: 'alice', habitId: 'a', date: Timestamp.now(), note: 'note' });
    await setDoc(doc(db, 'completions/orphan'), { userId: 'alice', habitId: 'missing', date: Timestamp.now(), note: '' });
  });
});

test('only owners can read records or query their own data', async () => {
  await assertSucceeds(getDoc(doc(own(), 'habits/a')));
  await assertFails(getDoc(doc(other(), 'habits/a')));
  await assertFails(getDoc(doc(anon(), 'habits/a')));
  await assertSucceeds(getDocs(query(collection(own(), 'habits'), where('userId', '==', 'alice'))));
  await assertSucceeds(getDocs(query(collection(own(), 'completions'), where('userId', '==', 'alice'), where('habitId', '==', 'a'))));
  await assertFails(getDocs(collection(own(), 'habits')));
  await assertFails(getDocs(query(collection(own(), 'completions'), where('userId', '==', 'bob'))));
});

test('valid habits can be created and legacy habits renamed, but ownership and fields cannot be changed', async () => {
  await assertSucceeds(setDoc(doc(own(), 'habits/new'), { userId: 'alice', name: 'Walk', createdAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(own(), 'habits/a'), { name: 'Read daily' }));
  await assertFails(setDoc(doc(anon(), 'habits/anonymous'), { userId: 'alice', name: 'Walk', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(own(), 'habits/fake'), { userId: 'bob', name: 'Walk', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(own(), 'habits/extra'), { userId: 'alice', name: 'Walk', createdAt: serverTimestamp(), admin: true }));
  await assertFails(setDoc(doc(own(), 'habits/long'), { userId: 'alice', name: 'x'.repeat(81), createdAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(own(), 'habits/a'), { userId: 'bob' }));
  await assertFails(updateDoc(doc(other(), 'habits/a'), { name: 'stolen' }));
  await assertFails(deleteDoc(doc(other(), 'habits/a')));
});

test('completions require an owned habit and valid fields; only notes can change', async () => {
  const completion = { userId: 'alice', habitId: 'a', date: Timestamp.now(), note: '' };
  await assertSucceeds(setDoc(doc(own(), 'completions/new'), completion));
  await assertSucceeds(updateDoc(doc(own(), 'completions/c'), { note: 'updated' }));
  await assertFails(setDoc(doc(own(), 'completions/foreign'), { ...completion, habitId: 'b' }));
  await assertFails(setDoc(doc(own(), 'completions/missing'), { ...completion, habitId: 'no-such-habit' }));
  await assertFails(setDoc(doc(own(), 'completions/bad-date'), { ...completion, date: '2025-01-01' }));
  await assertFails(setDoc(doc(own(), 'completions/oversized'), { ...completion, note: 'x'.repeat(10001) }));
  await assertFails(updateDoc(doc(own(), 'completions/c'), { habitId: 'b' }));
  await assertFails(updateDoc(doc(other(), 'completions/c'), { note: 'stolen' }));
  await assertFails(deleteDoc(doc(other(), 'completions/c')));
  await assertSucceeds(deleteDoc(doc(own(), 'completions/orphan')));
});

test('unrecognized collections are denied', async () => {
  await assertFails(setDoc(doc(own(), 'other/x'), { userId: 'alice' }));
  await assertFails(getDoc(doc(own(), 'other/x')));
});

test('guest import markers are private, immutable and linked to the owner’s records', async () => {
  const alice = own();
  const marker = doc(alice, 'users/alice/imports/guest-id');
  await assertSucceeds(getDoc(marker));
  await assertFails(getDoc(doc(other(), 'users/alice/imports/guest-id')));
  await assertFails(setDoc(marker, { habitId: 'b', createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(marker, { habitId: 'a', createdAt: serverTimestamp() }));
  await assertFails(updateDoc(marker, { habitId: 'b' }));
  await assertFails(deleteDoc(marker));
  const dayMarker = doc(alice, 'users/alice/imports/guest-id/completions/2025-01-02');
  await assertSucceeds(setDoc(dayMarker, { completionId: 'c', createdAt: serverTimestamp() }));
  await assertFails(deleteDoc(dayMarker));
  await assertFails(setDoc(doc(other(), 'users/alice/imports/guest-id/completions/2025-01-03'), { completionId: 'c', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(alice, 'users/alice/imports/guest-id/completions/invalid'), { completionId: 'c', createdAt: serverTimestamp() }));
});


test('guest import is retryable and never overwrites existing account records', async () => {
  const db = own();
  const data = { habits: [{ id: 'local-1', name: 'Read' }], completions: { 'local-1': { '2024-02-29': { id: 'local-c', note: 'from guest' } } } };
  const first = await importGuestData(db, 'alice', { ...data, completions: {} });
  assert.equal(first.habitsCreated, 1);
  const retry = await importGuestData(db, 'alice', data);
  assert.deepEqual(retry, { habitsCreated: 0, habitsSkipped: 1, completionsCreated: 1, completionsSkipped: 0 });
  const again = await importGuestData(db, 'alice', data);
  assert.deepEqual(again, { habitsCreated: 0, habitsSkipped: 1, completionsCreated: 0, completionsSkipped: 1 });
  const habits = await getDocs(query(collection(db, 'habits'), where('userId', '==', 'alice')));
  const completions = await getDocs(query(collection(db, 'completions'), where('userId', '==', 'alice')));
  assert.equal(habits.size, 2); // Original account habit and the imported copy.
  assert.equal(completions.size, 3); // Original, orphan, and imported completion.
  assert.equal(completions.docs.filter(item => item.data().note === 'from guest').length, 1);
});

test('an interrupted import leaves guest data intact and can resume without duplicates', async () => {
  const db = own();
  const data = { habits: [{ id: 'local-2', name: 'Walk' }], completions: { 'local-2': { '2024-03-01': { note: 'outside' } } } };
  let checks = 0;
  await assert.rejects(importGuestData(db, 'alice', data, () => { if (++checks === 2) throw new Error('interrupted'); }), /interrupted/);
  assert.equal(data.completions['local-2']['2024-03-01'].note, 'outside');
  const retry = await importGuestData(db, 'alice', data);
  assert.deepEqual(retry, { habitsCreated: 0, habitsSkipped: 1, completionsCreated: 1, completionsSkipped: 0 });
  const habits = await getDocs(query(collection(db, 'habits'), where('userId', '==', 'alice')));
  assert.equal(habits.docs.filter(item => item.data().name === 'Walk').length, 1);
});

test('concurrent imports of the same guest source do not duplicate records', async () => {
  const db = own();
  const data = { habits: [{ id: 'local-concurrent', name: 'Meditate' }], completions: { 'local-concurrent': { '2024-03-01': { note: 'quiet' } } } };
  await Promise.all([importGuestData(db, 'alice', data), importGuestData(db, 'alice', data)]);
  const habits = await getDocs(query(collection(db, 'habits'), where('userId', '==', 'alice')));
  const completions = await getDocs(query(collection(db, 'completions'), where('userId', '==', 'alice')));
  assert.equal(habits.docs.filter(item => item.data().name === 'Meditate').length, 1);
  assert.equal(completions.docs.filter(item => item.data().note === 'quiet').length, 1);
});
