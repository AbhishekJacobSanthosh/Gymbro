import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CheckCircle, Flame, User, Loader2, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Calendar({ session }) {
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
    you: { id: session?.user?.id, name: 'You', color: 'var(--accent-primary)', streak: 0, total: 0 },
    sister: { id: null, name: 'Sister', color: '#4CAF50', streak: 0, total: 0 }
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
          sisterProfile.name = sisterData.display_name || 'Sister';
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

      youProfile.total = youTotal;
      sisterProfile.total = sisterTotal;

      // 3. (Optional) Fetch streak exactly like Home.jsx for both users here. 
      // For now, we will just display 0 if we don't recalculate it, or we could fetch all workouts.
      // To keep it simple, we'll leave streak at 0 for now unless you want the full query.

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
    today.setHours(0,0,0,0);
    
    if (clickedDate > today) {
      alert("You cannot log a workout in the future!");
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
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="page-header mb-2">
        <h1 className="page-title">Consistency</h1>
        <p className="text-muted">Track your progress and build habits.</p>
      </header>
      
      <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
        
        {/* Main Calendar View */}
        <div className="card" style={{ flex: '2 1 400px' }}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <CalendarIcon className="text-accent" />
              <h2 style={{ fontSize: '1.25rem' }}>
                {currentDate.toLocaleString('default', { month: 'long' })} {currentDate.getFullYear()}
              </h2>
            </div>
            <div className="flex gap-2">
              <button onClick={prevMonth} className="btn btn-secondary" style={{ padding: '0.5rem' }}><ChevronLeft size={20} /></button>
              <button onClick={nextMonth} className="btn btn-secondary" style={{ padding: '0.5rem' }}><ChevronRight size={20} /></button>
            </div>
          </div>

          {loading ? (
             <div className="flex justify-center p-12 text-muted">
               <Loader2 className="animate-spin" size={32} />
             </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '0.5rem',
              textAlign: 'center'
            }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-muted" style={{ fontWeight: 600, paddingBottom: '0.5rem' }}>{day}</div>
              ))}
              
              {blanks.map(blank => (
                <div key={`blank-${blank}`} style={{ padding: '1rem', background: 'transparent' }} />
              ))}
              
              {days.map(day => {
                const dayData = activityData[day] || [];
                const youCompleted = dayData.includes('you');
                const sisterCompleted = dayData.includes('sister');
                const hasActivity = dayData.length > 0;
                
                const today = new Date();
                const isToday = day === today.getDate() && 
                                currentDate.getMonth() === today.getMonth() && 
                                currentDate.getFullYear() === today.getFullYear();
                
                return (
                  <div 
                    key={day} 
                    onClick={() => handleDayClick(day)}
                    style={{ 
                      padding: '1rem 0',
                      borderRadius: 'var(--border-radius)',
                      backgroundColor: hasActivity ? 'var(--bg-elevated)' : 'transparent',
                      border: isToday ? '2px solid var(--accent-primary)' : hasActivity ? '1px solid var(--border-color)' : '1px solid transparent',
                      color: hasActivity ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: hasActivity || isToday ? 'bold' : 'normal',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'var(--transition)'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = hasActivity ? 'var(--bg-elevated)' : 'transparent'}
                  >
                    {day}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '4px', height: '6px' }}>
                      {youCompleted && (
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: profiles.you.color }} title={profiles.you.name} />
                      )}
                      {sisterCompleted && (
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: profiles.sister.color }} title={profiles.sister.name} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar: Leaderboard */}
        <div style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div className="card" style={{ borderLeft: `4px solid ${profiles.you.color}` }}>
            <div className="flex items-center gap-2 mb-4">
              <User size={20} style={{ color: profiles.you.color }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{profiles.you.name}</h3>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted">Active Streak</span>
              <div className="flex items-center gap-1">
                <Flame size={16} className="text-accent" />
                <strong>🔥</strong>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted">This Month</span>
              <div className="flex items-center gap-1">
                <CheckCircle size={16} className="text-success" style={{ color: 'var(--success-color)' }} />
                <strong>{profiles.you.total}</strong>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderLeft: `4px solid ${profiles.sister.color}` }}>
            <div className="flex items-center gap-2 mb-4">
              <User size={20} style={{ color: profiles.sister.color }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{profiles.sister.name}</h3>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted">Active Streak</span>
              <div className="flex items-center gap-1">
                <Flame size={16} style={{ color: profiles.sister.color }} />
                <strong>🔥</strong>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted">This Month</span>
              <div className="flex items-center gap-1">
                <CheckCircle size={16} className="text-success" style={{ color: 'var(--success-color)' }} />
                <strong>{profiles.sister.total}</strong>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Retroactive Logging Modal */}
      {modalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
            <button 
              onClick={() => setModalOpen(false)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={24} />
            </button>
            
            <h2 className="page-title mb-1">Log Workout</h2>
            <p className="text-muted mb-4">{selectedDate?.toDateString()}</p>

            {modalLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-accent" size={32} /></div>
            ) : !activeTemplate ? (
              <div className="p-4 text-center text-muted">No template found for this day. Go to the Planner to create one first.</div>
            ) : activeTemplate.is_rest_day ? (
              <div className="p-4 text-center text-muted">This day was scheduled as a Rest Day.</div>
            ) : dayExercises.length === 0 ? (
              <div className="p-4 text-center text-muted">No exercises in this template. Add them in the Planner first.</div>
            ) : (
              <div className="flex flex-col gap-4">
                {dayExercises.map(ex => (
                  <div key={ex.id} className="flex items-center justify-between" style={{ padding: '1rem 0', borderBottom: '1px solid var(--border-color)', opacity: ex.completed ? 0.5 : 1 }}>
                    <div className="flex flex-col gap-1" style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: ex.completed ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: ex.completed ? 'line-through' : 'none' }}>
                        {ex.name}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-muted mt-1" style={{ flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 500 }}>{ex.sets} Sets</span>
                        <span style={{ opacity: 0.3 }}>•</span>
                        <div className="flex items-center gap-1">
                          <input 
                            type="text" 
                            value={ex.reps}
                            onChange={e => handleLocalChange(ex.id, 'reps', e.target.value)}
                            style={{ width: '45px', padding: '0.2rem 0', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid var(--text-muted)', textAlign: 'center', color: 'var(--text-primary)', fontWeight: 600 }}
                          />
                          <span>Reps</span>
                        </div>
                        <span style={{ opacity: 0.3 }}>•</span>
                        <div className="flex items-center gap-1">
                          <input 
                            type="number" 
                            step="0.5"
                            value={ex.weight}
                            onChange={e => handleLocalChange(ex.id, 'weight', e.target.value)}
                            style={{ width: '50px', padding: '0.2rem 0', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid var(--text-muted)', textAlign: 'center', color: 'var(--text-primary)', fontWeight: 600 }}
                          />
                          <span>kg</span>
                        </div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => toggleComplete(ex.id, ex.completed)}
                      style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: ex.completed ? 'var(--success-color)' : 'transparent', border: `2px solid ${ex.completed ? 'var(--success-color)' : 'var(--border-color)'}`, color: ex.completed ? '#fff' : 'transparent', borderRadius: '50%', cursor: 'pointer', transition: 'all 0.2s', marginLeft: '1rem', flexShrink: 0 }}
                    >
                      <Check size={20} />
                    </button>
                  </div>
                ))}

                <button 
                  onClick={finishRetroactiveWorkout}
                  disabled={saving || !dayExercises.every(ex => ex.completed)}
                  className="btn btn-primary mt-4 w-full"
                  style={{ padding: '1rem', fontSize: '1.1rem', opacity: (!dayExercises.every(ex => ex.completed)) ? 0.5 : 1 }}
                >
                  {saving ? 'Saving...' : 'Finish Workout'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
