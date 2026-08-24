import React, { useState, useEffect } from 'react';
import { Check, Dumbbell, Coffee } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Workouts({ session }) {
  const [today] = useState(DAYS[new Date().getDay()]);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Template State
  const [routineName, setRoutineName] = useState('Workout');
  const [isRestDay, setIsRestDay] = useState(false);

  useEffect(() => {
    fetchTodayWorkout();
  }, [session]);

  const fetchTodayWorkout = async () => {
    setLoading(true);
    
    // Find the template (completed = false) for TODAY
    let { data: templates } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('day_of_week', today)
      .eq('completed', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!templates || templates.length === 0) {
      setRoutineName('No Template');
      setIsRestDay(false);
      setExercises([]);
    } else {
      setRoutineName(templates[0].routine_name || 'Workout');
      setIsRestDay(templates[0].is_rest_day || false);
      
      // Fetch exercises for today's template
      const { data: exData } = await supabase
        .from('exercises')
        .select('*')
        .eq('workout_id', templates[0].id)
        .order('created_at', { ascending: true });
        
      setExercises(exData || []);
    }
    
    setLoading(false);
  };

  const toggleComplete = async (id, currentStatus) => {
    const { error } = await supabase
      .from('exercises')
      .update({ completed: !currentStatus })
      .eq('id', id);

    if (!error) {
      setExercises(exercises.map(ex => 
        ex.id === id ? { ...ex, completed: !currentStatus } : ex
      ));
    }
  };

  const handleLocalChange = (id, field, value) => {
    setExercises(exercises.map(ex => ex.id === id ? { ...ex, [field]: value } : ex));
  };

  const handleBlurSave = async (id, field, value) => {
    let finalValue = value;
    if (field === 'weight') finalValue = parseFloat(value) || 0;

    await supabase.from('exercises').update({ [field]: finalValue }).eq('id', id);
  };

  const finishWorkout = async () => {
    const { error: wError } = await supabase
      .from('workouts')
      .insert([{
        user_id: session.user.id,
        day_of_week: today,
        routine_name: routineName,
        completed: true,
        completed_at: new Date()
      }]);

    if (wError) {
      alert("Error finishing workout.");
      return;
    }

    // Add to Activity Feed
    await supabase.from('activity_feed').insert([{
      user_id: session.user.id,
      action: `crushed their ${routineName} workout!`
    }]);

    // Uncheck all exercises on the template so it's ready for next week
    for (const ex of exercises) {
      if (ex.completed) {
        await supabase.from('exercises').update({ completed: false }).eq('id', ex.id);
      }
    }
    
    setExercises(exercises.map(ex => ({ ...ex, completed: false })));

    alert(`Boom! Your ${routineName} workout has been logged on the calendar!`);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="page-header mb-2">
        <h1 className="page-title">Today's Workout</h1>
        <p className="text-muted">It's {today}. Time to get after it.</p>
      </header>

      <div className="card">
        {loading ? (
          <div className="flex justify-center p-8 text-muted">
            <Dumbbell className="animate-spin" />
          </div>
        ) : (
          <>
            <div className="mb-6 pb-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{routineName}</h2>
            </div>

            {isRestDay ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Coffee size={48} className="text-muted mb-4" />
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Rest Day</h3>
                <p className="text-muted" style={{ maxWidth: '300px' }}>Recovery is where the growth happens. Enjoy your day off!</p>
              </div>
            ) : exercises.length === 0 ? (
              <div className="text-center p-8 text-muted">
                <p>No exercises planned for today.</p>
                <p className="mt-2" style={{ fontSize: '0.9rem' }}>Go to the Planner to set up your templates.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 mb-6">
                  {exercises.map(ex => (
                    <div 
                      key={ex.id} 
                      className="flex items-center justify-between"
                      style={{ 
                        padding: '1.25rem 0',
                        borderBottom: '1px solid var(--border-color)',
                        opacity: ex.completed ? 0.5 : 1,
                        transition: 'var(--transition)'
                      }}
                    >
                      <div className="flex flex-col gap-1" style={{ flex: 1 }}>
                        <h3 style={{ 
                          fontSize: '1.15rem', 
                          fontWeight: 600, 
                          color: ex.completed ? 'var(--text-muted)' : 'var(--text-primary)', 
                          textDecoration: ex.completed ? 'line-through' : 'none' 
                        }}>
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
                              onBlur={e => handleBlurSave(ex.id, 'reps', e.target.value)}
                              style={{ 
                                width: '45px', 
                                padding: '0.2rem 0', 
                                backgroundColor: 'transparent', 
                                border: 'none',
                                borderBottom: '1px solid var(--text-muted)',
                                borderRadius: 0,
                                textAlign: 'center',
                                color: 'var(--text-primary)',
                                fontWeight: 600
                              }}
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
                              onBlur={e => handleBlurSave(ex.id, 'weight', e.target.value)}
                              style={{ 
                                width: '50px', 
                                padding: '0.2rem 0', 
                                backgroundColor: 'transparent', 
                                border: 'none',
                                borderBottom: '1px solid var(--text-muted)',
                                borderRadius: 0,
                                textAlign: 'center',
                                color: 'var(--text-primary)',
                                fontWeight: 600
                              }}
                            />
                            <span>kg</span>
                          </div>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => toggleComplete(ex.id, ex.completed)}
                        style={{ 
                          width: '36px', height: '36px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          backgroundColor: ex.completed ? 'var(--success-color)' : 'transparent',
                          border: `2px solid ${ex.completed ? 'var(--success-color)' : 'var(--border-color)'}`,
                          color: ex.completed ? '#fff' : 'transparent',
                          borderRadius: '50%',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          marginLeft: '1rem',
                          flexShrink: 0
                        }}
                      >
                        <Check size={20} />
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                  <button onClick={finishWorkout} className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.1rem', width: '100%', maxWidth: '300px' }}>
                    <Check size={24} />
                    Finish Workout
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
