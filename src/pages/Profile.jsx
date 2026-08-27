import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, Save, LogOut, Loader2, Mail } from 'lucide-react';
import { useToast } from '../App';

export default function Profile({ session }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    let ignore = false;
    async function getProfile() {
      setLoading(true);
      const { user } = session;

      const { data, error } = await supabase
        .from('profiles')
        .select(`display_name`)
        .eq('id', user.id)
        .single();

      if (!ignore) {
        if (error) {
          console.warn(error);
        } else if (data) {
          setDisplayName(data.display_name || '');
        }
      }
      setLoading(false);
    }

    getProfile();
    return () => { ignore = true; };
  }, [session]);

  const updateProfile = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { user } = session;

      const updates = {
        id: user.id,
        display_name: displayName,
        updated_at: new Date(),
      };

      const { error } = await supabase.from('profiles').upsert(updates);

      if (error) throw error;
      toast?.success('Profile updated successfully!');
    } catch (error) {
      toast?.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const getInitial = () => {
    if (displayName) return displayName.charAt(0).toUpperCase();
    if (session?.user?.email) return session.user.email.charAt(0).toUpperCase();
    return '?';
  };

  return (
    <div className="flex-col gap-5 stagger-children" style={{ display: 'flex' }}>
      <header className="page-header">
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">Customize how you appear on the leaderboard and calendar.</p>
      </header>

      <div className="card" style={{ maxWidth: '480px' }}>
        {/* Avatar & Info */}
        <div className="flex items-center gap-5 mb-8">
          <div className="profile-avatar">
            <div className="profile-avatar-inner">
              {loading ? (
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
              ) : (
                <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>{getInitial()}</span>
              )}
            </div>
          </div>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
              {loading ? (
                <span className="skeleton skeleton-text" style={{ width: '120px', display: 'inline-block' }} />
              ) : (
                displayName || 'Set your name'
              )}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Mail size={13} style={{ color: 'var(--text-tertiary)' }} />
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                {session?.user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={updateProfile} className="flex-col gap-5" style={{ display: 'flex' }}>
          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input
              type="text"
              placeholder="e.g. John or Sis"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="form-hint">This is how others will see you on the calendar and activity feed.</p>
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={saving || loading}
            style={{ alignSelf: 'flex-start' }}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Save Profile</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Sign Out Section — visible on mobile where it's hidden from nav */}
      <div className="card signout-card" style={{ maxWidth: '480px' }}>
        <style>{`
          .signout-card { display: none; }
          @media (max-width: 640px) { .signout-card { display: block !important; } }
        `}</style>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Sign Out</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
              You'll need to sign in again next time.
            </p>
          </div>
          <button onClick={handleLogout} className="btn btn-danger btn-sm">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
