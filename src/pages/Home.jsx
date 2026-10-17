import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from '../lib/supabase';
import { Check, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../App';
import { getGreeting, getRelativeTime, calculateStreak, calculateVolume, parseReps, getActiveTemplates, getRestDays, buildWeek } from '../lib/utils';
import { readStore } from '../lib/offline';

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
  "You can have results or excuses. Not both.",
  "What seems impossible today will one day become your warm-up.",
  "Success is what comes after you stop making excuses.",
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



function ChartTip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tip">
      <p className="chart-tip-label">{point.date ?? label}{point.time ? `, ${point.time}` : ''}</p>
      <p className="chart-tip-value num">{payload[0].value} {unit}</p>
    </div>
  );
}

export default function Home({ session }) {
  const toast = useToast();
  const [quote, setQuote] = useState('');
  const [weight, setWeight] = useState('');
  const [weightData, setWeightData] = useState([]);
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState({ totalWorkouts: 0, currentStreak: 0, plannedDays: 0 });
  const [displayName, setDisplayName] = useState('');
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [todayTemplate, setTodayTemplate] = useState(null);
  const [isTodayCompleted, setIsTodayCompleted] = useState(false);
  const [gracePeriodsRemaining, setGracePeriodsRemaining] = useState(3);
  const [week, setWeek] = useState(() => buildWeek([], {}));
  
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

    // Fetch the latest 30 weight logs, shown oldest to newest
    const { data: weights } = await supabase
      .from('weight_logs')
      .select('weight, logged_at')
      .eq('user_id', session.user.id)
      .order('logged_at', { ascending: false })
      .limit(30);

    if (weights) {
      setWeightData(weights.reverse().map(w => ({
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
      .select('id, completed, completed_at, is_rest_day, day_of_week, created_at, routine_name, exercises(sets, reps, weight, logged_sets)')
      .eq('user_id', session.user.id);

    let streak = 0;
    let totalWorkouts = 0;
    let goal = 0;

    if (allWorkouts && allWorkouts.length > 0) {
      // 1. Calculate Weekly Goal (newest template per day that is not a rest day and has exercises)
      const templatesByDay = getActiveTemplates(allWorkouts);
      const restDaysOfWeek = getRestDays(templatesByDay);

      // Empty templates are created just by opening a day in the Planner, so they don't count
      goal = Object.values(templatesByDay).filter(t => !t.is_rest_day && t.exercises?.length > 0).length;

      // 2. Filter to only completed history for streak and progress
      const completedHistory = allWorkouts
        .filter(w => w.completed)
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

      totalWorkouts = completedHistory.length;

      const todayStartCheck = new Date();
      todayStartCheck.setHours(0, 0, 0, 0);
      // Also counts a workout finished offline that hasn't synced yet
      const lastFinishedAt = readStore(session.user.id, 'lastFinished', null)?.completedAt;
      setIsTodayCompleted(
        completedHistory.some(w => new Date(w.completed_at).getTime() >= todayStartCheck.getTime()) ||
        (!!lastFinishedAt && new Date(lastFinishedAt) >= todayStartCheck)
      );
      setWeek(buildWeek([...completedHistory.map(w => w.completed_at), ...(lastFinishedAt ? [lastFinishedAt] : [])], templatesByDay));

      // 4. Calculate Streak
      if (completedHistory.length > 0) {
        const { streak: currentStreak, shieldsUsed } = calculateStreak(completedHistory, restDaysOfWeek, 3);
        streak = currentStreak;
        setGracePeriodsRemaining(Math.max(0, 3 - shieldsUsed));

        // 5. Calculate Volume Over Time
        const recentVolumes = [];
        completedHistory.slice(0, 14).forEach(w => {
          if (!w.completed_at) return;

          const vol = calculateVolume(w.exercises);
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
      plannedDays: goal
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
        const reps = parseReps(ex.reps);
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
    const value = parseFloat(weight);
    if (!(value > 0)) {
      toast?.error('Enter a weight above 0.');
      return;
    }

    const { error } = await supabase.from('weight_logs').insert([{
      user_id: session.user.id,
      weight: value
    }]);

    if (error) {
      toast?.error("Couldn't log weight. Please try again.");
      return;
    }
    setWeight('');
    fetchData(); // Refresh the chart
  };



  const greeting = getGreeting();
  const firstName = displayName.trim().split(/\s+/)[0];
  const todayExercises = [...(todayTemplate?.exercises || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const latestWeight = weightData[weightData.length - 1]?.weight;
  const firstWeight = weightData[0]?.weight;
  const weightChange = latestWeight != null && firstWeight != null && weightData.length > 1
    ? Math.round((latestWeight - firstWeight) * 10) / 10
    : null;
  const trainedDays = week.filter(d => d.trained).length;
  const dayStatus = (d) => d.trained ? 'trained' : d.rest ? 'rest day' : d.planned ? 'planned' : 'nothing planned';

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-heading">
          <h1 className="page-title">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          {quote && <p className="home-quote">{quote}</p>}
        </div>
        <Link to="/profile" className="level-pill" aria-label={`Level ${level}, ${xp} XP. Open profile`}>
          <span className="level-pill-label">Level</span>
          <span className="num">{level}</span>
        </Link>
      </header>

      {/* This week: did I train, what's next */}
      <section className="home-section" aria-labelledby="week-title">
        <h2 id="week-title" className="sr-only">This week</h2>
        <ol className="week-strip">
          {week.map(d => (
            <li
              key={d.name}
              className={`week-day ${d.trained ? 'is-trained' : ''} ${d.planned ? 'is-planned' : ''} ${d.rest ? 'is-rest' : ''} ${d.isToday ? 'is-today' : ''}`}
              aria-label={`${d.name}${d.isToday ? ' (today)' : ''}: ${dayStatus(d)}`}
            >
              <span className="week-day-letter" aria-hidden="true">{d.letter}</span>
              <span className="week-day-mark" aria-hidden="true">
                {d.trained ? <Check size={16} strokeWidth={3} /> : d.rest ? '–' : <span className="num">{d.date}</span>}
              </span>
            </li>
          ))}
        </ol>
        <dl className="week-stats">
          <div>
            <dt>Streak</dt>
            <dd className="num">{stats.currentStreak} {stats.currentStreak === 1 ? 'day' : 'days'}</dd>
          </div>
          <div>
            <dt>This week</dt>
            {/* Days trained, the same days the strip above ticks; extra days beyond the plan just count up */}
            <dd className="num">{trainedDays} {trainedDays === 1 ? 'day' : 'days'}</dd>
            {stats.plannedDays > 0 && <dd className="week-stats-note">{stats.plannedDays} planned</dd>}
          </div>
          <div>
            <dt>Shields left</dt>
            <dd className="num">{gracePeriodsRemaining}</dd>
          </div>
        </dl>
      </section>

      {/* Today's plan */}
      <section className="home-section" aria-labelledby="today-title">
        <h2 id="today-title" className="section-title">Today</h2>
        {isTodayCompleted ? (
          <Link to="/workouts" className="panel today-plan">
            <span className="today-plan-done"><Check size={18} strokeWidth={3} /></span>
            <span className="today-plan-text">
              <strong>Done for today</strong>
              <span>Nice work. See you tomorrow.</span>
            </span>
            <ChevronRight size={18} className="today-plan-chevron" />
          </Link>
        ) : todayTemplate?.is_rest_day ? (
          <div className="panel today-plan">
            <span className="today-plan-text">
              <strong>Rest day</strong>
              <span>Recover and come back stronger.</span>
            </span>
          </div>
        ) : todayExercises.length > 0 ? (
          <Link to="/workouts" className="panel today-plan">
            <span className="today-plan-text">
              <strong>{todayTemplate.routine_name || 'Workout'}</strong>
              <span>{todayExercises.length} exercise{todayExercises.length === 1 ? '' : 's'}: {todayExercises.slice(0, 3).map(ex => ex.name).join(', ')}{todayExercises.length > 3 ? '…' : ''}</span>
            </span>
            <span className="btn btn-primary">Start</span>
          </Link>
        ) : (
          <Link to="/templates" className="panel today-plan">
            <span className="today-plan-text">
              <strong>Nothing planned today</strong>
              <span>Plan your week in the Planner.</span>
            </span>
            <ChevronRight size={18} className="today-plan-chevron" />
          </Link>
        )}
      </section>

      <div className="home-grid">
        {/* Bodyweight */}
        <section className="home-section" aria-labelledby="weight-title">
          <div className="section-head">
            <h2 id="weight-title" className="section-title">Bodyweight</h2>
            {latestWeight != null && (
              <p className="section-figure">
                <span className="num">{latestWeight} kg</span>
                {weightChange !== null && weightChange !== 0 && (
                  <span className="section-figure-change">{weightChange > 0 ? '+' : ''}{weightChange} since {weightData[0].date}</span>
                )}
              </p>
            )}
          </div>
          <div className="panel">
            <form onSubmit={handleWeightSubmit} className="inline-form">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0.1"
                placeholder="Today's weight"
                aria-label="Today's weight"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">Log</button>
            </form>
            <div className="chart">
              {weightData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weightData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.25 }} />
                        <stop offset="100%" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--divider)" vertical={false} />
                    <XAxis
                      dataKey="id"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(id) => new Date(id).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTip unit="kg" />} cursor={{ stroke: 'var(--border-hover)' }} />
                    <Area
                      type="monotone"
                      dataKey="weight"
                      stroke="var(--accent)"
                      strokeWidth={2.5}
                      fill="url(#weightGradient)"
                      dot={false}
                      activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--bg-surface)', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="chart-empty">Log your weight above to start the chart.</p>
              )}
            </div>
          </div>
        </section>

        {/* Volume */}
        <section className="home-section" aria-labelledby="volume-title">
          <div className="section-head">
            <h2 id="volume-title" className="section-title">Volume</h2>
            <p className="section-note">Last 14 workouts, kg moved</p>
          </div>
          <div className="panel">
            <div className="chart">
              {volumeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={volumeData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="volGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.25 }} />
                        <stop offset="100%" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--divider)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip content={<ChartTip unit="kg" />} cursor={{ stroke: 'var(--border-hover)' }} />
                    <Area
                      type="monotone"
                      dataKey="volume"
                      stroke="var(--accent)"
                      strokeWidth={2.5}
                      fill="url(#volGradient)"
                      dot={false}
                      activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--bg-surface)', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="chart-empty">
                  {stats.totalWorkouts > 0
                    ? 'Log weight and reps on your sets to see your volume.'
                    : 'Finish a workout to see your volume.'}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Best lifts */}
        {top1RMs.length > 0 && (
          <section className="home-section" aria-labelledby="lifts-title">
            <div className="section-head">
              <h2 id="lifts-title" className="section-title">Best lifts</h2>
              <p className="section-note">Estimated 1-rep max</p>
            </div>
            <ul className="grouped-list">
              {top1RMs.map(item => (
                <li key={item.name} className="list-row">
                  <span className="list-row-main">{item.name}</span>
                  <span className="list-row-value num">{item.rm} kg</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Friends */}
        <section className="home-section" aria-labelledby="feed-title">
          <h2 id="feed-title" className="section-title">Friends</h2>
          {activities.length > 0 ? (
            <ul className="grouped-list">
              {activities.map(activity => (
                <li key={activity.id} className="list-row list-row-stacked">
                  <span className="list-row-main">
                    <strong>{activity.user}</strong> {activity.action}
                  </span>
                  <span className="list-row-meta">{activity.time}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel chart-empty">No activity yet. Finish a workout and it shows up here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
