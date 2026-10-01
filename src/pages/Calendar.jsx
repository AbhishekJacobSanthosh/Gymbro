import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Flame, Loader2, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../App';
import { calculateStreak, calculateXpGained, calculateLevelFromXp, getEarnedAchievements } from '../lib/utils';

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
        .select('user_id, day_of_week, is_rest_day, created_at')
        .eq('completed', false)
        .in('user_id', profileIds);

      const userRestDays = {};
      profileIds.forEach(id => userRestDays[id] = new Set());

      if (allTemplates) {
        allTemplates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const templatesByUserAndDay = {};
        allTemplates.forEach(t => {
          if (!templatesByUserAndDay[t.user_id]) templatesByUserAndDay[t.user_id] = {};
          if (!templatesByUserAndDay[t.user_id][t.day_of_week]) {
            templatesByUserAndDay[t.user_id][t.day_of_week] = t;
            if (t.is_rest_day) {
              userRestDays[t.user_id].add(t.day_of_week);
            }
          }
        });
      }

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
          p.streak = calculateStreak(allWorkouts.filter(w => w.user_id === p.id), userRestDays[p.id], 3);
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

    // Save updated exercises (reps and weights for progressive overload) back to the template
    await Promise.all(dayExercises.map(async (ex) => {
      await supabase
        .from('exercises')
        .update({
          reps: ex.reps,
          weight: parseFloat(ex.weight) || 0,
          completed: false
        })
        .eq('id', ex.id);
    }));

    // Insert historical workout record
    const { data: newWorkout, error: wError } = await supabase
      .from('workouts')
      .insert([{
        user_id: session.user.id,
        routine_name: activeTemplate.routine_name,
        day_of_week: activeTemplate.day_of_week,
        is_rest_day: activeTemplate.is_rest_day,
        completed: true,
        completed_at: localDate.toISOString()
      }])
      .select()
      .single();

    if (!wError && newWorkout && dayExercises.length > 0) {
      const completedExercises = dayExercises.map(ex => ({
        workout_id: newWorkout.id,
        name: ex.name,
        sets: parseInt(ex.sets) || 0,
        reps: ex.reps || '0',
        weight: parseFloat(ex.weight) || 0,
        minutes: parseInt(ex.minutes) || 0,
        completed: ex.completed
      }));
      await supabase.from('exercises').insert(completedExercises);
    }

    // --- GAMIFICATION: XP & LEVELING ---
    let totalVolume = 0;
    dayExercises.forEach(ex => {
        let reps = 0;
        if (typeof ex.reps === 'string') {
          const match = ex.reps.match(/\d+/);
          if (match) reps = parseInt(match[0]);
        } else {
          reps = parseInt(ex.reps) || 0;
        }
        const weight = parseFloat(ex.weight) || 0;
        const sets = parseInt(ex.sets) || 0;
        totalVolume += (sets * reps * weight);
    });
    
    const xpGained = calculateXpGained(totalVolume);

    const { data: profile } = await supabase
      .from('profiles')
      .select('xp, level')
      .eq('id', session.user.id)
      .single();
      
    const currentXp = profile?.xp || 0;
    const newXp = currentXp + xpGained;
    const newLevel = calculateLevelFromXp(newXp);

    await supabase.from('profiles').update({ xp: newXp, level: newLevel }).eq('id', session.user.id);

    // --- GAMIFICATION: PR CHECK ---
    let prsHit = [];
    
    await Promise.all(dayExercises.map(async (ex) => {
      if (!ex.name || !ex.weight || ex.weight <= 0) return;
      
      const { data: pastEx } = await supabase
        .from('exercises')
        .select('weight, workouts!inner(user_id)')
        .eq('name', ex.name)
        .eq('workouts.user_id', session.user.id)
        .order('weight', { ascending: false })
        .limit(1);

      const pastMax = pastEx && pastEx.length > 0 ? parseFloat(pastEx[0].weight) : 0;
      
      if (parseFloat(ex.weight) > pastMax && pastMax > 0) {
        prsHit.push({ name: ex.name, weight: ex.weight });
      }
    }));

    // --- GAMIFICATION: ACHIEVEMENTS CHECK ---
    const { data: allWorkouts } = await supabase.from('workouts').select('completed, completed_at').eq('user_id', session.user.id).eq('completed', true);
    
    const streak = calculateStreak(allWorkouts || [], new Set(), 3);
    
    const stats = {
      totalWorkouts: (allWorkouts?.length || 0),
      currentStreak: streak,
      level: newLevel,
      maxVolume: totalVolume
    };

    const { data: existingAchievements } = await supabase.from('achievements').select('badge_name').eq('user_id', session.user.id);
    const earnedAchievements = getEarnedAchievements(stats, existingAchievements || []);

    if (earnedAchievements.length > 0) {
      await supabase.from('achievements').insert(
        earnedAchievements.map(ach => ({
          user_id: session.user.id,
          badge_name: ach.badge_name,
          description: ach.description
        }))
      );
      
      earnedAchievements.forEach(ach => {
         setTimeout(() => toast?.success(`🏅 Achievement Unlocked: ${ach.badge_name}!`), 1000);
      });
    }

    // Add to Activity Feed
    const routineName = activeTemplate?.routine_name || 'Workout';
    const cleanRoutineName = routineName.toLowerCase().includes('workout') ? routineName : `${routineName} workout`;
    let feedAction = `crushed a retroactive ${cleanRoutineName}! (+${xpGained} XP)`;
    
    if (prsHit.length > 0) {
      const prText = prsHit.map(pr => `${pr.name} (${pr.weight}kg)`).join(', ');
      feedAction = `hit a PR on ${prText} retroactively! (+${xpGained} XP)`;
    } else if (earnedAchievements.length > 0) {
      feedAction = `earned the ${earnedAchievements[0].badge_name} badge retroactively! (+${xpGained} XP)`;
    }

    await supabase.from('activity_feed').insert([{
      user_id: session.user.id,
      action: feedAction
    }]);

    // Refresh Calendar
    await fetchCalendarData();
    setModalOpen(false);
    setSaving(false);

    toast?.success('Workout logged successfully!');
  };

  const todayDate = new Date();

  // Get user initials for avatar
  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';

  return (
    <div className="flex-col gap-5 stagger-children" style={{ display: 'flex' }}>
      <header className="page-header">
        <h1 className="page-title">Consistency</h1>
        <p className="page-subtitle">Track your progress and build habits.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-5)' }}>
        {/* Calendar + Leaderboard layout */}
        <div className="flex gap-5" style={{ flexWrap: 'wrap' }}>

          {/* Main Calendar */}
          <div className="card" style={{ flex: '2 1 400px' }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="stat-icon" style={{ backgroundColor: 'var(--accent-soft)', width: '36px', height: '36px' }}>
                  <CalendarIcon size={18} style={{ color: 'var(--accent)' }} />
                </div>
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>
                  {currentDate.toLocaleString('default', { month: 'long' })} {currentDate.getFullYear()}
                </h2>
              </div>
              <div className="flex gap-2">
                <button onClick={prevMonth} className="btn btn-secondary btn-icon">
                  <ChevronLeft size={18} />
                </button>
                <button onClick={nextMonth} className="btn btn-secondary btn-icon">
                  <ChevronRight size={18} />
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
                  <div key={day} className="calendar-header-cell">{day}</div>
                ))}

                {blanks.map(blank => (
                  <div key={`blank-${blank}`} className="calendar-blank" />
                ))}

                {days.map(day => {
                  const dayData = activityData[day] || [];
                  const hasActivity = dayData.length > 0;

                  const isToday = day === todayDate.getDate() &&
                    currentDate.getMonth() === todayDate.getMonth() &&
                    currentDate.getFullYear() === todayDate.getFullYear();

                  return (
                    <div
                      key={day}
                      onClick={() => handleDayClick(day)}
                      className={`calendar-day ${hasActivity ? 'has-activity' : ''} ${isToday ? 'is-today' : ''}`}
                    >
                      <span>{day}</span>
                      <div className="calendar-dots">
                        {activityData[day] && activityData[day].map(userId => {
                          const p = profiles.find(profile => profile.id === userId);
                          if (!p) return null;
                          return <div key={userId} className="calendar-dot" style={{ backgroundColor: p.color }} title={p.name} />;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar: Leaderboard */}
          <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="card" style={{ padding: 'var(--space-5)' }}>
              <div className="flex items-center gap-2 mb-5">
                <Flame size={18} style={{ color: 'var(--accent)' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Leaderboard</h3>
              </div>
              <div className="flex-col" style={{ display: 'flex', gap: '16px' }}>
                {profiles.map((p, index) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-tertiary)', width: '16px' }}>
                        {index + 1}
                      </span>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: 'var(--radius-full)',
                        background: `${p.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.8125rem', fontWeight: 700, color: p.color
                      }}>
                        {getInitial(p.name)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{p.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Lvl {p.level} • {p.xp} XP</span>
                      </div>
                    </div>
                    {p.streak > 0 ? (
                      <div className="flex items-center gap-1" title={`${p.streak} Day Streak`}>
                        <Flame size={14} style={{ color: p.color }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: p.color }}>{p.streak}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>💤</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
              {profiles.map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="calendar-dot" style={{ backgroundColor: p.color, width: '8px', height: '8px' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Retroactive Logging Modal / Bottom Sheet */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {/* Drag handle for mobile */}
            <div className="modal-drag-handle" style={{ display: 'none' }} />
            <style>{`@media (max-width: 640px) { .modal-drag-handle { display: block !important; } }`}</style>

            <button
              onClick={() => setModalOpen(false)}
              className="modal-close"
            >
              <X size={20} />
            </button>

            <h2 className="modal-title">{historicalWorkouts.length > 0 ? 'Workout History' : 'Log Workout'}</h2>
            <p className="modal-subtitle">{selectedDate?.toDateString()}</p>

            {modalLoading ? (
              <div className="empty-state">
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
              </div>
            ) : historicalWorkouts.length > 0 ? (
              <div className="flex-col gap-4" style={{ display: 'flex' }}>
                {historicalWorkouts.map(w => (
                  <div key={w.id} className="card" style={{ padding: 'var(--space-4)' }}>
                    <div className="flex justify-between items-center mb-3">
                      <h3 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>{w.routine_name}</h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        {new Date(w.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {w.is_rest_day ? (
                      <p style={{ color: 'var(--text-secondary)' }}>Rest Day</p>
                    ) : (
                      <div className="flex-col gap-2" style={{ display: 'flex' }}>
                        {(w.exercises || []).map(ex => {
                          const hasLoggedSets = ex.logged_sets && Object.keys(ex.logged_sets).length > 0;
                          return (
                            <div key={ex.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.875rem', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 500 }}>{ex.name}</span>
                                {!hasLoggedSets && (
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                    {ex.sets > 0 && `${ex.sets} Sets `} 
                                    {ex.reps && ex.reps !== '0' && `${ex.reps} Reps `}
                                    {ex.weight > 0 && `${ex.weight}kg `}
                                    {ex.minutes > 0 && `${ex.minutes}m`}
                                  </span>
                                )}
                              </div>
                              {hasLoggedSets && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px', borderLeft: '2px solid var(--border)', marginTop: '2px' }}>
                                  {Object.entries(ex.logged_sets).map(([idx, set]) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                      <span>Set {parseInt(idx) + 1}</span>
                                      <span>{set.reps} Reps • {set.weight}kg</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : !activeTemplate ? (
              <div className="empty-state">
                <CalendarIcon size={28} className="empty-state-icon" />
                <p className="empty-state-text">No template found for this day. Go to the Planner to create one first.</p>
              </div>
            ) : activeTemplate.is_rest_day ? (
              <div className="empty-state">
                <p className="empty-state-text">This day was scheduled as a Rest Day.</p>
              </div>
            ) : dayExercises.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-text">No exercises in this template. Add them in the Planner first.</p>
              </div>
            ) : (
              <div className="flex-col gap-1" style={{ display: 'flex' }}>
                {dayExercises.map(ex => (
                  <div
                    key={ex.id}
                    className="exercise-row"
                    style={{ opacity: ex.completed ? 0.5 : 1 }}
                  >
                    <button
                      onClick={() => toggleComplete(ex.id, ex.completed)}
                      className={`exercise-check ${ex.completed ? 'checked' : ''}`}
                    >
                      <Check size={16} />
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className={`exercise-name ${ex.completed ? 'completed' : ''}`}>
                        {ex.name}
                      </h3>
                      <div className="exercise-meta">
                        <span style={{ fontWeight: 500 }}>{ex.sets} Sets</span>
                        <div className="exercise-meta-dot" />
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={ex.reps}
                            onChange={e => handleLocalChange(ex.id, 'reps', e.target.value)}
                            className="exercise-inline-input"
                          />
                          <span>Reps</span>
                        </div>
                        <div className="exercise-meta-dot" />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.5"
                            value={ex.weight}
                            onChange={e => handleLocalChange(ex.id, 'weight', e.target.value)}
                            className="exercise-inline-input"
                            style={{ width: '50px' }}
                          />
                          <span>kg</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={finishRetroactiveWorkout}
                  disabled={saving || !dayExercises.every(ex => ex.completed)}
                  className="btn btn-primary btn-lg w-full mt-6"
                >
                  {saving ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      <span>Finish Workout</span>
                    </>
                  )}
                </button>

                {!dayExercises.every(ex => ex.completed) && (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', textAlign: 'center', marginTop: 'var(--space-2)' }}>
                    Complete all exercises to finish
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
