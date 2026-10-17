import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Home, Dumbbell, Calendar as CalendarIcon, LogOut, ClipboardList, User, CheckCircle, AlertCircle, Info, CloudOff } from 'lucide-react';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { getQueued, getFailed, flushOutbox, retryFailed, confirmSignOut } from './lib/offline';
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
  const toastApi = useMemo(() => ({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    info: (msg) => addToast(msg, 'info'),
  }), [addToast]);

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


// ---- Offline sync: uploads finished workouts and shows what is still waiting ----
function SyncStatus({ userId, online }) {
  const toast = useToast();
  const [pending, setPending] = useState(() => ({ queued: getQueued(userId).length, failed: getFailed(userId).length }));

  useEffect(() => {
    const update = () => setPending({ queued: getQueued(userId).length, failed: getFailed(userId).length });
    update();
    window.addEventListener('gymbro:outbox', update);
    return () => window.removeEventListener('gymbro:outbox', update);
  }, [userId]);

  // Upload on open, when signal comes back, and when the app returns to the foreground
  useEffect(() => {
    if (!online) return;
    const flush = () => flushOutbox(userId);
    const onVisible = () => { if (document.visibilityState === 'visible') flush(); };
    flush();
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, online]);

  // iPhone doesn't always report signal coming back, so keep trying while something is waiting
  useEffect(() => {
    if (!online || pending.queued === 0) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') flushOutbox(userId);
    }, 30000);
    return () => clearInterval(interval);
  }, [userId, online, pending.queued]);

  useEffect(() => {
    const onSynced = (e) => {
      const { routineName, xpGained, earnedAchievements } = e.detail;
      toast.success(`☁️ ${routineName} synced! +${xpGained} XP`);
      earnedAchievements.forEach(ach => {
        setTimeout(() => toast.success(`🏅 Achievement Unlocked: ${ach.badge_name}!`), 1000);
      });
    };
    window.addEventListener('gymbro:synced', onSynced);
    return () => window.removeEventListener('gymbro:synced', onSynced);
  }, [toast]);

  if (pending.queued === 0 && pending.failed === 0) return null;

  const plural = (n) => `${n} workout${n === 1 ? '' : 's'}`;
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
      <CloudOff size={16} />
      {pending.queued > 0 && (
        <span>{plural(pending.queued)} waiting to sync{online ? '' : ". It'll upload when you have signal"}.</span>
      )}
      {pending.failed > 0 && (
        <>
          <span style={{ color: 'var(--error)' }}>{plural(pending.failed)} couldn't sync.</span>
          <button className="btn btn-secondary btn-sm" onClick={() => retryFailed(userId)} disabled={!online}>Retry</button>
        </>
      )}
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
// The last signed-in user, so the app still opens offline after the login token expires
const LAST_USER_KEY = 'gymbro:lastUser';
function readLastUser() {
  try { return JSON.parse(localStorage.getItem(LAST_USER_KEY)); } catch { return null; }
}
function writeLastUser(user) {
  try {
    if (user) localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: user.id, email: user.email }));
    else localStorage.removeItem(LAST_USER_KEY);
  } catch { /* storage unavailable: offline start just won't work */ }
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session) {
        // Same token: keep the same object, so pages don't reload their data on every app switch
        setSession(prev => prev?.access_token === session.access_token ? prev : session);
      } else if (isAuthRetryableFetchError(error)) {
        // Offline with an expired login: Supabase keeps the refresh token, so stay signed in
        // with the cached user and refresh once signal is back
        const user = readLastUser();
        setSession(prev => prev?.offline ? prev : (user ? { user, offline: true } : null));
      } else {
        setSession(null);
      }
      setLoading(false);
    };
    restore();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setSession(session);
        writeLastUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        writeLastUser(null);
      }
    });

    // Coming back online or to the foreground: renew an offline login
    const onVisible = () => { if (document.visibilityState === 'visible') restore(); };
    window.addEventListener('online', restore);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', restore);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handleLogout = async () => {
    if (!confirmSignOut(session.user.id)) return;
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
              <SyncStatus userId={session.user.id} online={!session.offline} />
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
