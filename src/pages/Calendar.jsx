import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CheckCircle, Flame, User, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Calendar({ session }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  
  // Navigation
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const startDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay(); // 0 is Sunday
  
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: startDay }, (_, i) => i);

  const [profiles, setProfiles] = useState({
    you: { id: session?.user?.id, name: 'You', color: 'var(--accent-primary)', streak: 0, total: 0 },
    sister: { id: null, name: 'Sister', color: '#4CAF50', streak: 0, total: 0 }
  });

  const [activityData, setActivityData] = useState({});

  useEffect(() => {
    fetchCalendarData();
  }, [currentDate, session]);

  const fetchCalendarData = async () => {
    if (!session?.user) return;
    setLoading(true);

    try {
      // 1. Fetch all profiles to find sister
      const { data: allProfiles } = await supabase.from('profiles').select('*');
      
      let youProfile = { ...profiles.you };
      let sisterProfile = { ...profiles.sister };

      if (allProfiles) {
        const youData = allProfiles.find(p => p.id === session.user.id);
        const sisterData = allProfiles.find(p => p.id !== session.user.id);

        if (youData) youProfile.name = youData.display_name || 'You';
        if (sisterData) {
          sisterProfile.id = sisterData.id;
          sisterProfile.name = sisterData.display_name || 'Sister';
        }
      }

      // 2. Fetch all completed workouts for the current month
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: workouts } = await supabase
        .from('workouts')
        .select('user_id, completed_at')
        .eq('completed', true)
        .gte('completed_at', startOfMonth)
        .lte('completed_at', endOfMonth);

      // Process workouts into activityData map: { dayNumber: ['you', 'sister'] }
      let newActivityData = {};
      let youTotal = 0;
      let sisterTotal = 0;

      if (workouts) {
        workouts.forEach(w => {
          const wDate = new Date(w.completed_at);
          const dayNum = wDate.getDate();
          
          if (!newActivityData[dayNum]) {
            newActivityData[dayNum] = [];
          }

          if (w.user_id === youProfile.id) {
            if (!newActivityData[dayNum].includes('you')) newActivityData[dayNum].push('you');
            youTotal++;
          } else if (w.user_id === sisterProfile.id) {
            if (!newActivityData[dayNum].includes('sister')) newActivityData[dayNum].push('sister');
            sisterTotal++;
          }
        });
      }

      youProfile.total = youTotal;
      sisterProfile.total = sisterTotal;

      // 3. (Optional) Fetch streak exactly like Home.jsx for both users here. 
      // For now, we will just display 0 if we don't recalculate it, or we could fetch all workouts.
      // To keep it simple, we'll leave streak at 0 for now unless you want the full query.

      setProfiles({ you: youProfile, sister: sisterProfile });
      setActivityData(newActivityData);
      
    } catch (error) {
      console.error(error);
    }
    
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="page-header mb-2">
        <h1 className="page-title">Consistency</h1>
        <p className="text-muted">Track your progress and build habits.</p>
      </header>
      
      <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
        
        {/* Main Calendar View */}
        <div className="card" style={{ flex: '2 1 400px' }}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <CalendarIcon className="text-accent" />
              <h2 style={{ fontSize: '1.25rem' }}>
                {currentDate.toLocaleString('default', { month: 'long' })} {currentDate.getFullYear()}
              </h2>
            </div>
            <div className="flex gap-2">
              <button onClick={prevMonth} className="btn btn-secondary" style={{ padding: '0.5rem' }}><ChevronLeft size={20} /></button>
              <button onClick={nextMonth} className="btn btn-secondary" style={{ padding: '0.5rem' }}><ChevronRight size={20} /></button>
            </div>
          </div>

          {loading ? (
             <div className="flex justify-center p-12 text-muted">
               <Loader2 className="animate-spin" size={32} />
             </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '0.5rem',
              textAlign: 'center'
            }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-muted" style={{ fontWeight: 600, paddingBottom: '0.5rem' }}>{day}</div>
              ))}
              
              {blanks.map(blank => (
                <div key={`blank-${blank}`} style={{ padding: '1rem', background: 'transparent' }} />
              ))}
              
              {days.map(day => {
                const dayData = activityData[day] || [];
                const youCompleted = dayData.includes('you');
                const sisterCompleted = dayData.includes('sister');
                const hasActivity = dayData.length > 0;
                
                const today = new Date();
                const isToday = day === today.getDate() && 
                                currentDate.getMonth() === today.getMonth() && 
                                currentDate.getFullYear() === today.getFullYear();
                
                return (
                  <div 
                    key={day} 
                    style={{ 
                      padding: '1rem 0',
                      borderRadius: 'var(--border-radius)',
                      backgroundColor: hasActivity ? 'var(--bg-elevated)' : 'transparent',
                      border: isToday ? '2px solid var(--accent-primary)' : hasActivity ? '1px solid var(--border-color)' : '1px solid transparent',
                      color: hasActivity ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: hasActivity || isToday ? 'bold' : 'normal',
                      position: 'relative'
                    }}
                  >
                    {day}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '4px', height: '6px' }}>
                      {youCompleted && (
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: profiles.you.color }} title={profiles.you.name} />
                      )}
                      {sisterCompleted && (
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: profiles.sister.color }} title={profiles.sister.name} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar: Leaderboard */}
        <div style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div className="card" style={{ borderLeft: `4px solid ${profiles.you.color}` }}>
            <div className="flex items-center gap-2 mb-4">
              <User size={20} style={{ color: profiles.you.color }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{profiles.you.name}</h3>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted">Active Streak</span>
              <div className="flex items-center gap-1">
                <Flame size={16} className="text-accent" />
                <strong>🔥</strong>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted">This Month</span>
              <div className="flex items-center gap-1">
                <CheckCircle size={16} className="text-success" style={{ color: 'var(--success-color)' }} />
                <strong>{profiles.you.total}</strong>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderLeft: `4px solid ${profiles.sister.color}` }}>
            <div className="flex items-center gap-2 mb-4">
              <User size={20} style={{ color: profiles.sister.color }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{profiles.sister.name}</h3>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted">Active Streak</span>
              <div className="flex items-center gap-1">
                <Flame size={16} style={{ color: profiles.sister.color }} />
                <strong>🔥</strong>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted">This Month</span>
              <div className="flex items-center gap-1">
                <CheckCircle size={16} className="text-success" style={{ color: 'var(--success-color)' }} />
                <strong>{profiles.sister.total}</strong>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
