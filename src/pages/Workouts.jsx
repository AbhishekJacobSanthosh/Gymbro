import React, { useState, useEffect, useRef } from 'react';
import { Check, Dumbbell, Coffee, Loader2, Trophy, Undo2, Plus, Play, Square, TimerReset, ChevronDown, ChevronUp, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../App';
import { getActiveTemplates, workoutCompletedAt } from '../lib/utils';
import { readStore, writeStore, enqueueWorkout, removeQueued, flushOutbox } from '../lib/offline';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const startOfDay = (date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
const isSameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();

const EMPTY_WORKOUT = { templateId: null, routineName: 'No Template', isRestDay: false, exercises: [], startedAt: null, lastActivityAt: null };

// A planned exercise becomes a local one; ticks always start empty
const toLocalExercise = (ex) => ({
  key: ex.id ? `t${ex.id}` : crypto.randomUUID(),
  template_exercise_id: ex.id ?? null,
  name: ex.name,
  sets: ex.sets,
  reps: ex.reps,
  weight: ex.weight,
  minutes: ex.minutes,
  completed: false,
  logged_sets: null,
  set_drafts: Object.fromEntries(Array.from({ length: parseInt(ex.sets) || 0 }, (_, i) => [i, { reps: ex.reps, weight: ex.weight }])),
});

const planFromTemplate = (template) => template ? {
  ...EMPTY_WORKOUT,
  templateId: template.id,
  routineName: template.routine_name || 'Workout',
  isRestDay: !!template.is_rest_day,
  exercises: [...(template.exercises || [])]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(toLocalExercise),
} : EMPTY_WORKOUT;

const hasProgress = (workout) => workout.exercises.some(ex => ex.completed || Object.keys(ex.logged_sets || {}).length > 0);

// A heavier logged set raises the planned weight (saved to the template on finish)
const withTopWeight = (ex) => {
  const planned = parseFloat(ex.weight) || 0;
  const top = Math.max(planned, ...Object.values(ex.logged_sets || {}).map(set => parseFloat(set.weight) || 0));
  return top > planned ? { ...ex, weight: top } : ex;
};

function ProgressRing({ completed, total, size = 100, strokeWidth = 6 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const offset = circumference - (progress * circumference);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="progress-ring" width={size} height={size}>
        <circle
          className="progress-ring-bg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="progress-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="progress-label">
        <span className="progress-label-count">{completed}/{total}</span>
        <span className="progress-label-text">Done</span>
      </div>
    </div>
  );
}

export default function Workouts({ session }) {
  const toast = useToast();
  const userId = session.user.id;
  const [today] = useState(DAYS[new Date().getDay()]);
  const [workout, setWorkout] = useState(EMPTY_WORKOUT);
  const [pastExercises, setPastExercises] = useState(() => readStore(userId, 'exerciseNames', []));
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [prMessages, setPrMessages] = useState([]);

  // Add Exercise State
  const [newExercise, setNewExercise] = useState({ name: '', sets: '', reps: '', weight: '', minutes: '' });
  const [isTodayCompleted, setIsTodayCompleted] = useState(false);
  const [serverCompletedId, setServerCompletedId] = useState(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const pendingFinishId = useRef(null);

  const { exercises, routineName, isRestDay } = workout;
  const hasWorkout = workout.templateId !== null || !!workout.startedAt;

  // Timer State: kept on the phone so it survives leaving the page
  const [timer, setTimer] = useState(() => readStore(userId, 'timer', { elapsed: 0, runningSince: null }));
  const [, setTick] = useState(0);
  const isTimerRunning = !!timer.runningSince;
  const timerSeconds = timer.elapsed + (isTimerRunning ? Math.floor((Date.now() - timer.runningSince) / 1000) : 0);

  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const saveTimer = (next) => {
    setTimer(next);
    writeStore(userId, 'timer', next);
  };
  const toggleTimer = () => saveTimer(isTimerRunning
    ? { elapsed: timerSeconds, runningSince: null }
    : { elapsed: timer.elapsed, runningSince: Date.now() });
  const resetTimer = () => saveTimer({ elapsed: 0, runningSince: null });

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    loadWorkout();
    fetchPastExercises();
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

  const fetchPastExercises = async () => {
    if (session.offline) return;
    // Newest first so the 1000-row API cap drops the oldest names, not recent ones
    const { data } = await supabase
      .from('exercises')
      .select('name, workouts!inner(user_id)')
      .eq('workouts.user_id', userId)
      .neq('name', '')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (data) {
      const names = [...new Set(data.map(d => d.name))];
      setPastExercises(names);
      writeStore(userId, 'exerciseNames', names);
    }
  };

  // Shows the page from what is stored on the phone, so it opens instantly and offline
  const showFromStore = (serverDoneToday = false) => {
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
    setWorkout(planFromTemplate(readStore(userId, 'templates', {})[today]));
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
    showFromStore(!!completedToday?.length);
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
    updateWorkout(() => ({ ...EMPTY_WORKOUT, routineName: 'Spontaneous Workout' }));
  };

  const handleDiscard = () => {
    setIsCancelModalOpen(false);
    writeStore(userId, 'session', null);
    showFromStore(!!serverCompletedId);
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
    toast?.success("Workout undone. You can keep editing it.");
    await loadWorkout();
  };

  const handleAddExercise = (e) => {
    e.preventDefault();
    if (!newExercise.name.trim()) return;

    const added = toLocalExercise({
      name: newExercise.name.trim(),
      sets: parseInt(newExercise.sets) || 0,
      reps: newExercise.reps || '0',
      weight: parseFloat(newExercise.weight) || 0,
      minutes: parseInt(newExercise.minutes) || 0,
    });
    updateWorkout(w => ({ ...w, exercises: [...w.exercises, added] }));
    setNewExercise({ name: '', sets: '', reps: '', weight: '', minutes: '' });
  };

  // The big circle: completing fills every set from its drafts, unchecking clears them
  const toggleComplete = (key) => updateExercise(key, ex => {
    if (ex.completed) return { ...ex, completed: false, logged_sets: null };
    const logged = { ...(ex.logged_sets || {}) };
    for (let i = 0; i < (parseInt(ex.sets) || 0); i++) {
      logged[i] ??= { ...(ex.set_drafts?.[i] || { reps: ex.reps, weight: ex.weight }) };
    }
    return withTopWeight({ ...ex, completed: true, logged_sets: logged });
  });

  const toggleSet = (key, setIndex) => updateExercise(key, ex => {
    const logged = { ...(ex.logged_sets || {}) };
    const wasDone = !!logged[setIndex];
    if (wasDone) delete logged[setIndex];
    else logged[setIndex] = { ...(ex.set_drafts?.[setIndex] || { reps: ex.reps, weight: ex.weight }) };

    const allSetsDone = Object.keys(logged).length === (parseInt(ex.sets) || 0);
    return withTopWeight({ ...ex, completed: wasDone ? false : (allSetsDone || ex.completed), logged_sets: logged });
  });

  const handleSetDraftChange = (key, setIndex, field, value) => updateExercise(key, ex => ({
    ...ex,
    set_drafts: { ...(ex.set_drafts || {}), [setIndex]: { ...ex.set_drafts?.[setIndex], [field]: value } },
  }));

  // Showing or hiding the set rows is only a view change, so it doesn't start the workout
  const handleLocalChange = (key, field, value) => updateExercise(
    key,
    ex => ({ ...ex, [field]: value }),
    { activity: field !== 'is_tracking_sets' }
  );

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
    resetTimer();
    setFinishing(false);

    const savedTo = isSameDay(completedAt, now) ? '' : ` to ${op.dayOfWeek}`;
    toast?.success(navigator.onLine
      ? `🎉 ${routineName} saved${savedTo}! Great work!`
      : `🎉 ${routineName} saved${savedTo} on your phone. It'll upload when you have signal.`);

    if (!session.offline) flushOutbox(userId);
    showFromStore();
  };

  const completedCount = exercises.filter(ex => ex.completed).length;
  const allDone = exercises.length > 0 && completedCount === exercises.length;
  const startedEarlierDay = workout.startedAt && !isSameDay(workout.startedAt, new Date());

  return (
    <div className="flex-col gap-5" style={{ display: 'flex', position: 'relative' }}>

      {showConfetti && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <div className="card" style={{ textAlign: 'center', animation: 'scaleIn 0.3s ease-out' }}>
            <Trophy size={64} style={{ color: '#ffd700', margin: '0 auto var(--space-4)' }} />
            <h2 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              {prMessages.length > 0 ? 'New PR' : 'Badge unlocked'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.125rem' }}>
              {prMessages.map(pr => `${pr.name}: ${pr.weight}kg`).join(' • ')}
            </p>
          </div>
        </div>
      )}

      <header className="page-header">
        <h1 className="page-title">Today's Workout</h1>
        <p className="page-subtitle">
          {isRestDay ? "Take a breath. It's time to recover." : `It's ${today}. Time to get after it.`}
        </p>
      </header>

      <div className="card">
        {loading ? (
          <div className="empty-state">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        ) : isTodayCompleted ? (
          <div className="empty-state" style={{ padding: 'var(--space-12) var(--space-4)' }}>
            <span style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>💪</span>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>Already Completed!</h3>
            <p className="empty-state-text" style={{ maxWidth: '320px', margin: '0 auto' }}>
              You've already crushed your workout for today. Rest up and come back stronger tomorrow!
            </p>

            <div className="flex gap-4 justify-center" style={{ marginTop: 'var(--space-8)', flexWrap: 'wrap' }}>
              <button onClick={handleUndo} className="btn btn-secondary">
                <Undo2 size={18} /> Undo Last Workout
              </button>
              <button onClick={handleStartSpontaneous} className="btn btn-primary">
                <Plus size={18} /> Start Another
              </button>
            </div>
          </div>
        ) : (
          <>
            {startedEarlierDay && (
              <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--accent-soft)', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                Unfinished workout from {DAYS[new Date(workout.startedAt).getDay()]}. Finishing it saves it to that day.
              </div>
            )}

            {/* Routine Header + Progress Ring */}
            <div className="flex items-center justify-between mb-6" style={{ paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--divider)' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{routineName}</h2>
                {!isRestDay && exercises.length > 0 && (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem', marginTop: 'var(--space-1)' }}>
                    {completedCount} of {exercises.length} exercises completed
                  </p>
                )}

                {/* Timer UI */}
                {!isRestDay && (
                  <div className="flex items-center gap-3 mt-3">
                    <span style={{
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: isTimerRunning ? 'var(--accent)' : 'var(--text-secondary)',
                      fontVariantNumeric: 'tabular-nums'
                    }}>
                      {formatTime(timerSeconds)}
                    </span>
                    <button
                      onClick={toggleTimer}
                      className={`btn-icon ${isTimerRunning ? 'btn-secondary' : 'btn-primary'}`}
                      style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                      aria-label={isTimerRunning ? 'Pause timer' : 'Start timer'}
                    >
                      {isTimerRunning ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: '2px' }} />}
                    </button>
                    {!isTimerRunning && timerSeconds > 0 && (
                      <button
                        onClick={resetTimer}
                        className="btn-icon btn-ghost"
                        style={{ width: '32px', height: '32px', color: 'var(--text-tertiary)' }}
                        aria-label="Reset timer"
                      >
                        <TimerReset size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!isRestDay && exercises.length > 0 && (
                <ProgressRing completed={completedCount} total={exercises.length} />
              )}
            </div>

            {isRestDay ? (
              <div className="rest-day-card" style={{ maxWidth: '600px', margin: '0 auto', padding: 'var(--space-8) var(--space-4)' }}>
                <Coffee size={48} className="rest-day-icon" style={{ margin: '0 auto var(--space-6)', color: 'var(--accent)' }} />
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-3)', color: 'var(--text-primary)' }}>Rest & Recover</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-8)', fontSize: '1.0625rem', lineHeight: 1.6 }}>
                  Recovery is where the growth happens. Taking days off prevents injury and keeps your central nervous system fresh.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)', textAlign: 'left' }}>
                  <div style={{ padding: 'var(--space-4)', backgroundColor: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                    <h4 style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 'var(--space-2)' }}>Active Recovery</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>Consider a light 20-minute walk, some gentle stretching, or yoga to keep blood flowing without taxing your muscles.</p>
                  </div>
                  <div style={{ padding: 'var(--space-4)', backgroundColor: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                    <h4 style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 'var(--space-2)' }}>Nutrition Focus</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>Keep your protein intake high today. Your muscles are actively rebuilding the micro-tears from your previous workouts.</p>
                  </div>
                </div>
              </div>
            ) : !hasWorkout ? (
              <div className="empty-state">
                <Dumbbell size={36} className="empty-state-icon" />
                <p className="empty-state-title">No exercises planned</p>
                <p className="empty-state-text">Go to the Planner to set up your templates for {today}.</p>
                <button onClick={handleStartSpontaneous} className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
                  Start Spontaneous Workout
                </button>
              </div>
            ) : (
              <>
                {exercises.length === 0 ? (
                  <div className="empty-state" style={{ padding: 'var(--space-6) 0' }}>
                    <p className="empty-state-title">Ready to sweat?</p>
                    <p className="empty-state-text">Add your first exercise below to get started.</p>
                  </div>
                ) : (
                  <div className="flex-col" style={{ display: 'flex' }}>
                    {exercises.map(ex => (
                    <div
                      key={ex.key}
                      className="exercise-row"
                      style={{ opacity: ex.completed ? 0.5 : 1 }}
                    >
                      <button
                         onClick={() => toggleComplete(ex.key)}
                         className={`exercise-check ${ex.completed ? 'checked' : ''}`}
                         aria-label={`Mark ${ex.name} ${ex.completed ? 'not done' : 'done'}`}
                       >
                         <Check size={16} />
                       </button>

                       <div style={{ flex: 1, minWidth: 0 }}>
                         <h3 className={`exercise-name ${ex.completed ? 'completed' : ''}`}>
                           {ex.name}
                         </h3>

                         {(ex.sets > 0 || ex.weight > 0 || (ex.reps && ex.reps !== '0') || ex.minutes > 0) && (
                          <div className="exercise-meta" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                            {ex.sets > 0 && (
                              <>
                                <span style={{ fontWeight: 500 }}>{ex.sets} Sets</span>
                                <div className="exercise-meta-dot" />
                              </>
                            )}

                            {ex.minutes > 0 && (
                              <>
                                <span style={{ fontWeight: 500 }}>{ex.minutes} Mins</span>
                                {(!ex.is_tracking_sets && ex.sets > 0) && <div className="exercise-meta-dot" />}
                              </>
                            )}

                            {/* Global Inputs - Always visible unless they explicitly toggle advanced tracking or have 0 sets */}
                            {!ex.is_tracking_sets && ex.sets > 0 && (
                              <>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={ex.reps}
                                    onChange={e => handleLocalChange(ex.key, 'reps', e.target.value)}
                                    className="exercise-inline-input"
                                    aria-label={`${ex.name} reps`}
                                  />
                                  <span>Reps</span>
                                </div>
                                <div className="exercise-meta-dot" />
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.5"
                                    value={ex.weight}
                                    onChange={e => handleLocalChange(ex.key, 'weight', e.target.value)}
                                    className="exercise-inline-input"
                                    style={{ width: '50px' }}
                                    aria-label={`${ex.name} weight in kg`}
                                  />
                                  <span>kg</span>
                                </div>
                              </>
                            )}

                            {/* Toggle Button for Set-by-Set Tracking */}
                            {ex.sets > 0 && (
                              <button
                                onClick={() => handleLocalChange(ex.key, 'is_tracking_sets', !ex.is_tracking_sets)}
                                style={{
                                  marginLeft: 'auto',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  color: ex.is_tracking_sets ? 'var(--accent)' : 'var(--text-tertiary)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  backgroundColor: ex.is_tracking_sets ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                                  transition: 'all 0.2s'
                                }}
                              >
                                {ex.is_tracking_sets ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {ex.is_tracking_sets ? 'Hide Sets' : 'Log Sets'}
                              </button>
                            )}
                          </div>
                          )}

                          {/* Set-by-Set Tracking Rows (Sleek & Compact) */}
                          {ex.sets > 0 && ex.is_tracking_sets && (
                            <div className="flex-col mt-3" style={{ display: 'flex', gap: '1px', backgroundColor: 'var(--border)', padding: '1px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                              {Array.from({ length: parseInt(ex.sets) || 0 }).map((_, i) => {
                                const isSetCompleted = !!(ex.logged_sets && ex.logged_sets[i]);
                                const draft = ex.set_drafts?.[i] || { reps: ex.reps, weight: ex.weight };

                                return (
                                  <div key={i} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    backgroundColor: isSetCompleted ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                                    padding: '8px 12px',
                                    opacity: isSetCompleted ? 0.6 : 1,
                                    transition: 'all 0.2s'
                                  }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-tertiary)', width: '40px' }}>
                                      Set {i + 1}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={isSetCompleted ? (ex.logged_sets[i].reps) : draft.reps}
                                          onChange={e => handleSetDraftChange(ex.key, i, 'reps', e.target.value)}
                                          disabled={isSetCompleted}
                                          className="exercise-inline-input"
                                          style={{ width: '45px', textAlign: 'center', backgroundColor: isSetCompleted ? 'transparent' : 'var(--bg-surface)', padding: '2px 4px' }}
                                          aria-label={`Set ${i + 1} reps`}
                                        />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Reps</span>
                                      </div>

                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          inputMode="decimal"
                                          step="0.5"
                                          value={isSetCompleted ? (ex.logged_sets[i].weight) : draft.weight}
                                          onChange={e => handleSetDraftChange(ex.key, i, 'weight', e.target.value)}
                                          disabled={isSetCompleted}
                                          className="exercise-inline-input"
                                          style={{ width: '50px', textAlign: 'center', backgroundColor: isSetCompleted ? 'transparent' : 'var(--bg-surface)', padding: '2px 4px' }}
                                          aria-label={`Set ${i + 1} weight in kg`}
                                        />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>kg</span>
                                      </div>
                                    </div>

                                    <button
                                      onClick={() => toggleSet(ex.key, i)}
                                      aria-label={`Mark set ${i + 1} ${isSetCompleted ? 'not done' : 'done'}`}
                                      style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: isSetCompleted ? 'var(--accent)' : 'transparent',
                                        color: isSetCompleted ? 'var(--accent-contrast)' : 'var(--text-tertiary)',
                                        border: `2px solid ${isSetCompleted ? 'var(--accent)' : 'var(--border)'}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        marginLeft: '12px'
                                      }}
                                    >
                                      {isSetCompleted && <Check size={14} strokeWidth={3} />}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                       </div>
                     </div>
                   ))}
                 </div>
                 )}

                {/* Add Exercise Form */}
                <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 'var(--space-6)', marginTop: 'var(--space-6)' }}>
                  <p className="text-label mb-3">Quick Add</p>
                  <datalist id="exercise-suggestions">
                    {pastExercises.map(name => <option key={name} value={name} />)}
                  </datalist>
                  <form onSubmit={handleAddExercise} className="flex gap-2 flex-wrap items-end">
                    <div style={{ flex: '1 1 150px' }}>
                      <input
                        type="text"
                        list="exercise-suggestions"
                        placeholder="Exercise Name"
                        value={newExercise.name}
                        onChange={e => setNewExercise({ ...newExercise, name: e.target.value })}
                        required
                        className="exercise-inline-input"
                        style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-elevated)' }}
                      />
                    </div>
                    <div style={{ flex: '0 1 72px' }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="Sets"
                        value={newExercise.sets}
                        onChange={e => setNewExercise({ ...newExercise, sets: e.target.value })}
                        className="exercise-inline-input"
                        style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-elevated)' }}
                      />
                    </div>
                    <div style={{ flex: '0 1 72px' }}>
                      <input
                        type="text"
                        placeholder="Reps"
                        value={newExercise.reps}
                        onChange={e => setNewExercise({ ...newExercise, reps: e.target.value })}
                        className="exercise-inline-input"
                        style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-elevated)' }}
                      />
                    </div>
                    <div style={{ flex: '0 1 72px' }}>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        placeholder="kg"
                        value={newExercise.weight}
                        onChange={e => setNewExercise({ ...newExercise, weight: e.target.value })}
                        className="exercise-inline-input"
                        style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-elevated)' }}
                      />
                    </div>
                    <div style={{ flex: '0 1 72px' }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="Mins"
                        value={newExercise.minutes}
                        onChange={e => setNewExercise({ ...newExercise, minutes: e.target.value })}
                        className="exercise-inline-input"
                        style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-elevated)' }}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem', height: '36px' }} aria-label="Add exercise">
                      <span style={{ fontWeight: 'bold' }}>+</span>
                    </button>
                  </form>
                </div>

                {/* Finish Workout CTA */}
                 <div style={{ textAlign: 'center', marginTop: 'var(--space-8)' }}>
                   <button
                     onClick={finishWorkout}
                     className={`btn btn-primary btn-lg finish-cta ${allDone ? 'ready' : ''}`}
                     disabled={finishing || !allDone}
                     style={{ width: '100%', maxWidth: '320px' }}
                   >
                     {finishing ? (
                       <>
                         <Loader2 size={20} className="animate-spin" />
                         <span>Saving...</span>
                       </>
                     ) : (
                       <>
                         <Check size={20} />
                         <span>Finish Workout</span>
                       </>
                     )}
                   </button>

                   {workout.startedAt && (
                     <button
                       onClick={() => setIsCancelModalOpen(true)}
                       className="btn btn-secondary btn-lg finish-cta"
                       style={{ width: '100%', maxWidth: '320px', marginTop: 'var(--space-4)', backgroundColor: 'transparent', color: 'var(--error)', border: '1px solid var(--error)' }}
                     >
                       Cancel Workout
                     </button>
                   )}

                   {!allDone && exercises.length > 0 && (
                     <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: 'var(--space-3)' }}>
                       Complete all exercises to finish your workout
                     </p>
                   )}
                 </div>
               </>
             )}
           </>
         )}
       </div>

       {isCancelModalOpen && (
         <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 'var(--space-4)', backdropFilter: 'blur(2px)' }}>
           <div className="card" style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
             <div className="flex items-center justify-between mb-4">
               <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                 Cancel Workout
               </h2>
               <button onClick={() => setIsCancelModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }} aria-label="Close">
                 <X size={20} />
               </button>
             </div>
             <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', fontSize: '0.875rem', lineHeight: 1.5 }}>
               Are you sure you want to cancel this workout? All logged sets and changes from this session will be deleted. Your plan stays as it is.
             </p>
             <div className="flex gap-2">
               <button onClick={() => setIsCancelModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>No, Keep It</button>
               <button onClick={handleDiscard} className="btn" style={{ flex: 1, backgroundColor: 'var(--error)', color: 'white' }}>
                 Yes, Cancel
               </button>
             </div>
           </div>
         </div>
       )}
    </div>
  );
}
