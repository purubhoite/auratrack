import React, { useState, useEffect, useMemo } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Helper Functions & Constants ---
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const formatDate = (date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const PREDEFINED_HABITS = ["DSA", "Web Dev", "LeetCode"];
const wittyMessages = ["This habit is my favorite.", "Look at you go!", "Consistency is key...", "Is it a habit or an obsession?", "Don't stop now!", "Future you is sending a high-five."];
const getRandomMessage = () => wittyMessages[Math.floor(Math.random() * wittyMessages.length)];

// --- SVG Icons ---
const ChevronLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>;
const ChevronRightIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
const CloseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const NoteIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.6a2 2 0 0 0-.6-1.4L14.8 2.6a2 2 0 0 0-1.4-.6z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>;
const SpinnerIcon = () => <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>;
const AnimatedFireIcon = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-orange-400"><style>{`.flame-1{animation:flame-float 2s ease-in-out infinite}.flame-2{animation:flame-float 2.2s ease-in-out infinite .2s}.flame-3{animation:flame-float 2.4s ease-in-out infinite .4s}@keyframes flame-float{0%,100%{transform:translateY(0) scale(1);opacity:1}50%{transform:translateY(-4px) scale(1.05);opacity:.8}}`}</style><path className="flame-1" d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5-2 4.5-2 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path className="flame-2" d="M14.5 14.5A2.5 2.5 0 0 0 17 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5-2 4.5-2 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path className="flame-3" d="M11.5 16.5A2.5 2.5 0 0 0 14 14c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5-2 4.5-2 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const AnimatedTrophyIcon = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-amber-400"><style>{`.gleam{animation:trophy-gleam 3s ease-in-out infinite}@keyframes trophy-gleam{0%,100%{opacity:0;transform:translateX(-10px) skewX(-20deg)}20%{opacity:.5}30%{opacity:0;transform:translateX(10px) skewX(-20deg)}}`}</style><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 22h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path className="gleam" d="M8 4l8 2" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>;

// --- Reusable Components ---
const SolidCard = ({ children, className = '' }) => <div className={`bg-zinc-800/50 border border-zinc-700 rounded-xl shadow-lg ${className}`}>{children}</div>;
const PrimaryButton = ({ children, onClick, className = '', type = 'button', disabled = false }) => <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center px-6 py-2.5 font-semibold text-zinc-900 transition-all duration-200 bg-amber-400 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>{children}</button>;

// --- Custom Hooks ---
const useAuth = () => {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);
    return { user, authLoading };
};

const useHabits = (user) => {
    const [habits, setHabits] = useState([]);
    const [allCompletions, setAllCompletions] = useState({});
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!user) {
            setHabits([]);
            setAllCompletions({});
            setLoading(false);
            return;
        }
        setLoading(true);
        const habitsQuery = query(collection(db, "habits"), where("userId", "==", user.uid));
        const unsubscribeHabits = onSnapshot(habitsQuery, (snapshot) => setHabits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        const completionsQuery = query(collection(db, "completions"), where("userId", "==", user.uid));
        const unsubscribeCompletions = onSnapshot(completionsQuery, (snapshot) => {
            const completionsData = {};
            snapshot.docs.forEach(docSnap => {
                const data = docSnap.data();
                const dateStr = formatDate(data.date.toDate());
                if (!completionsData[data.habitId]) completionsData[data.habitId] = {};
                completionsData[data.habitId][dateStr] = { id: docSnap.id, note: data.note || '' };
            });
            setAllCompletions(completionsData);
            setLoading(false);
        });
        return () => {
            unsubscribeHabits();
            unsubscribeCompletions();
        };
    }, [user]);

    const streakData = useMemo(() => {
        const data = {};
        for (const habit of habits) {
            const habitCompletions = allCompletions[habit.id] || {};
            const dates = Object.keys(habitCompletions).sort();
            let currentStreak = 0, longestStreak = 0;
            if (dates.length > 0) {
                let iteratorDate = new Date();
                const todayStr = formatDate(iteratorDate);
                iteratorDate.setDate(iteratorDate.getDate() - 1);
                const yesterdayStr = formatDate(iteratorDate);
                let streakHeadDate = null;
                if (habitCompletions[todayStr]) streakHeadDate = new Date();
                else if (habitCompletions[yesterdayStr]) {
                    streakHeadDate = new Date();
                    streakHeadDate.setDate(streakHeadDate.getDate() - 1);
                }
                if (streakHeadDate) {
                    while (habitCompletions[formatDate(streakHeadDate)]) {
                        currentStreak++;
                        streakHeadDate.setDate(streakHeadDate.getDate() - 1);
                    }
                }
                let localCurrentStreak = 1;
                longestStreak = 1;
                for (let i = 1; i < dates.length; i++) {
                    const date1 = new Date(dates[i]);
                    const date2 = new Date(dates[i - 1]);
                    const diffDays = Math.round((date1 - date2) / (1000 * 60 * 60 * 24));
                    if (diffDays === 1) localCurrentStreak++;
                    else localCurrentStreak = 1;
                    if (localCurrentStreak > longestStreak) longestStreak = localCurrentStreak;
                }
            }
            data[habit.id] = { current: currentStreak, longest: longestStreak };
        }
        return data;
    }, [habits, allCompletions]);

    return { habits, setHabits, allCompletions, setAllCompletions, loading, streakData };
};

const useToast = () => {
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };
    return { toast, showToast };
};

// --- components/Toast.jsx ---
const Toast = ({ message, type, show }) => {
    const baseStyle = "fixed bottom-5 right-5 z-50 font-semibold rounded-lg px-5 py-3 shadow-xl transition-all duration-300";
    const typeStyles = {
        success: "bg-amber-400 text-zinc-900",
        error: "bg-red-500 text-white",
    };
    const visibilityStyle = show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4";
    return <div className={`${baseStyle} ${typeStyles[type]} ${visibilityStyle}`}>{message}</div>;
};

// --- components/AuthModal.jsx ---
const AuthModal = ({ onClose }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            onClose();
        } catch (err) {
            // This is the new logic to check for the specific error
            if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                setError("No account found with this email. Please sign up.");
            } else {
                setError(err.message.replace('Firebase: ', ''));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="relative w-full max-w-md p-4 m-4">
                <SolidCard className="p-8">
                    <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"><CloseIcon /></button>
                    <h2 className="text-3xl font-bold text-center text-zinc-100">AuraTrack</h2>
                    <p className="text-center text-zinc-400 mt-2">{isLogin ? "Welcome back! Did you miss your habits, or did they miss you?" : "Let's get you set up."}</p>
                    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                        <div className="space-y-4 rounded-md shadow-sm">
                            <input id="email-address" name="email" type="email" autoComplete="email" required className="relative block w-full px-3 py-3 text-zinc-100 placeholder-zinc-500 bg-zinc-900 border border-zinc-700 rounded-md appearance-none focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
                            <input id="password" name="password" type="password" autoComplete="current-password" required className="relative block w-full px-3 py-3 text-zinc-100 placeholder-zinc-500 bg-zinc-900 border border-zinc-700 rounded-md appearance-none focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                        </div>
                        {error && <p className="text-sm text-center text-red-400">{error}</p>}
                        <PrimaryButton type="submit" className="w-full" disabled={loading}>{loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}</PrimaryButton>
                    </form>
                    <p className="mt-6 text-sm text-center text-zinc-400">
                        {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                        <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="font-medium text-amber-400 hover:text-amber-300">{isLogin ? 'Sign up' : 'Sign in'}</button>
                    </p>
                </SolidCard>
            </div>
        </div>
    );
};
// --- components/NoteModal.jsx ---
const NoteModal = ({ habit, date, completion, onSave, onCancel }) => {
    // ... (NoteModal component remains unchanged)
    const [note, setNote] = useState(completion?.note || '');
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onCancel}>
            <SolidCard className="w-full max-w-md p-6 m-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold">{habit.name}</h3><p className="text-sm text-zinc-400">{date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p></div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." className="w-full h-32 p-3 text-zinc-100 placeholder-zinc-500 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" autoFocus />
                <div className="flex justify-end gap-3 mt-4"><button onClick={onCancel} className="px-4 py-2 text-zinc-300 rounded-lg hover:bg-zinc-700">Close</button><PrimaryButton onClick={() => onSave(habit.id, date, note, completion?.id)}>Save Note</PrimaryButton></div>
            </SolidCard>
        </div>
    );
};

// --- components/Navbar.jsx ---
const Navbar = ({ user, onLoginClick }) => (
    <header className="sticky top-0 z-30 p-4 bg-zinc-900/80 backdrop-blur-lg border-b border-zinc-700">
        <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-bold">AuraTrack</h1>
            {user ? <PrimaryButton onClick={() => signOut(auth)}>Logout</PrimaryButton> : <PrimaryButton onClick={onLoginClick}>Login / Sign Up</PrimaryButton>}
        </div>
    </header>
);

// --- components/ProgressOverview.jsx ---
const ProgressOverview = ({ habits, streakData, addHabit, deleteHabit, processingState }) => {
    const [newHabitName, setNewHabitName] = useState('');
    const handleAddHabit = (e) => {
        e.preventDefault();
        addHabit(newHabitName);
        setNewHabitName('');
    };
    return (
        <div className="lg:col-span-1 space-y-6">
            <SolidCard className="p-6">
                <h2 className="text-xl font-bold mb-4">Add New Habit</h2>
                <form onSubmit={handleAddHabit} className="flex gap-2">
                    <input type="text" value={newHabitName} onChange={(e) => setNewHabitName(e.target.value)} placeholder="e.g., Morning Run" className="flex-grow px-4 py-2 text-zinc-100 placeholder-zinc-500 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                    <PrimaryButton type="submit" className="!px-4" disabled={processingState.type === 'add'}><PlusIcon /></PrimaryButton>
                </form>
                <div className="flex flex-wrap gap-2 mt-4">
                    {PREDEFINED_HABITS.map(habit => <button key={habit} onClick={() => addHabit(habit)} className="px-3 py-1 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full hover:bg-amber-500/20 transition-colors">+ {habit}</button>)}
                </div>
            </SolidCard>
            <SolidCard className="p-6">
                <h2 className="text-xl font-bold mb-4">Progress Overview</h2>
                {habits.length > 0 ? (
                    <div className="space-y-4">
                        {habits.map(habit => {
                            const streak = streakData[habit.id];
                            const isDeleting = processingState.type === 'delete' && processingState.id === habit.id;
                            return (
                                <div key={habit.id} className={`p-4 bg-zinc-900/70 rounded-lg border border-zinc-700 transition-opacity ${isDeleting ? 'opacity-50' : ''}`}>
                                    <div className="flex justify-between items-center"><h3 className="font-semibold">{habit.name}</h3><button onClick={() => deleteHabit(habit.id)} disabled={isDeleting} className="text-zinc-500 hover:text-red-400 disabled:opacity-50"><TrashIcon /></button></div>
                                    <div className="grid grid-cols-2 gap-4 mt-3 text-center">
                                        <div className="p-3 bg-zinc-800 rounded-lg" title={getRandomMessage()}><p className="text-xs text-zinc-400">Current Streak</p><div className="flex items-center justify-center gap-1 mt-1"><AnimatedFireIcon /><p className="text-3xl font-bold">{streak?.current || 0}</p></div>{streak?.current === 0 && streak?.longest > 0 && <p className="text-xs text-zinc-500 mt-1">🦥 Still loading… your motivation.</p>}</div>
                                        <div className="p-3 bg-zinc-800 rounded-lg" title={getRandomMessage()}><p className="text-xs text-zinc-400">Longest Streak</p><div className="flex items-center justify-center gap-1 mt-1"><AnimatedTrophyIcon /><p className="text-3xl font-bold">{streak?.longest || 0}</p></div></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : <p className="text-sm text-zinc-400">😏 No habits yet? That’s one way to stay consistent.</p>}
            </SolidCard>
        </div>
    );
};

// --- components/HabitRow.jsx ---
const HabitRow = ({ habit, completions, calendarGrid, onToggle, onOpenNote, processingState }) => (
    <React.Fragment>
        <div className="sticky left-0 z-10 flex items-center p-2 text-sm font-medium bg-zinc-800 truncate">{habit.name}</div>
        {calendarGrid.grid.map(({ day, date }) => {
            const dateStr = formatDate(date);
            const completion = completions?.[dateStr];
            const isFuture = date > new Date() && dateStr !== formatDate(new Date());
            const isLoading = processingState.type === 'toggle' && processingState.id === `${habit.id}-${dateStr}`;
            return (
                <div key={`${habit.id}-${day}`} className="flex items-center justify-center bg-zinc-900/70 p-1">
                    <button disabled={isFuture || isLoading} onClick={() => onToggle(habit.id, date)} className={`group relative w-full h-10 rounded-md transition-all duration-200 ease-in-out transform focus:outline-none focus:ring-2 focus:ring-amber-500 ${completion ? 'bg-amber-500 shadow-lg hover:opacity-80' : 'bg-zinc-700/50 hover:bg-zinc-600/80'} ${isFuture ? 'opacity-20 cursor-not-allowed' : ''}`}>
                        {isLoading ? <SpinnerIcon /> : completion && <div onClick={(e) => { e.stopPropagation(); onOpenNote(habit, date); }} className="absolute bottom-1 right-1 p-0.5 rounded-full bg-black/20 text-zinc-300 opacity-50 group-hover:opacity-100 transition-opacity"><NoteIcon /></div>}
                    </button>
                </div>
            );
        })}
    </React.Fragment>
);

// --- components/CalendarGrid.jsx ---
const CalendarGrid = ({ habits, allCompletions, currentDate, changeMonth, onToggle, onOpenNote, processingState }) => {
    const calendarGrid = useMemo(() => {
        const year = currentDate.getFullYear(), month = currentDate.getMonth();
        const days = getDaysInMonth(year, month);
        const grid = Array.from({ length: days }, (_, i) => ({ day: i + 1, date: new Date(year, month, i + 1) }));
        return { grid, days };
    }, [currentDate]);

    return (
        <div className="lg:col-span-2">
            <SolidCard className="p-4 sm:p-6">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2><div className="flex items-center space-x-2"><button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-zinc-700"><ChevronLeftIcon /></button><button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-zinc-700"><ChevronRightIcon /></button></div></div>
                <div className="overflow-x-auto">
                    <div className="grid gap-px bg-zinc-700/50" style={{ gridTemplateColumns: `minmax(140px, 1fr) repeat(${calendarGrid.days}, minmax(45px, 1fr))` }}>
                        <div className="sticky left-0 z-20 p-2 text-sm font-semibold text-center bg-zinc-800">Habit</div>
                        {calendarGrid.grid.map(({ day, date }) => {
                            const isToday = formatDate(new Date()) === formatDate(date);
                            return <div key={day} className={`flex flex-col items-center justify-center p-1 text-xs font-semibold ${isToday ? 'bg-amber-900/40' : 'bg-zinc-800'}`}><span className="text-zinc-400">{['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()]}</span><span className={`mt-1 flex items-center justify-center w-6 h-6 rounded-full ${isToday ? 'text-amber-300 font-bold' : ''}`}>{day}</span></div>;
                        })}
                        {habits.length === 0 ? <div className="col-span-full p-4 text-center text-zinc-400">Add a habit from the panel on the left.</div> : (
                            habits.map(habit => <HabitRow key={habit.id} habit={habit} completions={allCompletions[habit.id]} calendarGrid={calendarGrid} onToggle={onToggle} onOpenNote={onOpenNote} processingState={processingState} />)
                        )}
                    </div>
                </div>
            </SolidCard>
        </div>
    );
};

// --- pages/DashboardPage.jsx ---
// --- pages/DashboardPage.jsx ---
const DashboardPage = ({ user }) => {
    const { habits, setHabits, allCompletions, setAllCompletions, loading, streakData } = useHabits(user);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [noteModalData, setNoteModalData] = useState(null);
    const [processingState, setProcessingState] = useState({ type: null, id: null }); // {type: 'add'|'delete'|'toggle', id: string}
    const { toast, showToast } = useToast();

    const addHabit = async (name) => {
        if (name.trim() === '') return;
        setProcessingState({ type: 'add', id: null });
        try {
            if (user) {
                await addDoc(collection(db, "habits"), { name: name.trim(), userId: user.uid, createdAt: serverTimestamp() });
            } else {
                setHabits(prev => [...prev, { id: `local-${Date.now()}`, name: name.trim() }]);
            }
        } catch (e) {
            console.error("Error adding habit:", e); 
            const code = e?.code || '';
            const message = e?.message || '';
            if (code === 'permission-denied' || message.includes('Missing or insufficient permissions')) {
                showToast("Sign in required to save habits.", "error");
                setShowAuthModal(true);
            } else if (code === 'failed-precondition') {
                showToast("Cloud Firestore is not enabled for this project.", "error");
            } else if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'network-request-failed') {
                setHabits(prev => [...prev, { id: `local-${Date.now()}`, name: name.trim() }]);
                showToast("You appear to be offline. Saved locally for now.", "error");
            } else {
                showToast(`❌ Failed to add habit: ${code || message}`, "error");
            }
        } 
        finally {
            setProcessingState({ type: null, id: null });
        }
    };
    
    const deleteHabit = async (habitId) => {
        setProcessingState({ type: 'delete', id: habitId });
        try {
            if (user) {
                await deleteDoc(doc(db, "habits", habitId));
                const completionsQuery = query(collection(db, "completions"), where("habitId", "==", habitId));
                const completionsSnapshot = await getDocs(completionsQuery);
                const batch = writeBatch(db);
                completionsSnapshot.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
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
            showToast("❌ Failed to delete habit.", "error"); 
        } 
        finally { setProcessingState({ type: null, id: null }); }
    };
    
    const toggleCompletion = async (habitId, date) => {
        const dateStr = formatDate(date);
        const completion = allCompletions[habitId]?.[dateStr];
        setProcessingState({ type: 'toggle', id: `${habitId}-${dateStr}` });
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
                        newCompletions[habitId][dateStr] = { id: `local-${Date.now()}`, note: "" };
                        showToast("🎉 Boom! Future you approves.");
                    }
                    return newCompletions;
                });
            }
        } catch (e) { 
            console.error("Error toggling completion:", e);
            showToast("❌ Failed to update.", "error"); 
        } 
        finally { setProcessingState({ type: null, id: null }); }
    };

    const saveNote = async (habitId, date, note, completionId) => {
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
            showToast("📝 Note saved!");
        } catch (e) { 
            console.error("Error saving note:", e);
            showToast("❌ Failed to save note.", "error"); 
        }
        setNoteModalData(null);
    };

    const changeMonth = (offset) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
        showToast("New month, same habits. Let’s do this.");
    };

    if (loading) return <div className="flex items-center justify-center min-h-screen bg-zinc-900">Loading...</div>;

    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-100 font-sans flex flex-col">
            {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
            {noteModalData && <NoteModal {...noteModalData} onSave={saveNote} onCancel={() => setNoteModalData(null)} />}
            <Toast {...toast} />
            <Navbar user={user} onLoginClick={() => setShowAuthModal(true)} />
            <main className="container mx-auto p-4 md:p-8 flex-grow">
                {!user && <div className="p-4 mb-6 text-center text-amber-200 bg-amber-900/30 border border-amber-500/30 rounded-lg">You are in guest mode. <button onClick={() => setShowAuthModal(true)} className="font-bold underline hover:text-white">Sign in or create an account</button> to save your progress.</div>}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <ProgressOverview habits={habits} streakData={streakData} addHabit={addHabit} deleteHabit={deleteHabit} processingState={processingState} />
                    <CalendarGrid habits={habits} allCompletions={allCompletions} currentDate={currentDate} changeMonth={changeMonth} onToggle={toggleCompletion} onOpenNote={(habit, date) => setNoteModalData({ habit, date, completion: allCompletions[habit.id]?.[formatDate(date)] })} processingState={processingState} />
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
    return (
        <>
            <DashboardPage user={user} />
            <Analytics />
        </>
    );
}
