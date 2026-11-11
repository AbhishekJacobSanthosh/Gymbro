export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Gamification utilities
// XP itself is calculated in the database (award_workout_xp); keep these formulas in sync with supabase_schema.sql.
export function getLevelProgress(xp, level) {
  const currentLevelXp = Math.pow(level - 1, 2) * 100;
  const nextLevelXp = Math.pow(level, 2) * 100;
  let progress = 0;
  if (nextLevelXp > currentLevelXp) {
    progress = ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
  }
  return {
    progress: Math.min(100, Math.max(0, progress)),
    nextLevelXp
  };
}

// First number in a reps string: "8-10" -> 8, "x10" -> 10, "AMRAP" -> 0
export function parseReps(reps) {
  const match = String(reps ?? '').match(/\d+/);
  return match ? parseInt(match[0]) : 0;
}

// Total kg moved. Logged sets win over the planned sets x reps x weight.
export function calculateVolume(exercises) {
  let total = 0;
  for (const ex of exercises || []) {
    const loggedSets = ex.logged_sets ? Object.values(ex.logged_sets) : [];
    if (loggedSets.length > 0) {
      loggedSets.forEach(set => { total += parseReps(set.reps) * (parseFloat(set.weight) || 0); });
    } else {
      total += (parseInt(ex.sets) || 0) * parseReps(ex.reps) * (parseFloat(ex.weight) || 0);
    }
  }
  return total;
}

// ---- Cardio ----
// pace: how speed is shown. per: metres for "time per distance" (min/km, /500 m, /100 m); 'kmh' for speed.
// unit: what distance is typed in (stored as km either way). level: label for incline/level under "More".
export const ACTIVITIES = [
  { id: 'run', label: 'Run', distance: true, unit: 'km', pace: 1000, level: 'Incline %' },
  { id: 'walk', label: 'Walk', distance: true, unit: 'km', pace: 1000, level: 'Incline %' },
  { id: 'cycle', label: 'Cycle', distance: true, unit: 'km', pace: 'kmh', level: 'Level' },
  { id: 'row', label: 'Row', distance: true, unit: 'm', pace: 500, level: 'Level' },
  { id: 'swim', label: 'Swim', distance: true, unit: 'm', pace: 100 },
  { id: 'elliptical', label: 'Elliptical', distance: false, level: 'Level' },
  { id: 'stairs', label: 'Stairs', distance: false, level: 'Level' },
  { id: 'jump_rope', label: 'Jump rope', distance: false },
  { id: 'hiit', label: 'HIIT', distance: false },
];
export const EFFORTS = ['Easy', 'Moderate', 'Hard', 'All-out']; // stored as 1-4

export const getActivity = (id) => ACTIVITIES.find(a => a.id === id) ?? null;

// "Morning run" -> run. Used when a cardio exercise is added or swapped by name only.
export function activityFromName(name) {
  const n = String(name ?? '').toLowerCase();
  const words = { run: 'run', jog: 'run', treadmill: 'run', walk: 'walk', hike: 'walk', cycl: 'cycle', bike: 'cycle',
    spin: 'cycle', row: 'row', erg: 'row', swim: 'swim', elliptical: 'elliptical', cross: 'elliptical',
    stair: 'stairs', step: 'stairs', rope: 'jump_rope', skip: 'jump_rope', hiit: 'hiit', interval: 'hiit', tabata: 'hiit' };
  return Object.entries(words).find(([word]) => n.includes(word))?.[1] ?? null;
}

// Rows saved before cardio had a kind: no sets but some minutes
export const isCardio = (ex) => ex?.kind ? ex.kind === 'cardio' : !(parseInt(ex?.sets) > 0) && parseInt(ex?.minutes) > 0;

// "25:10", "1:02:03", or a plain number of minutes ("30") -> seconds. Empty or invalid -> null.
export function parseDuration(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 60);
  if (!/^\d+(:\d{1,2}){1,2}$/.test(s)) return null;
  return s.split(':').reduce((total, part) => total * 60 + parseInt(part), 0);
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// "5:02 /km", "24.3 km/h", "1:58 /500 m". Null without both distance and time.
export function formatPace(activityId, distanceKm, seconds) {
  const activity = getActivity(activityId);
  const km = parseFloat(distanceKm) || 0;
  if (!activity?.pace || km <= 0 || !(seconds > 0)) return null;
  if (activity.pace === 'kmh') return `${(km / (seconds / 3600)).toFixed(1)} km/h`;
  const per = activity.pace === 1000 ? 'km' : `${activity.pace} m`;
  return `${formatDuration(seconds / (km * 1000 / activity.pace))} /${per}`;
}

// Typed distance in the activity's unit <-> stored km
export const distanceToKm = (activityId, value) => {
  const n = parseFloat(value);
  if (!(n > 0)) return null;
  return getActivity(activityId)?.unit === 'm' ? n / 1000 : n;
};
export const distanceForInput = (activityId, km) => {
  if (!(km > 0)) return '';
  return getActivity(activityId)?.unit === 'm' ? String(Math.round(km * 1000)) : String(+km.toFixed(2));
};
export const formatDistance = (activityId, km) => {
  if (!(km > 0)) return null;
  return getActivity(activityId)?.unit === 'm' ? `${Math.round(km * 1000)} m` : `${+km.toFixed(2)} km`;
};

// A plan target: "30 min", "5 km", "8 × 30s on / 30s off"
export function formatCardioTarget(ex) {
  const iv = ex?.intervals;
  if (iv?.rounds > 0 && iv?.work > 0) return `${iv.rounds} × ${iv.work}s on${iv.rest > 0 ? ` / ${iv.rest}s off` : ''}`;
  const parts = [
    formatDistance(ex?.activity, parseFloat(ex?.distance_km)),
    ex?.duration_seconds > 0 ? (ex.duration_seconds % 60 ? formatDuration(ex.duration_seconds) : `${ex.duration_seconds / 60} min`)
      : parseInt(ex?.minutes) > 0 ? `${parseInt(ex.minutes)} min` : null,
  ].filter(Boolean);
  return parts.join(' in ');
}

// Planned seconds for a cardio exercise: the time target, or all the interval rounds
export function cardioTargetSeconds(ex) {
  const iv = ex?.intervals;
  if (iv?.rounds > 0) return iv.rounds * ((iv.work || 0) + (iv.rest || 0));
  if (ex?.duration_seconds > 0) return ex.duration_seconds;
  return (parseInt(ex?.minutes) || 0) * 60;
}

// Last time vs now: "27 s/km faster", "1.2 km/h faster", "3 min longer". Null when there's nothing to compare.
export function cardioComparison(activityId, now, last) {
  if (!last) return null;
  const activity = getActivity(activityId);
  const nowKm = parseFloat(now.distance_km) || 0, lastKm = parseFloat(last.distance_km) || 0;
  if (activity?.pace && nowKm > 0 && lastKm > 0 && now.duration_seconds > 0 && last.duration_seconds > 0) {
    if (activity.pace === 'kmh') {
      const diff = nowKm / (now.duration_seconds / 3600) - lastKm / (last.duration_seconds / 3600);
      if (Math.abs(diff) < 0.05) return 'Same speed as last time';
      return `${Math.abs(diff).toFixed(1)} km/h ${diff > 0 ? 'faster' : 'slower'}`;
    }
    const units = (km) => km * 1000 / activity.pace;
    const diff = Math.round(now.duration_seconds / units(nowKm) - last.duration_seconds / units(lastKm));
    if (diff === 0) return 'Same pace as last time';
    const per = activity.pace === 1000 ? 'km' : `${activity.pace} m`;
    return `${Math.abs(diff)} s/${per} ${diff < 0 ? 'faster' : 'slower'}`;
  }
  if (now.duration_seconds > 0 && last.duration_seconds > 0) {
    const diff = Math.round((now.duration_seconds - last.duration_seconds) / 60);
    if (diff === 0) return 'Same time as last time';
    return `${Math.abs(diff)} min ${diff > 0 ? 'longer' : 'shorter'}`;
  }
  return null;
}

// Last finished cardio session per exercise name: { distance_km, duration_seconds }. `rows` newest first.
export function lastCardioByName(rows) {
  const byName = {};
  for (const row of rows || []) {
    const name = row.name?.trim().toLowerCase();
    if (!name || byName[name] || !isCardio(row)) continue;
    byName[name] = {
      distance_km: parseFloat(row.distance_km) || null,
      duration_seconds: row.duration_seconds ?? ((parseInt(row.minutes) || 0) * 60 || null),
    };
  }
  return byName;
}

// Cardio seconds of one row: the exact time, or whole minutes on older rows
const cardioSeconds = (ex) => ex.duration_seconds ?? (parseInt(ex.minutes) || 0) * 60;

// Minutes of cardio in one workout
export const cardioMinutes = (exercises) =>
  Math.round((exercises || []).filter(isCardio).reduce((sum, ex) => sum + cardioSeconds(ex), 0) / 60);

// Pace only counts over a real distance: 1 km (500 m rowing, 100 m swimming), so a sprint to the bus isn't a PR
const paceMinKm = (activity) => activity.pace === 'kmh' ? 1 : activity.pace / 1000;
const speedOf = (row) => (parseFloat(row.distance_km) || 0) / (cardioSeconds(row) / 3600);

// Best efforts per activity (rows without one are grouped by name), from finished cardio rows.
// [{ key, label, activity, longestKm, fastest: row | null, longestSeconds }], most sessions first.
export function cardioBests(rows) {
  const groups = {};
  for (const row of rows || []) {
    if (!isCardio(row)) continue;
    const activity = getActivity(row.activity);
    const key = row.activity || `name:${row.name?.trim().toLowerCase()}`;
    const g = groups[key] ??= { key, label: activity?.label ?? row.name, activity: row.activity ?? null, sessions: 0, longestKm: 0, fastest: null, longestSeconds: 0 };
    const km = parseFloat(row.distance_km) || 0;
    const seconds = cardioSeconds(row);
    g.sessions++;
    g.longestKm = Math.max(g.longestKm, km);
    g.longestSeconds = Math.max(g.longestSeconds, seconds);
    if (activity?.pace && km >= paceMinKm(activity) && seconds > 0 && (!g.fastest || speedOf(row) > speedOf(g.fastest))) {
      g.fastest = { distance_km: km, duration_seconds: seconds };
    }
  }
  return Object.values(groups).sort((a, b) => b.sessions - a.sessions);
}

// Cardio PRs for one finished exercise against earlier sessions of the same activity.
// Nothing on the first session: there's nothing to beat yet (same as lifting PRs).
export function cardioPRs(ex, pastRows) {
  const past = cardioBests(pastRows)[0];
  if (!past) return [];
  const activity = getActivity(ex.activity);
  const km = parseFloat(ex.distance_km) || 0;
  const seconds = ex.duration_seconds || 0;
  const label = activity?.label ?? ex.name;
  const prs = [];
  if (activity?.distance && km > 0 && past.longestKm > 0 && km > past.longestKm) {
    prs.push({ name: label, text: `longest ${formatDistance(ex.activity, km)}` });
  }
  if (activity?.pace && past.fastest && km >= paceMinKm(activity) && seconds > 0
      && speedOf({ distance_km: km, duration_seconds: seconds }) > speedOf(past.fastest)) {
    prs.push({ name: label, text: `fastest ${formatPace(ex.activity, km, seconds)}` });
  }
  return prs;
}

// HIIT timer: where you are after `elapsed` seconds of rounds of work/rest. No rest after the last round.
export function intervalState({ work, rest, rounds }, elapsed) {
  const total = rounds * work + (rounds - 1) * rest;
  if (elapsed >= total) return { done: true, total, round: rounds, phase: 'work', remaining: 0 };
  const cycle = work + rest;
  const round = Math.floor(elapsed / cycle) + 1;
  const into = elapsed - (round - 1) * cycle;
  return into < work
    ? { done: false, total, round, phase: 'work', remaining: work - into }
    : { done: false, total, round, phase: 'rest', remaining: cycle - into };
}

// When a finished workout is dated: the day it was started, even if Finish is pressed after midnight.
// Past that day it uses the last time something was logged, capped at 23:59:59.999 of the start day.
export function workoutCompletedAt(startedAt, lastActivityAt, now = new Date()) {
  const start = new Date(startedAt ?? now);
  const endOfStartDay = new Date(start);
  endOfStartDay.setHours(23, 59, 59, 999);
  if (now <= endOfStartDay) return new Date(now);
  return new Date(Math.min(new Date(lastActivityAt ?? start).getTime(), endOfStartDay.getTime()));
}

// What you did last time, per exercise name (case-insensitive): [{ reps, weight }] per set.
// `rows` are finished exercises, newest first.
export function lastPerformanceByName(rows) {
  const byName = {};
  for (const row of rows || []) {
    const name = row.name?.trim().toLowerCase();
    if (!name || byName[name] || isCardio(row)) continue;
    const logged = Object.entries(row.logged_sets || {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, set]) => ({ reps: set.reps, weight: set.weight }));
    byName[name] = logged.length > 0
      ? logged
      : Array.from({ length: parseInt(row.sets) || 0 }, () => ({ reps: row.reps, weight: row.weight }));
  }
  return byName;
}

// Starting values for each set's boxes. Weights follow last time set by set, unless the
// planned weight was changed since (it no longer matches last time's heaviest set).
export function plannedSetDrafts(sets, reps, weight, lastSets = []) {
  const top = Math.max(0, ...lastSets.map(set => parseFloat(set.weight) || 0));
  const followLast = lastSets.length > 0 && (parseFloat(weight) || 0) === top;
  return Object.fromEntries(Array.from({ length: parseInt(sets) || 0 }, (_, i) => [i, {
    reps,
    weight: followLast ? (lastSets[i] ?? lastSets[lastSets.length - 1]).weight : weight,
  }]));
}

// "80 × 10", or just "10" for bodyweight
export function formatSet(set) {
  if (!set) return null;
  const weight = parseFloat(set.weight) || 0;
  return weight > 0 ? `${weight} × ${set.reps}` : `${set.reps}`;
}

// After Undo: the same exercises, nothing ticked. What you entered for each set stays in its boxes,
// and the workout counts as started again from now.
export function untickSession(session, now = new Date()) {
  const at = now.toISOString();
  return {
    ...session,
    startedAt: at,
    lastActivityAt: at,
    exercises: session.exercises.map(ex => {
      const drafts = { ...(ex.set_drafts || {}) };
      Object.entries(ex.logged_sets || {}).forEach(([i, set]) => { drafts[i] = { reps: set.reps, weight: set.weight }; });
      return { ...ex, completed: false, logged_sets: null, set_drafts: drafts };
    }),
  };
}

// Whether a workout saved on the phone still applies when the Today page opens.
// - Anything logged (sets, cardio time or a stopwatch): always kept (never lose sets); planChanged flags a plan edited since it was started today.
// - Nothing logged, from a plan: kept only if today's plan is still that same training day, so Planner
//   changes (rest day, a different plan) show up.
// - Nothing logged, spontaneous: kept for the day it was started.
// planKnown: false before the plan has ever been loaded on this phone; then nothing is dropped.
export function storedSessionStatus(stored, todaysTemplate, now = new Date(), planKnown = true) {
  if (!stored) return { keep: false, planChanged: false };
  if (!planKnown) return { keep: true, planChanged: false };
  const progress = stored.exercises.some(ex => ex.completed || Object.keys(ex.logged_sets || {}).length > 0
    || ex.duration_seconds > 0 || !!ex.running_since);
  const startedToday = new Date(stored.startedAt).toDateString() === now.toDateString();
  const planStillMatches = !!todaysTemplate && !todaysTemplate.is_rest_day && todaysTemplate.id === stored.templateId;

  if (progress) return { keep: true, planChanged: startedToday && stored.templateId !== null && !planStillMatches };
  if (stored.templateId === null) return { keep: startedToday, planChanged: false };
  return { keep: startedToday && planStillMatches, planChanged: false };
}

// This week (Sunday first, like the Planner) for the dashboard strip.
// trained: a workout was finished that day; planned: a template with exercises; rest: a rest-day template.
export function buildWeek(completedDates, templatesByDay, today = new Date()) {
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const trainedDays = new Set(completedDates.map(d => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }));

  return DAY_NAMES.map((name, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const template = templatesByDay[name];
    return {
      name,
      letter: name[0],
      date: date.getDate(),
      trained: trainedDays.has(date.getTime()),
      planned: !!template && !template.is_rest_day && template.exercises?.length > 0,
      rest: !!template?.is_rest_day,
      isToday: i === today.getDay(),
      isFuture: date > today,
    };
  });
}

// "This week" on the dashboard: planned days trained out of planned days (so it tops out at 5/5),
// plus days trained that had nothing planned.
export function weekProgress(week) {
  const plannedDays = week.filter(d => d.planned).length;
  const plannedDone = week.filter(d => d.planned && d.trained).length;
  const trainedDays = week.filter(d => d.trained).length;
  return { plannedDays, plannedDone, trainedDays, extraDays: trainedDays - plannedDone };
}

// Newest template per weekday. Skips history and in-progress spontaneous workouts.
export function getActiveTemplates(workouts) {
  const byDay = {};
  (workouts || [])
    .filter(w => !w.completed && w.routine_name !== 'Spontaneous Workout')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .forEach(t => { byDay[t.day_of_week] ??= t; });
  return byDay;
}

// Planner "Rearrange week": what to send to rearrange_week(). before/after are 7 plans, Sunday first
// (null = no plan row). A day left without a plan gets a blank one, so an older plan there can't resurface.
export function weekRearrangement(before, after, days) {
  const moves = [], blankDays = [];
  after.forEach((plan, i) => {
    if (plan?.id === before[i]?.id) return;
    if (plan) moves.push({ id: plan.id, day_of_week: days[i] });
    else blankDays.push(days[i]);
  });
  return { moves, blankDays };
}

export function getRestDays(templatesByDay) {
  return new Set(Object.values(templatesByDay).filter(t => t.is_rest_day).map(t => t.day_of_week));
}

// Streak calculation shared by every page.
// shieldsUsed = shields spent this month on misses inside the current streak.
export function calculateStreak(completedHistory, restDaysOfWeek, maxGracePeriodsPerMonth = 3) {
  if (!completedHistory || completedHistory.length === 0) return { streak: 0, shieldsUsed: 0 };

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let currentCheckDate = new Date(today);
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const completedDates = new Set(completedHistory.map(w => {
    const d = new Date(w.completed_at);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }));

  let gracePeriodsUsedThisMonth = 0;
  let currentMonth = today.getMonth();
  let shieldsUsed = 0;
  // Misses in this month that only count once an older completed day proves they sit inside the streak
  let pendingShields = 0;

  for (let i = 0; i < 365; i++) {
    const time = currentCheckDate.getTime();
    const isCompleted = completedDates.has(time);
    const dayName = DAYS[currentCheckDate.getDay()];
    const isRestDay = restDaysOfWeek.has(dayName);
    const isToday = i === 0;
    const isThisMonth = currentCheckDate.getMonth() === today.getMonth() && currentCheckDate.getFullYear() === today.getFullYear();

    if (currentCheckDate.getMonth() !== currentMonth) {
      currentMonth = currentCheckDate.getMonth();
      gracePeriodsUsedThisMonth = 0; // reset for the past month
    }

    if (isCompleted) {
      streak++;
      shieldsUsed += pendingShields;
      pendingShields = 0;
    } else if (!isToday && !isRestDay) {
      // missed a required day
      if (gracePeriodsUsedThisMonth < maxGracePeriodsPerMonth) {
        gracePeriodsUsedThisMonth++; // auto-freeze, streak continues
        if (isThisMonth) pendingShields++;
      } else {
        break; // out of shields, streak breaks
      }
    }
    currentCheckDate.setDate(currentCheckDate.getDate() - 1);
  }

  return { streak, shieldsUsed };
}

// Achievements Logic
export const AVAILABLE_ACHIEVEMENTS = [
  { id: 'first_workout', badge_name: 'First Steps', description: 'Complete your first workout.', condition: (stats) => stats.totalWorkouts >= 1 },
  { id: 'streak_3', badge_name: 'Consistency is Key', description: 'Hit a 3-day streak.', condition: (stats) => stats.currentStreak >= 3 },
  { id: 'streak_7', badge_name: 'Unstoppable', description: 'Hit a 7-day streak.', condition: (stats) => stats.currentStreak >= 7 },
  { id: 'level_5', badge_name: 'Rising Star', description: 'Reach Level 5.', condition: (stats) => stats.level >= 5 },
  { id: 'volume_10k', badge_name: 'Heavy Lifter', description: 'Move 10,000kg total volume in a single workout.', condition: (stats) => stats.maxVolume >= 10000 },
  { id: 'run_5k', badge_name: 'First 5K', description: 'Run 5 km in one go.', condition: (stats) => stats.longestRunKm >= 5 },
  { id: 'run_10k', badge_name: 'Double Digits', description: 'Run 10 km in one go.', condition: (stats) => stats.longestRunKm >= 10 },
  { id: 'cardio_60', badge_name: 'Hour of Power', description: 'Do 60 minutes of cardio in one session.', condition: (stats) => stats.longestCardioMinutes >= 60 },
];

// Badge stats from one finished workout's cardio
export function cardioBadgeStats(exercises) {
  const cardio = (exercises || []).filter(isCardio);
  return {
    longestRunKm: Math.max(0, ...cardio.filter(ex => ex.activity === 'run').map(ex => parseFloat(ex.distance_km) || 0)),
    longestCardioMinutes: Math.max(0, ...cardio.map(ex => cardioSeconds(ex) / 60)),
  };
}

export function getEarnedAchievements(stats, existingAchievements = []) {
  const existingIds = new Set(existingAchievements.map(a => a.badge_name));
  return AVAILABLE_ACHIEVEMENTS.filter(ach => !existingIds.has(ach.badge_name) && ach.condition(stats));
}
