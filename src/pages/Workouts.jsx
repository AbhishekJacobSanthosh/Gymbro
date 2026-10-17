import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, Coffee, Loader2, Trophy, Undo2, Plus, Minus, ChevronDown, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../App';
import { getActiveTemplates, workoutCompletedAt, lastPerformanceByName, plannedSetDrafts, formatSet } from '../lib/utils';
import { readStore, writeStore, enqueueWorkout, removeQueued, flushOutbox } from '../lib/offline';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_REST_SECONDS = 90;
const WEIGHT_STEP = 2.5;

const startOfDay = (date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
const isSameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const nameKey = (name) => name?.trim().toLowerCase();

const EMPTY_WORKOUT = { templateId: null, routineName: 'No Template', isRestDay: false, exercises: [], startedAt: null, lastActivityAt: null };

// A planned exercise becomes a local one; ticks always start empty, boxes start from last time
const toLocalExercise = (ex, lastSets) => ({
  key: ex.id ? `t${ex.id}` : crypto.randomUUID(),
  template_exercise_id: ex.id ?? null,
  name: ex.name,
  sets: ex.sets,
  reps: ex.reps,
  weight: ex.weight,
  minutes: ex.minutes,
  completed: false,
  logged_sets: null,
  set_drafts: plannedSetDrafts(ex.sets, ex.reps, ex.weight, lastSets),
});

const planFromTemplate = (template, lastByName = {}) => template ? {
  ...EMPTY_WORKOUT,
  templateId: template.id,
  routineName: template.routine_name || 'Workout',
  isRestDay: !!template.is_rest_day,
  exercises: [...(template.exercises || [])]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(ex => toLocalExercise(ex, lastByName[nameKey(ex.name)])),
} : EMPTY_WORKOUT;

const hasProgress = (workout) => workout.exercises.some(ex => ex.completed || Object.keys(ex.logged_sets || {}).length > 0);
const loggedCount = (ex) => Object.keys(ex.logged_sets || {}).length;

// A heavier logged set raises the planned weight (saved to the template on finish)
const withTopWeight = (ex) => {
  const planned = parseFloat(ex.weight) || 0;
  const top = Math.max(planned, ...Object.values(ex.logged_sets || {}).map(set => parseFloat(set.weight) || 0));
  return top > planned ? { ...ex, weight: top } : ex;
};

const formatClock = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

export default function Workouts({ session }) {
  const toast = useToast();
  const userId = session.user.id;
  const [today] = useState(DAYS[new Date().getDay()]);
  const [workout, setWorkout] = useState(EMPTY_WORKOUT);
  const [pastExercises, setPastExercises] = useState(() => readStore(userId, 'exerciseNames', []));
  const [lastByName, setLastByName] = useState(() => readStore(userId, 'lastPerformance', {}));
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [prMessages, setPrMessages] = useState([]);
  const [expandedKey, setExpandedKey] = useState(null);

  // Add Exercise State
  const [newExercise, setNewExercise] = useState({ name: '', sets: '', reps: '', weight: '', minutes: '' });
  const [isTodayCompleted, setIsTodayCompleted] = useState(false);
  const [serverCompletedId, setServerCompletedId] = useState(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const pendingFinishId = useRef(null);
  const serverDoneTodayRef = useRef(false);

  const { exercises, routineName, isRestDay } = workout;
  const hasWorkout = workout.templateId !== null || !!workout.startedAt;
  const startedEarlierDay = workout.startedAt && !isSameDay(workout.startedAt, new Date());

  // Rest timer: an end time kept on the phone, so it keeps counting if you leave the page
  const [rest, setRest] = useState(() => readStore(userId, 'rest', null));
  const [restSeconds, setRestSeconds] = useState(() => readStore(userId, 'restSeconds', DEFAULT_REST_SECONDS));
  const [restOver, setRestOver] = useState(false);
  const [, setTick] = useState(0);
  const now = Date.now();
  const restRemaining = rest ? Math.ceil((rest.endsAt - now) / 1000) : 0;
  const elapsed = workout.startedAt && !startedEarlierDay ? (now - new Date(workout.startedAt).getTime()) / 1000 : null;

  const needsClock = !!rest || elapsed !== null;
  useEffect(() => {
    if (!needsClock) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [needsClock]);

  const saveRest = (next) => {
    setRest(next);
    writeStore(userId, 'rest', next);
  };
  const startRest = () => {
    setRestOver(false);
    saveRest({ endsAt: Date.now() + restSeconds * 1000 });
  };
  // Adjusting also becomes the default for the next rest
  const adjustRest = (delta) => {
    const nextDefault = Math.max(15, restSeconds + delta);
    setRestSeconds(nextDefault);
    writeStore(userId, 'restSeconds', nextDefault);
    if (rest) saveRest({ endsAt: Math.max(Date.now() + 1000, rest.endsAt + delta * 1000) });
  };
  const clearRest = () => {
    setRestOver(false);
    saveRest(null);
  };

  const restFinished = !!rest && restRemaining <= 0;
  useEffect(() => {
    if (!restFinished) return;
    navigator.vibrate?.([200, 100, 200]); // Android only; iPhone web apps can't vibrate
    saveRest(null);
    setRestOver(true);
    const timeout = setTimeout(() => setRestOver(false), 4000);
    return () => clearTimeout(timeout);
  }, [restFinished]);

  useEffect(() => {
    loadWorkout();
    fetchExerciseHistory();
  }, [session]);

  // Celebrate PRs and badges when this page's finished workout reaches the server
  useEffect(() => {
    const onSynced = (e) => {
      const { clientId, prsHit, earnedAchievements } = e.detail;
      if (clientId !== pendingFinishId.current) return;
      pendingFinishId.current = null;
      if (prsHit.length > 0 || earnedAchievements.length > 0) {
        setPrMessages(prsHit);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      }
    };
    window.addEventListener('gymbro:synced', onSynced);
    return () => window.removeEventListener('gymbro:synced', onSynced);
  }, []);

  // Exercise names for suggestions, and what you did last time for the "Last" column
  const fetchExerciseHistory = async () => {
    if (session.offline) return;
    // Newest first so the 1000-row API cap drops the oldest rows, not recent ones
    const { data } = await supabase
      .from('exercises')
      .select('name, sets, reps, weight, logged_sets, workouts!inner(user_id, completed)')
      .eq('workouts.user_id', userId)
      .neq('name', '')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!data) return;

    const names = [...new Set(data.map(d => d.name))];
    setPastExercises(names);
    writeStore(userId, 'exerciseNames', names);

    const last = lastPerformanceByName(data.filter(d => d.workouts.completed));
    setLastByName(last);
    writeStore(userId, 'lastPerformance', last);
    showFromStore(); // re-prefill an untouched plan with last time's weights
  };

  // Shows the page from what is stored on the phone, so it opens instantly and offline.
  // Without an argument it reuses the server's last "done today" answer.
  const showFromStore = (serverDoneToday = serverDoneTodayRef.current) => {
    const now = new Date();
    const stored = readStore(userId, 'session', null);

    // A started workout stays until it is finished or discarded, whatever the date.
    // One from an earlier day with nothing ticked is just dropped.
    if (stored && (isSameDay(stored.startedAt, now) || hasProgress(stored))) {
      setWorkout(stored);
      setIsTodayCompleted(false);
      setLoading(false);
      return;
    }
    if (stored) writeStore(userId, 'session', null);

    const last = readStore(userId, 'lastFinished', null);
    setIsTodayCompleted(serverDoneToday || (!!last && isSameDay(last.completedAt, now)));
    setWorkout(planFromTemplate(readStore(userId, 'templates', {})[today], readStore(userId, 'lastPerformance', {})));
    setLoading(false);
  };

  const loadWorkout = async () => {
    showFromStore();
    if (session.offline) return;

    const todayStart = startOfDay(new Date());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Refresh the weekly plan and "done today" from the server, then redraw
    const [{ data: plans, error }, { data: completedToday }] = await Promise.all([
      supabase
        .from('workouts')
        .select('*, exercises(*)')
        .eq('user_id', userId)
        .eq('completed', false),
      supabase
        .from('workouts')
        .select('id')
        .eq('user_id', userId)
        .eq('completed', true)
        .gte('completed_at', todayStart.toISOString())
        .lt('completed_at', todayEnd.toISOString())
        .order('completed_at', { ascending: false })
        .limit(1),
    ]);

    if (!error) writeStore(userId, 'templates', getActiveTemplates(plans));
    setServerCompletedId(completedToday?.[0]?.id ?? null);
    serverDoneTodayRef.current = !!completedToday?.length;
    showFromStore();
  };

  // Every change goes through here: the workout counts as started on the first change
  // and is saved on the phone right away.
  const updateWorkout = (change, { activity = true } = {}) => {
    setWorkout(prev => {
      const next = change(prev);
      if (activity) {
        const at = new Date().toISOString();
        next.startedAt ??= at;
        next.lastActivityAt = at;
      }
      if (next.startedAt) writeStore(userId, 'session', next);
      return next;
    });
  };

  const updateExercise = (key, change, options) => updateWorkout(w => ({
    ...w,
    exercises: w.exercises.map(ex => ex.key === key ? change(ex) : ex),
  }), options);

  const handleStartSpontaneous = () => {
    setIsTodayCompleted(false);
    setExpandedKey(null);
    updateWorkout(() => ({ ...EMPTY_WORKOUT, routineName: 'Spontaneous Workout' }));
  };

  const handleDiscard = () => {
    setIsCancelModalOpen(false);
    writeStore(userId, 'session', null);
    clearRest();
    setExpandedKey(null);
    showFromStore();
  };

  const handleUndo = async () => {
    const last = readStore(userId, 'lastFinished', null);

    // Not uploaded yet: just take it back out of the queue
    if (last && removeQueued(userId, last.clientId)) {
      writeStore(userId, 'lastFinished', null);
      writeStore(userId, 'session', last.session);
      pendingFinishId.current = null;
      toast?.success("Workout undone. You can keep editing it.");
      showFromStore();
      return;
    }

    const workoutId = last?.workoutId ?? serverCompletedId;
    if (!workoutId) {
      toast?.error(last ? "This workout is still uploading. Try again in a moment." : "Couldn't find the workout to undo.");
      return;
    }
    if (session.offline) {
      toast?.error("Undo needs signal once a workout has synced.");
      return;
    }

    setLoading(true);
    // Deletes the workout and takes back exactly the XP it was awarded, in one transaction
    const { error } = await supabase.rpc('revoke_workout_xp', { p_workout_id: workoutId });
    if (error) {
      console.error(error);
      toast?.error("Failed to undo workout.");
      setLoading(false);
      return;
    }

    writeStore(userId, 'lastFinished', null);
    if (last?.workoutId === workoutId) writeStore(userId, 'session', last.session);
    setServerCompletedId(null);
    serverDoneTodayRef.current = false;
    toast?.success("Workout undone. You can keep editing it.");
    await loadWorkout();
  };

  const handleAddExercise = (e) => {
    e.preventDefault();
    if (!newExercise.name.trim()) return;

    const name = newExercise.name.trim();
    const added = toLocalExercise({
      name,
      sets: parseInt(newExercise.sets) || 0,
      reps: newExercise.reps || '0',
      weight: parseFloat(newExercise.weight) || 0,
      minutes: parseInt(newExercise.minutes) || 0,
    }, lastByName[nameKey(name)]);
    updateWorkout(w => ({ ...w, exercises: [...w.exercises, added] }));
    setExpandedKey(added.key);
    setNewExercise({ name: '', sets: '', reps: '', weight: '', minutes: '' });
  };

  // Exercises without sets (cardio): one tick for the whole thing
  const toggleComplete = (key) => updateExercise(key, ex => (
    ex.completed ? { ...ex, completed: false, logged_sets: null } : { ...ex, completed: true }
  ));

  const toggleSet = (key, setIndex) => {
    const ex = exercises.find(e => e.key === key);
    const ticking = ex && !ex.logged_sets?.[setIndex];
    if (ticking) startRest();
    // Finishing the open exercise hands the focus to the next unfinished one
    if (ticking && loggedCount(ex) + 1 === (parseInt(ex.sets) || 0) && expandedKey === key) setExpandedKey(null);

    updateExercise(key, ex => {
      const logged = { ...(ex.logged_sets || {}) };
      const wasDone = !!logged[setIndex];
      if (wasDone) delete logged[setIndex];
      else logged[setIndex] = { ...(ex.set_drafts?.[setIndex] || { reps: ex.reps, weight: ex.weight }) };

      const allSetsDone = Object.keys(logged).length === (parseInt(ex.sets) || 0);
      return withTopWeight({ ...ex, completed: wasDone ? false : (allSetsDone || ex.completed), logged_sets: logged });
    });
  };

  // Later sets that still had the same value follow along, so a change is made once, not per set
  const handleSetDraftChange = (key, setIndex, field, value) => updateExercise(key, ex => {
    const drafts = { ...(ex.set_drafts || {}) };
    const before = String(drafts[setIndex]?.[field] ?? '');
    drafts[setIndex] = { ...drafts[setIndex], [field]: value };
    for (let i = setIndex + 1; i < (parseInt(ex.sets) || 0); i++) {
      if (!ex.logged_sets?.[i] && String(drafts[i]?.[field] ?? '') === before) {
        drafts[i] = { ...drafts[i], [field]: value };
      }
    }
    return { ...ex, set_drafts: drafts };
  });

  const stepWeight = (ex, setIndex, delta) => {
    const current = parseFloat(ex.set_drafts?.[setIndex]?.weight) || 0;
    handleSetDraftChange(ex.key, setIndex, 'weight', String(Math.max(0, current + delta)));
  };

  // Extra sets are for this workout only; the plan keeps its set count
  const addSet = (key) => updateExercise(key, ex => {
    const count = parseInt(ex.sets) || 0;
    const previous = ex.logged_sets?.[count - 1] ?? ex.set_drafts?.[count - 1] ?? { reps: ex.reps, weight: ex.weight };
    return {
      ...ex,
      sets: count + 1,
      completed: false,
      set_drafts: { ...(ex.set_drafts || {}), [count]: { reps: previous.reps, weight: previous.weight } },
    };
  });

  const removeLastSet = (key) => updateExercise(key, ex => {
    const count = parseInt(ex.sets) || 0;
    const drafts = { ...(ex.set_drafts || {}) };
    delete drafts[count - 1];
    const sets = count - 1;
    return { ...ex, sets, set_drafts: drafts, completed: sets > 0 && loggedCount(ex) === sets };
  });

  const finishWorkout = () => {
    if (!allDone || finishing) return;
    setFinishing(true);

    const now = new Date();
    const startedAt = new Date(workout.startedAt ?? now);
    const completedAt = workoutCompletedAt(workout.startedAt, workout.lastActivityAt, now);

    const op = {
      clientId: crypto.randomUUID(),
      templateId: workout.templateId,
      routineName,
      dayOfWeek: DAYS[startedAt.getDay()],
      completedAt: completedAt.toISOString(),
      exercises: exercises.map(ex => ({
        template_exercise_id: ex.template_exercise_id,
        name: ex.name,
        sets: parseInt(ex.sets) || 0,
        reps: String(ex.reps ?? '') || '0',
        weight: parseFloat(ex.weight) || 0,
        minutes: parseInt(ex.minutes) || 0,
        logged_sets: ex.logged_sets || null,
      })),
    };

    // Queue first, then clear the session, so the workout is never only in memory
    enqueueWorkout(userId, op);
    writeStore(userId, 'lastFinished', { clientId: op.clientId, completedAt: op.completedAt, session: workout });
    writeStore(userId, 'session', null);
    pendingFinishId.current = op.clientId;
    clearRest();
    setExpandedKey(null);
    setFinishing(false);

    const savedTo = isSameDay(completedAt, now) ? '' : ` to ${op.dayOfWeek}`;
    toast?.success(navigator.onLine
      ? `${routineName} saved${savedTo}`
      : `${routineName} saved${savedTo} on your phone. It'll upload when you have signal.`);

    if (!session.offline) flushOutbox(userId);
    showFromStore();
  };

  const completedCount = exercises.filter(ex => ex.completed).length;
  const allDone = exercises.length > 0 && completedCount === exercises.length;
  const totalSets = exercises.reduce((sum, ex) => sum + (parseInt(ex.sets) || 1), 0);
  const doneSets = exercises.reduce((sum, ex) => sum + ((parseInt(ex.sets) || 0) > 0 ? loggedCount(ex) : (ex.completed ? 1 : 0)), 0);
  const openKey = exercises.some(ex => ex.key === expandedKey)
    ? expandedKey
    : (exercises.find(ex => !ex.completed) ?? exercises[0])?.key;
  const showDock = hasWorkout && !isRestDay && exercises.length > 0 && !isTodayCompleted;

  const title = loading ? 'Today' : isTodayCompleted ? 'Done for today' : isRestDay ? 'Rest day' : hasWorkout ? routineName : 'Today';
  const subtitle = startedEarlierDay
    ? `Started ${DAYS[new Date(workout.startedAt).getDay()]}`
    : hasWorkout && !isRestDay && !isTodayCompleted
      ? `${today}, ${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`
      : today;

  const renderSetTable = (ex) => {
    const sets = parseInt(ex.sets) || 0;
    const last = lastByName[nameKey(ex.name)] || [];
    const activeIndex = Array.from({ length: sets }, (_, i) => i).find(i => !ex.logged_sets?.[i]);

    return (
      <>
        <div className="set-table" role="table" aria-label={`${ex.name} sets`}>
          <div className="set-row set-row-head" role="row">
            <span role="columnheader">Set</span>
            <span role="columnheader">Last</span>
            <span role="columnheader">kg</span>
            <span role="columnheader">Reps</span>
            <span role="columnheader" className="sr-only">Done</span>
          </div>
          {Array.from({ length: sets }).map((_, i) => {
            const logged = ex.logged_sets?.[i];
            const draft = ex.set_drafts?.[i] || { reps: ex.reps, weight: ex.weight };
            const shown = logged || draft;
            const isActive = i === activeIndex;
            return (
              <div key={i} role="row" className={`set-row ${logged ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}>
                <span className="set-num num">{i + 1}</span>
                <span className="set-last">{formatSet(last[i]) ?? '–'}</span>
                <span className="set-kg">
                  {isActive && (
                    <button className="set-step" onClick={() => stepWeight(ex, i, -WEIGHT_STEP)} aria-label={`Set ${i + 1}: ${WEIGHT_STEP} kg less`}>
                      <Minus size={14} strokeWidth={3} />
                    </button>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    className="set-input num"
                    value={shown.weight ?? ''}
                    onChange={e => handleSetDraftChange(ex.key, i, 'weight', e.target.value)}
                    disabled={!!logged}
                    aria-label={`Set ${i + 1} weight in kg`}
                  />
                  {isActive && (
                    <button className="set-step" onClick={() => stepWeight(ex, i, WEIGHT_STEP)} aria-label={`Set ${i + 1}: ${WEIGHT_STEP} kg more`}>
                      <Plus size={14} strokeWidth={3} />
                    </button>
                  )}
                </span>
                <input
                  type="text"
                  className="set-input num"
                  value={shown.reps ?? ''}
                  onChange={e => handleSetDraftChange(ex.key, i, 'reps', e.target.value)}
                  disabled={!!logged}
                  aria-label={`Set ${i + 1} reps`}
                />
                <button
                  onClick={() => toggleSet(ex.key, i)}
                  aria-label={`Mark set ${i + 1} ${logged ? 'not done' : 'done'}`}
                  className={`set-check ${logged ? 'checked' : ''}`}
                >
                  <span className="set-check-circle">
                    {logged && <Check size={16} strokeWidth={3} />}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="set-actions">
          <button className="text-button" onClick={() => addSet(ex.key)}>
            <Plus size={16} /> Add set
          </button>
          {sets > 1 && !ex.logged_sets?.[sets - 1] && (
            <button className="text-button text-button-quiet" onClick={() => removeLastSet(ex.key)}>
              <Minus size={16} /> Remove last set
            </button>
          )}
        </div>
      </>
    );
  };

  return (
    <div className={`today ${showDock ? 'has-dock' : ''}`}>

      {showConfetti && (
        <div className="celebrate" role="status">
          <div className="celebrate-card">
            <Trophy size={56} />
            <h2>{prMessages.length > 0 ? 'New PR' : 'Badge unlocked'}</h2>
            {prMessages.length > 0 && <p>{prMessages.map(pr => `${pr.name}: ${pr.weight} kg`).join(', ')}</p>}
          </div>
        </div>
      )}

      <header className="today-header">
        <div className="today-header-row">
          <div className="today-heading">
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">{subtitle}</p>
          </div>
          {elapsed !== null && !isTodayCompleted && (
            <div className="today-elapsed" aria-label="Workout time">
              <span className="num">{formatClock(elapsed)}</span>
            </div>
          )}
        </div>
        {showDock && (
          <div className="today-progress" role="progressbar" aria-valuemin={0} aria-valuemax={totalSets} aria-valuenow={doneSets} aria-label="Sets done">
            <span style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} />
          </div>
        )}
      </header>

      {loading ? (
        <div className="empty-state">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
        </div>
      ) : isTodayCompleted ? (
        <section className="today-state">
          <span className="today-state-icon"><Check size={28} strokeWidth={3} /></span>
          <p className="today-state-text">Workout logged. Rest up and come back stronger tomorrow.</p>
          <div className="today-state-actions">
            <button onClick={handleStartSpontaneous} className="btn btn-primary btn-lg">
              <Plus size={18} /> Start another workout
            </button>
            <button onClick={handleUndo} className="btn btn-secondary btn-lg">
              <Undo2 size={18} /> Undo last workout
            </button>
          </div>
        </section>
      ) : isRestDay ? (
        <section className="today-state">
          <span className="today-state-icon today-state-icon-quiet"><Coffee size={26} /></span>
          <p className="today-state-text">Recovery is where the growth happens.</p>
          <ul className="grouped-list">
            <li><strong>Active recovery</strong><span>A 20-minute walk, light stretching or yoga keeps blood flowing without taxing your muscles.</span></li>
            <li><strong>Eat for repair</strong><span>Keep protein high today while your muscles rebuild.</span></li>
          </ul>
          <button onClick={handleStartSpontaneous} className="btn btn-secondary btn-lg">Train anyway</button>
        </section>
      ) : !hasWorkout ? (
        <section className="today-state">
          <p className="today-state-text">Nothing planned for {today}.</p>
          <div className="today-state-actions">
            <button onClick={handleStartSpontaneous} className="btn btn-primary btn-lg">
              <Plus size={18} /> Start a workout
            </button>
            <Link to="/templates" className="btn btn-secondary btn-lg">Plan your week</Link>
          </div>
        </section>
      ) : (
        <>
          {startedEarlierDay && (
            <p className="today-notice">
              Unfinished workout from {DAYS[new Date(workout.startedAt).getDay()]}. Finishing it saves it to that day.
            </p>
          )}

          {exercises.length === 0 ? (
            <p className="today-notice">Add your first exercise below.</p>
          ) : (
            <div className="exercise-list">
              {exercises.map(ex => {
                const sets = parseInt(ex.sets) || 0;
                const isOpen = ex.key === openKey;
                const plan = sets > 0 ? `${sets} × ${ex.reps}` : ex.minutes > 0 ? `${ex.minutes} min` : '';

                if (!isOpen) {
                  return (
                    <button key={ex.key} className={`ex-row ${ex.completed ? 'is-done' : ''}`} onClick={() => setExpandedKey(ex.key)}>
                      <span className="ex-row-name">{ex.name}</span>
                      <span className="ex-row-plan">{plan}</span>
                      {ex.completed
                        ? <span className="ex-row-done" aria-label="Done"><Check size={16} strokeWidth={3} /></span>
                        : sets > 0 && <span className="ex-row-count num">{loggedCount(ex)}/{sets}</span>}
                      <ChevronDown size={18} className="ex-row-chevron" />
                    </button>
                  );
                }

                return (
                  <article key={ex.key} className="ex-card">
                    <div className="ex-card-head">
                      <h2 className="ex-card-name">{ex.name}</h2>
                      {sets > 0
                        ? <span className="ex-row-count num">{loggedCount(ex)}/{sets}</span>
                        : (
                          <button
                            onClick={() => toggleComplete(ex.key)}
                            aria-label={`Mark ${ex.name} ${ex.completed ? 'not done' : 'done'}`}
                            className={`set-check ${ex.completed ? 'checked' : ''}`}
                          >
                            <span className="set-check-circle">{ex.completed && <Check size={16} strokeWidth={3} />}</span>
                          </button>
                        )}
                    </div>
                    {sets > 0 ? renderSetTable(ex) : plan && <p className="ex-card-plan">{plan}</p>}
                  </article>
                );
              })}
            </div>
          )}

          {/* Add Exercise Form */}
          <form onSubmit={handleAddExercise} className="quick-add">
            <datalist id="exercise-suggestions">
              {pastExercises.map(name => <option key={name} value={name} />)}
            </datalist>
            <label htmlFor="quick-add-name" className="form-label">Add an exercise</label>
            <input
              id="quick-add-name"
              type="text"
              list="exercise-suggestions"
              placeholder="Exercise name"
              value={newExercise.name}
              onChange={e => setNewExercise({ ...newExercise, name: e.target.value })}
              required
            />
            <div className="quick-add-row">
              <input type="number" inputMode="numeric" min="0" placeholder="Sets" aria-label="Sets"
                value={newExercise.sets} onChange={e => setNewExercise({ ...newExercise, sets: e.target.value })} />
              <input type="text" placeholder="Reps" aria-label="Reps"
                value={newExercise.reps} onChange={e => setNewExercise({ ...newExercise, reps: e.target.value })} />
              <input type="number" inputMode="decimal" step="0.5" placeholder="kg" aria-label="Weight in kg"
                value={newExercise.weight} onChange={e => setNewExercise({ ...newExercise, weight: e.target.value })} />
              <input type="number" inputMode="numeric" placeholder="Min" aria-label="Minutes"
                value={newExercise.minutes} onChange={e => setNewExercise({ ...newExercise, minutes: e.target.value })} />
              <button type="submit" className="btn btn-secondary" aria-label="Add exercise"><Plus size={18} /></button>
            </div>
          </form>

          {workout.startedAt && (
            <button className="text-button text-button-danger today-cancel" onClick={() => setIsCancelModalOpen(true)}>
              Cancel workout
            </button>
          )}
        </>
      )}

      {showDock && (
        <div className="today-dock">
          {(rest || restOver) && (
            <div className={`rest-bar ${restOver ? 'is-over' : ''}`} role="timer" aria-live="off">
              <span className="rest-label">{restOver ? 'Rest over' : 'Rest'}</span>
              <span className="rest-time num">{restOver ? 'Go' : formatClock(restRemaining)}</span>
              {!restOver && (
                <>
                  <button className="rest-button" onClick={() => adjustRest(-15)} aria-label="15 seconds less rest">−15</button>
                  <button className="rest-button" onClick={() => adjustRest(15)} aria-label="15 seconds more rest">+15</button>
                  <button className="rest-button" onClick={clearRest}>Skip</button>
                </>
              )}
            </div>
          )}
          <button
            onClick={finishWorkout}
            className="btn btn-primary btn-lg today-finish"
            disabled={finishing || !allDone}
          >
            {finishing
              ? <><Loader2 size={20} className="animate-spin" /> Saving</>
              : allDone
                ? <><Check size={20} /> Finish workout</>
                : `${completedCount}/${exercises.length} exercises done`}
          </button>
        </div>
      )}

      {isCancelModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsCancelModalOpen(false); }}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
            <div className="modal-drag-handle" />
            <button onClick={() => setIsCancelModalOpen(false)} className="modal-close" aria-label="Close">
              <X size={20} />
            </button>
            <h2 id="cancel-title" className="modal-title">Cancel this workout?</h2>
            <p className="modal-subtitle">
              Logged sets and changes from this session are deleted. Your plan stays as it is.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setIsCancelModalOpen(false)} className="btn btn-secondary btn-lg" style={{ flex: 1 }}>Keep going</button>
              <button onClick={handleDiscard} className="btn btn-lg btn-destructive" style={{ flex: 1 }}>Cancel workout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
