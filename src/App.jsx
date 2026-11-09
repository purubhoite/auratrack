import React, { useState, useEffect, useMemo, useRef } from 'react';
import { calculateStreak, formatDate, moveMonth, readGuestData, writeGuestData } from './domain/tracking';
import { createCloudExport, createGuestExport, downloadExport } from './domain/export';
import { importGuestData, prepareGuestImport } from './domain/guestImport';
import { groupCloudCompletions } from './domain/cloudCompletions';
import { SolidCard, PrimaryButton, CloseIcon, Toast, NoteModal, ProgressOverview, CalendarGrid, TodayView } from './components/TrackerUI';
import { useDialogFocus } from './hooks/useDialogFocus';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail,
    signOut 
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    onSnapshot,
    addDoc,
    deleteDoc,
    doc,
    writeBatch,
    getDocs,
    getDocsFromServer,
    Timestamp,
    updateDoc,
    serverTimestamp
} from 'firebase/firestore';

// --- IMPORTANT: Firebase Configuration ---
const firebaseConfig = {
    apiKey: import.meta.env.VITE_API_KEY,
    authDomain: import.meta.env.VITE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_APP_ID
};


// --- Initialize Firebase ---
// Guest mode remains usable without a configured Firebase project.
const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

// --- Helper Functions & Constants ---
const EMPTY_HABITS = [];
const EMPTY_COMPLETIONS = {};
// --- Custom Hooks ---
const useAuth = () => {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    useEffect(() => {
        if (!auth) {
            setAuthLoading(false);
            return;
        }
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);
    return { user, authLoading };
};

const useHabits = (user, today) => {
    const [guest, setGuest] = useState(() => {
        try {
            return { data: readGuestData(window.localStorage), error: '' };
        } catch {
            // Do not overwrite unreadable data; it may be recoverable.
            return { data: { habits: [], completions: {} }, error: 'Guest data could not be read. Changes will not be saved in this browser.' };
        }
    });
    const [cloudHabits, setCloudHabits] = useState([]);
    const [cloudCompletions, setCloudCompletions] = useState({});
    const [loading, setLoading] = useState(Boolean(user));
    const [cloudError, setCloudError] = useState('');
    const [cloudOwner, setCloudOwner] = useState(null);
    const [cloudSync, setCloudSync] = useState({ habits: null, completions: null });
    const [cloudIssues, setCloudIssues] = useState({ duplicateDays: 0, invalidCount: 0 });
    const isCurrentOwner = user && cloudOwner === user.uid;
    const habits = user ? (isCurrentOwner ? cloudHabits : EMPTY_HABITS) : guest.data.habits;
    const allCompletions = user ? (isCurrentOwner ? cloudCompletions : EMPTY_COMPLETIONS) : guest.data.completions;

    useEffect(() => {
        if (guest.error) return;
        try {
            writeGuestData(window.localStorage, guest.data);
        } catch {
            setGuest(previous => ({ ...previous, error: 'Guest changes could not be saved in this browser. They may be lost when you leave.' }));
        }
    }, [guest.data, guest.error]);
    const updateGuest = (field, update) => {
        setGuest(previous => ({
            ...previous,
            data: { ...previous.data, [field]: typeof update === 'function' ? update(previous.data[field]) : update },
        }));
    };
    const setHabits = user ? setCloudHabits : update => updateGuest('habits', update);
    const setAllCompletions = user ? setCloudCompletions : update => updateGuest('completions', update);

    useEffect(() => {
        if (!user) {
            setCloudHabits([]);
            setCloudCompletions({});
            setCloudError('');
            setCloudOwner(null);
            setCloudSync({ habits: null, completions: null });
            setCloudIssues({ duplicateDays: 0, invalidCount: 0 });
            setLoading(false);
            return;
        }
        setLoading(true);
        setCloudHabits([]);
        setCloudCompletions({});
        setCloudError('');
        setCloudOwner(user.uid);
        setCloudSync({ habits: null, completions: null });
        setCloudIssues({ duplicateDays: 0, invalidCount: 0 });
        let active = true;
        let habitsReady = false;
        let completionsReady = false;
        const ready = () => { if (habitsReady && completionsReady) setLoading(false); };
        const onError = (error) => {
            if (!active) return;
            console.error('Unable to load tracking data:', error);
            setCloudError('Could not load your data. Check your connection and refresh to try again.');
            setLoading(false);
        };
        const habitsQuery = query(collection(db, "habits"), where("userId", "==", user.uid));
        const unsubscribeHabits = onSnapshot(habitsQuery, { includeMetadataChanges: true }, (snapshot) => {
            if (!active) return;
            setCloudSync(previous => ({ ...previous, habits: snapshot.metadata || { fromCache: false, hasPendingWrites: false } }));
            setCloudHabits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            habitsReady = true;
            ready();
        }, onError);
        const completionsQuery = query(collection(db, "completions"), where("userId", "==", user.uid));
        const unsubscribeCompletions = onSnapshot(completionsQuery, { includeMetadataChanges: true }, (snapshot) => {
            if (!active) return;
            const { completions, invalidCount, duplicateDays } = groupCloudCompletions(snapshot.docs);
            setCloudSync(previous => ({ ...previous, completions: snapshot.metadata || { fromCache: false, hasPendingWrites: false } }));
            setCloudIssues({ invalidCount, duplicateDays });
            setCloudCompletions(completions);
            completionsReady = true;
            ready();
        }, onError);
        return () => {
            active = false;
            unsubscribeHabits();
            unsubscribeCompletions();
        };
    }, [user]);

    const streakData = useMemo(() => Object.fromEntries(
        habits.map(habit => [habit.id, calculateStreak(allCompletions[habit.id] || {}, today)])
    ), [habits, allCompletions, today]);

    return { habits, setHabits, allCompletions, setAllCompletions, loading: user ? (!isCurrentOwner || loading) : false, streakData, storageError: user ? cloudError : guest.error, guestData: guest.data, guestStorageError: guest.error, cloudSync: isCurrentOwner ? cloudSync : null, cloudIssues: isCurrentOwner ? cloudIssues : null };
};

const useToast = () => {
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };
    return { toast, showToast };
};

// --- components/AuthModal.jsx ---
const AuthModal = ({ onClose }) => {
    const dialogRef = useDialogFocus(onClose);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState('login');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const changeMode = next => { setMode(next); setError(''); setMessage(''); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);
        try {
            if (mode === 'reset') {
                await sendPasswordResetEmail(auth, email.trim());
                setMessage('If an account exists for this email, a password reset link will be sent.');
            } else {
                if (mode === 'login') await signInWithEmailAndPassword(auth, email.trim(), password);
                else await createUserWithEmailAndPassword(auth, email.trim(), password);
                onClose();
            }
        } catch (err) {
            if (mode === 'reset' && err.code === 'auth/user-not-found') {
                setMessage('If an account exists for this email, a password reset link will be sent.');
            } else if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setError('Incorrect email or password. Please try again.');
            } else {
                setError(err.message.replace('Firebase: ', ''));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="auth-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="relative w-full max-w-md p-4 m-4">
                <SolidCard className="p-8">
                    <button aria-label="Close sign-in" onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"><CloseIcon /></button>
                    <h2 id="auth-title" className="text-3xl font-bold text-center text-zinc-100">{mode === 'reset' ? 'Reset password' : 'AuraTrack'}</h2>
                    <p className="text-center text-zinc-400 mt-2">{mode === 'reset' ? 'Enter your email and we’ll send reset instructions if an account exists.' : mode === 'login' ? 'Welcome back!' : 'Create an account to track across devices.'}</p>
                    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                        <div className="space-y-4 rounded-md shadow-sm">
                            <input data-initial-focus aria-label="Email address" id="email-address" name="email" type="email" autoComplete="email" required className="relative block w-full px-3 py-3 text-zinc-100 placeholder-zinc-500 bg-zinc-900 border border-zinc-700 rounded-md appearance-none focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
                            {mode !== 'reset' && <input aria-label="Password" id="password" name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required className="relative block w-full px-3 py-3 text-zinc-100 placeholder-zinc-500 bg-zinc-900 border border-zinc-700 rounded-md appearance-none focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />}
                        </div>
                        {error && <p role="alert" className="text-sm text-center text-red-400">{error}</p>}
                        {message && <p role="status" className="text-sm text-center text-amber-300">{message}</p>}
                        <PrimaryButton type="submit" className="w-full" disabled={loading}>{loading ? 'Processing...' : mode === 'reset' ? 'Send reset link' : mode === 'login' ? 'Sign In' : 'Sign Up'}</PrimaryButton>
                    </form>
                    <div className="mt-6 flex flex-col gap-3 text-sm text-center text-zinc-400">
                        {mode === 'login' && <button onClick={() => changeMode('reset')} className="font-medium text-amber-400 hover:text-amber-300">Forgot password?</button>}
                        <button onClick={() => changeMode(mode === 'login' ? 'signup' : 'login')} className="font-medium text-amber-400 hover:text-amber-300">{mode === 'login' ? 'Create an account' : 'Back to sign in'}</button>
                    </div>
                </SolidCard>
            </div>
        </div>
    );
};
// --- components/Navbar.jsx ---
const Navbar = ({ user, onLoginClick, importing }) => (
    <header className="sticky top-0 z-30 p-4 bg-zinc-900/80 backdrop-blur-lg border-b border-zinc-700">
        <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-bold">AuraTrack</h1>
            {user ? <PrimaryButton disabled={importing} onClick={() => signOut(auth)}>Logout</PrimaryButton> : <PrimaryButton onClick={onLoginClick} disabled={!firebaseConfigured}>Login / Sign Up</PrimaryButton>}
        </div>
    </header>
);

// Refresh on return to the app and periodically so an open tab rolls over to the new day.
const useToday = () => {
    const [today, setToday] = useState(() => formatDate(new Date()));
    useEffect(() => {
        const update = () => setToday(formatDate(new Date()));
        const timer = window.setInterval(update, 60000);
        document.addEventListener('visibilitychange', update);
        return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); };
    }, []);
    const [year, month, day] = today.split('-').map(Number);
    return useMemo(() => new Date(year, month - 1, day), [year, month, day]);
};

// --- pages/DashboardPage.jsx ---
// --- pages/DashboardPage.jsx ---
const DashboardPage = ({ user }) => {
    const today = useToday();
    const { habits, setHabits, allCompletions, setAllCompletions, loading, streakData, storageError, guestData, guestStorageError, cloudSync, cloudIssues } = useHabits(user, today);
    const pendingRef = useRef(new Set());
    const addingRef = useRef(false);
    const exportingRef = useRef(false);
    const importingRef = useRef(false);
    const [importing, setImporting] = useState(false);
    const [importStatus, setImportStatus] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [pendingCompletions, setPendingCompletions] = useState(() => new Set());
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [noteModalData, setNoteModalData] = useState(null);
    const [processingState, setProcessingState] = useState({ type: null, id: null }); // {type: 'add'|'delete'|'toggle', id: string}
    const { toast, showToast } = useToast();

    const addHabit = async (name) => {
        if (name.trim() === '' || name.trim().length > 80 || addingRef.current) return false;
        addingRef.current = true;
        setProcessingState({ type: 'add', id: null });
        try {
            if (user) {
                await addDoc(collection(db, "habits"), { name: name.trim(), userId: user.uid, createdAt: serverTimestamp() });
            } else {
                setHabits(prev => [...prev, { id: `local-${crypto.randomUUID()}`, name: name.trim() }]);
            }
            return true;
        } catch (e) {
            console.error("Error adding habit:", e); 
            const code = e?.code || '';
            const message = e?.message || '';
            if (code === 'permission-denied' || message.includes('Missing or insufficient permissions')) {
                showToast("Your account cannot save habits. Check your Firestore permissions.", "error");
            } else if (code === 'failed-precondition') {
                showToast("Cloud Firestore is not enabled for this project.", "error");
            } else if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'network-request-failed') {
                showToast("Could not save your habit. Check your connection and try again.", "error");
            } else {
                showToast(`❌ Failed to add habit: ${code || message}`, "error");
            }
            return false;
        }
        finally {
            addingRef.current = false;
            setProcessingState({ type: null, id: null });
        }
    };
    
    const renameHabit = async (habitId, name) => {
        if (!name || name.length > 80) return false;
        try {
            if (user) await updateDoc(doc(db, "habits", habitId), { name });
            else setHabits(prev => prev.map(habit => habit.id === habitId ? { ...habit, name } : habit));
            return true;
        } catch (error) {
            console.error('Error renaming habit:', error);
            return false;
        }
    };

    const deleteHabit = async (habitId) => {
        if (!window.confirm('Delete this habit and its completion history? This cannot be undone.')) return;
        setProcessingState({ type: 'delete', id: habitId });
        try {
            if (user) {
                const completionsQuery = query(collection(db, "completions"), where("userId", "==", user.uid), where("habitId", "==", habitId));
                const completionsSnapshot = await getDocs(completionsQuery);
                // Delete in batches within Firestore's write limit. Keep the habit if cleanup fails.
                for (let i = 0; i < completionsSnapshot.docs.length; i += 500) {
                    const batch = writeBatch(db);
                    completionsSnapshot.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
                await deleteDoc(doc(db, "habits", habitId));
            } else {
                setHabits(prev => prev.filter(h => h.id !== habitId));
                setAllCompletions(prev => {
                    const newCompletions = {...prev};
                    delete newCompletions[habitId];
                    return newCompletions;
                });
            }
        } catch (e) { 
            console.error("Error deleting habit:", e);
            showToast("Could not finish deletion. Some history may already have been removed; please try again.", "error");
        } 
        finally { setProcessingState({ type: null, id: null }); }
    };
    
    const toggleCompletion = async (habitId, date) => {
        const dateStr = formatDate(date);
        const completion = allCompletions[habitId]?.[dateStr];
        const key = `${habitId}-${dateStr}`;
        if (pendingRef.current.has(key)) return;
        if (completion?.records?.length > 1 || completion?.unsafe) {
            showToast('This day has conflicting or invalid records. Export your data before resolving them.', 'error');
            return;
        }
        if (completion?.note && !window.confirm('Marking this day incomplete will delete its note. Continue?')) return;
        pendingRef.current.add(key);
        setPendingCompletions(new Set(pendingRef.current));
        try {
            if (user) {
                if (completion) await deleteDoc(doc(db, "completions", completion.id));
                else {
                    await addDoc(collection(db, "completions"), { userId: user.uid, habitId, date: Timestamp.fromDate(date), note: "" });
                    showToast("🎉 Boom! Future you approves.");
                }
            } else {
                setAllCompletions(prev => {
                    const newCompletions = JSON.parse(JSON.stringify(prev));
                    if (!newCompletions[habitId]) newCompletions[habitId] = {};
                    if (completion) delete newCompletions[habitId][dateStr];
                    else {
                        newCompletions[habitId][dateStr] = { id: `local-${crypto.randomUUID()}`, note: "" };
                    }
                    return newCompletions;
                });
            }
        } catch (e) { 
            console.error("Error toggling completion:", e);
            showToast("❌ Failed to update.", "error"); 
        } 
        finally {
            pendingRef.current.delete(key);
            setPendingCompletions(new Set(pendingRef.current));
        }
    };

    const saveNote = async (habitId, date, note, completionId) => {
        const current = allCompletions[habitId]?.[formatDate(date)];
        if (current?.records?.length > 1 || current?.unsafe) {
            showToast('This day has conflicting or invalid records. Export your data before resolving them.', 'error');
            return;
        }
        try {
            if (user && completionId) await updateDoc(doc(db, "completions", completionId), { note });
            else {
                const dateStr = formatDate(date);
                setAllCompletions(prev => {
                    const newCompletions = JSON.parse(JSON.stringify(prev));
                    if(newCompletions[habitId]?.[dateStr]) newCompletions[habitId][dateStr].note = note;
                    return newCompletions;
                });
            }
            if (user) showToast("📝 Note saved!");
            setNoteModalData(null);
        } catch (e) {
            console.error("Error saving note:", e);
            showToast("❌ Failed to save note. Please try again.", "error");
        }
    };

    const importGuest = async () => {
        if (!user || importingRef.current || guestStorageError) return;
        try {
            prepareGuestImport(guestData);
        } catch (error) {
            setImportStatus({ uid: user.uid, message: error.message });
            return;
        }
        const accepted = window.confirm('Import guest habits and history into this account? Guest data stays on this device. Habits with matching names will be separate, and previously imported records are skipped.');
        if (!accepted) return;
        importingRef.current = true;
        setImporting(true);
        setImportStatus({ uid: user.uid, message: 'Importing… keep this page open.' });
        try {
            const uid = user.uid;
            const result = await importGuestData(db, uid, guestData, () => {
                if (auth.currentUser?.uid !== uid) throw new Error('Account changed during import');
            });
            setImportStatus({ uid, message: `Import complete: ${result.habitsCreated} habit(s) and ${result.completionsCreated} completion(s) added. ${result.habitsSkipped} habit(s) and ${result.completionsSkipped} completion(s) were already imported and skipped.` });
        } catch (error) {
            console.error('Error importing guest data:', error);
            setImportStatus({ uid: user.uid, message: 'Import did not finish. Some records may have been added; guest data is unchanged. Check your connection and Firestore rules, then retry.' });
        } finally {
            importingRef.current = false;
            setImporting(false);
        }
    };

    const exportData = async () => {
        if (exportingRef.current) return;
        exportingRef.current = true;
        setExporting(true);
        try {
            let backup;
            if (user) {
                // Fetch from the server so a stale or failed live listener cannot silently
                // produce a partial backup. Keep raw documents, including duplicates.
                const [habitDocs, completionDocs] = await Promise.all([
                    getDocsFromServer(query(collection(db, 'habits'), where('userId', '==', user.uid))),
                    getDocsFromServer(query(collection(db, 'completions'), where('userId', '==', user.uid))),
                ]);
                backup = createCloudExport(habitDocs, completionDocs);
            } else {
                backup = createGuestExport(habits, allCompletions);
            }
            downloadExport(backup);
        } catch (error) {
            console.error('Error exporting data:', error);
            showToast('Could not export your data. Check your connection and try again.', 'error');
        } finally {
            exportingRef.current = false;
            setExporting(false);
        }
    };

    const changeMonth = (offset) => {
        setCurrentDate(prev => moveMonth(prev, offset));
        showToast("New month, same habits. Let’s do this.");
    };

    if (loading) return <div className="flex items-center justify-center min-h-screen bg-zinc-900">Loading...</div>;

    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-100 font-sans flex flex-col">
            {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
            {noteModalData && <NoteModal {...noteModalData} onSave={saveNote} onCancel={() => setNoteModalData(null)} />}
            <Toast {...toast} />
            <Navbar user={user} importing={importing} onLoginClick={() => setShowAuthModal(true)} />
            <main className="container mx-auto p-4 md:p-8 flex-grow">
                {!user && <div className="p-4 mb-6 text-center text-amber-200 bg-amber-900/30 border border-amber-500/30 rounded-lg">Guest data is stored in this browser only and can be lost if browser data is cleared. {firebaseConfigured ? <> <button onClick={() => setShowAuthModal(true)} className="font-bold underline hover:text-white">Sign in or create an account</button> for cloud tracking. Guest data stays on this device and is not imported automatically.</> : 'Account sign-in is unavailable until Firebase is configured.'}</div>}
                {user && guestStorageError && <div role="alert" className="p-4 mb-6 text-red-200 bg-red-900/40 border border-red-500 rounded-lg">Guest data cannot be imported: {guestStorageError}</div>}
                {user && guestData.habits.length > 0 && <div className="p-4 mb-6 border border-amber-500/30 rounded-lg bg-amber-900/20 text-amber-100">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm">You have {guestData.habits.length} guest {guestData.habits.length === 1 ? 'habit' : 'habits'} on this device. Import creates separate account habits and keeps the guest originals. Previously imported records are skipped even if later edited or deleted in the account.</p>
                        <button type="button" disabled={importing} onClick={importGuest} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-500 disabled:opacity-50">{importing ? 'Importing…' : 'Import guest data'}</button>
                    </div>
                    {importStatus?.uid === user.uid && <p role="status" className="mt-3 text-sm">{importStatus.message}</p>}
                </div>}
                {storageError && <div role="alert" className="p-4 mb-6 text-red-200 bg-red-900/40 border border-red-500 rounded-lg">{storageError}</div>}
                {user && !storageError && cloudSync?.habits && cloudSync?.completions && <p role="status" className="mb-4 text-sm text-zinc-400">{cloudSync.habits.fromCache || cloudSync.completions.fromCache ? 'Showing cached account data; waiting for the server. Recent changes may not be saved yet.' : cloudSync.habits.hasPendingWrites || cloudSync.completions.hasPendingWrites ? 'Syncing account changes…' : 'Showing account data received from the server.'}</p>}
                {user && cloudIssues && (cloudIssues.duplicateDays > 0 || cloudIssues.invalidCount > 0) && <div role="alert" className="p-4 mb-6 text-amber-100 bg-amber-900/30 border border-amber-500/40 rounded-lg">{cloudIssues.duplicateDays > 0 && <p>{cloudIssues.duplicateDays} {cloudIssues.duplicateDays === 1 ? 'day has' : 'days have'} duplicate completion records. Editing those days is disabled to protect notes.</p>}{cloudIssues.invalidCount > 0 && <p>{cloudIssues.invalidCount} completion {cloudIssues.invalidCount === 1 ? 'record contains' : 'records contain'} invalid data and may not be shown or editable.</p>}<p>Export your data before resolving these records in Firestore. The account export includes all records returned by your account query.</p></div>}
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
                    <p>Download a JSON copy of your habits and notes. It can contain private information and cannot yet be restored in AuraTrack.</p>
                    <button type="button" onClick={exportData} disabled={exporting} className="rounded-lg border border-zinc-600 px-4 py-2 font-medium text-zinc-200 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50">{exporting ? 'Preparing export…' : 'Export data'}</button>
                </div>
                <TodayView habits={habits} allCompletions={allCompletions} today={today} onToggle={toggleCompletion} onOpenNote={(habit, date) => setNoteModalData({ habit, date, completion: allCompletions[habit.id]?.[formatDate(date)] })} pendingCompletions={pendingCompletions} />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <ProgressOverview habits={habits} streakData={streakData} addHabit={addHabit} deleteHabit={deleteHabit} renameHabit={renameHabit} processingState={processingState} />
                    <CalendarGrid habits={habits} allCompletions={allCompletions} currentDate={currentDate} changeMonth={changeMonth} onToggle={toggleCompletion} onOpenNote={(habit, date) => setNoteModalData({ habit, date, completion: allCompletions[habit.id]?.[formatDate(date)] })} pendingCompletions={pendingCompletions} />
                </div>
            </main>
             <footer className="text-center p-4 text-zinc-500 text-sm">
            Created by Puru
        </footer>
        </div>
    );
};


// --- App.jsx ---
export default function App() {
    const { user, authLoading } = useAuth();
    if (authLoading) return <div className="flex items-center justify-center min-h-screen bg-zinc-900 text-zinc-100">Loading AuraTrack...</div>;
    return <DashboardPage user={user} />;
}
