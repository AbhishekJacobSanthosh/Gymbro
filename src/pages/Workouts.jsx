import React, { useState, useEffect } from 'react';
import { Check, Dumbbell, Coffee, Loader2, Trophy, Undo2, Plus, Play, Square, TimerReset, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../App';
import { calculateXpGained, calculateLevelFromXp, calculateStreak, getEarnedAchievements } from '../lib/utils';

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

let hasLoadedOnce = false;

export default function Workouts({ session }) {
  const toast = useToast();
  const [today] = useState(DAYS[new Date().getDay()]);
  const [exercises, setExercises] = useState([]);
  const [pastExercises, setPastExercises] = useState([]);
  const [loading, setLoading] = useState(!hasLoadedOnce);
  const [finishing, setFinishing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [prMessages, setPrMessages] = useState([]);

  // Template State
  const [routineName, setRoutineName] = useState('Workout');
  const [isRestDay, setIsRestDay] = useState(false);
  const [workoutId, setWorkoutId] = useState(null);

  // Add Exercise State
  const [newExercise, setNewExercise] = useState({ name: '', sets: '', reps: '', weight: '', minutes: '' });
  const [addingExercise, setAddingExercise] = useState(false);
  const [isTodayCompleted, setIsTodayCompleted] = useState(false);
  const [completedWorkoutId, setCompletedWorkoutId] = useState(null);

  // Timer State
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  useEffect(() => {
    let interval;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds(s => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    fetchTodayWorkout();
    fetchPastExercises();
  }, [session]);

  const fetchPastExercises = async () => {
    if (!session?.user) return;
    const { data } = await supabase.from('exercises').select('name').neq('name', '');
    if (data) {
      setPastExercises([...new Set(data.map(d => d.name))]);
    }
  };

  const fetchTodayWorkout = async () => {
    if (!hasLoadedOnce) setLoading(true);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Check if a workout was already completed today
    const { data: completedWorkouts } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('completed', true)
      .gte('completed_at', todayStart.toISOString())
      .lt('completed_at', todayEnd.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (completedWorkouts && completedWorkouts.length > 0) {
      setCompletedWorkoutId(completedWorkouts[0].id);
      setIsTodayCompleted(true);
      setLoading(false);
      return;
    }

    // Clean up abandoned Spontaneous Workouts from previous days so they don't override future templates
    const { data: abandoned } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('completed', false)
      .eq('routine_name', 'Spontaneous Workout')
      .lt('created_at', todayStart.toISOString());
    
    if (abandoned && abandoned.length > 0) {
      const abandonedIds = abandoned.map(a => a.id);
      await supabase.from('exercises').delete().in('workout_id', abandonedIds);
      await supabase.from('workouts').delete().in('id', abandonedIds);
    }

    // Find the template (completed = false) for TODAY
    let { data: templates } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('day_of_week', today)
      .eq('completed', false)
      .neq('routine_name', 'Spontaneous Workout')
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

      const formattedExData = (exData || []).map(ex => {
        const drafts = {};
        const setsCount = parseInt(ex.sets) || 0;
        for (let i = 0; i < setsCount; i++) {
          drafts[i] = ex.logged_sets?.[i] || { reps: ex.reps, weight: ex.weight };
        }
        return { ...ex, set_drafts: drafts };
      });

      setExercises(formattedExData);
    }

    hasLoadedOnce = true;
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

  const handleStartSecondWorkout = async () => {
    setIsTodayCompleted(false);
    await handleStartSpontaneous();
  };

  const handleUndo = async () => {
    if (!completedWorkoutId) return;
    setLoading(true);

    try {
      // 1. Fetch exercises to calculate XP to subtract
      const { data: pastExercises } = await supabase
        .from('exercises')
        .select('weight, reps, sets')
        .eq('workout_id', completedWorkoutId);

      let totalVolume = 0;
      if (pastExercises) {
        pastExercises.forEach(ex => {
          totalVolume += (ex.sets * (parseInt(ex.reps) || 0) * ex.weight);
        });
      }
      const xpToSubtract = calculateXpGained(totalVolume);

      // 2. Subtract XP
      const { data: profile } = await supabase
        .from('profiles')
        .select('xp, level')
        .eq('id', session.user.id)
        .single();

      if (profile) {
        const newXp = Math.max(0, profile.xp - xpToSubtract);
        const newLevel = calculateLevelFromXp(newXp);
        await supabase.from('profiles').update({ xp: newXp, level: newLevel }).eq('id', session.user.id);
      }

      // 3. Delete historical records
      await supabase.from('exercises').delete().eq('workout_id', completedWorkoutId);
      await supabase.from('workouts').delete().eq('id', completedWorkoutId);

      // 4. Reset state and reload template
      setIsTodayCompleted(false);
      setCompletedWorkoutId(null);
      toast?.success("Workout undone. You can now edit your exercises.");
      await fetchTodayWorkout();
    } catch (error) {
      console.error(error);
      toast?.error("Failed to undo workout.");
      setLoading(false);
    }
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
      minutes: parseInt(newExercise.minutes) || 0,
      completed: false
    };

    const { data: inserted, error } = await supabase
      .from('exercises')
      .insert([exerciseData])
      .select()
      .single();

    if (!error && inserted) {
      const drafts = {};
      const setsCount = parseInt(inserted.sets) || 0;
      for (let i = 0; i < setsCount; i++) {
        drafts[i] = { reps: inserted.reps, weight: inserted.weight };
      }
      setExercises([...exercises, { ...inserted, set_drafts: drafts }]);
      setNewExercise({ name: '', sets: '', reps: '', weight: '', minutes: '' });
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

  const toggleSet = (exId, setIndex) => {
    setExercises(exercises.map(ex => {
      if (ex.id === exId) {
        const loggedSets = ex.logged_sets || {};
        const isCompleted = !!loggedSets[setIndex];
        
        let newLoggedSets = { ...loggedSets };
        if (isCompleted) {
          delete newLoggedSets[setIndex];
        } else {
          newLoggedSets[setIndex] = { ...(ex.set_drafts?.[setIndex] || { reps: ex.reps, weight: ex.weight }) };
        }
        
        // Auto-complete the exercise if all sets are done
        const completedCount = Object.keys(newLoggedSets).length;
        let newCompletedStatus = ex.completed;
        if (!isCompleted && completedCount === (parseInt(ex.sets) || 0)) {
           newCompletedStatus = true;
           supabase.from('exercises').update({ completed: true, logged_sets: newLoggedSets }).eq('id', exId);
        } else {
           if (isCompleted && ex.completed) {
             newCompletedStatus = false;
           }
           supabase.from('exercises').update({ completed: newCompletedStatus, logged_sets: newLoggedSets }).eq('id', exId);
        }
        
        return { ...ex, logged_sets: newLoggedSets, completed: newCompletedStatus };
      }
      return ex;
    }));
  };

  const handleSetDraftChange = (exId, setIndex, field, value) => {
    setExercises(exercises.map(ex => {
      if (ex.id === exId) {
         const newDrafts = { ...(ex.set_drafts || {}) };
         newDrafts[setIndex] = { ...newDrafts[setIndex], [field]: value };
         return { ...ex, set_drafts: newDrafts };
      }
      return ex;
    }));
  };

  const handleLocalChange = (id, field, value) => {
    setExercises(exercises.map(ex => ex.id === id ? { ...ex, [field]: value } : ex));
  };

  const handleBlurSave = async (id, field, value) => {
    let finalValue = value;
    if (field === 'sets' || field === 'minutes') finalValue = parseInt(value) || 0;
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
        minutes: parseInt(ex.minutes) || 0,
        logged_sets: ex.logged_sets || null,
        completed: true
      }));
      await supabase.from('exercises').insert(completedExercises);
    }

    // --- GAMIFICATION: XP & LEVELING ---
    let totalVolume = 0;
    exercises.forEach(ex => {
      if (ex.logged_sets && Object.keys(ex.logged_sets).length > 0) {
        Object.values(ex.logged_sets).forEach(set => {
          let reps = 0;
          if (typeof set.reps === 'string') {
            const match = set.reps.match(/\d+/);
            if (match) reps = parseInt(match[0]);
          } else {
            reps = parseInt(set.reps) || 0;
          }
          const weight = parseFloat(set.weight) || 0;
          totalVolume += (reps * weight);
        });
      } else {
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
      }
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
    
    await Promise.all(exercises.map(async (ex) => {
      if (!ex.name || !ex.weight || ex.weight <= 0) return;
      
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
    }));

    // --- GAMIFICATION: ACHIEVEMENTS CHECK ---
    const { data: allWorkouts } = await supabase.from('workouts').select('completed, completed_at').eq('user_id', session.user.id).eq('completed', true);
    
    // We haven't fetched rest days or freezes here, but for simple achievements, we can just use total workouts.
    // To be precise on streak, we can just pass an empty set for freezes and rest days.
    const streak = calculateStreak(allWorkouts || [], new Set(), new Set());
    
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
    const cleanRoutineName = routineName.toLowerCase().includes('workout') ? routineName : `${routineName} workout`;
    let feedAction = `crushed their ${cleanRoutineName}! (+${xpGained} XP)`;
    if (prsHit.length > 0) {
      const prText = prsHit.map(pr => `${pr.name} (${pr.weight}kg)`).join(', ');
      feedAction = `hit a PR on ${prText}! (+${xpGained} XP)`;
      setPrMessages(prsHit);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
    } else if (earnedAchievements.length > 0) {
      feedAction = `earned the ${earnedAchievements[0].badge_name} badge! (+${xpGained} XP)`;
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
      await Promise.all(exercises.map(async (ex) => {
        if (ex.completed) {
          await supabase.from('exercises').update({ completed: false, reps_completed: null, weight_used: null }).eq('id', ex.id);
        }
      }));
      setExercises(exercises.map(ex => ({ ...ex, completed: false, reps_completed: null, weight_used: null })));
    }
    
    setIsTimerRunning(false);
    setTimerSeconds(0);
    setFinishing(false);

    toast?.success(`🎉 ${routineName} workout logged! Great work!`);
    
    // Refresh the page state to show the "Already Completed" screen
    fetchTodayWorkout();
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
              <button onClick={handleStartSecondWorkout} className="btn btn-primary">
                <Plus size={18} /> Start Another
              </button>
            </div>
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
                      onClick={() => setIsTimerRunning(!isTimerRunning)} 
                      className={`btn-icon ${isTimerRunning ? 'btn-secondary' : 'btn-primary'}`} 
                      style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                    >
                      {isTimerRunning ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: '2px' }} />}
                    </button>
                    {!isTimerRunning && timerSeconds > 0 && (
                      <button 
                        onClick={() => setTimerSeconds(0)} 
                        className="btn-icon btn-ghost" 
                        style={{ width: '32px', height: '32px', color: 'var(--text-tertiary)' }}
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
                                <div className="exercise-meta-dot" />
                              </>
                            )}

                            {/* Global Inputs - Always visible unless they explicitly toggle advanced tracking */}
                            {!ex.is_tracking_sets && (
                              <>
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
                              </>
                            )}

                            {/* Toggle Button for Set-by-Set Tracking */}
                            {ex.sets > 0 && (
                              <button
                                onClick={() => handleLocalChange(ex.id, 'is_tracking_sets', !ex.is_tracking_sets)}
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
                                  backgroundColor: ex.is_tracking_sets ? 'rgba(255, 120, 84, 0.1)' : 'var(--bg-elevated)',
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
                                      SET {i + 1}
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={isSetCompleted ? (ex.logged_sets[i].reps) : draft.reps}
                                          onChange={e => handleSetDraftChange(ex.id, i, 'reps', e.target.value)}
                                          disabled={isSetCompleted}
                                          className="exercise-inline-input"
                                          style={{ width: '45px', textAlign: 'center', backgroundColor: isSetCompleted ? 'transparent' : 'var(--bg-surface)', padding: '2px 4px' }}
                                        />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Reps</span>
                                      </div>
                                      
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          step="0.5"
                                          value={isSetCompleted ? (ex.logged_sets[i].weight) : draft.weight}
                                          onChange={e => handleSetDraftChange(ex.id, i, 'weight', e.target.value)}
                                          disabled={isSetCompleted}
                                          className="exercise-inline-input"
                                          style={{ width: '50px', textAlign: 'center', backgroundColor: isSetCompleted ? 'transparent' : 'var(--bg-surface)', padding: '2px 4px' }}
                                        />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>kg</span>
                                      </div>
                                    </div>
                                    
                                    <button
                                      onClick={() => toggleSet(ex.id, i)}
                                      style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        display: 'flex', 
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: isSetCompleted ? 'var(--accent)' : 'transparent',
                                        color: isSetCompleted ? 'var(--bg-surface)' : 'var(--text-tertiary)',
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
                        placeholder="Mins"
                        value={newExercise.minutes}
                        onChange={e => setNewExercise({ ...newExercise, minutes: e.target.value })}
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
