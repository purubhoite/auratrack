// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
    repo: { listHabits: vi.fn(), listCompletions: vi.fn(), createHabit: vi.fn(), renameHabit: vi.fn(), deleteHabit: vi.fn(), setArchived: vi.fn(), complete: vi.fn(), deleteCompletion: vi.fn(), updateNote: vi.fn() },
    download: vi.fn(),
    client: { auth: { onAuthStateChange: vi.fn(), getSession: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() }, rpc: vi.fn() },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => mocks.client) }));
vi.mock('../data/supabaseRepository', () => ({ createSupabaseRepository: vi.fn(() => mocks.repo) }));
vi.mock('../domain/export', async importOriginal => ({ ...await importOriginal(), downloadExport: mocks.download }));
let App;
let onAuth;
beforeAll(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable');
    ({ default: App } = await import('../SupabaseApp.jsx'));
});
beforeEach(() => {
    window.localStorage.clear();
    mocks.repo.listHabits.mockResolvedValue([]);
    mocks.repo.listCompletions.mockResolvedValue([]);
    mocks.client.auth.onAuthStateChange.mockImplementation(callback => { onAuth = callback; callback('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe() {} } } }; });
    mocks.client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('Supabase application', () => {
    it('preserves guest habits and notes across reloads', async () => {
        const user = userEvent.setup();
        const view = render(<App />);
        await user.click(await screen.findByRole('button', { name: '+ Read' }));
        await user.click(screen.getByRole('button', { name: 'Mark complete today: Read' }));
        await user.click(screen.getByRole('button', { name: "Edit today's note: Read" }));
        await user.type(screen.getByRole('textbox', { name: 'Habit note' }), 'A chapter');
        await user.click(screen.getByRole('button', { name: 'Save Note' }));
        await waitFor(() => expect(window.localStorage.getItem('auratrack.guest.v1')).toContain('A chapter'));
        view.unmount();
        render(<App />);
        await user.click(await screen.findByRole('button', { name: "Edit today's note: Read" }));
        expect(screen.getByRole('textbox', { name: 'Habit note' }).value).toBe('A chapter');
    });

    it('archives and restores a guest habit across reloads without losing its note', async () => {
        const user = userEvent.setup();
        const view = render(<App />);
        await user.click(await screen.findByRole('button', { name: '+ Read' }));
        await user.click(screen.getByRole('button', { name: 'Mark complete today: Read' }));
        await user.click(screen.getByRole('button', { name: "Edit today's note: Read" }));
        await user.type(screen.getByRole('textbox', { name: 'Habit note' }), 'Kept history');
        await user.click(screen.getByRole('button', { name: 'Save Note' }));
        await user.click(screen.getByRole('button', { name: 'Archive Read' }));
        expect(screen.queryByRole('button', { name: 'Mark incomplete today: Read' })).toBeNull();
        await waitFor(() => expect(JSON.parse(window.localStorage.getItem('auratrack.guest.v1')).habits[0].archived).toBe(true));
        view.unmount();
        render(<App />);
        await user.click(await screen.findByRole('button', { name: 'Restore Read' }));
        await user.click(screen.getByRole('button', { name: "Edit today's note: Read" }));
        expect(screen.getByRole('textbox', { name: 'Habit note' }).value).toBe('Kept history');
    });

    it('archives and restores an account habit without deleting it', async () => {
        mocks.client.auth.onAuthStateChange.mockImplementation(callback => { onAuth = callback; callback('INITIAL_SESSION', { user: { id: 'alice' } }); return { data: { subscription: { unsubscribe() {} } } }; });
        mocks.repo.listHabits.mockResolvedValue([{ id: 'h', name: 'Read', archived: false }]);
        mocks.repo.setArchived.mockImplementation(async (id, archived) => {
            mocks.repo.listHabits.mockResolvedValue([{ id, name: 'Read', archived }]);
        });
        const user = userEvent.setup(); render(<App />);
        await user.click(await screen.findByRole('button', { name: 'Archive Read' }));
        await user.click(await screen.findByRole('button', { name: 'Restore Read' }));
        await screen.findByRole('button', { name: 'Archive Read' });
        expect(mocks.repo.setArchived.mock.calls).toEqual([['h', true], ['h', false]]);
        expect(mocks.repo.deleteHabit).not.toHaveBeenCalled();
    });

    it('imports only active guest habits and keeps archived history locally', async () => {
        const guest = { version: 1, habits: [{ id: 'a', name: 'Active' }, { id: 'b', name: 'Paused', archived: true }], completions: { a: { '2024-02-29': { note: 'active' } }, b: { '2024-03-01': { note: 'archived' } } } };
        window.localStorage.setItem('auratrack.guest.v1', JSON.stringify(guest));
        mocks.client.auth.onAuthStateChange.mockImplementation(callback => { onAuth = callback; callback('INITIAL_SESSION', { user: { id: 'alice' } }); return { data: { subscription: { unsubscribe() {} } } }; });
        mocks.client.rpc.mockResolvedValue({ data: { habitsCreated: 1, habitsSkipped: 0, completionsCreated: 1, completionsSkipped: 0 }, error: null });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        try {
            const user = userEvent.setup(); render(<App />);
            await user.click(await screen.findByRole('button', { name: 'Import guest data' }));
            await screen.findByText(/Import complete/);
            expect(confirm.mock.calls[0][0]).toMatch(/Archived guest habits stay on this device/);
            expect(mocks.client.rpc).toHaveBeenCalledWith('auratrack_import_guest_for_user', { expected_user: 'alice', payload: { habits: [{ id: 'a', name: 'Active' }], completions: [{ habitId: 'a', date: '2024-02-29', note: 'active' }] } });
            expect(JSON.parse(window.localStorage.getItem('auratrack.guest.v1'))).toEqual(guest);
        } finally { confirm.mockRestore(); }
    });

    it('requests signup and shows the email confirmation state', async () => {
        mocks.client.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
        const user = userEvent.setup();
        render(<App />);
        await user.click(await screen.findByRole('button', { name: 'Login / Sign Up' }));
        await user.click(screen.getByRole('button', { name: 'Create an account' }));
        await user.type(screen.getByLabelText('Email address'), 'test@example.com');
        await user.type(screen.getByLabelText('Password'), 'password123');
        await user.click(screen.getByRole('button', { name: 'Sign Up' }));
        expect(mocks.client.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'test@example.com' }));
        expect(await screen.findByText(/Check your email/)).toBeTruthy();
    });

    it('loads an account and records a completion using that user ID', async () => {
        mocks.client.auth.onAuthStateChange.mockImplementation(callback => { onAuth = callback; callback('INITIAL_SESSION', { user: { id: 'alice' } }); return { data: { subscription: { unsubscribe() {} } } }; });
        mocks.repo.listHabits.mockResolvedValue([{ id: 'h', name: 'Read' }]);
        mocks.repo.complete.mockImplementation(async (habitId, day) => { mocks.repo.listCompletions.mockResolvedValue([{ id: 'c', habit_id: habitId, completed_on: day, note: '' }]); });
        const user = userEvent.setup();
        render(<App />);
        await user.click(await screen.findByRole('button', { name: 'Mark complete today: Read' }));
        await screen.findByRole('button', { name: 'Mark incomplete today: Read' });
        expect(mocks.repo.complete).toHaveBeenCalledWith('h', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 'alice');
    });

    it('imports confirmed guest data without deleting the local copy', async () => {
        const guest = { version: 1, habits: [{ id: 'local-1', name: 'Read' }], completions: { 'local-1': { '2024-02-29': { note: 'hello' } } } };
        window.localStorage.setItem('auratrack.guest.v1', JSON.stringify(guest));
        mocks.client.auth.onAuthStateChange.mockImplementation(callback => { onAuth = callback; callback('INITIAL_SESSION', { user: { id: 'alice' } }); return { data: { subscription: { unsubscribe() {} } } }; });
        mocks.client.rpc.mockResolvedValue({ data: { habitsCreated: 1, habitsSkipped: 0, completionsCreated: 1, completionsSkipped: 0 }, error: null });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        try {
            const user = userEvent.setup(); render(<App />);
            await user.click(await screen.findByRole('button', { name: 'Import guest data' }));
            expect(await screen.findByText(/Import complete/)).toBeTruthy();
            expect(mocks.client.rpc).toHaveBeenCalledWith('auratrack_import_guest_for_user', { expected_user: 'alice', payload: { habits: [{ id: 'local-1', name: 'Read' }], completions: [{ habitId: 'local-1', date: '2024-02-29', note: 'hello' }] } });
            expect(JSON.parse(window.localStorage.getItem('auratrack.guest.v1'))).toEqual(guest);
        } finally { confirm.mockRestore(); }
    });

    it('opens a recovery dialog and updates the password after a recovery event', async () => {
        mocks.client.auth.updateUser.mockResolvedValue({ error: null });
        const user = userEvent.setup(); render(<App />);
        await screen.findByRole('button', { name: 'Login / Sign Up' });
        act(() => { onAuth('PASSWORD_RECOVERY', { user: { id: 'alice' } }); });
        await screen.findByText('Choose a new password');
        await user.type(screen.getByLabelText('Password'), 'newpassword');
        await user.click(screen.getByRole('button', { name: 'Update password' }));
        expect(mocks.client.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword' });
    });

    it('keeps an unreadable guest record intact and does not export a false empty backup', async () => {
        window.localStorage.setItem('auratrack.guest.v1', '{broken');
        render(<App />);
        expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/i);
        expect(screen.getByRole('button', { name: 'Export data' }).disabled).toBe(true);
        expect(window.localStorage.getItem('auratrack.guest.v1')).toBe('{broken');
        expect(mocks.download).not.toHaveBeenCalled();
    });

    it('warns about another tab and does not overwrite its guest data', async () => {
        const user = userEvent.setup(); render(<App />);
        await user.click(await screen.findByRole('button', { name: '+ Read' }));
        await waitFor(() => expect(window.localStorage.getItem('auratrack.guest.v1')).toContain('Read'));
        const other = JSON.stringify({ version: 1, habits: [{ id: 'other', name: 'Other tab' }], completions: {} });
        act(() => {
            window.localStorage.setItem('auratrack.guest.v1', other);
            window.dispatchEvent(new StorageEvent('storage', { key: 'auratrack.guest.v1', newValue: other, storageArea: window.localStorage }));
        });
        expect((await screen.findByRole('alert')).textContent).toMatch(/changed in another tab/);
        await user.click(screen.getByRole('button', { name: '+ Exercise' }));
        expect(window.localStorage.getItem('auratrack.guest.v1')).toBe(other);
        await user.click(screen.getByRole('button', { name: 'Export data' }));
        expect(mocks.download.mock.calls[0][0].data.habits.map(h => h.name)).toEqual(['Read', 'Exercise']);
    });

    it('checks the guest storage baseline before writing even without a storage event', async () => {
        const user = userEvent.setup(); render(<App />);
        await screen.findByRole('button', { name: '+ Read' });
        const other = JSON.stringify({ version: 1, habits: [{ id: 'other', name: 'Other tab' }], completions: {} });
        window.localStorage.setItem('auratrack.guest.v1', other);
        await user.click(screen.getByRole('button', { name: '+ Read' }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/changed in another tab/);
        expect(window.localStorage.getItem('auratrack.guest.v1')).toBe(other);
    });

    it('ignores a delayed account refresh after a switch away and back', async () => {
        mocks.client.auth.onAuthStateChange.mockImplementation(callback => { onAuth = callback; callback('INITIAL_SESSION', { user: { id: 'alice' } }); return { data: { subscription: { unsubscribe() {} } } }; });
        mocks.repo.listHabits.mockResolvedValueOnce([{ id: 'a', name: 'Alice initial' }]);
        const user = userEvent.setup(); render(<App />);
        await screen.findByRole('button', { name: 'Archive Alice initial' });
        let resolveOld;
        mocks.repo.listHabits.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
        mocks.repo.listHabits.mockResolvedValue([{ id: 'a', name: 'Alice fresh' }]);
        await user.click(screen.getByRole('button', { name: 'Refresh' }));
        act(() => { onAuth('SIGNED_IN', { user: { id: 'bob' } }); onAuth('SIGNED_IN', { user: { id: 'alice' } }); });
        expect(await screen.findByRole('button', { name: 'Archive Alice fresh' })).toBeTruthy();
        await act(async () => { resolveOld([{ id: 'b', name: 'Wrong account' }]); });
        expect(screen.queryByText('Wrong account')).toBeNull();
        expect(screen.getByRole('button', { name: 'Archive Alice fresh' })).toBeTruthy();
    });

    it('hides a private note when the signed-in identity changes, even away and back', async () => {
        mocks.repo.listHabits.mockResolvedValue([{ id: 'a', name: 'Alice habit' }]);
        const day = new Date();
        const key = [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-');
        mocks.repo.listCompletions.mockResolvedValue([{ id: 'c', habit_id: 'a', completed_on: key, note: 'private note' }]);
        const user = userEvent.setup(); render(<App />);
        await screen.findByRole('button', { name: 'Login / Sign Up' });
        act(() => { onAuth('SIGNED_IN', { user: { id: 'alice' } }); });
        await user.click(await screen.findByRole('button', { name: "Edit today's note: Alice habit" }));
        expect(screen.getByRole('textbox', { name: 'Habit note' }).value).toBe('private note');
        act(() => { onAuth('SIGNED_IN', { user: { id: 'bob' } }); onAuth('SIGNED_IN', { user: { id: 'alice' } }); });
        expect(screen.queryByRole('textbox', { name: 'Habit note' })).toBeNull();
        expect(mocks.repo.updateNote).not.toHaveBeenCalled();
    });

    it('cancels an account export if the identity changes during its reads', async () => {
        mocks.client.auth.onAuthStateChange.mockImplementation(callback => { onAuth = callback; callback('INITIAL_SESSION', { user: { id: 'alice' } }); return { data: { subscription: { unsubscribe() {} } } }; });
        const user = userEvent.setup(); render(<App />);
        const exportButton = await screen.findByRole('button', { name: 'Export data' });
        let resolveHabits;
        mocks.repo.listHabits.mockImplementationOnce(() => new Promise(resolve => { resolveHabits = resolve; }));
        await user.click(exportButton);
        act(() => { onAuth('SIGNED_IN', { user: { id: 'bob' } }); onAuth('SIGNED_IN', { user: { id: 'alice' } }); });
        await act(async () => { resolveHabits([{ id: 'private', name: 'Alice' }]); });
        await waitFor(() => expect(screen.queryByText('Preparing export…')).toBeNull());
        expect(mocks.download).not.toHaveBeenCalled();
    });

    it('locks note edits and repeat submissions while a save is pending', async () => {
        mocks.client.auth.onAuthStateChange.mockImplementation(callback => { onAuth = callback; callback('INITIAL_SESSION', { user: { id: 'alice' } }); return { data: { subscription: { unsubscribe() {} } } }; });
        mocks.repo.listHabits.mockResolvedValue([{ id: 'a', name: 'Read' }]);
        const day = new Date();
        const key = [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-');
        mocks.repo.listCompletions.mockResolvedValue([{ id: 'c', habit_id: 'a', completed_on: key, note: 'old' }]);
        let finish;
        mocks.repo.updateNote.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const user = userEvent.setup(); render(<App />);
        await user.click(await screen.findByRole('button', { name: "Edit today's note: Read" }));
        const field = screen.getByRole('textbox', { name: 'Habit note' });
        await user.clear(field); await user.type(field, 'new');
        await user.click(screen.getByRole('button', { name: 'Save Note' }));
        expect(field.readOnly).toBe(true);
        expect(screen.getByRole('button', { name: 'Saving…' }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Close' }).disabled).toBe(false);
        await user.keyboard('{Escape}');
        expect(screen.getByRole('dialog', { name: 'Note for Read' })).toBeTruthy();
        await act(async () => { finish({}); });
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Note for Read' })).toBeNull());
        expect(mocks.repo.updateNote).toHaveBeenCalledTimes(1);
        expect(mocks.repo.updateNote).toHaveBeenCalledWith('c', 'new', 'old');
    });

    it('does not show one account’s data to the next account', async () => {
        const aliceHabits = [{ id: 'a', name: 'Alice habit' }];
        mocks.repo.listHabits.mockResolvedValueOnce(aliceHabits).mockResolvedValueOnce([{ id: 'b', name: 'Bob habit' }]);
        render(<App />);
        await screen.findByRole('button', { name: 'Login / Sign Up' });
        act(() => { onAuth('SIGNED_IN', { user: { id: 'alice' } }); });
        expect((await screen.findAllByText('Alice habit')).length).toBeGreaterThan(0);
        act(() => { onAuth('SIGNED_IN', { user: { id: 'bob' } }); });
        expect(screen.queryByText('Alice habit')).toBeNull();
        expect((await screen.findAllByText('Bob habit')).length).toBeGreaterThan(0);
    });
});
