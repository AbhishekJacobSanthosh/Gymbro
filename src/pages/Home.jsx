import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from '../lib/supabase';
import { TrendingDown, Quote, Activity, Trophy, Flame, CheckCircle } from 'lucide-react';

const quotes = [
  "The only bad workout is the one that didn't happen.",
  "It never gets easier, you just get stronger.",
  "Your body can stand almost anything. It's your mind that you have to convince.",
  "A one hour workout is 4% of your day. No excuses.",
  "Sore today, strong tomorrow.",
  "Motivation is what gets you started. Habit is what keeps you going."
];

export default function Home({ session }) {
  const [quote, setQuote] = useState('');
  const [weight, setWeight] = useState('');
  const [weightData, setWeightData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState({ totalWorkouts: 0, currentStreak: 0, weeklyGoal: '0 / 0' });

  useEffect(() => {
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
    fetchData();
  }, [session]);

  const fetchData = async () => {
    if (!session?.user) return;

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
        time: new Date(a.created_at).toLocaleDateString()
      })));
    }

    // Fetch all workouts to calculate stats
    const { data: allWorkouts } = await supabase
      .from('workouts')
      .select('completed, completed_at, is_rest_day, day_of_week')
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
      templates.forEach(t => {
        if (!templatesByDay[t.day_of_week]) {
          templatesByDay[t.day_of_week] = t;
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
        
        const firstWorkoutDate = new Date(completedHistory[0].completed_at);
        firstWorkoutDate.setHours(0,0,0,0);
        
        const diffTime = Math.abs(today - firstWorkoutDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 1) {
          currentCheckDate = new Date(firstWorkoutDate);
          
          for (let i = 0; i < completedHistory.length; i++) {
            const wDate = new Date(completedHistory[i].completed_at);
            wDate.setHours(0,0,0,0);
            
            if (wDate.getTime() === currentCheckDate.getTime()) {
              streak++;
              currentCheckDate.setDate(currentCheckDate.getDate() - 1);
            } else if (wDate.getTime() > currentCheckDate.getTime()) {
              continue;
            } else {
              break;
            }
          }
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

  return (
    <div className="flex flex-col gap-4">
      <header className="page-header">
        <h1 className="page-title">Welcome back!</h1>
        <p className="text-muted">Let's get after it today.</p>
      </header>
      
      {/* Quick Stats */}
      <div className="flex gap-4 mb-2" style={{ flexWrap: 'wrap' }}>
        <div className="card flex items-center justify-between" style={{ flex: '1 1 150px', padding: '1rem 1.5rem' }}>
          <div>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Total Workouts</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.totalWorkouts}</p>
          </div>
          <CheckCircle size={32} className="text-success" style={{ color: 'var(--success-color)', opacity: 0.8 }} />
        </div>
        <div className="card flex items-center justify-between" style={{ flex: '1 1 150px', padding: '1rem 1.5rem' }}>
          <div>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Current Streak</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.currentStreak} Days</p>
          </div>
          <Flame size={32} className="text-accent" style={{ opacity: 0.8 }} />
        </div>
        <div className="card flex items-center justify-between" style={{ flex: '1 1 150px', padding: '1rem 1.5rem' }}>
          <div>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Weekly Goal</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.weeklyGoal}</p>
          </div>
          <Trophy size={32} style={{ color: '#FFD700', opacity: 0.8 }} />
        </div>
      </div>
      
      <div className="card" style={{ borderLeft: '4px solid var(--accent-primary)', position: 'relative' }}>
        <Quote size={24} className="text-accent mb-2" style={{ opacity: 0.5 }} />
        <p style={{ fontStyle: 'italic', fontSize: '1.1rem' }}>"{quote}"</p>
      </div>
      
      <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1 1 300px' }}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="text-accent" />
            <h2 style={{ fontSize: '1.2rem' }}>Weight Tracker</h2>
          </div>
          
          <form onSubmit={handleWeightSubmit} className="flex gap-2 mb-4">
            <input 
              type="number" 
              step="0.1" 
              placeholder="Current weight (kg/lbs)" 
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">Log</button>
          </form>
          
          <div style={{ height: '200px', width: '100%', marginTop: '1rem' }}>
            {weightData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" stroke="var(--text-secondary)" />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke="var(--text-secondary)" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: 'none', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--accent-primary)' }}
                  />
                  <Line type="monotone" dataKey="weight" stroke="var(--accent-primary)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent-primary)' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted">No weight data logged yet.</div>
            )}
          </div>
        </div>
        
        <div className="card" style={{ flex: '1 1 300px' }}>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="text-accent" />
            <h2 style={{ fontSize: '1.2rem' }}>Activity Feed</h2>
          </div>
          
          <div className="flex flex-col gap-4">
            {activities.map(activity => (
              <div key={activity.id} className="flex flex-col pb-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <p>
                  <strong className="text-accent">{activity.user}</strong> {activity.action}
                </p>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>{activity.time}</span>
              </div>
            ))}
            {activities.length === 0 && <p className="text-muted">No recent activity. Go crush a workout!</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
