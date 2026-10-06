import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from '../lib/supabase';
import { TrendingDown, Activity, Trophy, Flame, CheckCircle, Snowflake, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../App';
import { getGreeting, getRelativeTime, calculateStreak, getGracePeriodsUsedThisMonth } from '../lib/utils';

const quotes = [
  "The only bad workout is the one that didn't happen.",
  "It never gets easier, you just get stronger.",
  "Your body can stand almost anything. It's your mind that you have to convince.",
  "A one hour workout is 4% of your day. No excuses.",
  "Sore today, strong tomorrow.",
  "Motivation is what gets you started. Habit is what keeps you going.",
  "Discipline equals freedom.",
  "Wake up with determination. Go to bed with satisfaction.",
  "The hardest lift of all is lifting your butt off the couch.",
  "You don't have to be extreme, just consistent.",
  "Sweat is fat crying.",
  "When you feel like quitting, think about why you started.",
  "Don't stop when you're tired. Stop when you're done.",
  "The pain you feel today will be the strength you feel tomorrow.",
  "Do something today that your future self will thank you for.",
  "No pain, no gain. Shut up and train.",
  "Doubt kills more dreams than failure ever will.",
  "Success starts with self-discipline.",
  "Making excuses burns zero calories per hour.",
  "If it doesn't challenge you, it doesn't change you.",
  "You are entirely up to you.",
  "Fall in love with taking care of your body.",
  "Strive for progress, not perfection.",
  "Strength does not come from physical capacity. It comes from an indomitable will.",
  "The body achieves what the mind believes.",
  "Every workout is progress.",
  "Focus on your goals, not your obstacles.",
  "Be stronger than your excuses.",
  "The only bad workout is the one that didn't happen.",
  "You can have results or excuses. Not both.",
  "What seems impossible today will one day become your warm-up.",
  "Success is what comes after your stop making excuses.",
  "Train insane or remain the same.",
  "A champion is someone who gets up when they can't.",
  "Don't wish for a good body, work for it.",
  "Eat clean. Train hard. Be patient.",
  "Respect your body. It's the only one you get.",
  "Lifting weights makes women huge...ly awesome.",
  "Excuses don't build muscle.",
  "Better sore than sorry.",
  "Don't limit your challenges, challenge your limits.",
  "You must do what others won't, to achieve what others don't.",
  "Results happen over time, not overnight. Work hard, stay consistent, and be patient.",
  "Your only limit is you.",
  "Nothing truly great ever came from a comfort zone.",
  "The harder you work, the luckier you get.",
  "Sweat now, shine later.",
  "Great things never come from comfort zones.",
  "Get comfortable with being uncomfortable.",
  "Don't count the days, make the days count.",
  "Make your body the sexiest outfit you own.",
  "I may not be there yet, but I'm closer than I was yesterday.",
  "Fitness is not about being better than someone else. It's about being better than you used to be.",
  "Don't dream of it. Train for it.",
  "Hustle for that muscle.",
  "Take care of your body. It's the only place you have to live.",
  "Rome wasn't built in a day, but they worked on it every single day.",
  "Once you see results, it becomes an addiction.",
  "Tough times don't last. Tough people do.",
  "If you want something you've never had, you must be willing to do something you've never done.",
  "Believe you can and you're halfway there.",
  "Clear your mind of can't.",
  "To enjoy the glow of good health, you must exercise.",
  "Work hard in silence. Let success be your noise.",
  "Action is the foundational key to all success.",
  "Fitness is like a relationship. You can't cheat and expect it to work.",
  "Obstacles can't stop you. Problems can't stop you. Most of all, other people can't stop you. Only you can stop you.",
  "Exercise is a celebration of what your body can do. Not a punishment for what you ate.",
  "I don't stop when I'm tired, I stop when I'm done.",
  "Never give up on a dream just because of the time it will take to accomplish it.",
  "Do today what others won't so tomorrow you can do what others can't.",
  "It's going to be a journey. It's not a sprint to get in shape.",
  "Look in the mirror. That's your competition.",
  "Small daily improvements are the key to staggering long-term results.",
  "No matter how slow you go, you are still lapping everybody on the couch.",
  "You don't find willpower, you create it.",
  "To keep the body in good health is a duty.",
  "The clock is ticking. Are you becoming the person you want to be?",
  "Excuses will always be there for you. Opportunity won't.",
  "Today I will do what others won't, so tomorrow I can accomplish what others can't.",
  "Your health account, your bank account, they're the same thing. The more you put in, the more you can take out.",
  "All progress takes place outside the comfort zone.",
  "There are no shortcuts to any place worth going.",
  "Strength doesn't come from what you can do. It comes from overcoming the things you once thought you couldn't.",
  "You have a choice. You can throw in the towel, or you can use it to wipe your face off.",
  "Energy and persistence conquer all things.",
  "The difference between the impossible and the possible lies in a person's determination.",
  "To be a champion, you must act like one.",
  "Success is walking from failure to failure with no loss of enthusiasm.",
  "Be patient and tough; someday this pain will be useful to you.",
  "The only place where success comes before work is in the dictionary.",
  "Continuous improvement is better than delayed perfection.",
  "Keep going. Your future self is waiting.",
  "Don't tell people your plans. Show them your results.",
  "You are stronger than you think.",
  "Commit to be fit.",
  "The resistance that you fight physically in the gym and the resistance that you fight in life can only build a strong character.",
  "Stop waiting for Monday, Jan 1st, or tomorrow. Start now.",
  "When you feel like stopping, remember why you started.",
  "Every rep is a step closer.",
  "Train like a beast, look like a beauty."
];



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
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.6875rem', marginBottom: '0.125rem' }}>{payload[0].payload.date} {payload[0].payload.time}</p>
      <p style={{ color: 'var(--accent)', fontSize: '0.9375rem', fontWeight: 600 }}>{payload[0].value} kg</p>
    </div>
  );
};

const CustomVolumeTooltip = ({ active, payload, label }) => {
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
      <p style={{ color: '#3b82f6', fontSize: '0.9375rem', fontWeight: 600 }}>{payload[0].value} volume</p>
    </div>
  );
};

export default function Home({ session }) {
  const toast = useToast();
  const [quote, setQuote] = useState('');
  const [weight, setWeight] = useState('');
  const [weightData, setWeightData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState({ totalWorkouts: 0, currentStreak: 0, weeklyGoal: '0 / 0' });
  const [displayName, setDisplayName] = useState('');
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [todayTemplate, setTodayTemplate] = useState(null);
  const [isTodayCompleted, setIsTodayCompleted] = useState(false);
  const [gracePeriodsRemaining, setGracePeriodsRemaining] = useState(3);
  
  // Analytics State
  const [volumeData, setVolumeData] = useState([]);
  const [top1RMs, setTop1RMs] = useState([]);

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
      .neq('routine_name', 'Spontaneous Workout')
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
        id: new Date(w.logged_at).getTime(),
        date: new Date(w.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        time: new Date(w.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Fetch all workouts to calculate stats
    const { data: allWorkouts } = await supabase
      .from('workouts')
      .select('id, completed, completed_at, is_rest_day, day_of_week, created_at, exercises(sets, reps, weight, logged_sets)')
      .eq('user_id', session.user.id);

    let streak = 0;
    let totalWorkouts = 0;
    let completedThisWeek = 0;
    let goal = 0;

    if (allWorkouts && allWorkouts.length > 0) {
      // 1. Calculate Weekly Goal (count newest templates that are not rest days)
      const templates = allWorkouts.filter(w => w.completed === false && w.routine_name !== 'Spontaneous Workout');
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
      
      const todayStartCheck = new Date();
      todayStartCheck.setHours(0, 0, 0, 0);
      setIsTodayCompleted(completedHistory.some(w => new Date(w.completed_at).getTime() >= todayStartCheck.getTime()));

      // 4. Calculate Streak
      if (completedHistory.length > 0) {
        streak = calculateStreak(completedHistory, restDaysOfWeek, 3);
        const usedGrace = getGracePeriodsUsedThisMonth(completedHistory, restDaysOfWeek);
        setGracePeriodsRemaining(Math.max(0, 3 - usedGrace));
        
        // 5. Calculate Volume Over Time
        const recentVolumes = [];
        completedHistory.slice(0, 14).forEach(w => { 
          if (!w.completed_at) return;
          
          let vol = 0;
          if (w.exercises) {
            w.exercises.forEach(ex => {
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
                  vol += (reps * weight);
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
                vol += (sets * reps * weight);
              }
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
              <Snowflake size={12} /> {gracePeriodsRemaining} Shield{gracePeriodsRemaining !== 1 ? 's' : ''} Left
            </div>
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
                  <XAxis 
                    dataKey="id" 
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(id) => new Date(id).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} 
                    stroke="var(--text-quaternary)" 
                    tick={{ fontSize: 11 }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
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
                  <Tooltip content={<CustomVolumeTooltip />} />
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
                <p className="empty-state-text">
                  {stats.totalWorkouts > 0 
                    ? "No volume data found. Track reps and weight to see your graph!" 
                    : "Complete workouts to see your volume graph!"}
                </p>
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
            {isTodayCompleted ? (
              <div className="empty-state" style={{ padding: 'var(--space-4) 0' }}>
                <span style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>💪</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Already Completed!</p>
                <p className="empty-state-text">You crushed your workout for today.</p>
              </div>
            ) : todayTemplate ? (
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
                  
                  <Link to="/workouts" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-4)', alignSelf: 'flex-start' }}>
                    Start Workout
                  </Link>
                </div>
              )
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-4) 0' }}>
                <p className="empty-state-text">No template set for today.</p>
                <Link to="/templates" className="btn btn-secondary btn-sm mt-3">Set one up</Link>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
