import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from '../lib/supabase';
import { TrendingDown, Activity, Trophy, Flame, CheckCircle, Snowflake, X } from 'lucide-react';

const quotes = [
  "The only bad workout is the one that didn't happen.",
  "It never gets easier, you just get stronger.",
  "Your body can stand almost anything. It's your mind that you have to convince.",
  "A one hour workout is 4% of your day. No excuses.",
  "Sore today, strong tomorrow.",
  "Motivation is what gets you started. Habit is what keeps you going."
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      backgroundColor: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      padding: '0.5rem 0.75rem',
      boxShadow: 'var(--shadow-md)',
    }}>
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.6875rem', marginBottom: '0.125rem' }}>{label}</p>
      <p style={{ color: 'var(--accent)', fontSize: '0.9375rem', fontWeight: 600 }}>{payload[0].value} kg</p>
    </div>
  );
};

export default function Home({ session }) {
  const [quote, setQuote] = useState('');
  const [weight, setWeight] = useState('');
  const [weightData, setWeightData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState({ totalWorkouts: 0, currentStreak: 0, weeklyGoal: '0 / 0' });
  const [displayName, setDisplayName] = useState('');
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [todayTemplate, setTodayTemplate] = useState(null);
  
  // Analytics State
  const [volumeData, setVolumeData] = useState([]);
  const [top1RMs, setTop1RMs] = useState([]);
  
  // Freeze state
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false);
  const [freezeReason, setFreezeReason] = useState('');
  const [isFreezing, setIsFreezing] = useState(false);
  const [freezeDates, setFreezeDates] = useState(new Set());

  useEffect(() => {
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
    fetchData();
    fetchProfile();
  }, [session]);

  const fetchProfile = async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('profiles')
      .select('display_name, level, xp')
      .eq('id', session.user.id)
      .single();
    if (data) {
      setDisplayName(data.display_name || '');
      setLevel(data.level || 1);
      setXp(data.xp || 0);
    }
  };

  const fetchData = async () => {
    if (!session?.user) return;

    // Fetch Today's Plan
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = DAYS[new Date().getDay()];
    
    const { data: templateData } = await supabase
      .from('workouts')
      .select('*, exercises(*)')
      .eq('user_id', session.user.id)
      .eq('day_of_week', todayName)
      .eq('completed', false)
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (templateData && templateData.length > 0) {
      setTodayTemplate(templateData[0]);
    } else {
      setTodayTemplate(null);
    }

    // Fetch Weight Logs
    const { data: weights } = await supabase
      .from('weight_logs')
      .select('weight, logged_at')
      .eq('user_id', session.user.id)
      .order('logged_at', { ascending: true })
      .limit(30);

    if (weights) {
      setWeightData(weights.map(w => ({
        date: new Date(w.logged_at).toLocaleDateString('en-US', { weekday: 'short' }),
        weight: w.weight
      })));
    }

    // Fetch Activity Feed (combined for you and sister)
    const { data: acts } = await supabase
      .from('activity_feed')
      .select(`
        id, action, created_at,
        profiles!inner(display_name)
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (acts) {
      setActivities(acts.map(a => ({
        id: a.id,
        user: a.profiles.display_name,
        action: a.action,
        time: getRelativeTime(a.created_at)
      })));
    }

    // Fetch Streak Freezes
    const { data: freezes } = await supabase
      .from('streak_freezes')
      .select('freeze_date')
      .eq('user_id', session.user.id);

    let fetchedFreezeDates = new Set();
    if (freezes) {
      fetchedFreezeDates = new Set(freezes.map(f => {
        // Need to parse date string safely. Date strings from postgres are usually YYYY-MM-DD
        const [year, month, day] = f.freeze_date.split('-');
        const d = new Date(year, month - 1, day);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }));
    }
    setFreezeDates(fetchedFreezeDates);

    // Fetch all workouts to calculate stats
    const { data: allWorkouts } = await supabase
      .from('workouts')
      .select('id, completed, completed_at, is_rest_day, day_of_week, created_at, exercises(sets, reps, weight)')
      .eq('user_id', session.user.id);

    let streak = 0;
    let totalWorkouts = 0;
    let completedThisWeek = 0;
    let goal = 0;

    if (allWorkouts && allWorkouts.length > 0) {
      // 1. Calculate Weekly Goal (count newest templates that are not rest days)
      const templates = allWorkouts.filter(w => w.completed === false);
      templates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // newest first

      const templatesByDay = {};
      const restDaysOfWeek = new Set();
      templates.forEach(t => {
        if (!templatesByDay[t.day_of_week]) {
          templatesByDay[t.day_of_week] = t;
          if (t.is_rest_day) {
            restDaysOfWeek.add(t.day_of_week);
          }
        }
      });

      goal = Object.values(templatesByDay).filter(t => t.is_rest_day === false).length;

      // 2. Filter to only completed history for streak and progress
      const completedHistory = allWorkouts
        .filter(w => w.completed)
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

      totalWorkouts = completedHistory.length;

      // 3. Calculate this week's progress (starting Sunday to match planner)
      const today = new Date();
      const currentDay = today.getDay(); // 0 is Sunday
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - currentDay);
      startOfWeek.setHours(0, 0, 0, 0);

      completedThisWeek = completedHistory.filter(w => new Date(w.completed_at) >= startOfWeek).length;

      // 4. Calculate Streak
      if (completedHistory.length > 0) {
        today.setHours(0, 0, 0, 0);
        let currentCheckDate = new Date(today);
        const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        const completedDates = new Set(completedHistory.map(w => {
          const d = new Date(w.completed_at);
          d.setHours(0, 0, 0, 0);
          return d.getTime();
        }));

        for (let i = 0; i < 365; i++) {
          const time = currentCheckDate.getTime();
          const isCompleted = completedDates.has(time);
          const dayName = DAYS[currentCheckDate.getDay()];
          const isRestDay = restDaysOfWeek.has(dayName);
          const isFreezeDay = fetchedFreezeDates.has(time);
          const isToday = i === 0;

          if (isCompleted) {
            streak++;
          } else {
            if (isToday) {
              // skip today if not completed
            } else if (isRestDay || isFreezeDay) {
              // skip rest day or freeze day if not completed
            } else {
              // missing a required day breaks streak
              break;
            }
          }
          currentCheckDate.setDate(currentCheckDate.getDate() - 1);
        }
        
        // 5. Calculate Volume Over Time
        const recentVolumes = [];
        completedHistory.slice(0, 14).forEach(w => { 
          if (!w.completed_at) return;
          
          let vol = 0;
          if (w.exercises) {
            w.exercises.forEach(ex => {
               let reps = 0;
               if (typeof ex.reps === 'string') {
                 const match = ex.reps.match(/\d+/);
                 if (match) reps = parseInt(match[0]);
               } else {
                 reps = parseInt(ex.reps) || 0;
               }
               const weight = parseFloat(ex.weight) || 0;
               const sets = parseInt(ex.sets) || 0;
               vol += (sets * reps * weight);
            });
          }
          
          if (vol > 0) {
            recentVolumes.push({
              dateObj: new Date(w.completed_at),
              date: new Date(w.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              volume: vol
            });
          }
        });
        
        recentVolumes.sort((a, b) => a.dateObj - b.dateObj);
        setVolumeData(recentVolumes);
      }
    }

    setStats(prev => ({
      ...prev,
      totalWorkouts,
      currentStreak: streak,
      weeklyGoal: `${completedThisWeek} / ${goal || 0}`
    }));

    // 6. Fetch 1RMs
    const { data: allExercises } = await supabase
      .from('exercises')
      .select('name, weight, reps, workouts!inner(completed)')
      .eq('workouts.user_id', session.user.id)
      .eq('workouts.completed', true);
      
    let oneRepMaxes = {};
    if (allExercises) {
      allExercises.forEach(ex => {
        if (!ex.name || !ex.weight) return;
        let reps = 0;
        if (typeof ex.reps === 'string') {
           const match = ex.reps.match(/\d+/);
           if (match) reps = parseInt(match[0]);
        } else {
           reps = parseInt(ex.reps) || 0;
        }
        const weight = parseFloat(ex.weight) || 0;
        
        if (weight > 0 && reps > 0) {
          const epley1RM = weight * (1 + reps / 30);
          if (!oneRepMaxes[ex.name] || epley1RM > oneRepMaxes[ex.name]) {
            oneRepMaxes[ex.name] = epley1RM;
          }
        }
      });
    }
    
    const topRMsArray = Object.entries(oneRepMaxes)
      .map(([name, rm]) => ({ name, rm: Math.round(rm) }))
      .sort((a, b) => b.rm - a.rm)
      .slice(0, 3);
      
    setTop1RMs(topRMsArray);
  };

  const handleWeightSubmit = async (e) => {
    e.preventDefault();
    if (!weight) return;

    const { error } = await supabase.from('weight_logs').insert([{
      user_id: session.user.id,
      weight: parseFloat(weight)
    }]);

    if (!error) {
      setWeight('');
      fetchData(); // Refresh the chart
    }
  };

  const handleFreezeStreak = async () => {
    if (!session?.user) return;
    setIsFreezing(true);
    
    const today = new Date();
    // Offset by timezone to get local date string YYYY-MM-DD reliably
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(today - tzOffset)).toISOString().slice(0, -1);
    const freezeDateStr = localISOTime.split('T')[0];

    const { error } = await supabase.from('streak_freezes').insert([{
      user_id: session.user.id,
      freeze_date: freezeDateStr,
      reason: freezeReason
    }]);

    if (!error) {
      setIsFreezeModalOpen(false);
      setFreezeReason('');
      fetchData(); // Refresh to recalculate streak
    }
    setIsFreezing(false);
  };

  const greeting = getGreeting();

  return (
    <div className="flex-col gap-6 stagger-children" style={{ display: 'flex' }}>
      {/* Header */}
      <header className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">{greeting}{displayName ? `, ${displayName}` : ''}!</h1>
          <p className="page-subtitle">Let's get after it today.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-block', backgroundColor: 'var(--accent-soft)', color: 'var(--accent)', padding: '4px 12px', borderRadius: '100px', fontWeight: 700, fontSize: '0.875rem' }}>
            Level {level}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px', fontWeight: 600 }}>{xp} XP</p>
        </div>
      </header>

      {/* Quick Stats */}
      <div className="stats-scroll" style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: '1 1 180px' }}>
          <div>
            <p className="stat-label">Total Workouts</p>
            <p className="stat-value">{stats.totalWorkouts}</p>
          </div>
          <div className="stat-icon" style={{ backgroundColor: 'var(--success-soft)' }}>
            <CheckCircle size={22} style={{ color: 'var(--success)' }} />
          </div>
        </div>
        <div className="stat-card" style={{ flex: '1 1 180px' }}>
          <div>
            <p className="stat-label">Current Streak</p>
            <p className="stat-value">{stats.currentStreak} Days</p>
            <button 
              onClick={() => setIsFreezeModalOpen(true)}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-tertiary)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}
            >
              <Snowflake size={12} /> Freeze Streak
            </button>
          </div>
          <div className="stat-icon" style={{ backgroundColor: 'var(--accent-soft)' }}>
            <Flame size={22} style={{ color: 'var(--accent)' }} />
          </div>
        </div>
        <div className="stat-card" style={{ flex: '1 1 180px' }}>
          <div>
            <p className="stat-label">Weekly Goal</p>
            <p className="stat-value">{stats.weeklyGoal}</p>
          </div>
          <div className="stat-icon" style={{ backgroundColor: 'var(--warning-soft)' }}>
            <Trophy size={22} style={{ color: 'var(--warning)' }} />
          </div>
        </div>
      </div>

      {/* Quote */}
      <div className="card quote-card">
        <p style={{ fontStyle: 'italic', fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: 1.6, position: 'relative', zIndex: 1 }}>
          "{quote}"
        </p>
      </div>

      {/* Charts & Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-5)' }}>
        {/* Weight Tracker */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="stat-icon" style={{ backgroundColor: 'var(--accent-soft)', width: '36px', height: '36px' }}>
              <TrendingDown size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>Weight Tracker</h2>
          </div>

          <form onSubmit={handleWeightSubmit} className="flex gap-2 mb-5">
            <input
              type="number"
              step="0.1"
              placeholder="Current weight (kg/lbs)"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary">Log</button>
          </form>

          <div style={{ height: '200px', width: '100%' }}>
            {weightData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weightData}>
                  <defs>
                    <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#ff7854" />
                      <stop offset="100%" stopColor="#ffb347" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-quaternary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke="var(--text-quaternary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="weight"
                    stroke="url(#lineGradient)"
                    strokeWidth={2.5}
                    fill="url(#weightGradient)"
                    dot={{ r: 3, fill: 'var(--accent)', stroke: 'var(--bg-surface)', strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--bg-surface)', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
                <TrendingDown size={32} className="empty-state-icon" />
                <p className="empty-state-text">No weight data logged yet. Start tracking above!</p>
              </div>
            )}
          </div>
        </div>

        {/* Volume Tracker */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="stat-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', width: '36px', height: '36px' }}>
              <Activity size={18} style={{ color: '#3b82f6' }} />
            </div>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>Volume History</h2>
          </div>

          <div style={{ height: '200px', width: '100%' }}>
            {volumeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeData}>
                  <defs>
                    <linearGradient id="volGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-quaternary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="var(--text-quaternary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#volGradient)"
                    dot={{ r: 3, fill: '#3b82f6', stroke: 'var(--bg-surface)', strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: '#3b82f6', stroke: 'var(--bg-surface)', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
                <Activity size={32} className="empty-state-icon" />
                <p className="empty-state-text">Complete workouts to see your volume graph!</p>
              </div>
            )}
          </div>
        </div>

        {/* 1RM Estimations */}
        {top1RMs.length > 0 && (
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="stat-icon" style={{ backgroundColor: 'var(--warning-soft)', width: '36px', height: '36px' }}>
                <Trophy size={18} style={{ color: 'var(--warning)' }} />
              </div>
              <h2 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>Est. 1 Rep Max</h2>
            </div>
            
            <div className="flex-col gap-3" style={{ display: 'flex' }}>
              {top1RMs.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.name}</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{item.rm} kg</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Feed */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="stat-icon" style={{ backgroundColor: 'var(--accent-soft)', width: '36px', height: '36px' }}>
              <Activity size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>Activity Feed</h2>
          </div>

          <div className="flex-col gap-4" style={{ display: 'flex' }}>
            {activities.map(activity => (
              <div key={activity.id} className="activity-item" style={{ paddingBottom: 'var(--space-4)' }}>
                <p style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>{activity.user}</strong>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>{activity.action}</span>
                </p>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{activity.time}</span>
              </div>
            ))}
            {activities.length === 0 && (
              <div className="empty-state" style={{ padding: 'var(--space-6) 0' }}>
                <Activity size={28} className="empty-state-icon" />
                <p className="empty-state-text">No recent activity. Go crush a workout!</p>
              </div>
            )}
          </div>
        </div>

        {/* Today's Plan */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="stat-icon" style={{ backgroundColor: 'var(--accent-soft)', width: '36px', height: '36px' }}>
                <CheckCircle size={18} style={{ color: 'var(--accent)' }} />
              </div>
              <h2 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>Today's Plan</h2>
            </div>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {todayTemplate ? (
              todayTemplate.is_rest_day ? (
                <div className="empty-state" style={{ padding: 'var(--space-4) 0' }}>
                  <span style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>☕</span>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Rest Day</p>
                  <p className="empty-state-text">Time to recover and grow.</p>
                </div>
              ) : (
                <div className="flex-col gap-3" style={{ display: 'flex' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--accent)' }}>
                    {todayTemplate.routine_name || 'Workout'}
                  </p>
                  
                  {todayTemplate.exercises?.length > 0 ? (
                    <div className="flex-col gap-2" style={{ display: 'flex', marginTop: 'var(--space-1)' }}>
                      {todayTemplate.exercises.slice(0, 4).map(ex => (
                        <div key={ex.id} className="flex justify-between items-center" style={{ fontSize: '0.875rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{ex.name}</span>
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>{ex.sets} × {ex.reps}</span>
                        </div>
                      ))}
                      {todayTemplate.exercises.length > 4 && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 'var(--space-2)' }}>
                          +{todayTemplate.exercises.length - 4} more exercises
                        </p>
                      )}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>No exercises added yet.</p>
                  )}
                  
                  <a href="/workouts" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-4)', alignSelf: 'flex-start' }}>
                    Start Workout
                  </a>
                </div>
              )
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-4) 0' }}>
                <p className="empty-state-text">No template set for today.</p>
                <a href="/templates" className="btn btn-secondary btn-sm mt-3">Set one up</a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Freeze Modal */}
      {isFreezeModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 'var(--space-4)', backdropFilter: 'blur(2px)' }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Snowflake size={20} style={{ color: '#60a5fa' }} /> Freeze Streak
              </h2>
              <button onClick={() => setIsFreezeModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', fontSize: '0.875rem', lineHeight: 1.5 }}>
              Feeling sick or need a break? Freeze your streak for today so you don't lose your progress.
            </p>
            <input
              type="text"
              placeholder="Reason (e.g. Sick, Traveling)"
              value={freezeReason}
              onChange={(e) => setFreezeReason(e.target.value)}
              style={{ width: '100%', marginBottom: 'var(--space-4)' }}
            />
            <div className="flex gap-2">
              <button onClick={() => setIsFreezeModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={handleFreezeStreak} className="btn btn-primary" style={{ flex: 1 }} disabled={isFreezing}>
                {isFreezing ? 'Freezing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
