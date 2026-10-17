import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Save, LogOut, Loader2, Mail, Medal, Award, Snowflake, Check, Plus } from 'lucide-react';
import { useToast } from '../App';
import { calculateStreak, getActiveTemplates, getRestDays, getLevelProgress } from '../lib/utils';
import { confirmSignOut } from '../lib/offline';
import { applyAccent, saveAccent, loadSavedAccent, normalizeHex, readableAccent } from '../lib/theme';

// Quick picks: bright enough on black as they are
const PRESETS = ['#ff7854', '#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#0a84ff', '#bf5af2'];

let hasLoadedOnce = false;

export default function Profile({ session }) {
  const toast = useToast();
  const [loading, setLoading] = useState(!hasLoadedOnce);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [color, setColor] = useState(loadSavedAccent);
  const [hexDraft, setHexDraft] = useState(() => loadSavedAccent().toUpperCase());
  const [achievements, setAchievements] = useState([]);
  const [gracePeriodsRemaining, setGracePeriodsRemaining] = useState(3);

  // The whole app previews the colour while you pick; leaving without saving restores the saved one
  useEffect(() => { applyAccent(color); }, [color]);
  useEffect(() => () => { applyAccent(loadSavedAccent()); }, []);

  const pickColor = (value) => {
    const hex = normalizeHex(value);
    if (!hex) return;
    setColor(hex);
    setHexDraft(hex.toUpperCase());
  };

  const handleHexChange = (value) => {
    setHexDraft(value.toUpperCase());
    const hex = normalizeHex(value);
    if (hex) setColor(hex);
  };

  const readable = readableAccent(color);
  const wasAdjusted = readable !== color;

  useEffect(() => {
    let ignore = false;
    async function getProfile() {
      if (!hasLoadedOnce) setLoading(true);
      const { user } = session;

      const { data, error } = await supabase
        .from('profiles')
        .select(`display_name, xp, level, color`)
        .eq('id', user.id)
        .single();

      const { data: achData } = await supabase
        .from('achievements')
        .select('*')
        .eq('user_id', user.id)
        .order('achieved_at', { ascending: false });

      // Fetch all workouts to calculate grace periods remaining this month
      const { data: allWorkouts } = await supabase
        .from('workouts')
        .select('id, completed, completed_at, is_rest_day, day_of_week, created_at, routine_name')
        .eq('user_id', user.id);

      let usedGrace = 0;
      if (allWorkouts && allWorkouts.length > 0) {
        const restDaysOfWeek = getRestDays(getActiveTemplates(allWorkouts));
        const completedHistory = allWorkouts.filter(w => w.completed);
        usedGrace = calculateStreak(completedHistory, restDaysOfWeek, 3).shieldsUsed;
      }

      if (!ignore) {
        if (error) {
          console.warn(error);
        } else if (data) {
          setDisplayName(data.display_name || '');
          setXp(data.xp || 0);
          setLevel(data.level || 1);
          if (data.color) pickColor(data.color);
        }
        if (achData) {
          setAchievements(achData);
        }
        setGracePeriodsRemaining(Math.max(0, 3 - usedGrace));
      }
      hasLoadedOnce = true;
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

      // Plain update: the sign-up trigger always creates the row, and xp/level are not client-writable
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || null, // '' would clash with the UNIQUE constraint
          color: readable, // the adjusted colour, so it also reads well on everyone's calendar
          updated_at: new Date(),
        })
        .eq('id', user.id);

      if (error) throw error;
      saveAccent(readable);
      pickColor(readable);
      toast?.success('Profile saved');
    } catch (error) {
      toast?.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    if (!confirmSignOut(session.user.id)) return;
    await supabase.auth.signOut();
  };

  const getInitial = () => {
    if (displayName) return displayName.charAt(0).toUpperCase();
    if (session?.user?.email) return session.user.email.charAt(0).toUpperCase();
    return '?';
  };

  return (
    <div className="flex-col gap-5" style={{ display: 'flex' }}>
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
          <div style={{ flex: 1 }}>
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

            {/* Gamification Stats */}
            {!loading && (
              <div style={{ marginTop: 'var(--space-4)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                <div className="flex justify-between items-center mb-2">
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent)' }}>Level {level}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{xp} XP total</span>
                </div>
                <div style={{ height: '6px', backgroundColor: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: `${getLevelProgress(xp, level).progress}%`,
                    backgroundColor: 'var(--accent)', 
                    borderRadius: '3px' 
                  }} />
                </div>
                <div className="flex justify-between items-center" style={{ marginTop: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                    <Snowflake size={12} /> {gracePeriodsRemaining} Shield{gracePeriodsRemaining !== 1 ? 's' : ''} Left this Month
                  </div>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                    Next level: {getLevelProgress(xp, level).nextLevelXp} XP
                  </p>
                </div>
              </div>
            )}
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

          <fieldset className="form-group accent-picker">
            <legend className="form-label">Your colour</legend>
            <div className="swatches">
              {PRESETS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`swatch ${color === c ? 'selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => pickColor(c)}
                  aria-label={`Use colour ${c}`}
                  aria-pressed={color === c}
                />
              ))}
              {/* The phone's own colour picker: spectrum, sliders and eyedropper */}
              <label
                className={`swatch swatch-custom ${PRESETS.includes(color) ? '' : 'selected'}`}
                style={PRESETS.includes(color) ? undefined : { backgroundColor: color }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => pickColor(e.target.value)}
                  aria-label="Pick any colour"
                />
                {PRESETS.includes(color) && <Plus size={16} />}
              </label>
            </div>

            <div className="accent-hex">
              <label htmlFor="accent-hex" className="sr-only">Hex code</label>
              <span className="accent-hex-dot" style={{ backgroundColor: readable }} />
              <input
                id="accent-hex"
                type="text"
                value={hexDraft}
                onChange={(e) => handleHexChange(e.target.value)}
                maxLength={7}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="#FF7854"
                aria-invalid={!normalizeHex(hexDraft)}
              />
            </div>

            <div className="accent-preview" aria-hidden="true">
              <span className="accent-preview-check"><Check size={14} strokeWidth={3} /></span>
              <span className="num accent-preview-set">82.5 kg × 8</span>
              <span className="btn btn-primary btn-sm">Finish workout</span>
            </div>

            <p className="form-hint">
              {!normalizeHex(hexDraft)
                ? 'Enter a 6-digit hex code, like #3B82F6.'
                : wasAdjusted
                  ? `Lightened to ${readable.toUpperCase()} so it stays readable on black.`
                  : 'Colours the whole app for you, and marks you on the calendar for everyone.'}
            </p>
          </fieldset>

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

      {/* Achievements Section */}
      <div className="card" style={{ maxWidth: '480px' }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="stat-icon" style={{ backgroundColor: 'var(--warning-soft)', width: '36px', height: '36px' }}>
            <Award size={18} style={{ color: 'var(--warning)' }} />
          </div>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>Achievements</h2>
        </div>

        {loading ? (
          <div className="flex justify-center" style={{ padding: 'var(--space-4) 0' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        ) : achievements.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-4) 0' }}>
            <Medal size={28} className="empty-state-icon" />
            <p className="empty-state-text">No achievements yet. Keep grinding!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
            {achievements.map((ach) => (
              <div key={ach.id} style={{ 
                padding: 'var(--space-3)', 
                backgroundColor: 'var(--bg-elevated)', 
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)'
              }}>
                <div style={{ 
                  backgroundColor: 'var(--warning-soft)', 
                  width: '40px', height: '40px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Medal size={20} style={{ color: 'var(--warning)' }} />
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{ach.badge_name}</p>
                  {ach.description && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{ach.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
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
