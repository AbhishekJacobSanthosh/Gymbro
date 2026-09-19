import React, { useState, useEffect } from 'react';
import { Check, Dumbbell, Coffee, Loader2, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../App';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ProgressRing({ completed, total, size = 100, strokeWidth = 6 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const offset = circumference - (progress * circumference);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="progress-ring" width={size} height={size}>
        <defs>
          <linearGradient id="accent-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff7854" />
            <stop offset="100%" stopColor="#ffb347" />
          </linearGradient>
        </defs>
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
  const [today] = useState(DAYS[new Date().getDay()]);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [prMessages, setPrMessages] = useState([]);

  // Template State
  const [routineName, setRoutineName] = useState('Workout');
  const [isRestDay, setIsRestDay] = useState(false);
  const [workoutId, setWorkoutId] = useState(null);

  // Add Exercise State
  const [newExercise, setNewExercise] = useState({ name: '', sets: '', reps: '', weight: '' });
  const [addingExercise, setAddingExercise] = useState(false);

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
      setWorkoutId(null);
    } else {
      setRoutineName(templates[0].routine_name || 'Workout');
      setIsRestDay(templates[0].is_rest_day || false);
      setWorkoutId(templates[0].id);

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

  const handleStartSpontaneous = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('workouts')
      .insert([{
        user_id: session.user.id,
        day_of_week: today,
        routine_name: 'Spontaneous Workout',
        completed: false,
        is_rest_day: false
      }])
      .select()
      .single();
      
    if (!error && data) {
      setWorkoutId(data.id);
      setRoutineName(data.routine_name);
      setIsRestDay(false);
      setExercises([]);
    } else {
      toast?.error("Error starting workout.");
    }
    setLoading(false);
  };

  const handleAddExercise = async (e) => {
    e.preventDefault();
    if (!newExercise.name || !workoutId) return;

    setAddingExercise(true);

    const exerciseData = {
      workout_id: workoutId,
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
      toast?.error("Error adding exercise.");
    }

    setAddingExercise(false);
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
    if (!allDone) return;
    setFinishing(true);

    const { error: wError, data: newWorkout } = await supabase
      .from('workouts')
      .insert([{
        user_id: session.user.id,
        day_of_week: today,
        routine_name: routineName,
        completed: true,
        completed_at: new Date()
      }])
      .select()
      .single();

    if (wError || !newWorkout) {
      toast?.error("Error finishing workout. Please try again.");
      setFinishing(false);
      return;
    }

    if (exercises.length > 0) {
      const completedExercises = exercises.map(ex => ({
        workout_id: newWorkout.id,
        name: ex.name,
        sets: parseInt(ex.sets) || 0,
        reps: ex.reps || '0',
        weight: parseFloat(ex.weight) || 0,
        completed: true
      }));
      await supabase.from('exercises').insert(completedExercises);
    }

    // --- GAMIFICATION: XP & LEVELING ---
    let totalVolume = 0;
    exercises.forEach(ex => {
      // Reps might be a string like "10, 10, 8", we can just try to parse the first number or average. 
      // For simplicity, let's assume it's a single number or we take the first number.
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
    
    const xpGained = 50 + Math.floor(totalVolume / 100);

    const { data: profile } = await supabase
      .from('profiles')
      .select('xp, level')
      .eq('id', session.user.id)
      .single();
      
    const currentXp = profile?.xp || 0;
    const newXp = currentXp + xpGained;
    const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1; 

    await supabase.from('profiles').update({ xp: newXp, level: newLevel }).eq('id', session.user.id);

    // --- GAMIFICATION: PR CHECK ---
    let prsHit = [];
    for (const ex of exercises) {
      if (!ex.name || !ex.weight || ex.weight <= 0) continue;
      
      const { data: pastEx } = await supabase
        .from('exercises')
        .select('weight, workouts!inner(user_id)')
        .eq('name', ex.name)
        .eq('workouts.user_id', session.user.id)
        .lt('created_at', ex.created_at || new Date().toISOString()) 
        .order('weight', { ascending: false })
        .limit(1);

      const pastMax = pastEx && pastEx.length > 0 ? parseFloat(pastEx[0].weight) : 0;
      
      if (parseFloat(ex.weight) > pastMax && pastMax > 0) {
        prsHit.push({ name: ex.name, weight: ex.weight });
      }
    }

    // Add to Activity Feed
    let feedAction = `crushed their ${routineName} workout! (+${xpGained} XP)`;
    if (prsHit.length > 0) {
      const prText = prsHit.map(pr => `${pr.name} (${pr.weight}kg)`).join(', ');
      feedAction = `hit a PR on ${prText}! (+${xpGained} XP)`;
      setPrMessages(prsHit);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
    }

    await supabase.from('activity_feed').insert([{
      user_id: session.user.id,
      action: feedAction
    }]);

    // Uncheck all exercises on the template so it's ready for next week
    if (routineName === 'Spontaneous Workout' && workoutId) {
      await supabase.from('workouts').delete().eq('id', workoutId);
      setWorkoutId(null);
      setExercises([]);
      setRoutineName('No Template');
    } else {
      for (const ex of exercises) {
        if (ex.completed) {
          await supabase.from('exercises').update({ completed: false }).eq('id', ex.id);
        }
      }
      setExercises(exercises.map(ex => ({ ...ex, completed: false })));
    }
    
    setFinishing(false);

    toast?.success(`🎉 ${routineName} workout logged! Great work!`);
  };

  const completedCount = exercises.filter(ex => ex.completed).length;
  const allDone = exercises.length > 0 && completedCount === exercises.length;

  return (
    <div className="flex-col gap-5 stagger-children" style={{ display: 'flex', position: 'relative' }}>
      
      {showConfetti && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <div className="card" style={{ textAlign: 'center', animation: 'scaleIn 0.3s ease-out' }}>
            <Trophy size={64} style={{ color: '#ffd700', margin: '0 auto var(--space-4)' }} />
            <h2 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>NEW PR!</h2>
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
        ) : (
          <>
            {/* Routine Header + Progress Ring */}
            <div className="flex items-center justify-between mb-6" style={{ paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--divider)' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{routineName}</h2>
                {!isRestDay && exercises.length > 0 && (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem', marginTop: 'var(--space-1)' }}>
                    {completedCount} of {exercises.length} exercises completed
                  </p>
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
            ) : !workoutId ? (
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
                               onBlur={e => handleBlurSave(ex.id, 'reps', e.target.value)}
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
                               onBlur={e => handleBlurSave(ex.id, 'weight', e.target.value)}
                               className="exercise-inline-input"
                               style={{ width: '50px' }}
                             />
                             <span>kg</span>
                           </div>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
                 )}

                {/* Add Exercise Form */}
                <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 'var(--space-6)', marginTop: 'var(--space-6)' }}>
                  <p className="text-label mb-3">Quick Add</p>
                  <form onSubmit={handleAddExercise} className="flex gap-2 flex-wrap items-end">
                    <div style={{ flex: '1 1 150px' }}>
                      <input
                        type="text"
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
                        min="1"
                        placeholder="Sets"
                        value={newExercise.sets}
                        onChange={e => setNewExercise({ ...newExercise, sets: e.target.value })}
                        required
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
                        required
                        className="exercise-inline-input"
                        style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-elevated)' }}
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
                        className="exercise-inline-input"
                        style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-elevated)' }}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={addingExercise} style={{ padding: '0.5rem', height: '36px' }}>
                      {addingExercise ? <Loader2 size={18} className="animate-spin" /> : <span style={{ fontWeight: 'bold' }}>+</span>}
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
    </div>
  );
}
