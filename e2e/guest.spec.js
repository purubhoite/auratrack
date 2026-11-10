import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const key = 'auratrack.guest.v1';

test('guest history, note, archive and export survive reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Account sign-in is unavailable until Supabase is configured.')).toBeVisible();
  await page.getByRole('button', { name: '+ Read', exact: true }).click();
  await page.getByRole('button', { name: 'Mark complete today: Read' }).click();
  await page.getByRole('button', { name: "Edit today's note: Read" }).click();
  await page.getByRole('textbox', { name: 'Habit note' }).fill('One chapter');
  await page.getByRole('button', { name: 'Save Note' }).click();
  await expect(page.getByRole('dialog', { name: 'Note for Read' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(k => localStorage.getItem(k), key)).toContain('One chapter');

  await page.getByRole('button', { name: 'Archive Read' }).click();
  await expect(page.getByRole('button', { name: 'Mark incomplete today: Read' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(k => JSON.parse(localStorage.getItem(k)).habits[0].archived, key)).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Restore Read' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export data' }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup.source).toBe('guest');
  expect(backup.data.habits[0]).toMatchObject({ name: 'Read', archived: true });
  expect(JSON.stringify(backup.data.completions)).toContain('One chapter');

  await page.getByRole('button', { name: 'Restore Read' }).click();
  await page.getByRole('button', { name: "Edit today's note: Read" }).click();
  await expect(page.getByRole('textbox', { name: 'Habit note' })).toHaveValue('One chapter');
});

test('guest tab warns and preserves data changed in another tab', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Read', exact: true }).click();
  await expect.poll(() => page.evaluate(k => localStorage.getItem(k), key)).toContain('Read');
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Archive Read' })).toBeVisible();
  await page.getByRole('button', { name: '+ Exercise', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('changed in another tab');
  await other.getByRole('button', { name: '+ Meditate', exact: true }).click();
  const stored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
  expect(stored.habits.map(h => h.name)).toEqual(['Read', 'Exercise']);
  await other.close();
});

test('page remains horizontally usable and dialogs support keyboard escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Read', exact: true }).click();
  await page.getByRole('button', { name: 'Mark complete today: Read' }).click();
  await page.getByRole('button', { name: "Edit today's note: Read" }).click();
  await expect(page.getByRole('textbox', { name: 'Habit note' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Note for Read' })).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
});

test('uses Today filters and finds a saved journal note', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Read', exact: true }).click();
  await page.getByRole('button', { name: '+ Exercise', exact: true }).click();
  await page.getByRole('button', { name: 'Mark complete today: Read' }).click();
  await page.getByRole('button', { name: "Edit today's note: Read" }).click();
  await page.getByRole('textbox', { name: 'Habit note' }).fill('Read about the stars');
  await page.getByRole('button', { name: 'Save Note' }).click();
  await page.getByRole('button', { name: 'To do', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark incomplete today: Read' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark complete today: Exercise' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search notes and habits' }).fill('STARS');
  await page.getByRole('button', { name: /Edit note for Read/ }).click();
  await expect(page.getByRole('textbox', { name: 'Habit note' })).toHaveValue('Read about the stars');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: '30 days' }).click();
  await expect(page.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Previous month' }).click();
  await page.getByRole('button', { name: 'This month' }).click();
  const currentMonth = await page.evaluate(() => new Date().toLocaleString('default', { month: 'long', year: 'numeric' }));
  await expect(page.getByRole('heading', { name: currentMonth })).toBeVisible();
});
