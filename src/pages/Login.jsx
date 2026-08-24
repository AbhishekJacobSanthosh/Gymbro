import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Dumbbell } from 'lucide-react';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState('');

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Check your email for the login link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage('');
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (error) {
      setMessage(error.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Left Side: Login */}
      <div style={{ flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <div className="flex flex-col mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Dumbbell className="text-accent" size={40} />
              <h2 className="page-title" style={{ fontSize: '2rem', marginBottom: 0 }}>GymBro</h2>
            </div>
            <p className="text-muted" style={{ fontSize: '1.1rem' }}>
              {isSignUp ? 'Create an account to start tracking.' : 'Welcome back! Securely log in to continue.'}
            </p>
          </div>
          
          <div className="flex flex-col gap-4">
            <button 
              onClick={handleGoogleLogin}
              className="btn" 
              disabled={loading} 
              style={{ 
                padding: '0.85rem', 
                fontSize: '1rem',
                backgroundColor: '#ffffff',
                color: '#000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                border: '1px solid #ddd'
              }}
            >
              <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
              Continue with Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', margin: '1rem 0' }}>
              <hr style={{ flex: 1, borderColor: 'var(--border-color)' }} />
              <span style={{ padding: '0 1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>or</span>
              <hr style={{ flex: 1, borderColor: 'var(--border-color)' }} />
            </div>

            <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
              <div>
                <label className="text-muted mb-2 block" style={{ fontSize: '0.9rem', fontWeight: 600 }}>Email</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  required
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ padding: '0.85rem', fontSize: '1rem' }}
                />
              </div>
              <div>
                <label className="text-muted mb-2 block" style={{ fontSize: '0.9rem', fontWeight: 600 }}>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  required
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ padding: '0.85rem', fontSize: '1rem' }}
                />
              </div>
              
              {message && <div style={{ color: message.includes('Check') ? 'var(--success-color)' : 'var(--danger-color)', fontSize: '0.9rem', textAlign: 'center' }}>{message}</div>}
              
              <button className="btn btn-primary mt-2" type="submit" disabled={loading} style={{ padding: '0.85rem', fontSize: '1rem' }}>
                {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <div className="mt-4" style={{ textAlign: 'center' }}>
              <p className="text-muted">
                {isSignUp ? "Already have an account? " : "Don't have an account? "}
                <button
                  onClick={() => { setIsSignUp(!isSignUp); setMessage(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  {isSignUp ? 'Sign In' : "Sign Up"}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right Side: Image/Graphics */}
      <div style={{ 
        flex: '1.2', 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        borderLeft: '1px solid var(--border-color)',
        overflow: 'hidden'
      }}>
        {/* Background Image */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundImage: 'url(/gym-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.6) contrast(1.1)',
        }}></div>
        
        {/* Overlay gradient */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(135deg, rgba(18,18,18,0.8) 0%, rgba(255,123,84,0.1) 100%)',
        }}></div>

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '3rem' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 800, color: '#fff', marginBottom: '1rem', textShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
            Track Together.<br/>Grow Together.
          </h1>
          <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.8)', maxWidth: '400px', margin: '0 auto' }}>
            Stay consistent, push your limits, and celebrate PRs with your sibling.
          </p>
        </div>
      </div>
    </div>
  );
}
