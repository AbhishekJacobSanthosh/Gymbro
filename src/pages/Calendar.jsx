import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Flame, Loader2, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../App';
import { calculateStreak, getActiveTemplates, getRestDays } from '../lib/utils';
import { submitWorkout } from '../lib/awardWorkout';

let hasLoadedOnce = false;

export default function Calendar({ session }) {
  const toast = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(!hasLoadedOnce);

  // Navigation
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const startDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay(); // 0 is Sunday

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: startDay }, (_, i) => i);

  const COLORS = ['#ff7854', '#4ade80', '#60a5fa', '#c084fc', '#facc15', '#f472b6'];

  const [profiles, setProfiles] = useState([]);
  const [activityData, setActivityData] = useState({});

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayExercises, setDayExercises] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [historicalWorkouts, setHistoricalWorkouts] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCalendarData();
  }, [currentDate, session]);

  const fetchCalendarData = async () => {
    if (!session?.user) return;
    if (!hasLoadedOnce) setLoading(true);

    try {
      // 1. Fetch all profiles
      const { data: allProfiles } = await supabase.from('profiles').select('*');

      let profileList = [];
      if (allProfiles && allProfiles.length > 0) {
        profileList = allProfiles.map((p, index) => ({
          id: p.id,
          name: p.display_name || (p.id === session.user.id ? 'You' : `User ${index + 1}`),
          color: p.color || COLORS[index % COLORS.length],
          level: p.level || 1,
          xp: p.xp || 0,
          streak: 0,
          total: 0
        }));
      } else {
        // fallback if no profiles exist
        profileList = [{ id: session.user.id, name: 'You', color: COLORS[0], level: 1, xp: 0, streak: 0, total: 0 }];
      }

      // 2. Fetch all completed workouts for the current month
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: workouts } = await supabase
        .from('workouts')
        .select('user_id, completed_at')
        .eq('completed', true)
        .gte('completed_at', startOfMonth)
        .lte('completed_at', endOfMonth);

      // Fetch ALL completed workouts for streak calculation
      const { data: allWorkouts } = await supabase
        .from('workouts')
        .select('user_id, completed_at')
        .eq('completed', true)
        .order('completed_at', { ascending: false });



      const profileIds = profileList.map(p => p.id);

      // Fetch active templates to determine rest days
      const { data: allTemplates } = await supabase
        .from('workouts')
        .select('user_id, day_of_week, is_rest_day, created_at, completed, routine_name')
        .eq('completed', false)
        .in('user_id', profileIds);

      const userRestDays = {};
      profileIds.forEach(id => {
        userRestDays[id] = getRestDays(getActiveTemplates((allTemplates || []).filter(t => t.user_id === id)));
      });

      // Process workouts into activityData map: { dayNumber: [userId, userId, ...] }
      let newActivityData = {};
      const userTotals = {};
      profileIds.forEach(id => userTotals[id] = 0);

      if (workouts) {
        workouts.forEach(w => {
          const wDate = new Date(w.completed_at);
          const dayNum = wDate.getDate();

          if (!newActivityData[dayNum]) {
            newActivityData[dayNum] = [];
          }

          if (profileIds.includes(w.user_id)) {
            if (!newActivityData[dayNum].includes(w.user_id)) {
              newActivityData[dayNum].push(w.user_id);
            }
            if (userTotals[w.user_id] !== undefined) {
              userTotals[w.user_id]++;
            }
          }
        });
      }

      if (allWorkouts) {
        profileList.forEach(p => {
          p.streak = calculateStreak(allWorkouts.filter(w => w.user_id === p.id), userRestDays[p.id], 3).streak;
          p.total = userTotals[p.id] || 0;
        });
      }

      profileList.sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level;
        if (b.xp !== a.xp) return b.xp - a.xp;
        return b.streak - a.streak;
      });

      setProfiles(profileList);
      setActivityData(newActivityData);

    } catch (error) {
      console.error(error);
    }

    hasLoadedOnce = true;
    setLoading(false);
  };

  const handleDayClick = async (day) => {
    const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (clickedDate > today) {
      toast?.info("You can't log a workout in the future!");
      return;
    }

    setSelectedDate(clickedDate);
    setModalOpen(true);
    setModalLoading(true);
    setHistoricalWorkouts([]);

    const startOfDay = new Date(clickedDate);
    const endOfDay = new Date(clickedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Check if user already completed workouts on this day
    const { data: pastWorkouts } = await supabase
      .from('workouts')
      .select('*, exercises(*)')
      .eq('user_id', session.user.id)
      .eq('completed', true)
      .gte('completed_at', startOfDay.toISOString())
      .lte('completed_at', endOfDay.toISOString())
      .order('completed_at', { ascending: false });

    if (pastWorkouts && pastWorkouts.length > 0) {
      setHistoricalWorkouts(pastWorkouts);
      setModalLoading(false);
      return;
    }

    const dayOfWeekStr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][clickedDate.getDay()];

    const { data: templates } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('day_of_week', dayOfWeekStr)
      .eq('completed', false)
      .neq('routine_name', 'Spontaneous Workout')
      .order('created_at', { ascending: false })
      .limit(1);

    if (templates && templates.length > 0) {
      const template = templates[0];
      setActiveTemplate(template);

      const { data: exData } = await supabase
        .from('exercises')
        .select('*')
        .eq('workout_id', template.id)
        .order('created_at', { ascending: true });

      const formattedExercises = (exData || []).map(ex => ({
        ...ex,
        completed: false
      }));
      setDayExercises(formattedExercises);
    } else {
      setActiveTemplate(null);
      setDayExercises([]);
    }
    setModalLoading(false);
  };

  const handleLocalChange = (exId, field, value) => {
    setDayExercises(prev => prev.map(ex =>
      ex.id === exId ? { ...ex, [field]: value } : ex
    ));
  };

  const toggleComplete = (exId, currentStatus) => {
    setDayExercises(prev => prev.map(ex =>
      ex.id === exId ? { ...ex, completed: !currentStatus } : ex
    ));
  };

  const finishRetroactiveWorkout = async () => {
    if (!activeTemplate) return;
    setSaving(true);

    // Build the completed_at ISO string using the selected date but keeping a default noon time
    const localDate = new Date(selectedDate);
    localDate.setHours(12, 0, 0, 0);

    // One transaction saves the workout, its exercises, the reps/weights back to the template, and XP
    try {
      const { earnedAchievements } = await submitWorkout(session.user.id, {
        clientId: crypto.randomUUID(),
        templateId: activeTemplate.id,
        routineName: activeTemplate.routine_name || 'Workout',
        dayOfWeek: activeTemplate.day_of_week,
        completedAt: localDate.toISOString(),
        retro: true,
        exercises: dayExercises.map(ex => ({
          template_exercise_id: ex.id,
          name: ex.name,
          sets: parseInt(ex.sets) || 0,
          reps: ex.reps || '0',
          weight: parseFloat(ex.weight) || 0,
          minutes: parseInt(ex.minutes) || 0,
          logged_sets: null
        }))
      });
      earnedAchievements.forEach(ach => {
         setTimeout(() => toast?.success(`🏅 Achievement Unlocked: ${ach.badge_name}!`), 1000);
      });
    } catch (error) {
      console.error(error);
      toast?.error('Error logging workout. Please try again.');
      setSaving(false);
      return;
    }

    // Refresh Calendar
    await fetchCalendarData();
    setModalOpen(false);
    setSaving(false);

    toast?.success('Workout logged successfully!');
  };

  const todayDate = new Date();
  const monthLabel = `${currentDate.toLocaleString('default', { month: 'long' })} ${currentDate.getFullYear()}`;
  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';
  const formatLoggedSet = (set) => (parseFloat(set.weight) || 0) > 0 ? `${set.weight} kg × ${set.reps}` : `${set.reps} reps`;
  const planSummary = (ex) => [
    ex.sets > 0 && ex.reps && ex.reps !== '0' ? `${ex.sets} × ${ex.reps}` : null,
    ex.weight > 0 ? `${ex.weight} kg` : null,
    ex.minutes > 0 ? `${ex.minutes} min` : null,
  ].filter(Boolean).join(', ');

  return (
    <div className="consistency">
      <header className="page-header">
        <h1 className="page-title">Consistency</h1>
        <p className="page-subtitle">Who trained when. Tap a day to see or log a workout.</p>
      </header>

      <div className="consistency-grid">
        <section className="panel calendar-panel" aria-label={monthLabel}>
          <div className="calendar-head">
            <h2 className="section-title">{monthLabel}</h2>
            <div className="calendar-nav">
              <button onClick={prevMonth} className="icon-button" aria-label="Previous month">
                <ChevronLeft size={20} />
              </button>
              <button onClick={nextMonth} className="icon-button" aria-label="Next month">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          ) : (
            <div className="calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="calendar-header-cell" aria-hidden="true">{day}</div>
              ))}

              {blanks.map(blank => (
                <div key={`blank-${blank}`} className="calendar-blank" />
              ))}

              {days.map(day => {
                const trainedIds = activityData[day] || [];
                const isToday = day === todayDate.getDate() &&
                  currentDate.getMonth() === todayDate.getMonth() &&
                  currentDate.getFullYear() === todayDate.getFullYear();
                const names = trainedIds.map(id => profiles.find(p => p.id === id)?.name).filter(Boolean);

                return (
                  <button
                    key={day}
                    onClick={() => handleDayClick(day)}
                    className={`calendar-day ${trainedIds.length ? 'has-activity' : ''} ${isToday ? 'is-today' : ''}`}
                    aria-label={`${day} ${monthLabel}${names.length ? `, trained: ${names.join(', ')}` : ''}`}
                  >
                    <span className="num">{day}</span>
                    <span className="calendar-dots" aria-hidden="true">
                      {trainedIds.map(userId => {
                        const p = profiles.find(profile => profile.id === userId);
                        return p ? <span key={userId} className="calendar-dot" style={{ backgroundColor: p.color }} /> : null;
                      })}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Leaderboard: each person in their own colour */}
        <section aria-labelledby="leaderboard-title">
          <h2 id="leaderboard-title" className="section-title">Leaderboard</h2>
          <ol className="grouped-list leaderboard">
            {profiles.map((p, index) => (
              <li key={p.id} className="leader-row">
                <span className="leader-rank num">{index + 1}</span>
                <span className="leader-avatar" style={{ backgroundColor: p.color }} aria-hidden="true">{getInitial(p.name)}</span>
                <span className="leader-main">
                  <strong>{p.name}{p.id === session.user.id ? ' (you)' : ''}</strong>
                  <span>Level {p.level}, {p.xp} XP</span>
                </span>
                <span className={`leader-streak ${p.streak > 0 ? '' : 'is-zero'}`}>
                  {p.streak > 0 && <Flame size={16} style={{ color: p.color }} aria-hidden="true" />}
                  <span className="num">{p.streak}</span>
                  <span className="sr-only">day streak</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Day sheet: history for that day, or log a past workout */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="day-sheet-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle" />
            <button onClick={() => setModalOpen(false)} className="modal-close" aria-label="Close">
              <X size={20} />
            </button>

            <h2 id="day-sheet-title" className="modal-title">{historicalWorkouts.length > 0 ? 'Workout history' : 'Log a past workout'}</h2>
            <p className="modal-subtitle">
              {selectedDate?.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>

            {modalLoading ? (
              <div className="empty-state">
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
              </div>
            ) : historicalWorkouts.length > 0 ? (
              <div className="history-list">
                {historicalWorkouts.map(w => (
                  <article key={w.id} className="history-item">
                    <div className="history-head">
                      <h3>{w.routine_name}</h3>
                      <span className="num">{new Date(w.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {w.is_rest_day ? (
                      <p className="history-note">Rest day</p>
                    ) : (
                      <ul className="history-exercises">
                        {(w.exercises || []).map(ex => {
                          const loggedSets = Object.entries(ex.logged_sets || {});
                          return (
                            <li key={ex.id}>
                              <div className="history-exercise">
                                <span>{ex.name}</span>
                                {loggedSets.length === 0 && <span className="history-plan">{planSummary(ex)}</span>}
                              </div>
                              {loggedSets.length > 0 && (
                                <ol className="history-sets">
                                  {loggedSets.map(([idx, set]) => (
                                    <li key={idx}>
                                      <span>Set {parseInt(idx) + 1}</span>
                                      <span className="num">{formatLoggedSet(set)}</span>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            ) : !activeTemplate ? (
              <p className="history-note">Nothing planned for this weekday. Set it up in the Planner first.</p>
            ) : activeTemplate.is_rest_day ? (
              <p className="history-note">This was a rest day.</p>
            ) : dayExercises.length === 0 ? (
              <p className="history-note">This day's plan has no exercises yet. Add them in the Planner first.</p>
            ) : (
              <div className="retro-list">
                <p className="history-note">Tick what you did. Changes to reps and weight also update your plan.</p>
                {dayExercises.map(ex => (
                  <div key={ex.id} className="exercise-row" style={{ opacity: ex.completed ? 0.6 : 1 }}>
                    <button
                      onClick={() => toggleComplete(ex.id, ex.completed)}
                      className={`exercise-check ${ex.completed ? 'checked' : ''}`}
                      aria-label={`Mark ${ex.name} ${ex.completed ? 'not done' : 'done'}`}
                    >
                      <Check size={16} />
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className={`exercise-name ${ex.completed ? 'completed' : ''}`}>{ex.name}</h3>
                      <div className="exercise-meta">
                        <span>{ex.sets} sets</span>
                        <label className="flex items-center gap-1">
                          <input
                            type="text"
                            value={ex.reps}
                            onChange={e => handleLocalChange(ex.id, 'reps', e.target.value)}
                            className="exercise-inline-input"
                            aria-label={`${ex.name} reps`}
                          />
                          <span>reps</span>
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            value={ex.weight}
                            onChange={e => handleLocalChange(ex.id, 'weight', e.target.value)}
                            className="exercise-inline-input"
                            aria-label={`${ex.name} weight in kg`}
                          />
                          <span>kg</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={finishRetroactiveWorkout}
                  disabled={saving || !dayExercises.every(ex => ex.completed)}
                  className="btn btn-primary btn-lg w-full mt-6"
                >
                  {saving ? <><Loader2 size={18} className="animate-spin" /> Saving</> : <><Check size={18} /> Save workout</>}
                </button>
                {!dayExercises.every(ex => ex.completed) && (
                  <p className="history-note" style={{ textAlign: 'center' }}>Tick every exercise to save.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
