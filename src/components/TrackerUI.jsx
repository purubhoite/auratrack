import React, { useState, useMemo, useRef, useCallback } from 'react';
import { formatDate } from '../domain/tracking';
import { useDialogFocus } from '../hooks/useDialogFocus';

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const PREDEFINED_HABITS = ["Read", "Exercise", "Meditate", "DSA", "Web Dev", "LeetCode"];
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
const SolidCard = ({ children, className = '', ...props }) => <div {...props} className={`bg-zinc-800/50 border border-zinc-700 rounded-xl shadow-lg ${className}`}>{children}</div>;
const PrimaryButton = ({ children, onClick, className = '', type = 'button', disabled = false, ...props }) => <button {...props} type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center px-6 py-2.5 font-semibold text-zinc-900 transition-all duration-200 bg-amber-400 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>{children}</button>;

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

// --- components/NoteModal.jsx ---
const NoteModal = ({ habit, date, completion, onSave, onCancel }) => {
    const [note, setNote] = useState(completion?.note || '');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const savingRef = useRef(false);
    const close = useCallback(() => { if (!savingRef.current) onCancel(); }, [onCancel]);
    const dialogRef = useDialogFocus(close);
    const save = async () => {
        if (savingRef.current) return;
        savingRef.current = true; setSaving(true); setSaveError('');
        try { await onSave(habit.id, date, note, completion?.id); }
        catch { setSaveError('Could not save this note. Please try again.'); }
        finally { savingRef.current = false; setSaving(false); }
    };
    return (
        <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={close} role="dialog" aria-modal="true" aria-busy={saving} aria-label={`Note for ${habit.name}`}>
            <SolidCard className="w-full max-w-md p-6 m-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold">{habit.name}</h3><p className="text-sm text-zinc-400">{date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p></div>
                <textarea data-initial-focus readOnly={saving} maxLength={10000} aria-label="Habit note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." className="w-full h-32 p-3 text-zinc-100 placeholder-zinc-500 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                {saving && <p role="status" className="mt-2 text-sm text-zinc-400">Saving… You can copy your note; closing will not cancel the save.</p>}
                {saveError && <p role="alert" className="mt-2 text-sm text-red-400">{saveError}</p>}
                <div className="flex justify-end gap-3 mt-4"><button onClick={onCancel} className="px-4 py-2 text-zinc-300 rounded-lg hover:bg-zinc-700">Close</button><PrimaryButton disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Note'}</PrimaryButton></div>
            </SolidCard>
        </div>
    );
};

const HabitName = ({ habit, renameHabit }) => {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(habit.name);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const cancel = () => { setValue(habit.name); setError(''); setEditing(false); };
    const submit = async (event) => {
        event.preventDefault();
        if (!value.trim()) { setError('Enter a habit name.'); return; }
        setSaving(true);
        const saved = await renameHabit(habit.id, value.trim());
        setSaving(false);
        if (saved) { setError(''); setEditing(false); }
        else setError('Could not rename this habit. Please try again.');
    };
    if (!editing) return <div className="flex items-center gap-2 min-w-0"><h3 className="font-semibold break-words">{habit.name}</h3><button aria-label={`Rename ${habit.name}`} onClick={() => { setValue(habit.name); setEditing(true); }} className="text-xs text-amber-300 hover:text-amber-200 underline shrink-0">Edit</button></div>;
    return <form aria-label={`Rename ${habit.name}`} onSubmit={submit} className="flex-1 min-w-0 mr-2"><label className="sr-only" htmlFor={`rename-${habit.id}`}>Habit name</label><input id={`rename-${habit.id}`} autoFocus maxLength={80} value={value} onChange={e => setValue(e.target.value)} className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm" /><div className="flex gap-3 mt-2 text-sm"><button type="submit" disabled={saving} className="text-amber-300 underline">{saving ? 'Saving…' : 'Save'}</button><button type="button" disabled={saving} onClick={cancel} className="text-zinc-300 underline">Cancel</button></div>{error && <p role="alert" className="text-red-400 text-xs mt-1">{error}</p>}</form>;
};

// --- components/ProgressOverview.jsx ---
const ProgressOverview = ({ habits, streakData, addHabit, deleteHabit, renameHabit, processingState, archiveHabit, archivedHabits = [], restoreHabit }) => {
    const [newHabitName, setNewHabitName] = useState('');
    const handleAddHabit = async (e) => {
        e.preventDefault();
        if (await addHabit(newHabitName)) setNewHabitName('');
    };
    return (
        <div className="lg:col-span-1 space-y-6">
            <SolidCard className="p-6">
                <h2 className="text-xl font-bold mb-4">Add New Habit</h2>
                <form onSubmit={handleAddHabit} className="flex gap-2">
                    <input aria-label="Habit name" maxLength={80} type="text" value={newHabitName} onChange={(e) => setNewHabitName(e.target.value)} placeholder="e.g., Morning Run" className="flex-grow px-4 py-2 text-zinc-100 placeholder-zinc-500 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                    <PrimaryButton aria-label="Add habit" type="submit" className="!px-4" disabled={processingState.type === 'add'}><PlusIcon /></PrimaryButton>
                </form>
                <div className="flex flex-wrap gap-2 mt-4">
                    {PREDEFINED_HABITS.map(habit => <button key={habit} disabled={processingState.type === 'add'} onClick={() => addHabit(habit)} className="px-3 py-1 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full hover:bg-amber-500/20 transition-colors">+ {habit}</button>)}
                </div>
            </SolidCard>
            <SolidCard className="p-6">
                <h2 className="text-xl font-bold mb-4">Progress Overview</h2>
                {habits.length > 0 ? (
                    <div className="space-y-4">
                        {habits.map(habit => {
                            const streak = streakData[habit.id];
                            const isDeleting = processingState.type === 'delete' && processingState.id === habit.id;
                            const isArchiving = processingState.type === 'archive' && processingState.id === habit.id;
                            return (
                                <div key={habit.id} className={`p-4 bg-zinc-900/70 rounded-lg border border-zinc-700 transition-opacity ${isDeleting ? 'opacity-50' : ''}`}>
                                    <div className="flex justify-between items-center"><HabitName habit={habit} renameHabit={renameHabit} />{archiveHabit && <button aria-label={`Archive ${habit.name}`} onClick={() => archiveHabit(habit.id)} disabled={isArchiving || isDeleting} className="mx-3 text-xs text-amber-300 underline disabled:opacity-50">{isArchiving ? 'Archiving…' : 'Archive'}</button>}<button aria-label={`Delete ${habit.name}`} onClick={() => deleteHabit(habit.id)} disabled={isDeleting || isArchiving} className="text-zinc-500 hover:text-red-400 disabled:opacity-50"><TrashIcon /></button></div>
                                    <div className="grid grid-cols-2 gap-4 mt-3 text-center">
                                        <div className="p-3 bg-zinc-800 rounded-lg" title={getRandomMessage()}><p className="text-xs text-zinc-400">Current Streak</p><div className="flex items-center justify-center gap-1 mt-1"><AnimatedFireIcon /><p className="text-3xl font-bold">{streak?.current || 0}</p></div>{streak?.current === 0 && streak?.longest > 0 && <p className="text-xs text-zinc-500 mt-1">A fresh start is always possible.</p>}</div>
                                        <div className="p-3 bg-zinc-800 rounded-lg" title={getRandomMessage()}><p className="text-xs text-zinc-400">Longest Streak</p><div className="flex items-center justify-center gap-1 mt-1"><AnimatedTrophyIcon /><p className="text-3xl font-bold">{streak?.longest || 0}</p></div></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : <p className="text-sm text-zinc-400">Add your first habit to start tracking your progress.</p>}
            </SolidCard>
            {restoreHabit && archivedHabits.length > 0 && <SolidCard className="p-6">
                <h2 className="text-xl font-bold mb-2">Archived habits</h2>
                <p className="text-sm text-zinc-400 mb-4">History is kept. Restoring does not preserve a current streak across missed days.</p>
                <ul className="space-y-2">{archivedHabits.map(habit => <li key={habit.id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900/70 p-3"><span className="break-words">{habit.name}</span><button aria-label={`Restore ${habit.name}`} disabled={processingState.type === 'archive' && processingState.id === habit.id} onClick={() => restoreHabit(habit.id)} className="text-sm text-amber-300 underline disabled:opacity-50">Restore</button></li>)}</ul>
            </SolidCard>}
        </div>
    );
};

// --- components/HabitRow.jsx ---
const HabitRow = ({ habit, completions, calendarGrid, onToggle, onOpenNote, pendingCompletions }) => (
    <React.Fragment>
        <div className="sticky left-0 z-10 flex items-center p-2 text-sm font-medium bg-zinc-800 truncate">{habit.name}</div>
        {calendarGrid.grid.map(({ day, date }) => {
            const dateStr = formatDate(date);
            const completion = completions?.[dateStr];
            const isFuture = date > new Date() && dateStr !== formatDate(new Date());
            const isLoading = pendingCompletions.has(`${habit.id}-${dateStr}`);
            const isDuplicate = completion?.records?.length > 1;
            const isUnsafe = isDuplicate || completion?.unsafe;
            return (
                <div key={`${habit.id}-${day}`} className="flex items-center justify-center bg-zinc-900/70 p-1">
                    <div className="relative w-full"><button aria-label={`${completion ? 'Mark incomplete' : 'Mark complete'}: ${habit.name}, ${dateStr}`} aria-pressed={Boolean(completion)} disabled={isFuture || isLoading || isUnsafe} title={isUnsafe ? 'Conflicting or invalid data: export your data before resolving.' : undefined} onClick={() => onToggle(habit.id, date)} className={`w-full h-10 rounded-md transition-all duration-200 ease-in-out transform focus:outline-none focus:ring-2 focus:ring-amber-500 ${completion ? 'bg-amber-500 shadow-lg hover:opacity-80' : 'bg-zinc-700/50 hover:bg-zinc-600/80'} ${isFuture ? 'opacity-20 cursor-not-allowed' : ''}`}>
                        {isLoading ? <SpinnerIcon /> : isUnsafe ? <span aria-label="Conflicting or invalid record">!</span> : null}
                    </button>{completion && !isUnsafe && <button disabled={isLoading} aria-label={`Edit note: ${habit.name}, ${dateStr}`} onClick={() => onOpenNote(habit, date)} className="absolute bottom-1 right-1 p-1 rounded-full bg-black/50 text-white hover:bg-black/80"><NoteIcon /></button>}</div>
                </div>
            );
        })}
    </React.Fragment>
);

// --- components/CalendarGrid.jsx ---
const CalendarGrid = ({ habits, allCompletions, currentDate, changeMonth, goToToday, onToggle, onOpenNote, pendingCompletions }) => {
    const calendarGrid = useMemo(() => {
        const year = currentDate.getFullYear(), month = currentDate.getMonth();
        const days = getDaysInMonth(year, month);
        const grid = Array.from({ length: days }, (_, i) => ({ day: i + 1, date: new Date(year, month, i + 1) }));
        return { grid, days };
    }, [currentDate]);

    return (
        <div className="lg:col-span-2">
            <SolidCard className="p-4 sm:p-6">
                <div className="flex flex-wrap gap-2 justify-between items-center mb-4"><h2 className="text-xl font-bold">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2><div className="flex items-center space-x-2">{goToToday && <button type="button" onClick={goToToday} className="rounded-md border border-zinc-600 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-700">This month</button>}<button aria-label="Previous month" onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-zinc-700"><ChevronLeftIcon /></button><button aria-label="Next month" onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-zinc-700"><ChevronRightIcon /></button></div></div>
                <div className="overflow-x-auto">
                    <div className="grid gap-px bg-zinc-700/50" style={{ gridTemplateColumns: `minmax(140px, 1fr) repeat(${calendarGrid.days}, minmax(45px, 1fr))` }}>
                        <div className="sticky left-0 z-20 p-2 text-sm font-semibold text-center bg-zinc-800">Habit</div>
                        {calendarGrid.grid.map(({ day, date }) => {
                            const isToday = formatDate(new Date()) === formatDate(date);
                            return <div key={day} className={`flex flex-col items-center justify-center p-1 text-xs font-semibold ${isToday ? 'bg-amber-900/40' : 'bg-zinc-800'}`}><span className="text-zinc-400">{['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()]}</span><span className={`mt-1 flex items-center justify-center w-6 h-6 rounded-full ${isToday ? 'text-amber-300 font-bold' : ''}`}>{day}</span></div>;
                        })}
                        {habits.length === 0 ? <div className="col-span-full p-4 text-center text-zinc-400">Add a habit from the panel on the left.</div> : (
                            habits.map(habit => <HabitRow key={habit.id} habit={habit} completions={allCompletions[habit.id]} calendarGrid={calendarGrid} onToggle={onToggle} onOpenNote={onOpenNote} pendingCompletions={pendingCompletions} />)
                        )}
                    </div>
                </div>
            </SolidCard>
        </div>
    );
};

const TodayView = ({ habits, allCompletions, today, onToggle, onOpenNote, pendingCompletions }) => {
    const todayStr = formatDate(today);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const completed = habits.filter(habit => allCompletions[habit.id]?.[todayStr]).length;
    const visibleHabits = habits.filter(habit => {
        const done = Boolean(allCompletions[habit.id]?.[todayStr]);
        return habit.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (filter === 'all' || (filter === 'done' ? done : !done));
    });
    return <SolidCard className="p-4 sm:p-6 mb-8" aria-labelledby="today-title">
        <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
            <div><h2 id="today-title" className="text-xl font-bold">Today</h2><p className="text-sm text-zinc-400 mt-1">{today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
            <span className="text-sm text-amber-300">{completed} of {habits.length} completed</span>
        </div>
        {habits.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-4"><p className="font-semibold text-zinc-200">Build momentum, one day at a time.</p><p className="mt-1 text-sm text-zinc-400">Add a habit below to get started. Your daily check-in will appear here.</p><p className="mt-2 text-sm text-zinc-400">Choose a starter or create your own, check in, and add a note to remember your progress.</p></div> : <>
        <div className="mb-4 flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Filter today's habits" className="flex rounded-lg border border-zinc-700 bg-zinc-900 p-1 text-sm">
                {[['all', 'All'], ['todo', 'To do'], ['done', 'Done']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 font-semibold ${filter === value ? 'bg-amber-400 text-zinc-900' : 'text-zinc-400 hover:text-white'}`}>{label}</button>)}
            </div>
            <label htmlFor="today-search" className="sr-only">Search today's habits</label><input id="today-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a habit" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        {visibleHabits.length === 0 ? <p className="text-sm text-zinc-400">No habits match these filters.</p> : <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleHabits.map(habit => {
                const completion = allCompletions[habit.id]?.[todayStr];
                const done = Boolean(completion);
                const isDuplicate = completion?.records?.length > 1;
                const isUnsafe = isDuplicate || completion?.unsafe;
                const pending = pendingCompletions.has(`${habit.id}-${todayStr}`);
                return <li key={habit.id} className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/70 p-3">
                    <button aria-label={`${done ? 'Mark incomplete' : 'Mark complete'} today: ${habit.name}`} aria-pressed={done} disabled={pending || isUnsafe} title={isUnsafe ? 'Conflicting or invalid data: export your data before resolving.' : undefined} onClick={() => onToggle(habit.id, today)} className={`flex-1 min-w-0 flex items-center gap-3 text-left rounded focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50`}>
                        <span aria-hidden="true" className={`flex shrink-0 h-7 w-7 items-center justify-center rounded-md border ${done ? 'bg-amber-400 border-amber-400 text-zinc-900' : 'border-zinc-500 text-zinc-500'}`}>{done ? '✓' : ''}</span><span className="break-words">{habit.name}</span>
                    </button>
                    {isUnsafe && <span className="text-xs text-amber-300">{isDuplicate ? 'Duplicate records' : 'Invalid record'}</span>}
                    {done && !isUnsafe && <button disabled={pending} onClick={() => onOpenNote(habit, today)} className="text-xs text-amber-300 underline shrink-0" aria-label={`Edit today's note: ${habit.name}`}>Note</button>}
                </li>;
            })}
        </ul>}
        </>}
    </SolidCard>;
};


export { SolidCard, PrimaryButton, CloseIcon, Toast, NoteModal, ProgressOverview, CalendarGrid, TodayView };
