import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Dumbbell, Coffee, Edit3, Save, Check, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  const [addingExercise, setAddingExercise] = useState(false);

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

    setAddingExercise(true);

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
    }

    setAddingExercise(false);
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

  const todayIndex = new Date().getDay();

  return (
    <div className="flex-col gap-5 stagger-children" style={{ display: 'flex' }}>
      <header className="page-header">
        <h1 className="page-title">Planner</h1>
        <p className="page-subtitle">Build your weekly templates and edit exercises.</p>
      </header>

      <div className="planner-layout">
        
        {/* Right Sidebar: Weekly Overview */}
        <div className="planner-sidebar">
          <div className="card" style={{ padding: 'var(--space-5)' }}>
            <p className="text-label mb-4">Weekly Overview</p>
            <div className="flex-col gap-2" style={{ display: 'flex' }}>
              {DAYS.map((day, i) => (
                <div
                  key={day}
                  className="weekly-day-pill"
                  style={{
                    backgroundColor: i === todayIndex ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                    border: i === todayIndex ? '1px solid var(--accent-soft)' : '1px solid transparent',
                    width: '100%',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)'
                  }}
                >
                  <span className="weekly-day-label" style={{ fontSize: '0.8125rem' }}>{day}</span>
                  <span className={`weekly-day-value ${weeklyOverview[day] === 'Rest' ? 'is-rest' : weeklyOverview[day] ? 'has-workout' : ''}`}>
                    {weeklyOverview[day] || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Left Column: Main Planner */}
        <div style={{ flex: '2 1 500px', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* Day Selector */}
          <div className="day-selector">
            {DAYS.map((day, i) => (
              <button
                key={day}
                onClick={() => setActiveDay(day)}
                className={`btn ${activeDay === day ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flexShrink: 0 }}
              >
                <span className="day-full">{SHORT_DAYS[i]}</span>
              </button>
            ))}
          </div>

          {/* Template Card */}
          <div className="card">
            {loading ? (
              <div className="empty-state">
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
              </div>
            ) : (
              <>
                {/* Routine Header */}
                <div className="flex items-center justify-between mb-6" style={{ paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--divider)' }}>
                  <div className="flex items-center gap-3">
                    {isEditingName ? (
                      <form onSubmit={(e) => { e.preventDefault(); setIsEditingName(false); handleUpdateTemplate({ routine_name: routineName }); }} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={routineName}
                          onChange={(e) => setRoutineName(e.target.value)}
                          style={{ padding: '0.375rem 0.75rem', fontSize: '1.125rem', fontWeight: 700, width: '200px' }}
                          autoFocus
                        />
                        <button type="submit" className="btn btn-primary btn-sm">
                          <Save size={16} />
                        </button>
                      </form>
                    ) : (
                      <>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{routineName}</h2>
                        <button onClick={() => setIsEditingName(true)} className="btn-icon btn-ghost" style={{ width: '32px', height: '32px' }}>
                          <Edit3 size={15} style={{ color: 'var(--text-tertiary)' }} />
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    onClick={() => handleUpdateTemplate({ is_rest_day: !isRestDay })}
                    className={`btn btn-sm ${isRestDay ? 'btn-secondary' : 'btn-ghost'}`}
                  >
                    {isRestDay ? 'Undo Rest Day' : 'Mark Rest Day'}
                  </button>
                </div>

                {/* Main Content Area */}
                {isRestDay ? (
                  <div className="rest-day-card">
                    <Coffee size={40} className="rest-day-icon" style={{ margin: '0 auto' }} />
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 'var(--space-2) 0', color: 'var(--text-secondary)' }}>Rest Day</h3>
                    <p style={{ color: 'var(--text-tertiary)', maxWidth: '280px', margin: '0 auto', fontSize: '0.875rem' }}>
                      Take it easy today. Recovery is just as important as the workout!
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Exercise List */}
                    <div className="flex-col mb-6" style={{ display: 'flex' }}>
                      {exercises.length === 0 ? (
                        <div className="empty-state">
                          <Dumbbell size={32} className="empty-state-icon" />
                          <p className="empty-state-title">No exercises yet</p>
                          <p className="empty-state-text">Add some exercises below to build your template!</p>
                        </div>
                      ) : (
                        <>
                          {/* Desktop: Grid Header */}
                          <div className="exercise-grid-header" style={{ display: 'none' }}>
                            <span style={{ flex: 3 }}>Exercise</span>
                            <span style={{ flex: 1, textAlign: 'center' }}>Sets</span>
                            <span style={{ flex: 1, textAlign: 'center' }}>Reps</span>
                            <span style={{ flex: 1, textAlign: 'center' }}>Weight</span>
                            <span style={{ width: '36px' }}></span>
                          </div>

                          {/* Show grid header on desktop */}
                          <style>{`.exercise-grid-header { display: none !important; } @media (min-width: 641px) { .exercise-grid-header { display: flex !important; } }`}</style>

                          {exercises.map(ex => (
                            <div key={ex.id} className="exercise-grid-row">
                              <input
                                type="text"
                                value={ex.name}
                                onChange={e => handleLocalChange(ex.id, 'name', e.target.value)}
                                onBlur={e => handleBlurSave(ex.id, 'name', e.target.value)}
                                style={{ flex: 3, minWidth: 0, fontWeight: 500 }}
                              />
                              <input
                                type="number"
                                value={ex.sets}
                                onChange={e => handleLocalChange(ex.id, 'sets', e.target.value)}
                                onBlur={e => handleBlurSave(ex.id, 'sets', e.target.value)}
                                style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '0.5rem 0.25rem' }}
                                placeholder="Sets"
                              />
                              <input
                                type="text"
                                value={ex.reps}
                                onChange={e => handleLocalChange(ex.id, 'reps', e.target.value)}
                                onBlur={e => handleBlurSave(ex.id, 'reps', e.target.value)}
                                style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '0.5rem 0.25rem' }}
                                placeholder="Reps"
                              />
                              <input
                                type="number"
                                step="0.5"
                                value={ex.weight}
                                onChange={e => handleLocalChange(ex.id, 'weight', e.target.value)}
                                onBlur={e => handleBlurSave(ex.id, 'weight', e.target.value)}
                                style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '0.5rem 0.25rem' }}
                                placeholder="kg"
                              />
                              <button
                                onClick={() => removeExercise(ex.id)}
                                className="btn-icon btn-danger"
                                style={{ width: '36px', height: '36px', flexShrink: 0 }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                    </div>

                    {/* Add Exercise Form */}
                    <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 'var(--space-6)' }}>
                      <p className="text-label mb-3">Quick Add</p>
                      <form onSubmit={handleAddExercise} className="flex gap-2 flex-wrap items-end">
                        <div style={{ flex: '1 1 150px' }}>
                          <input
                            type="text"
                            placeholder="Exercise Name"
                            value={newExercise.name}
                            onChange={e => setNewExercise({ ...newExercise, name: e.target.value })}
                            required
                          />
                        </div>
                        <div style={{ flex: '0 1 72px' }}>
                          <input
                            type="number"
                            min="1"
                            placeholder="Sets"
                            value={newExercise.sets}
                            onChange={e => setNewExercise({ ...newExercise, sets: e.target.value })}
                            required
                          />
                        </div>
                        <div style={{ flex: '0 1 72px' }}>
                          <input
                            type="text"
                            placeholder="Reps"
                            value={newExercise.reps}
                            onChange={e => setNewExercise({ ...newExercise, reps: e.target.value })}
                            required
                          />
                        </div>
                        <div style={{ flex: '0 1 72px' }}>
                          <input
                            type="number"
                            step="0.5"
                            placeholder="kg"
                            value={newExercise.weight}
                            onChange={e => setNewExercise({ ...newExercise, weight: e.target.value })}
                            required
                          />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={addingExercise}>
                          {addingExercise ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
