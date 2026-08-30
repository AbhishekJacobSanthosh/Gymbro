import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CheckCircle, Flame, User, Loader2, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../App';

export default function Calendar({ session }) {
  const toast = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  // Navigation
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const startDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay(); // 0 is Sunday

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: startDay }, (_, i) => i);

  const [profiles, setProfiles] = useState({
    you: { id: session?.user?.id, name: 'You', color: 'var(--accent)', streak: 0, total: 0 },
    sister: { id: null, name: 'Partner', color: 'var(--success)', streak: 0, total: 0 }
  });

  const [activityData, setActivityData] = useState({});

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayExercises, setDayExercises] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCalendarData();
  }, [currentDate, session]);

  const fetchCalendarData = async () => {
    if (!session?.user) return;
    setLoading(true);

    try {
      // 1. Fetch all profiles to find sister
      const { data: allProfiles } = await supabase.from('profiles').select('*');

      let youProfile = { ...profiles.you };
      let sisterProfile = { ...profiles.sister };

      if (allProfiles) {
        const youData = allProfiles.find(p => p.id === session.user.id);
        const sisterData = allProfiles.find(p => p.id !== session.user.id);

        if (youData) youProfile.name = youData.display_name || 'You';
        if (sisterData) {
          sisterProfile.id = sisterData.id;
          sisterProfile.name = sisterData.display_name || 'Partner';
        }
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

      // Fetch active templates to determine rest days
      const { data: allTemplates } = await supabase
        .from('workouts')
        .select('user_id, day_of_week, is_rest_day, created_at')
        .eq('completed', false)
        .in('user_id', [youProfile.id, sisterProfile.id].filter(Boolean));

      const userRestDays = {
        [youProfile.id]: new Set(),
        [sisterProfile.id]: new Set()
      };

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

      // Process workouts into activityData map: { dayNumber: ['you', 'sister'] }
      let newActivityData = {};
      let youTotal = 0;
      let sisterTotal = 0;

      if (workouts) {
        workouts.forEach(w => {
          const wDate = new Date(w.completed_at);
          const dayNum = wDate.getDate();

          if (!newActivityData[dayNum]) {
            newActivityData[dayNum] = [];
          }

          if (w.user_id === youProfile.id) {
            if (!newActivityData[dayNum].includes('you')) newActivityData[dayNum].push('you');
            youTotal++;
          } else if (w.user_id === sisterProfile.id) {
            if (!newActivityData[dayNum].includes('sister')) newActivityData[dayNum].push('sister');
            sisterTotal++;
          }
        });
      }

      const calculateStreak = (history, restDaysOfWeek) => {
        if (!history || history.length === 0) return 0;
        let streak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let currentCheckDate = new Date(today);
        const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        const completedDates = new Set(history.map(w => {
          const d = new Date(w.completed_at);
          d.setHours(0, 0, 0, 0);
          return d.getTime();
        }));

        for (let i = 0; i < 365; i++) {
          const time = currentCheckDate.getTime();
          const isCompleted = completedDates.has(time);
          const dayName = DAYS[currentCheckDate.getDay()];
          const isRestDay = restDaysOfWeek.has(dayName);
          const isToday = i === 0;

          if (isCompleted) {
            streak++;
          } else {
            if (isToday) {
              // skip today if not completed
            } else if (isRestDay) {
              // skip rest day if not completed
            } else {
              // missing a required day breaks streak
              break;
            }
          }
          currentCheckDate.setDate(currentCheckDate.getDate() - 1);
        }
        return streak;
      };

      if (allWorkouts) {
        youProfile.streak = calculateStreak(allWorkouts.filter(w => w.user_id === youProfile.id), userRestDays[youProfile.id]);
        sisterProfile.streak = calculateStreak(allWorkouts.filter(w => w.user_id === sisterProfile.id), userRestDays[sisterProfile.id]);
      }

      youProfile.total = youTotal;
      sisterProfile.total = sisterTotal;

      setProfiles({ you: youProfile, sister: sisterProfile });
      setActivityData(newActivityData);

    } catch (error) {
      console.error(error);
    }

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

    // Save updated exercises (reps and weights for progressive overload) and reset completed status
    for (const ex of dayExercises) {
      await supabase
        .from('exercises')
        .update({
          reps: ex.reps,
          weight: parseFloat(ex.weight) || 0,
          completed: false
        })
        .eq('id', ex.id);
    }

    // Build the completed_at ISO string using the selected date but keeping a default noon time to avoid timezone edge cases
    const localDate = new Date(selectedDate);
    localDate.setHours(12, 0, 0, 0);

    // Mark as completed
    await supabase
      .from('workouts')
      .update({ completed: true, completed_at: localDate.toISOString() })
      .eq('id', activeTemplate.id);

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
                  const youCompleted = dayData.includes('you');
                  const sisterCompleted = dayData.includes('sister');
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
                        {youCompleted && (
                          <div className="calendar-dot" style={{ backgroundColor: profiles.you.color }} title={profiles.you.name} />
                        )}
                        {sisterCompleted && (
                          <div className="calendar-dot" style={{ backgroundColor: profiles.sister.color }} title={profiles.sister.name} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar: Leaderboard */}
          <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* You */}
            <div className="card user-stat-card" style={{ paddingLeft: 'calc(var(--space-6) + 3px)' }}>
              <style>{`.user-stat-card:first-child::before { background: var(--accent-gradient); }`}</style>
              <div className="flex items-center gap-3 mb-4">
                <div style={{
                  width: '36px', height: '36px', borderRadius: 'var(--radius-full)',
                  background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent)'
                }}>
                  {getInitial(profiles.you.name)}
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{profiles.you.name}</h3>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>Active Streak</span>
                <div className="flex items-center gap-1">
                  <strong style={{ fontSize: '0.875rem', color: profiles.you.streak > 0 ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    {profiles.you.streak > 0 ? '🔥' : '💤'} {profiles.you.streak}
                  </strong>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>This Month</span>
                <div className="flex items-center gap-1">
                  <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                  <strong style={{ fontSize: '0.875rem' }}>{profiles.you.total}</strong>
                </div>
              </div>
            </div>

            {/* Partner */}
            <div className="card user-stat-card" style={{ paddingLeft: 'calc(var(--space-6) + 3px)' }}>
              <style>{`.user-stat-card:nth-child(2)::before { background: var(--success); }`}</style>
              <div className="flex items-center gap-3 mb-4">
                <div style={{
                  width: '36px', height: '36px', borderRadius: 'var(--radius-full)',
                  background: 'var(--success-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.875rem', fontWeight: 700, color: 'var(--success)'
                }}>
                  {getInitial(profiles.sister.name)}
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{profiles.sister.name}</h3>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>Active Streak</span>
                <div className="flex items-center gap-1">
                  <strong style={{ fontSize: '0.875rem', color: profiles.sister.streak > 0 ? 'var(--success)' : 'var(--text-tertiary)' }}>
                    {profiles.sister.streak > 0 ? '🔥' : '💤'} {profiles.sister.streak}
                  </strong>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>This Month</span>
                <div className="flex items-center gap-1">
                  <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                  <strong style={{ fontSize: '0.875rem' }}>{profiles.sister.total}</strong>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-3)', justifyContent: 'center' }}>
              <div className="flex items-center gap-2">
                <div className="calendar-dot" style={{ backgroundColor: profiles.you.color, width: '8px', height: '8px' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{profiles.you.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="calendar-dot" style={{ backgroundColor: profiles.sister.color, width: '8px', height: '8px' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{profiles.sister.name}</span>
              </div>
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

            <h2 className="modal-title">Log Workout</h2>
            <p className="modal-subtitle">{selectedDate?.toDateString()}</p>

            {modalLoading ? (
              <div className="empty-state">
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
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
