// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatDate } from '../domain/tracking';

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({})),
    onAuthStateChanged: vi.fn((auth, callback) => { callback(null); return () => {}; }),
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
    getFirestore: vi.fn(() => ({})), collection: vi.fn(), query: vi.fn(), where: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), deleteDoc: vi.fn(), doc: vi.fn(),
    writeBatch: vi.fn(), getDocs: vi.fn(), getDocsFromServer: vi.fn(), runTransaction: vi.fn(), Timestamp: {}, updateDoc: vi.fn(), serverTimestamp: vi.fn(),
}));

let App;
beforeAll(async () => {
    vi.stubEnv('VITE_API_KEY', 'test');
    vi.stubEnv('VITE_AUTH_DOMAIN', 'test');
    vi.stubEnv('VITE_PROJECT_ID', 'test');
    vi.stubEnv('VITE_APP_ID', 'test');
    ({ default: App } = await import('../App.jsx'));
});
beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('guest daily tracking', () => {
    it('persists a completion and note and keeps history when a habit is renamed', async () => {
        const user = userEvent.setup();
        const view = render(<App />);
        await user.type(await screen.findByLabelText('Habit name'), 'Read');
        await user.click(screen.getByRole('button', { name: 'Add habit' }));
        await user.click(screen.getByRole('button', { name: 'Mark complete today: Read' }));
        expect(screen.getByText('1 of 1 completed')).toBeTruthy();
        const date = formatDate(new Date());
        expect(screen.getByRole('button', { name: `Mark incomplete: Read, ${date}` }).getAttribute('aria-pressed')).toBe('true');
        await user.click(screen.getByRole('button', { name: "Edit today's note: Read" }));
        await user.type(screen.getByRole('textbox', { name: 'Habit note' }), 'A good chapter');
        await user.click(screen.getByRole('button', { name: 'Save Note' }));
        await user.click(screen.getByRole('button', { name: 'Rename Read' }));
        const rename = screen.getByRole('form', { name: 'Rename Read' });
        const input = within(rename).getByLabelText('Habit name');
        await user.clear(input);
        await user.type(input, 'Read daily');
        await user.click(within(rename).getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Mark incomplete today: Read daily' })).toBeTruthy());
        await waitFor(() => expect(window.localStorage.getItem('auratrack.guest.v1')).toContain('Read daily'));
        view.unmount();
        render(<App />);
        await user.click(await screen.findByRole('button', { name: "Edit today's note: Read daily" }));
        expect(screen.getByRole('textbox', { name: 'Habit note' }).value).toBe('A good chapter');
    });

    it('keeps keyboard focus in the note dialog and restores it on Escape', async () => {
        const user = userEvent.setup();
        render(<App />);
        await user.click(await screen.findByRole('button', { name: '+ Read' }));
        await user.click(screen.getByRole('button', { name: 'Mark complete today: Read' }));
        const trigger = screen.getByRole('button', { name: "Edit today's note: Read" });
        await user.click(trigger);
        const dialog = screen.getByRole('dialog', { name: 'Note for Read' });
        expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: 'Habit note' }));
        await user.keyboard('{Shift>}{Tab}{/Shift}');
        expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Save Note' }));
        await user.keyboard('{Tab}');
        expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: 'Habit note' }));
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it('offers a guest backup download', async () => {
        const user = userEvent.setup();
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        URL.createObjectURL = vi.fn(() => 'blob:backup');
        URL.revokeObjectURL = vi.fn();
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        try {
            render(<App />);
            await user.click(await screen.findByRole('button', { name: '+ Read' }));
            await user.click(screen.getByRole('button', { name: 'Export data' }));
            expect(URL.createObjectURL).toHaveBeenCalledOnce();
            expect(URL.createObjectURL.mock.calls[0][0].type).toBe('application/json');
            expect(click).toHaveBeenCalledOnce();
            expect(click.mock.instances[0].download).toMatch(/^auratrack-guest-.*\.json$/);
        } finally {
            click.mockRestore();
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
        }
    });

    it('asks before removing a completion that has a note', async () => {
        const user = userEvent.setup();
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<App />);
        await user.click(await screen.findByRole('button', { name: '+ Read' }));
        await user.click(screen.getByRole('button', { name: 'Mark complete today: Read' }));
        await user.click(screen.getByRole('button', { name: "Edit today's note: Read" }));
        await user.type(screen.getByRole('textbox', { name: 'Habit note' }), 'Keep me');
        await user.click(screen.getByRole('button', { name: 'Save Note' }));
        await user.click(screen.getByRole('button', { name: 'Mark incomplete today: Read' }));
        expect(confirm).toHaveBeenCalledOnce();
        expect(screen.getByRole('button', { name: 'Mark incomplete today: Read' })).toBeTruthy();
        confirm.mockRestore();
    });
});

it('refreshes the daily check-in after midnight', () => {
    vi.useFakeTimers();
    try {
        vi.setSystemTime(new Date(2025, 11, 31, 23, 59, 30));
        window.localStorage.setItem('auratrack.guest.v1', JSON.stringify({
            version: 1,
            habits: [{ id: 'a', name: 'Read' }],
            completions: { a: { '2025-12-31': { id: 'c', note: '' } } },
        }));
        render(<App />);
        expect(screen.getByText('1 of 1 completed')).toBeTruthy();
        act(() => { vi.advanceTimersByTime(60000); });
        expect(screen.getByText('0 of 1 completed')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Mark complete today: Read' })).toBeTruthy();
    } finally {
        vi.useRealTimers();
    }
});

it('does not show a previous account’s data when the signed-in user changes', async () => {
    const { onAuthStateChanged } = await import('firebase/auth');
    const { onSnapshot } = await import('firebase/firestore');
    let authChanged;
    const observers = [];
    onAuthStateChanged.mockImplementationOnce((auth, callback) => { authChanged = callback; return () => {}; });
    onSnapshot.mockImplementation((query, options, callback) => { observers.push(callback); return () => {}; });
    render(<App />);
    act(() => { authChanged({ uid: 'alice' }); });
    act(() => {
        observers[0]({ docs: [{ id: 'a', data: () => ({ name: 'Alice private habit', userId: 'alice' }) }] });
        observers[1]({ docs: [] });
    });
    expect(screen.getAllByText('Alice private habit').length).toBeGreaterThan(0);
    act(() => { authChanged({ uid: 'bob' }); });
    expect(screen.queryByText('Alice private habit')).toBeNull();
    act(() => {
        // A late callback from the unsubscribed listener must not repopulate the new account.
        observers[0]({ docs: [{ id: 'a', data: () => ({ name: 'Alice private habit', userId: 'alice' }) }] });
        observers[2]({ docs: [{ id: 'b', data: () => ({ name: 'Bob habit', userId: 'bob' }) }] });
        observers[3]({ docs: [] });
    });
    expect(screen.queryByText('Alice private habit')).toBeNull();
    expect(screen.getAllByText('Bob habit').length).toBeGreaterThan(0);
});

it('warns about duplicate records, blocks editing them, and shows cache state', async () => {
    const { onAuthStateChanged } = await import('firebase/auth');
    const { onSnapshot, deleteDoc } = await import('firebase/firestore');
    const observers = [];
    onAuthStateChanged.mockImplementationOnce((auth, callback) => { callback({ uid: 'alice' }); return () => {}; });
    onSnapshot.mockImplementation((query, options, callback) => { observers.push(callback); return () => {}; });
    render(<App />);
    const metadata = { fromCache: true, hasPendingWrites: false };
    const date = new Date();
    act(() => {
        observers[0]({ metadata, docs: [{ id: 'a', data: () => ({ name: 'Read', userId: 'alice' }) }] });
        observers[1]({ metadata, docs: [
            { id: 'one', data: () => ({ habitId: 'a', date: { toDate: () => date }, note: 'one' }) },
            { id: 'two', data: () => ({ habitId: 'a', date: { toDate: () => date }, note: 'two' }) },
        ] });
    });
    expect(screen.getByText(/1 day has duplicate completion records/)).toBeTruthy();
    expect(screen.getByText(/Showing cached account data/)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Mark incomplete today: Read' });
    expect(button.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: "Edit today's note: Read" })).toBeNull();
    await userEvent.setup().click(button);
    expect(deleteDoc).not.toHaveBeenCalled();
    act(() => {
        const synced = { fromCache: false, hasPendingWrites: false };
        observers[0]({ metadata: synced, docs: [{ id: 'a', data: () => ({ name: 'Read', userId: 'alice' }) }] });
        observers[1]({ metadata: synced, docs: [] });
    });
    expect(screen.getByText('Showing account data received from the server.')).toBeTruthy();
});

describe('guest to account import', () => {
    it('requires confirmation, preserves guest storage and reports the result', async () => {
        const { onAuthStateChanged } = await import('firebase/auth');
        const { onSnapshot } = await import('firebase/firestore');
        const importer = await import('../domain/guestImport');
        const runImport = vi.spyOn(importer, 'importGuestData').mockResolvedValue({ habitsCreated: 1, habitsSkipped: 0, completionsCreated: 1, completionsSkipped: 0 });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
        onAuthStateChanged.mockImplementationOnce((auth, callback) => { callback({ uid: 'alice' }); return () => {}; });
        onSnapshot.mockImplementation((query, options, callback) => { callback({ docs: [] }); return () => {}; });
        const guest = { version: 1, habits: [{ id: 'local-1', name: 'Read' }], completions: { 'local-1': { '2025-01-02': { note: 'hello' } } } };
        window.localStorage.setItem('auratrack.guest.v1', JSON.stringify(guest));
        try {
            const user = userEvent.setup();
            render(<App />);
            await user.click(await screen.findByRole('button', { name: 'Import guest data' }));
            expect(runImport).not.toHaveBeenCalled();
            await user.click(screen.getByRole('button', { name: 'Import guest data' }));
            expect(await screen.findByText(/Import complete: 1 habit\(s\) and 1 completion\(s\) added/)).toBeTruthy();
            expect(runImport).toHaveBeenCalledOnce();
            expect(JSON.parse(window.localStorage.getItem('auratrack.guest.v1'))).toEqual(guest);
        } finally {
            confirm.mockRestore();
            runImport.mockRestore();
        }
    });

    it('explains a partial failure and leaves the guest data available for retry', async () => {
        const { onAuthStateChanged } = await import('firebase/auth');
        const { onSnapshot } = await import('firebase/firestore');
        const importer = await import('../domain/guestImport');
        const runImport = vi.spyOn(importer, 'importGuestData').mockRejectedValue(new Error('offline'));
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        onAuthStateChanged.mockImplementationOnce((auth, callback) => { callback({ uid: 'alice' }); return () => {}; });
        onSnapshot.mockImplementation((query, options, callback) => { callback({ docs: [] }); return () => {}; });
        const guest = { version: 1, habits: [{ id: 'local-1', name: 'Read' }], completions: {} };
        window.localStorage.setItem('auratrack.guest.v1', JSON.stringify(guest));
        try {
            const user = userEvent.setup();
            render(<App />);
            await user.click(await screen.findByRole('button', { name: 'Import guest data' }));
            expect(await screen.findByText(/Import did not finish/)).toBeTruthy();
            expect(screen.getByRole('button', { name: 'Import guest data' }).disabled).toBe(false);
            expect(JSON.parse(window.localStorage.getItem('auratrack.guest.v1'))).toEqual(guest);
        } finally {
            error.mockRestore(); confirm.mockRestore(); runImport.mockRestore();
        }
    });
});

describe('account data export', () => {
    it('requests both collections from the server and downloads a backup', async () => {
        const { onAuthStateChanged } = await import('firebase/auth');
        const { onSnapshot, getDocsFromServer } = await import('firebase/firestore');
        onAuthStateChanged.mockImplementationOnce((auth, callback) => { callback({ uid: 'user-1' }); return () => {}; });
        onSnapshot.mockImplementation((query, options, callback) => { callback({ docs: [] }); return () => {}; });
        getDocsFromServer.mockResolvedValueOnce({ docs: [{ id: 'h', data: () => ({ userId: 'user-1', name: 'Read' }) }] });
        getDocsFromServer.mockResolvedValueOnce({ docs: [{ id: 'c', data: () => ({ userId: 'user-1', habitId: 'h', note: 'Note' }) }] });
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        URL.createObjectURL = vi.fn(() => 'blob:backup');
        URL.revokeObjectURL = vi.fn();
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        try {
            const user = userEvent.setup();
            render(<App />);
            await user.click(await screen.findByRole('button', { name: 'Export data' }));
            await waitFor(() => expect(click).toHaveBeenCalledOnce());
            expect(getDocsFromServer).toHaveBeenCalledTimes(2);
            expect(click.mock.instances[0].download).toMatch(/^auratrack-firebase-.*\.json$/);
            const blob = URL.createObjectURL.mock.calls[0][0];
            const content = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsText(blob);
            });
            const backup = JSON.parse(content);
            expect(backup.data.habits[0].id).toBe('h');
            expect(backup.data.completions[0].data.note).toBe('Note');
        } finally {
            click.mockRestore();
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
        }
    });

    it('does not download a partial backup if a server query fails', async () => {
        const { onAuthStateChanged } = await import('firebase/auth');
        const { onSnapshot, getDocsFromServer } = await import('firebase/firestore');
        onAuthStateChanged.mockImplementationOnce((auth, callback) => { callback({ uid: 'user-1' }); return () => {}; });
        onSnapshot.mockImplementation((query, options, callback) => { callback({ docs: [] }); return () => {}; });
        getDocsFromServer.mockResolvedValueOnce({ docs: [] }).mockRejectedValueOnce(new Error('offline'));
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        try {
            const user = userEvent.setup();
            render(<App />);
            await user.click(await screen.findByRole('button', { name: 'Export data' }));
            expect(await screen.findByText('Could not export your data. Check your connection and try again.')).toBeTruthy();
            expect(click).not.toHaveBeenCalled();
        } finally {
            error.mockRestore();
            click.mockRestore();
        }
    });
});

describe('account recovery', () => {
    it('sends a password reset request and displays a generic confirmation', async () => {
        const user = userEvent.setup();
        const { sendPasswordResetEmail } = await import('firebase/auth');
        render(<App />);
        await user.click(await screen.findByRole('button', { name: 'Login / Sign Up' }));
        await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
        await user.type(screen.getByLabelText('Email address'), 'person@example.com');
        await user.click(screen.getByRole('button', { name: 'Send reset link' }));
        expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'person@example.com');
        await screen.findByRole('status');
        expect(screen.getByRole('status').textContent).toContain('If an account exists');
    });
});
