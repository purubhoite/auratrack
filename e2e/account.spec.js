import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

// This exercises the real browser and Supabase SDK with entirely synthetic HTTP
// responses. It is NOT an Auth, RLS, or API test against the staging project.
test('signs in, imports retained guest data and signs out with mocked Supabase HTTP', async ({ page }) => {
  const requests = [];
  const user = { id: 'test-user', aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', app_metadata: {}, user_metadata: {} };
  const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  await page.route('https://auratrack-browser-tests.invalid/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ path, method: request.method(), body: request.postDataJSON() });
    const respond = (status, json) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(json) });
    if (path === '/auth/v1/token') return respond(200, { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user });
    if (path === '/auth/v1/logout') return respond(200, {});
    if (path === '/rest/v1/auratrack_habits') return respond(200, [{ id: 'account-habit', name: 'Account habit', archived: false, created_at: '2024-01-01T00:00:00Z' }]);
    if (path === '/rest/v1/auratrack_completions') return respond(200, []);
    if (path === '/rest/v1/rpc/auratrack_import_guest_for_user') return respond(200, { habitsCreated: 1, completionsCreated: 1, habitsSkipped: 0, completionsSkipped: 0 });
    return respond(404, { message: `Unexpected mocked request: ${path}` });
  });
  await page.goto('http://127.0.0.1:4176/');
  await page.getByRole('button', { name: '+ Read', exact: true }).click();
  await page.getByRole('button', { name: 'Mark complete today: Read' }).click();
  await page.getByRole('button', { name: "Edit today's note: Read" }).click();
  await page.getByRole('textbox', { name: 'Habit note' }).fill('guest note');
  await page.getByRole('button', { name: 'Save Note' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('auratrack.guest.v1'))).toContain('guest note');
  await page.getByRole('button', { name: 'Login / Sign Up' }).click();
  await page.getByLabel('Email address').fill('test@example.invalid');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Archive Account habit' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Import guest data' }).click();
  await expect(page.getByRole('status')).toContainText('Import complete');
  const imported = requests.find(request => request.path === '/rest/v1/rpc/auratrack_import_guest_for_user');
  expect(imported.body.expected_user).toBe('test-user');
  expect(imported.body.payload.habits[0].name).toBe('Read');
  expect(imported.body.payload.completions[0].note).toBe('guest note');
  await page.getByRole('button', { name: 'Logout' }).click();
  await page.getByRole('button', { name: "Edit today's note: Read" }).click();
  await expect(page.getByRole('textbox', { name: 'Habit note' })).toHaveValue('guest note');
});
