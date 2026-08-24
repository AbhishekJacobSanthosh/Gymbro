import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Dumbbell, Coffee, Edit3, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Templates({ session }) {
  const [activeDay, setActiveDay] = useState(DAYS[new Date().getDay()]);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Template State
  const [templateId, setTemplateId] = useState(null);
  const [routineName, setRoutineName] = useState('Workout');
  const [isRestDay, setIsRestDay] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  
  const [newExercise, setNewExercise] = useState({ name: '', sets: '', reps: '', weight: '' });
  
  // Weekly Overview State
  const [weeklyOverview, setWeeklyOverview] = useState({});

  useEffect(() => {
    fetchWeeklyOverview();
  }, [session]);

  useEffect(() => {
    fetchTemplateForDay(activeDay);
  }, [activeDay, session]);

  const fetchWeeklyOverview = async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('workouts')
      .select('day_of_week, routine_name, is_rest_day')
      .eq('user_id', session.user.id)
      .eq('completed', false)
      .order('created_at', { ascending: true });
      
    if (data) {
      const overview = {};
      data.forEach(t => {
        overview[t.day_of_week] = t.is_rest_day ? 'Rest' : (t.routine_name || 'Workout');
      });
      setWeeklyOverview(overview);
    }
  };

  const fetchTemplateForDay = async (day) => {
    setLoading(true);
    setIsEditingName(false);
    
    // Find the template (completed = false) for this day
    let { data: templates } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('day_of_week', day)
      .eq('completed', false)
      .order('created_at', { ascending: false })
      .limit(1);

    let currentTId = null;

    if (!templates || templates.length === 0) {
      // Create a blank template for this day
      const { data: newTemplate, error } = await supabase
        .from('workouts')
        .insert([{ 
          user_id: session.user.id, 
          day_of_week: day,
          completed: false,
          routine_name: 'Workout',
          is_rest_day: false
        }])
        .select()
        .single();
        
      if (!error && newTemplate) {
        currentTId = newTemplate.id;
        setRoutineName('Workout');
        setIsRestDay(false);
        setExercises([]);
      }
    } else {
      currentTId = templates[0].id;
      setRoutineName(templates[0].routine_name || 'Workout');
      setIsRestDay(templates[0].is_rest_day || false);
      
      // Fetch exercises for this template
      const { data: exData } = await supabase
        .from('exercises')
        .select('*')
        .eq('workout_id', currentTId)
        .order('created_at', { ascending: true });
        
      setExercises(exData || []);
    }
    
    setTemplateId(currentTId);
    setLoading(false);
  };

  const handleUpdateTemplate = async (updates) => {
    if (!templateId) return;
    const { error } = await supabase.from('workouts').update(updates).eq('id', templateId);
    
    if (error) {
      alert("Database Error: " + error.message);
      console.error(error);
      return;
    }
    
    if (updates.routine_name !== undefined) setRoutineName(updates.routine_name);
    if (updates.is_rest_day !== undefined) setIsRestDay(updates.is_rest_day);
    
    fetchWeeklyOverview(); 
  };

  const handleAddExercise = async (e) => {
    e.preventDefault();
    if (!newExercise.name || !templateId) return;
    
    const exerciseData = {
      workout_id: templateId,
      name: newExercise.name,
      sets: parseInt(newExercise.sets) || 0,
      reps: newExercise.reps || '0',
      weight: parseFloat(newExercise.weight) || 0,
      completed: false
    };

    const { data: inserted, error } = await supabase
      .from('exercises')
      .insert([exerciseData])
      .select()
      .single();

    if (!error && inserted) {
      setExercises([...exercises, inserted]);
      setNewExercise({ name: '', sets: '', reps: '', weight: '' });
    } else {
      alert("Error adding exercise: " + error.message);
    }
  };

  const handleLocalChange = (id, field, value) => {
    setExercises(exercises.map(ex => ex.id === id ? { ...ex, [field]: value } : ex));
  };

  const handleBlurSave = async (id, field, value) => {
    // If empty or invalid, fallback to 0 to prevent errors
    let finalValue = value;
    if (field === 'sets') finalValue = parseInt(value) || 0;
    if (field === 'weight') finalValue = parseFloat(value) || 0;

    await supabase.from('exercises').update({ [field]: finalValue }).eq('id', id);
  };

  const removeExercise = async (id) => {
    const { error } = await supabase
      .from('exercises')
      .delete()
      .eq('id', id);
      
    if (!error) {
      setExercises(exercises.filter(ex => ex.id !== id));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="page-header mb-2">
        <h1 className="page-title">Planner</h1>
        <p className="text-muted">Build your weekly templates and edit exercises.</p>
      </header>

      {/* Weekly Overview Banner */}
      <div className="card" style={{ padding: '1rem' }}>
        <h3 className="text-muted mb-3" style={{ fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase' }}>Weekly Overview</h3>
        <div className="flex gap-2" style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {DAYS.map(day => (
            <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{day.substring(0, 3)}</span>
              <span style={{ fontSize: '0.85rem', color: weeklyOverview[day] === 'Rest' ? 'var(--text-muted)' : 'var(--accent-primary)', fontWeight: weeklyOverview[day] === 'Rest' ? 'normal' : 600, marginTop: '4px' }}>
                {weeklyOverview[day] || '-'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Day Selector */}
      <div className="flex gap-2 mb-2" style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
        {DAYS.map(day => (
          <button
            key={day}
            onClick={() => setActiveDay(day)}
            className={`btn ${activeDay === day ? 'btn-primary' : 'btn-secondary'}`}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {day}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div className="flex justify-center p-8 text-muted">
            <Dumbbell className="animate-spin" />
          </div>
        ) : (
          <>
            {/* Routine Header */}
            <div className="flex items-center justify-between mb-6 pb-2">
              <div className="flex items-center gap-3">
                {isEditingName ? (
                  <form onSubmit={(e) => { e.preventDefault(); setIsEditingName(false); handleUpdateTemplate({ routine_name: routineName }); }} className="flex gap-2">
                    <input 
                      type="text" 
                      value={routineName} 
                      onChange={(e) => setRoutineName(e.target.value)} 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '1.25rem', fontWeight: 700 }}
                      autoFocus
                    />
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.4rem 0.8rem' }}><Save size={18}/></button>
                  </form>
                ) : (
                  <>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{routineName}</h2>
                    <button onClick={() => setIsEditingName(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <Edit3 size={18} />
                    </button>
                  </>
                )}
              </div>
              
              <button 
                onClick={() => handleUpdateTemplate({ is_rest_day: !isRestDay })}
                className="btn"
                style={{ 
                  backgroundColor: isRestDay ? 'var(--bg-elevated)' : 'transparent',
                  border: '1px solid var(--border-color)',
                  color: isRestDay ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                {isRestDay ? 'Undo Rest Day' : 'Mark as Rest Day'}
              </button>
            </div>

            {/* Main Content Area */}
            {isRestDay ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Coffee size={48} className="text-muted mb-4" />
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Rest Day</h3>
                <p className="text-muted" style={{ maxWidth: '300px' }}>Take it easy today. Recovery is just as important as the workout!</p>
              </div>
            ) : (
              <>
                {/* Editable Exercise List */}
                <div className="flex flex-col gap-4 mb-6">
                  {exercises.length === 0 ? (
                    <p className="text-muted text-center py-4">Your template is empty. Add some exercises below!</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {/* Headers */}
                      <div className="flex gap-2 text-muted px-2" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        <div style={{ flex: '3' }}>Exercise</div>
                        <div style={{ flex: '1', textAlign: 'center' }}>Sets</div>
                        <div style={{ flex: '1', textAlign: 'center' }}>Reps</div>
                        <div style={{ flex: '1', textAlign: 'center' }}>Weight</div>
                        <div style={{ width: '40px' }}></div>
                      </div>
                      
                      {exercises.map(ex => (
                        <div key={ex.id} className="flex gap-2 items-center">
                          <input 
                            type="text" 
                            value={ex.name} 
                            onChange={e => handleLocalChange(ex.id, 'name', e.target.value)}
                            onBlur={e => handleBlurSave(ex.id, 'name', e.target.value)}
                            style={{ flex: '3', minWidth: 0 }}
                          />
                          <input 
                            type="number" 
                            value={ex.sets} 
                            onChange={e => handleLocalChange(ex.id, 'sets', e.target.value)}
                            onBlur={e => handleBlurSave(ex.id, 'sets', e.target.value)}
                            style={{ flex: '1', minWidth: 0, textAlign: 'center', padding: '0.6rem 0.2rem' }}
                          />
                          <input 
                            type="text" 
                            value={ex.reps} 
                            onChange={e => handleLocalChange(ex.id, 'reps', e.target.value)}
                            onBlur={e => handleBlurSave(ex.id, 'reps', e.target.value)}
                            style={{ flex: '1', minWidth: 0, textAlign: 'center', padding: '0.6rem 0.2rem' }}
                          />
                          <input 
                            type="number" 
                            step="0.5"
                            value={ex.weight} 
                            onChange={e => handleLocalChange(ex.id, 'weight', e.target.value)}
                            onBlur={e => handleBlurSave(ex.id, 'weight', e.target.value)}
                            style={{ flex: '1', minWidth: 0, textAlign: 'center', padding: '0.6rem 0.2rem' }}
                          />
                          <button 
                            onClick={() => removeExercise(ex.id)}
                            className="btn"
                            style={{ width: '40px', padding: 0, background: 'none', color: 'var(--danger-color)' }}
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add Exercise Form */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                  <h3 className="mb-2" style={{ fontSize: '1.1rem' }}>Quick Add</h3>
                  <form onSubmit={handleAddExercise} className="flex gap-2 flex-wrap items-end">
                    <div style={{ flex: '1 1 150px' }}>
                      <input type="text" placeholder="Exercise Name" value={newExercise.name} onChange={e => setNewExercise({...newExercise, name: e.target.value})} required />
                    </div>
                    <div style={{ flex: '1 1 60px', maxWidth: '80px' }}>
                      <input type="number" min="1" placeholder="Sets" value={newExercise.sets} onChange={e => setNewExercise({...newExercise, sets: e.target.value})} required />
                    </div>
                    <div style={{ flex: '1 1 60px', maxWidth: '80px' }}>
                      <input type="text" placeholder="Reps" value={newExercise.reps} onChange={e => setNewExercise({...newExercise, reps: e.target.value})} required />
                    </div>
                    <div style={{ flex: '1 1 60px', maxWidth: '80px' }}>
                      <input type="number" step="0.5" placeholder="kg/lbs" value={newExercise.weight} onChange={e => setNewExercise({...newExercise, weight: e.target.value})} required />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem', height: '100%' }}>
                      <Plus size={20} />
                    </button>
                  </form>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
