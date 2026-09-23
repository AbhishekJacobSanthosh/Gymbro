import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Dumbbell, Loader2 } from 'lucide-react';

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
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        
        if (!data?.session) {
          setMessage('success:Check your email for the login link!');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage('error:' + error.message);
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
      setMessage('error:' + error.message);
      setLoading(false);
    }
  };

  const isSuccess = message.startsWith('success:');
  const messageText = message.replace(/^(success|error):/, '');

  return (
    <div className="login-container">
      {/* Hero Section — sticky background */}
      <div className="login-hero">
        <div className="login-hero-bg" />
        <div className="login-hero-overlay" />

        <div className="login-hero-content">
          <h1 className="login-hero-title">
            Track Together.<br />Grow Together.
          </h1>
          <p className="login-hero-subtitle">
            Stay consistent, push your limits, and celebrate PRs with your training partner.
          </p>
          <div className="login-scroll-indicator">
            <p style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Swipe up to login</p>
            <div className="bounce-arrow">↓</div>
          </div>
        </div>
      </div>

      {/* Form Section — slides over hero */}
      <div className="login-form-section">
        <div className="login-form-wrapper animate-fade-in-up">
          {/* Brand */}
          <div className="login-brand">
            <Dumbbell className="text-accent" size={36} />
            <span className="login-brand-text">GymBro</span>
          </div>

          <p className="login-welcome">
            {isSignUp
              ? 'Create an account to start tracking your workouts.'
              : 'Welcome back! Sign in to continue your streak.'}
          </p>

          {/* Google OAuth */}
          <button
            onClick={handleGoogleLogin}
            className="google-btn"
            disabled={loading}
          >
            <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="login-divider">
            <span>or</span>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailAuth} className="flex-col gap-5" style={{ display: 'flex' }}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                required
                minLength={6}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {messageText && (
              <div className={isSuccess ? 'login-success' : 'login-error'}>
                {messageText}
              </div>
            )}

            <button
              className="btn btn-primary btn-lg w-full"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Please wait...</span>
                </>
              ) : (
                isSignUp ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          {/* Toggle Sign Up / Sign In */}
          <div className="login-toggle">
            <span>{isSignUp ? 'Already have an account? ' : "Don't have an account? "}</span>
            <button
              onClick={() => { setIsSignUp(!isSignUp); setMessage(''); }}
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
