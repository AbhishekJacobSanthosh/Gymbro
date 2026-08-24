import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Home, Dumbbell, Calendar as CalendarIcon, LogOut, ClipboardList } from 'lucide-react';
import { supabase } from './lib/supabase';

// Pages
import HomePage from './pages/Home';
import WorkoutsPage from './pages/Workouts';
import TemplatesPage from './pages/Templates';
import CalendarPage from './pages/Calendar';
import LoginPage from './pages/Login';
import ProfilePage from './pages/Profile';
import { User } from 'lucide-react';

function Sidebar({ onLogout }) {
  const location = useLocation();
  
  return (
    <aside className="sidebar">
      <div className="flex items-center gap-2 px-4 mb-4">
        <Dumbbell className="text-accent" size={28} />
        <h1 className="page-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>GymBro</h1>
      </div>
      
      <nav className="sidebar-nav">
        <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
          <Home size={20} />
          <span>Dashboard</span>
        </Link>
        <Link to="/templates" className={`nav-item ${location.pathname === '/templates' ? 'active' : ''}`}>
          <ClipboardList size={20} />
          <span>Planner</span>
        </Link>
        <Link to="/workouts" className={`nav-item ${location.pathname === '/workouts' ? 'active' : ''}`}>
          <Dumbbell size={20} />
          <span>Today</span>
        </Link>
        <Link to="/calendar" className={`nav-item ${location.pathname === '/calendar' ? 'active' : ''}`}>
          <CalendarIcon size={20} />
          <span>Consistency</span>
        </Link>
        <Link to="/profile" className={`nav-item ${location.pathname === '/profile' ? 'active' : ''}`}>
          <User size={20} />
          <span>Profile</span>
        </Link>
      </nav>
      
      <div style={{ marginTop: 'auto', padding: '1rem' }}>
        <button onClick={onLogout} className="nav-item" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left' }}>
          <LogOut size={20} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return <div className="app-container flex items-center justify-center">Loading...</div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <BrowserRouter>
      <div className="app-container">
        <Sidebar onLogout={handleLogout} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage session={session} />} />
            <Route path="/templates" element={<TemplatesPage session={session} />} />
            <Route path="/workouts" element={<WorkoutsPage session={session} />} />
            <Route path="/calendar" element={<CalendarPage session={session} />} />
            <Route path="/profile" element={<ProfilePage session={session} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
