import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SolidCard, PrimaryButton, CloseIcon, Toast, NoteModal, ProgressOverview, CalendarGrid, TodayView } from './components/TrackerUI';
import { useDialogFocus } from './hooks/useDialogFocus';
import { ActivityInsights, NotesJournal } from './components/Insights';
import { calculateStreak, formatDate, GUEST_STORAGE_KEY, moveMonth, readGuestData, writeGuestData } from './domain/tracking';
import { prepareGuestImport } from './domain/importValidation';
import { createGuestExport, downloadExport } from './domain/export';
import { createSupabaseRepository } from './data/supabaseRepository';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;
const repository = supabase ? createSupabaseRepository(supabase) : null;
const emptyHabits = [];
const emptyCompletions = {};

function useToday() {
    const [date, setDate] = useState(() => formatDate(new Date()));
    useEffect(() => {
        const update = () => setDate(formatDate(new Date()));
        const timer = window.setInterval(update, 60000);
        document.addEventListener('visibilitychange', update);
        return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); };
    }, []);
    const [year, month, day] = date.split('-').map(Number);
    return useMemo(() => new Date(year, month - 1, day), [year, month, day]);
}

function useGuest() {
    const [initial] = useState(() => {
        try {
            const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
            return { data: readGuestData({ getItem: () => raw }), baseline: raw, error: '', readFailed: false };
        } catch {
            return { data: { habits: [], completions: {} }, baseline: null, readFailed: true, error: 'Guest data could not be read. Changes will not be saved in this browser, and an export cannot be prepared.' };
        }
    });
    const [guest, setGuest] = useState(initial);
    const persisted = useRef(initial.baseline);
    const conflict = 'Guest data changed in another tab. Changes here will not be saved or imported. In guest mode, export this tab’s data if needed, then reload to see the other tab’s data.';
    useEffect(() => {
        if (guest.error) return;
        try {
            const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
            if (raw !== persisted.current) {
                setGuest(previous => ({ ...previous, error: conflict }));
                return;
            }
            const next = JSON.stringify({ version: 1, ...guest.data });
            if (raw !== next) {
                writeGuestData(window.localStorage, guest.data);
                persisted.current = next;
            }
        } catch { setGuest(previous => ({ ...previous, error: 'Guest changes could not be saved in this browser. They may be lost when you leave.' })); }
    }, [guest.data, guest.error]);
    useEffect(() => {
        const onStorage = event => {
            if (event.key !== GUEST_STORAGE_KEY && event.key !== null) return;
            try {
                if (event.storageArea === window.localStorage && window.localStorage.getItem(GUEST_STORAGE_KEY) !== persisted.current) {
                    setGuest(previous => previous.error ? previous : { ...previous, error: conflict });
                }
            } catch { setGuest(previous => previous.error ? previous : { ...previous, error: 'Guest data could not be checked in this browser. Changes may not be saved.' }); }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);
    const update = (field, fn) => setGuest(previous => ({ ...previous, data: { ...previous.data, [field]: typeof fn === 'function' ? fn(previous.data[field]) : fn } }));
    return { guest, setHabits: fn => update('habits', fn), setCompletions: fn => update('completions', fn) };
}

function useSession() {
    // A new token for each identity transition also catches a switch away and back.
    const identity = useRef({ uid: null, sequence: 0 });
    const [state, setState] = useState(() => ({ loading: Boolean(supabase), user: null, recovery: false, error: '', identityToken: identity.current }));
    const changeIdentity = uid => { if (identity.current.uid !== uid) identity.current = { uid, sequence: identity.current.sequence + 1 }; };
    useEffect(() => {
        if (!supabase) return;
        let active = true;
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (active) {
                changeIdentity(session?.user?.id || null);
                setState(previous => ({ loading: false, user: session?.user || null, recovery: event === 'PASSWORD_RECOVERY' || (previous.recovery && event !== 'SIGNED_OUT'), error: '', identityToken: identity.current }));
            }
        });
        supabase.auth.getSession().then(({ error }) => {
            if (active && error) { changeIdentity(null); setState({ loading: false, user: null, recovery: false, error: 'Could not restore your session. Please try signing in again.', identityToken: identity.current }); }
        }).catch(() => { if (active) { changeIdentity(null); setState({ loading: false, user: null, recovery: false, error: 'Could not restore your session. Please try signing in again.', identityToken: identity.current }); } });
        return () => { active = false; subscription.unsubscribe(); };
    }, []);
    return { ...state, identity, finishRecovery: () => setState(previous => ({ ...previous, recovery: false })) };
}

function AuthModal({ onClose, recovery = false }) {
    const ref = useDialogFocus(onClose);
    const [mode, setMode] = useState(recovery ? 'new-password' : 'login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const changeMode = value => { setMode(value); setError(''); setMessage(''); };
    const submit = async event => {
        event.preventDefault();
        setLoading(true); setError(''); setMessage('');
        try {
            if (mode === 'reset') {
                const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/?auth=recovery` });
                if (result.error) throw result.error;
                setMessage('If an account exists for this email, a password reset link will be sent.');
            } else if (mode === 'new-password') {
                const result = await supabase.auth.updateUser({ password });
                if (result.error) throw result.error;
                onClose();
            } else if (mode === 'signup') {
                const result = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/` } });
                if (result.error) throw result.error;
                if (result.data.session) onClose();
                else setMessage('Check your email for a confirmation link, then sign in.');
            } else {
                const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (result.error) throw result.error;
                onClose();
            }
        } catch (err) {
            setError(mode === 'login' ? 'Could not sign in. Check your email and password, and confirm your email if required.' : (err.message || 'Something went wrong. Please try again.'));
        } finally { setLoading(false); }
    };
    const title = mode === 'reset' ? 'Reset password' : mode === 'new-password' ? 'Choose a new password' : 'AuraTrack';
    return <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="supabase-auth-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="relative w-full max-w-md p-4 m-4"><SolidCard className="p-8">
            <button aria-label="Close sign-in" onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white"><CloseIcon /></button>
            <h2 id="supabase-auth-title" className="text-3xl font-bold text-center">{title}</h2>
            <p className="text-center text-zinc-400 mt-2">{mode === 'reset' ? 'Enter your email to request a reset link.' : mode === 'new-password' ? 'Enter your new password.' : mode === 'signup' ? 'Create an account to track across devices.' : 'Welcome back!'}</p>
            <form onSubmit={submit} className="mt-8 space-y-5">
                {mode !== 'new-password' && <input data-initial-focus aria-label="Email address" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email address" className="block w-full px-3 py-3 text-zinc-100 bg-zinc-900 border border-zinc-700 rounded-md" />}
                {mode !== 'reset' && <input data-initial-focus={mode === 'new-password' ? '' : undefined} aria-label="Password" type="password" required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Password" className="block w-full px-3 py-3 text-zinc-100 bg-zinc-900 border border-zinc-700 rounded-md" />}
                {error && <p role="alert" className="text-sm text-center text-red-400">{error}</p>}
                {message && <p role="status" className="text-sm text-center text-amber-300">{message}</p>}
                <PrimaryButton type="submit" className="w-full" disabled={loading}>{loading ? 'Processing…' : mode === 'reset' ? 'Send reset link' : mode === 'new-password' ? 'Update password' : mode === 'signup' ? 'Sign Up' : 'Sign In'}</PrimaryButton>
            </form>
            {mode !== 'new-password' && <div className="mt-6 flex flex-col gap-3 text-sm text-center"><button onClick={() => changeMode(mode === 'login' ? 'reset' : 'login')} className="text-amber-400 underline">{mode === 'login' ? 'Forgot password?' : 'Back to sign in'}</button>{mode === 'login' && <button onClick={() => changeMode('signup')} className="text-amber-400 underline">Create an account</button>}</div>}
        </SolidCard></div>
    </div>;
}

function groupCompletions(rows) {
    const result = {};
    for (const row of rows) {
        if (!result[row.habit_id]) result[row.habit_id] = {};
        result[row.habit_id][row.completed_on] = { id: row.id, note: row.note };
    }
    return result;
}

export default function SupabaseApp() {
    const { loading: authLoading, user, recovery, error: authError, finishRecovery, identity, identityToken } = useSession();
    const { guest, setHabits: setGuestHabits, setCompletions: setGuestCompletions } = useGuest();
    const today = useToday();
    const [account, setAccount] = useState({ owner: null, loading: false, error: '', habits: [], completions: {} });
    const requestId = useRef(0);
    const activeUser = useRef(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [authOpen, setAuthOpen] = useState(false);
    const [noteModal, setNoteModal] = useState(null);
    const [processing, setProcessing] = useState({ type: null, id: null });
    const [pending, setPending] = useState(() => new Set());
    const pendingRef = useRef(new Set());
    const addRef = useRef(false);
    const habitLocks = useRef(new Set());
    const [importing, setImporting] = useState(false);
    const importRef = useRef(false);
    const [importStatus, setImportStatus] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => { setToast({ show: true, message, type }); window.setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000); };
    const uid = user?.id;

    const refresh = useCallback(async (showLoading = false) => {
        if (!uid || !repository || activeUser.current !== uid || identity.current !== identityToken) return false;
        const id = ++requestId.current;
        if (showLoading) setAccount(previous => previous.owner === uid
            ? { ...previous, loading: true, error: '' }
            : { owner: uid, loading: true, error: '', habits: [], completions: {} });
        try {
            const [habits, completions] = await Promise.all([repository.listHabits(), repository.listCompletions()]);
            if (requestId.current === id && identity.current === identityToken) setAccount({ owner: uid, loading: false, error: '', habits, completions: groupCompletions(completions) });
            return true;
        } catch (error) {
            console.error('Unable to load account data:', error);
            if (requestId.current === id && identity.current === identityToken) setAccount(previous => ({ ...previous, owner: uid, loading: false, error: 'Could not load your account data. Check your connection and retry.' }));
            return false;
        }
    }, [uid, identity, identityToken]);
    useEffect(() => {
        const requests = requestId;
        const currentUser = activeUser;
        currentUser.current = uid || null;
        if (uid) refresh(true);
        else { requests.current++; setAccount({ owner: null, loading: false, error: '', habits: [], completions: {} }); }
        return () => { currentUser.current = null; requests.current++; };
    }, [uid, refresh]);
    useEffect(() => {
        if (!uid) return;
        const refreshVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', refreshVisible);
        return () => document.removeEventListener('visibilitychange', refreshVisible);
    }, [uid, refresh]);

    const allHabits = uid ? (account.owner === uid ? account.habits : emptyHabits) : guest.data.habits;
    const habits = useMemo(() => allHabits.filter(habit => !habit.archived), [allHabits]);
    const archivedHabits = useMemo(() => allHabits.filter(habit => habit.archived), [allHabits]);
    const completions = uid ? (account.owner === uid ? account.completions : emptyCompletions) : guest.data.completions;
    const streakData = useMemo(() => Object.fromEntries(habits.map(habit => [habit.id, calculateStreak(completions[habit.id] || {}, today)])), [habits, completions, today]);
    const openNote = (habit, date) => setNoteModal({ habit, date, completion: completions[habit.id]?.[formatDate(date)], identity: identity.current });

    const addHabit = async name => {
        const value = name.trim();
        if (!value || value.length > 80 || addRef.current) return false;
        addRef.current = true; setProcessing({ type: 'add', id: null });
        try {
            if (uid) { await repository.createHabit(value, uid); await refresh(); }
            else setGuestHabits(prev => [...prev, { id: `local-${crypto.randomUUID()}`, name: value }]);
            return true;
        } catch (error) { console.error(error); showToast('Could not add habit. Please try again.', 'error'); return false; }
        finally { addRef.current = false; setProcessing({ type: null, id: null }); }
    };
    const renameHabit = async (id, name) => {
        try {
            if (uid) { await repository.renameHabit(id, name); await refresh(); }
            else setGuestHabits(prev => prev.map(habit => habit.id === id ? { ...habit, name } : habit));
            return true;
        } catch (error) { console.error(error); return false; }
    };
    const setArchived = async (id, archived) => {
        if (habitLocks.current.has(id)) return;
        habitLocks.current.add(id);
        setProcessing({ type: 'archive', id });
        try {
            if (uid) { await repository.setArchived(id, archived); await refresh(); }
            else setGuestHabits(prev => prev.map(habit => habit.id === id ? { ...habit, archived } : habit));
        } catch (error) { console.error(error); showToast(`Could not ${archived ? 'archive' : 'restore'} habit. Please try again.`, 'error'); }
        finally { habitLocks.current.delete(id); setProcessing({ type: null, id: null }); }
    };
    const deleteHabit = async id => {
        if (habitLocks.current.has(id)) return;
        if (!window.confirm('Delete this habit and its completion history? This cannot be undone.')) return;
        habitLocks.current.add(id); setProcessing({ type: 'delete', id });
        try {
            if (uid) { await repository.deleteHabit(id); await refresh(); }
            else {
                setGuestHabits(prev => prev.filter(habit => habit.id !== id));
                setGuestCompletions(prev => { const next = { ...prev }; delete next[id]; return next; });
            }
        } catch (error) { console.error(error); showToast('Could not delete habit. Please try again.', 'error'); }
        finally { habitLocks.current.delete(id); setProcessing({ type: null, id: null }); }
    };
    const toggle = async (habitId, date) => {
        const day = formatDate(date);
        const completion = completions[habitId]?.[day];
        const key = `${habitId}-${day}`;
        if (pendingRef.current.has(key)) return;
        if (completion?.note && !window.confirm('Marking this day incomplete will delete its note. Continue?')) return;
        pendingRef.current.add(key); setPending(new Set(pendingRef.current));
        try {
            if (uid) {
                if (completion) await repository.deleteCompletion(completion.id, completion.note);
                else await repository.complete(habitId, day, uid);
                await refresh();
            } else {
                setGuestCompletions(prev => {
                    const next = { ...prev, [habitId]: { ...prev[habitId] } };
                    if (completion) delete next[habitId][day];
                    else next[habitId][day] = { id: `local-${crypto.randomUUID()}`, note: '' };
                    return next;
                });
            }
        } catch (error) { console.error(error); showToast('Could not update completion. It may have changed on another device; refresh and try again.', 'error'); if (uid) await refresh(); }
        finally { pendingRef.current.delete(key); setPending(new Set(pendingRef.current)); }
    };
    const saveNote = async (habitId, date, note, completionId) => {
        const opened = noteModal;
        if (!opened || opened.identity !== identity.current) return;
        try {
            if (uid) { await repository.updateNote(completionId, note, noteModal?.completion?.note || ''); await refresh(); }
            else setGuestCompletions(prev => {
                const day = formatDate(date);
                if (!prev[habitId]?.[day]) return prev;
                return { ...prev, [habitId]: { ...prev[habitId], [day]: { ...prev[habitId][day], note } } };
            });
            setNoteModal(current => current === opened ? null : current);
        } catch (error) { console.error(error); if (opened.identity === identity.current) showToast('Could not save note. It may have changed on another device; copy your note, close this dialog and refresh.', 'error'); }
    };
    const importGuest = async () => {
        if (!uid || guest.error || importRef.current) return;
        let source;
        try {
            source = prepareGuestImport(guest.data);
            // Archived guest habits are kept locally until the user restores them.
            const activeIds = new Set(guest.data.habits.filter(habit => !habit.archived).map(habit => habit.id));
            source = { habits: source.habits.filter(habit => activeIds.has(habit.id)), entries: source.entries.filter(entry => activeIds.has(entry.habitId)) };
        }
        catch (error) { setImportStatus({ uid, message: error.message }); return; }
        if (!source.habits.length) { setImportStatus({ uid, message: 'Restore a guest habit before importing it. Guest data remains on this device.' }); return; }
        if (source.habits.length > 200 || source.entries.length > 5000) { setImportStatus({ uid, message: 'Import is limited to 200 habits and 5,000 completions. Your guest data is unchanged.' }); return; }
        if (!window.confirm('Import active guest habits and history into this account? Archived guest habits stay on this device until restored. Guest data stays on this device. Matching names remain separate and previously imported records are skipped.')) return;
        importRef.current = true; setImporting(true);
        setImportStatus({ uid, message: 'Importing… keep this page open.' });
        try {
            const payload = { habits: source.habits, completions: source.entries.map(entry => ({ habitId: entry.habitId, date: entry.dateKey, note: entry.note })) };
            const { data, error } = await supabase.rpc('auratrack_import_guest_for_user', { expected_user: uid, payload });
            if (error) throw error;
            setImportStatus({ uid, message: `Import complete: ${data.habitsCreated} habit(s) and ${data.completionsCreated} completion(s) added; ${data.habitsSkipped} habit(s) and ${data.completionsSkipped} completion(s) skipped.` });
            await refresh();
        } catch (error) {
            console.error('Import failed:', error);
            setImportStatus({ uid, message: 'Import could not be completed. Your guest data is unchanged. Check your connection and try again; previously imported records are skipped.' });
        } finally { importRef.current = false; setImporting(false); }
    };
    const exportData = async () => {
        if (exporting || (!uid && guest.readFailed)) return;
        const exportIdentity = identity.current;
        setExporting(true);
        try {
            let backup;
            if (uid) {
                const [allHabits, allCompletions] = await Promise.all([repository.listHabits(), repository.listCompletions()]);
                backup = { format: 'auratrack-backup', version: 1, source: 'supabase', exportedAt: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null, data: { habits: allHabits, completions: allCompletions } };
            } else backup = createGuestExport(guest.data.habits, guest.data.completions);
            // Authentication may change during paginated reads; never export a mixed-account result.
            if (identity.current !== exportIdentity) { showToast('Export canceled because the account changed. Please try again.', 'error'); return; }
            downloadExport(backup);
        } catch (error) { console.error(error); showToast('Could not export data. Check your connection and retry.', 'error'); }
        finally { setExporting(false); }
    };
    const signOut = async () => { const { error } = await supabase.auth.signOut(); if (error) showToast('Could not sign out. Please try again.', 'error'); };

    if (authLoading || (uid && (account.owner !== uid || account.loading))) return <div className="flex items-center justify-center min-h-screen bg-zinc-900 text-zinc-100">Loading AuraTrack…</div>;
    return <div className="min-h-screen bg-zinc-900 text-zinc-100 font-sans flex flex-col">
        {(authOpen || recovery) && <AuthModal key={recovery ? 'recovery' : 'auth'} recovery={recovery} onClose={() => { setAuthOpen(false); finishRecovery(); }} />}
        {noteModal && noteModal.identity === identity.current && <NoteModal {...noteModal} onSave={saveNote} onCancel={() => setNoteModal(null)} />}
        <Toast {...toast} />
        <header className="sticky top-0 z-30 p-4 bg-zinc-900/80 backdrop-blur-lg border-b border-zinc-700"><div className="container mx-auto flex justify-between items-center"><h1 className="text-2xl font-bold">AuraTrack</h1>{uid ? <PrimaryButton disabled={importing} onClick={signOut}>Logout</PrimaryButton> : <PrimaryButton disabled={!supabase} onClick={() => setAuthOpen(true)}>Login / Sign Up</PrimaryButton>}</div></header>
        <main className="container mx-auto p-4 md:p-8 flex-grow">
            {authError && <div role="alert" className="p-4 mb-6 text-red-200 bg-red-900/40 border border-red-500 rounded-lg">{authError}</div>}
            {!uid && <div className="p-4 mb-6 text-center text-amber-200 bg-amber-900/30 border border-amber-500/30 rounded-lg">Guest data is stored in this browser only and can be lost if browser data is cleared. {supabase ? <> <button onClick={() => setAuthOpen(true)} className="font-bold underline hover:text-white">Sign in or create an account</button> for cloud tracking. Guest data is not imported automatically.</> : 'Account sign-in is unavailable until Supabase is configured.'}</div>}
            {guest.error && <div role="alert" className="p-4 mb-6 text-red-200 bg-red-900/40 border border-red-500 rounded-lg">{guest.error}</div>}
            {uid && account.error ? <div role="alert" className="p-4 mb-6 text-red-200 bg-red-900/40 border border-red-500 rounded-lg">{account.error} <button className="underline font-bold" onClick={() => refresh(true)}>Retry</button></div> : <>
                {uid && guest.data.habits.length > 0 && <div className="p-4 mb-6 border border-amber-500/30 rounded-lg bg-amber-900/20 text-amber-100"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">You have {guest.data.habits.length} guest habit(s) on this device. Import copies active guest habits only, keeps all originals on this device, and skips previously imported records even if edited or deleted later. Restore archived guest habits in guest mode to import them.</p><button disabled={importing || Boolean(guest.error)} onClick={importGuest} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-500 disabled:opacity-50">{importing ? 'Importing…' : 'Import guest data'}</button></div>{importStatus?.uid === uid && <p role="status" className="mt-3 text-sm">{importStatus.message}</p>}</div>}
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400"><p>Export a private JSON copy of your data. Restoring exports is not yet supported.</p><div className="flex gap-2">{uid && <button type="button" onClick={() => refresh(true)} className="rounded-lg border border-zinc-600 px-4 py-2 text-zinc-200 hover:bg-zinc-800">Refresh</button>}<button type="button" onClick={exportData} disabled={exporting || (!uid && guest.readFailed)} className="rounded-lg border border-zinc-600 px-4 py-2 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">{exporting ? 'Preparing export…' : 'Export data'}</button></div></div>
                {uid && <p className="mb-4 text-sm text-zinc-400">Changes require a connection. Refresh to see updates from other devices.</p>}
                <TodayView key={`today-${identityToken.sequence}`} habits={habits} allCompletions={completions} today={today} onToggle={toggle} onOpenNote={openNote} pendingCompletions={pending} />
                {habits.length > 0 && <div key={`insights-${identityToken.sequence}`} className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2"><ActivityInsights habits={habits} completions={completions} today={today} /><NotesJournal habits={habits} completions={completions} today={today} onOpenNote={openNote} /></div>}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8"><ProgressOverview habits={habits} streakData={streakData} addHabit={addHabit} deleteHabit={deleteHabit} renameHabit={renameHabit} archiveHabit={id => setArchived(id, true)} archivedHabits={archivedHabits} restoreHabit={id => setArchived(id, false)} processingState={processing} /><CalendarGrid habits={habits} allCompletions={completions} currentDate={currentDate} goToToday={() => setCurrentDate(new Date())} changeMonth={offset => setCurrentDate(prev => moveMonth(prev, offset))} onToggle={toggle} onOpenNote={openNote} pendingCompletions={pending} /></div>
            </>}
        </main><footer className="text-center p-4 text-zinc-500 text-sm">Created by Puru</footer>
    </div>;
}
