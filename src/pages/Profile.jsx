import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, Save } from 'lucide-react';

export default function Profile({ session }) {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');

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
    setLoading(true);
    setMessage('');

    try {
      const { user } = session;

      const updates = {
        id: user.id,
        display_name: displayName,
        updated_at: new Date(),
      };

      const { error } = await supabase.from('profiles').upsert(updates);

      if (error) throw error;
      setMessage('Profile updated successfully!');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="page-header mb-4">
        <h1 className="page-title">Profile</h1>
        <p className="text-muted">Customize how you appear on the leaderboard and calendar.</p>
      </header>

      <div className="card" style={{ maxWidth: '500px' }}>
        <div className="flex items-center gap-4 mb-6">
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={32} className="text-accent" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>Your Information</h2>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>{session?.user?.email}</p>
          </div>
        </div>

        <form onSubmit={updateProfile} className="flex flex-col gap-4">
          <div>
            <label className="text-muted mb-2 block" style={{ fontSize: '0.9rem', fontWeight: 600 }}>Display Name</label>
            <input
              type="text"
              placeholder="e.g. John or Sis"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{ padding: '0.75rem 1rem' }}
            />
          </div>

          {message && (
            <div style={{ color: message.includes('success') ? 'var(--success-color)' : 'var(--danger-color)', fontSize: '0.9rem' }}>
              {message}
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ alignSelf: 'flex-start', marginTop: '1rem' }}>
            <Save size={18} />
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
