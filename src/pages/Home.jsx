import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from '../lib/supabase';
import { TrendingDown, Activity, Trophy, Flame, CheckCircle } from 'lucide-react';

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

  const [todayTemplate, setTodayTemplate] = useState(null);

  useEffect(() => {
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
    fetchData();
    fetchProfile();
  }, [session]);

  const fetchProfile = async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', session.user.id)
      .single();
    if (data) setDisplayName(data.display_name || '');
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
      .limit(10);

    if (acts) {
      setActivities(acts.map(a => ({
        id: a.id,
        user: a.profiles.display_name,
        action: a.action,
        time: getRelativeTime(a.created_at)
      })));
    }

    // Fetch all workouts to calculate stats
    const { data: allWorkouts } = await supabase
      .from('workouts')
      .select('completed, completed_at, is_rest_day, day_of_week, created_at')
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
      }
    }

    setStats(prev => ({
      ...prev,
      totalWorkouts,
      currentStreak: streak,
      weeklyGoal: `${completedThisWeek} / ${goal || 0}`
    }));
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

  const greeting = getGreeting();

  return (
    <div className="flex-col gap-6 stagger-children" style={{ display: 'flex' }}>
      {/* Header */}
      <header className="page-header">
        <h1 className="page-title">{greeting}{displayName ? `, ${displayName}` : ''}!</h1>
        <p className="page-subtitle">Let's get after it today.</p>
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
    </div>
  );
}
