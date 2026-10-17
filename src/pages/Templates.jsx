import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Dumbbell, Coffee, Edit3, Save, Loader2, GripVertical } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../App';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let hasLoadedOnce = false;

export default function Templates({ session }) {
  const [activeDay, setActiveDay] = useState(DAYS[new Date().getDay()]);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(!hasLoadedOnce);

  const toast = useToast();

  // Template State
  const [templateId, setTemplateId] = useState(null);
  const currentTemplateRef = useRef(null);
  useEffect(() => { currentTemplateRef.current = templateId; }, [templateId]);
  const [routineName, setRoutineName] = useState('Workout');
  const [isRestDay, setIsRestDay] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);

  // Drag and Drop State
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [activeDragId, setActiveDragId] = useState(null);

  const [newExercise, setNewExercise] = useState({ name: '', sets: '', reps: '', weight: '', minutes: '' });
  const [addingExercise, setAddingExercise] = useState(false);

  // Weekly Overview State
  const [weeklyOverview, setWeeklyOverview] = useState({});
  const [pastExercises, setPastExercises] = useState([]);

  useEffect(() => {
    fetchWeeklyOverview();
    fetchPastExercises();
  }, [session]);

  useEffect(() => {
    fetchTemplateForDay(activeDay);
  }, [activeDay, session]);

  const fetchWeeklyOverview = async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('workouts')
      .select('day_of_week, routine_name, is_rest_day, exercises(count)')
      .eq('user_id', session.user.id)
      .eq('completed', false)
      .neq('routine_name', 'Spontaneous Workout')
      .order('created_at', { ascending: false });

    if (data) {
      const overview = {};
      data.forEach(t => {
        if (!overview[t.day_of_week]) {
          overview[t.day_of_week] = {
            name: t.routine_name || 'Workout',
            rest: !!t.is_rest_day,
            count: t.exercises?.[0]?.count ?? 0,
          };
        }
      });
      setWeeklyOverview(overview);
    }
  };

  const fetchPastExercises = async () => {
    if (!session?.user) return;
    // Newest first so the 1000-row API cap drops the oldest names, not recent ones
    const { data } = await supabase
      .from('exercises')
      .select('name, workouts!inner(user_id)')
      .eq('workouts.user_id', session.user.id)
      .neq('name', '')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (data) {
      setPastExercises([...new Set(data.map(d => d.name))]);
    }
  };

  const fetchTemplateForDay = async (day) => {
    if (!hasLoadedOnce) setLoading(true);
    setIsEditingName(false);

    // Find the template (completed = false) for this day
    let { data: templates } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('day_of_week', day)
      .eq('completed', false)
      .neq('routine_name', 'Spontaneous Workout')
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
    hasLoadedOnce = true;
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
      minutes: parseInt(newExercise.minutes) || 0,
      completed: false
    };

    const { data: inserted, error } = await supabase
      .from('exercises')
      .insert([exerciseData])
      .select()
      .single();

    if (!error && inserted) {
      setExercises([...exercises, inserted]);
      setNewExercise({ name: '', sets: '', reps: '', weight: '', minutes: '' });
      fetchWeeklyOverview();
    }

    setAddingExercise(false);
  };

  const handleLocalChange = (id, field, value) => {
    setExercises(exercises.map(ex => ex.id === id ? { ...ex, [field]: value } : ex));
  };

  const handleBlurSave = async (id, field, value) => {
    // If empty or invalid, fallback to 0 to prevent errors
    let finalValue = value;
    if (field === 'sets' || field === 'minutes') finalValue = parseInt(value) || 0;
    if (field === 'weight') finalValue = parseFloat(value) || 0;

    await supabase.from('exercises').update({ [field]: finalValue }).eq('id', id);
  };

  // Removed from the list right away, deleted for real only if Undo isn't tapped within 5s
  const removeExercise = (id) => {
    const index = exercises.findIndex(ex => ex.id === id);
    if (index === -1) return;
    const removed = exercises[index];
    const fromTemplate = templateId;
    // Put it back only if the same day is still on screen; other days reload from the database
    const restore = () => setExercises(prev =>
      currentTemplateRef.current !== fromTemplate || prev.some(ex => ex.id === id)
        ? prev
        : [...prev.slice(0, index), removed, ...prev.slice(index)]
    );

    setExercises(prev => prev.filter(ex => ex.id !== id));

    const timer = setTimeout(async () => {
      const { error } = await supabase.from('exercises').delete().eq('id', id);
      if (error) {
        restore();
        toast?.error(`Couldn't remove ${removed.name}. Check your connection.`);
        return;
      }
      fetchWeeklyOverview();
    }, 5000);

    toast?.action(`Removed ${removed.name}`, {
      label: 'Undo',
      onAction: () => {
        clearTimeout(timer);
        restore();
      },
    });
  };

  const handleDragStart = (e, index) => {
    setDraggedIdx(index);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/gymbro-index', index);
    }
  };

  const handleDragEnter = (e, index) => {
    e.preventDefault();
    setDragOverIdx(index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragEnd = async () => {
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx) {
      const newExercises = [...exercises];
      const draggedItem = newExercises[draggedIdx];
      newExercises.splice(draggedIdx, 1);
      newExercises.splice(dragOverIdx, 0, draggedItem);
      
      setExercises(newExercises);

      // Save order to DB by modifying created_at
      const now = Date.now();
      const updates = newExercises.map((ex, idx) => ({
        id: ex.id,
        created_at: new Date(now + idx * 1000).toISOString()
      }));

      await Promise.all(
        updates.map(update => 
          supabase.from('exercises').update({ created_at: update.created_at }).eq('id', update.id)
        )
      );
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleTouchStart = (e, index) => {
    setActiveDragId(exercises[index].id);
    setDraggedIdx(index);
    document.body.style.overflow = 'hidden'; // prevent scrolling while dragging
  };

  const handleTouchMove = (e) => {
    if (draggedIdx === null) return;
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element) {
      const row = element.closest('.plan-row');
      if (row && row.dataset.index !== undefined) {
        setDragOverIdx(parseInt(row.dataset.index));
      }
    }
  };

  const handleTouchEnd = () => {
    document.body.style.overflow = ''; 
    setActiveDragId(null);
    handleDragEnd();
  };

  const todayIndex = new Date().getDay();
  const dayStatus = (day) => {
    const plan = weeklyOverview[day];
    if (!plan) return { kind: 'none', label: 'Not planned' };
    if (plan.rest) return { kind: 'rest', label: 'Rest' };
    if (plan.count > 0) return { kind: 'planned', label: `${plan.name}, ${plan.count} exercise${plan.count === 1 ? '' : 's'}` };
    return { kind: 'none', label: 'Not planned' };
  };

  return (
    <div className="planner">
      <header className="page-header">
        <h1 className="page-title">Planner</h1>
        <p className="page-subtitle">Your weekly plan. Changes show up in your next workout.</p>
      </header>

      {/* One button per day; the dot shows which days have a plan */}
      <div className="day-picker" role="tablist" aria-label="Day of the week">
        {DAYS.map((day, i) => {
          const status = dayStatus(day);
          return (
            <button
              key={day}
              role="tab"
              aria-selected={activeDay === day}
              aria-label={`${day}${i === todayIndex ? ' (today)' : ''}: ${status.label}`}
              onClick={() => setActiveDay(day)}
              className={`day-pick ${activeDay === day ? 'is-active' : ''} ${i === todayIndex ? 'is-today' : ''}`}
            >
              <span>{SHORT_DAYS[i]}</span>
              <span className={`day-pick-dot is-${status.kind}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <section className="plan-day" aria-label={`${activeDay} plan`}>
        <div className="plan-day-head">
          {isEditingName ? (
            <form
              onSubmit={(e) => { e.preventDefault(); setIsEditingName(false); handleUpdateTemplate({ routine_name: routineName }); }}
              className="plan-name-form"
            >
              <input
                type="text"
                value={routineName}
                onChange={(e) => setRoutineName(e.target.value)}
                aria-label="Workout name"
                autoFocus
              />
              <button type="submit" className="btn btn-primary" aria-label="Save name">
                <Save size={18} />
              </button>
            </form>
          ) : (
            <button className="plan-day-name" onClick={() => setIsEditingName(true)} aria-label={`Rename ${routineName}`}>
              <span>{isRestDay ? 'Rest day' : routineName}</span>
              {!isRestDay && <Edit3 size={16} />}
            </button>
          )}
          <button
            onClick={() => handleUpdateTemplate({ is_rest_day: !isRestDay })}
            className="text-button text-button-quiet"
          >
            {isRestDay ? <><Dumbbell size={16} /> Make it a training day</> : <><Coffee size={16} /> Make it a rest day</>}
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        ) : isRestDay ? (
          <p className="panel plan-empty">Nothing to plan. Rest days count toward your streak.</p>
        ) : (
          <>
            {exercises.length === 0 ? (
              <p className="panel plan-empty">No exercises yet. Add your first one below.</p>
            ) : (
              <ul className="plan-list">
                {exercises.map((ex, idx) => (
                  <li
                    key={ex.id}
                    data-index={idx}
                    className={`plan-row ${dragOverIdx === idx ? 'drag-over' : ''} ${draggedIdx === idx ? 'is-dragging' : ''}`}
                    draggable={activeDragId === ex.id}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragEnter={(e) => handleDragEnter(e, idx)}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    style={{
                      borderTopColor: dragOverIdx === idx && draggedIdx > idx ? 'var(--accent)' : undefined,
                      borderBottomColor: dragOverIdx === idx && draggedIdx < idx ? 'var(--accent)' : undefined,
                    }}
                  >
                    <div className="plan-row-top">
                      <span
                        className="plan-grip"
                        aria-label="Drag to reorder"
                        onMouseDown={() => setActiveDragId(ex.id)}
                        onMouseUp={() => setActiveDragId(null)}
                        onMouseLeave={() => setActiveDragId(null)}
                        onTouchStart={(e) => handleTouchStart(e, idx)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                      >
                        <GripVertical size={18} />
                      </span>
                      <input
                        type="text"
                        list="exercise-suggestions"
                        className="plan-name"
                        value={ex.name}
                        onChange={e => handleLocalChange(ex.id, 'name', e.target.value)}
                        onBlur={e => handleBlurSave(ex.id, 'name', e.target.value)}
                        aria-label="Exercise name"
                      />
                      <button
                        onClick={() => removeExercise(ex.id)}
                        aria-label={`Remove ${ex.name}`}
                        className="plan-remove"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <div className="plan-fields">
                      <label className="plan-field">
                        <span>Sets</span>
                        <input type="number" inputMode="numeric" className="num" value={ex.sets}
                          onChange={e => handleLocalChange(ex.id, 'sets', e.target.value)}
                          onBlur={e => handleBlurSave(ex.id, 'sets', e.target.value)} />
                      </label>
                      <label className="plan-field">
                        <span>Reps</span>
                        <input type="text" className="num" value={ex.reps}
                          onChange={e => handleLocalChange(ex.id, 'reps', e.target.value)}
                          onBlur={e => handleBlurSave(ex.id, 'reps', e.target.value)} />
                      </label>
                      <label className="plan-field">
                        <span>kg</span>
                        <input type="number" inputMode="decimal" step="0.5" className="num" value={ex.weight}
                          onChange={e => handleLocalChange(ex.id, 'weight', e.target.value)}
                          onBlur={e => handleBlurSave(ex.id, 'weight', e.target.value)} />
                      </label>
                      <label className="plan-field">
                        <span>Min</span>
                        <input type="number" inputMode="numeric" className="num" value={ex.minutes || ''}
                          onChange={e => handleLocalChange(ex.id, 'minutes', e.target.value)}
                          onBlur={e => handleBlurSave(ex.id, 'minutes', e.target.value)} />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Add Exercise Form */}
            <form onSubmit={handleAddExercise} className="quick-add">
              <datalist id="exercise-suggestions">
                {pastExercises.map(name => <option key={name} value={name} />)}
              </datalist>
              <label htmlFor="plan-add-name" className="form-label">Add an exercise</label>
              <input
                id="plan-add-name"
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
                <button type="submit" className="btn btn-primary" disabled={addingExercise} aria-label="Add exercise">
                  {addingExercise ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      {/* The whole week at a glance; tap a day to edit it */}
      <section aria-labelledby="week-overview-title">
        <h2 id="week-overview-title" className="section-title">Your week</h2>
        <ul className="grouped-list">
          {DAYS.map((day, i) => {
            const status = dayStatus(day);
            return (
              <li key={day} className="week-overview-item">
                <button className={`week-overview-row ${activeDay === day ? 'is-active' : ''}`} onClick={() => setActiveDay(day)}>
                  <span className="list-row-main">{day}{i === todayIndex ? ' (today)' : ''}</span>
                  <span className={`week-overview-plan is-${status.kind}`}>{status.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
