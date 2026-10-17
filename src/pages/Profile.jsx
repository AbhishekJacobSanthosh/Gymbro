import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Save, LogOut, Loader2, Medal, Snowflake, Check, Plus } from 'lucide-react';
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

  const { progress, nextLevelXp } = getLevelProgress(xp, level);

  return (
    <div className="profile">
      <header className="profile-hero">
        <div className="profile-avatar">
          <div className="profile-avatar-inner">
            {loading ? <Loader2 size={24} className="animate-spin" /> : <span>{getInitial()}</span>}
          </div>
        </div>
        <div className="profile-hero-text">
          <h1 className="page-title">{displayName || 'Your profile'}</h1>
          <p className="page-subtitle">{session?.user?.email}</p>
        </div>
      </header>

      <section className="panel profile-level" aria-label="Level">
        <div className="profile-level-row">
          <span className="profile-level-label">Level <strong className="num">{level}</strong></span>
          <span className="num profile-level-xp">{xp} / {nextLevelXp} XP</span>
        </div>
        <div className="today-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label="Progress to next level">
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className="profile-shields">
          <Snowflake size={14} aria-hidden="true" /> {gracePeriodsRemaining} shield{gracePeriodsRemaining === 1 ? '' : 's'} left this month
        </p>
      </section>

      <form onSubmit={updateProfile} className="profile-form">
        <div className="form-group">
          <label className="form-label" htmlFor="display-name">Name</label>
          <input
            id="display-name"
            type="text"
            placeholder="e.g. John or Sis"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
          />
          <p className="form-hint">How friends see you on the calendar and in the feed.</p>
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

        <button className="btn btn-primary btn-lg" type="submit" disabled={saving || loading}>
          {saving ? <><Loader2 size={18} className="animate-spin" /> Saving</> : <><Save size={18} /> Save profile</>}
        </button>
      </form>

      <section aria-labelledby="badges-title">
        <h2 id="badges-title" className="section-title">Achievements</h2>
        {loading ? (
          <div className="empty-state">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        ) : achievements.length === 0 ? (
          <p className="panel plan-empty">No badges yet. Finish workouts to earn them.</p>
        ) : (
          <ul className="grouped-list">
            {achievements.map((ach) => (
              <li key={ach.id} className="badge-row">
                <span className="badge-icon" aria-hidden="true"><Medal size={20} /></span>
                <span className="badge-text">
                  <strong>{ach.badge_name}</strong>
                  {ach.description && <span>{ach.description}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button onClick={handleLogout} className="btn btn-secondary btn-lg profile-signout">
        <LogOut size={18} /> Sign out
      </button>
    </div>
  );
}
