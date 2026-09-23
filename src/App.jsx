import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Home, Dumbbell, Calendar as CalendarIcon, LogOut, ClipboardList, User, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { supabase } from './lib/supabase';
import './App.css';

// Pages
import HomePage from './pages/Home';
import WorkoutsPage from './pages/Workouts';
import TemplatesPage from './pages/Templates';
import CalendarPage from './pages/Calendar';
import LoginPage from './pages/Login';
import ProfilePage from './pages/Profile';

// ---- Toast Context ----
const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, exiting: false }]);

    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 250);
    }, duration);
  }, []);

  // Make toast callable as toast.success(), etc.
  const toastApi = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    info: (msg) => addToast(msg, 'info'),
  };

  const icons = {
    success: <CheckCircle size={16} />,
    error: <AlertCircle size={16} />,
    info: <Info size={16} />,
  };

  return (
    <ToastContext.Provider value={toastApi}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type} ${t.exiting ? 'toast-exit' : ''}`}>
            {icons[t.type]}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}


// ---- Sidebar / Navigation ----
function Sidebar({ onLogout }) {
  const location = useLocation();

  const navItems = [
    { to: '/', icon: Home, label: 'Dashboard' },
    { to: '/templates', icon: ClipboardList, label: 'Planner' },
    { to: '/workouts', icon: Dumbbell, label: 'Today' },
    { to: '/calendar', icon: CalendarIcon, label: 'Consistency' },
    { to: '/profile', icon: User, label: 'Profile' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Dumbbell className="sidebar-brand-icon" size={26} />
        <span className="sidebar-brand-text">GymBro</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className={`nav-item ${location.pathname === to ? 'active' : ''}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          onClick={onLogout}
          className="nav-item w-full"
        >
          <LogOut size={20} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}


// ---- Page Wrapper ----
function PageWrapper({ children }) {
  const location = useLocation();

  return (
    <div className="page-transition" key={location.pathname}>
      {children}
    </div>
  );
}


// ---- Loading Screen ----
function LoadingScreen() {
  return (
    <div className="loading-screen">
      <Dumbbell size={40} className="loading-logo" />
      <div className="loading-dots">
        <div className="loading-dot" />
        <div className="loading-dot" />
        <div className="loading-dot" />
      </div>
    </div>
  );
}


// ---- App ----
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
    return <LoadingScreen />;
  }

  if (!session) {
    return (
      <ToastProvider>
        <LoginPage />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className="app-container">
          <Sidebar onLogout={handleLogout} />
          <main className="main-content">
            <PageWrapper>
              <Routes>
                <Route path="/" element={<HomePage session={session} />} />
                <Route path="/templates" element={<TemplatesPage session={session} />} />
                <Route path="/workouts" element={<WorkoutsPage session={session} />} />
                <Route path="/calendar" element={<CalendarPage session={session} />} />
                <Route path="/profile" element={<ProfilePage session={session} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </PageWrapper>
          </main>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
