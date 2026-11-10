import { useMemo, useState } from 'react';
import { activitySummary, parseDateKey, recentNotes } from '../domain/insights';
import { SolidCard } from './TrackerUI';

export function ActivityInsights({ habits, completions, today }) {
    const [days, setDays] = useState(7);
    const summary = useMemo(() => activitySummary(habits, completions, today, days), [habits, completions, today, days]);
    const peak = Math.max(1, ...summary.daily.map(day => day.count));
    return <SolidCard className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-widest text-amber-400">Your momentum</p><h2 className="mt-1 text-xl font-bold">Activity overview</h2><p className="mt-1 text-sm text-zinc-400">Check-ins for your currently active habits, including today.</p></div>
            <div role="group" aria-label="Activity time range" className="flex rounded-lg border border-zinc-700 bg-zinc-900 p-1 text-sm">
                {[7, 30].map(value => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)} className={`rounded-md px-3 py-1.5 font-semibold ${days === value ? 'bg-amber-400 text-zinc-900' : 'text-zinc-400 hover:text-white'}`}>{value} days</button>)}
            </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-zinc-900/70 p-4"><p className="text-sm text-zinc-400">Check-ins</p><p className="mt-1 text-3xl font-bold text-amber-300">{summary.total}</p><p className="mt-1 text-xs text-zinc-500">Last {days} days</p></div>
            <div className="rounded-xl bg-zinc-900/70 p-4"><p className="text-sm text-zinc-400">Days active</p><p className="mt-1 text-3xl font-bold">{summary.activeDays}<span className="text-lg font-normal text-zinc-500"> / {days}</span></p><p className="mt-1 text-xs text-zinc-500">At least one check-in</p></div>
        </div>
        <div className="mt-5" aria-label={`Daily check-ins for the last ${days} days`}>
            <div className="flex h-24 items-end gap-1" aria-hidden="true">{summary.daily.map(day => <div key={day.key} className="flex min-w-0 flex-1 items-end h-full"><div className={`w-full rounded-t ${day.count ? 'bg-amber-400' : 'bg-zinc-700'}`} style={{ height: `${day.count ? Math.max(8, day.count / peak * 100) : 4}%` }} /></div>)}</div>
            <div className="mt-2 flex justify-between text-xs text-zinc-400"><span>{summary.daily[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span>Today</span></div>
            <details className="mt-3 text-sm text-zinc-400"><summary className="cursor-pointer text-amber-300 underline">View daily totals</summary><ul className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">{summary.daily.map(day => <li key={day.key}>{day.key}: {day.count} {day.count === 1 ? 'check-in' : 'check-ins'}</li>)}</ul></details>
        </div>
        <p className="mt-4 text-xs text-zinc-500">Archived habits are excluded. This is a count of recorded check-ins, not a completion rate.</p>
    </SolidCard>;
}

export function NotesJournal({ habits, completions, today, onOpenNote }) {
    const [query, setQuery] = useState('');
    const [limit, setLimit] = useState(5);
    const notes = useMemo(() => recentNotes(habits, completions, today), [habits, completions, today]);
    const filtered = useMemo(() => {
        const term = query.trim().toLocaleLowerCase();
        return term ? notes.filter(entry => `${entry.habit.name}\n${entry.note}`.toLocaleLowerCase().includes(term)) : notes;
    }, [notes, query]);
    return <SolidCard className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Remember the details</p>
        <h2 className="mt-1 text-xl font-bold">Notes journal</h2>
        <p className="mt-1 text-sm text-zinc-400">Revisit notes from your active habits. Select one to edit it.</p>
        <label htmlFor="journal-search" className="sr-only">Search notes and habits</label>
        <input id="journal-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(5); }} placeholder="Search notes or habits" className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        {filtered.length ? <>
            <ul className="mt-4 space-y-2">{filtered.slice(0, limit).map(entry => <li key={`${entry.habit.id}:${entry.dateKey}`}><button type="button" onClick={() => onOpenNote(entry.habit, parseDateKey(entry.dateKey))} aria-label={`Edit note for ${entry.habit.name}, ${entry.dateKey}`} className="w-full rounded-lg border border-zinc-700 bg-zinc-900/70 p-3 text-left hover:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"><span className="flex flex-wrap justify-between gap-1 text-sm"><span className="font-semibold text-amber-300 break-all">{entry.habit.name}</span><time dateTime={entry.dateKey} className="text-zinc-400">{entry.dateKey}</time></span><span className="mt-1 block line-clamp-3 whitespace-pre-wrap break-words text-sm text-zinc-300">{entry.note}</span></button></li>)}</ul>
            {filtered.length > limit && <button type="button" onClick={() => setLimit(current => current + 5)} className="mt-4 text-sm font-semibold text-amber-300 underline">Show more notes ({filtered.length - limit} remaining)</button>}
        </> : <p className="mt-5 rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">{query.trim() ? 'No notes match your search.' : 'Your notes will appear here after you add them to a check-in.'}</p>}
        <p className="mt-4 text-xs text-zinc-500">Notes from archived habits are hidden until restored.</p>
    </SolidCard>;
}
