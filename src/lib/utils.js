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

// When a finished workout is dated: the day it was started, even if Finish is pressed after midnight.
// Past that day it uses the last time something was logged, capped at 23:59:59.999 of the start day.
export function workoutCompletedAt(startedAt, lastActivityAt, now = new Date()) {
  const start = new Date(startedAt ?? now);
  const endOfStartDay = new Date(start);
  endOfStartDay.setHours(23, 59, 59, 999);
  if (now <= endOfStartDay) return new Date(now);
  return new Date(Math.min(new Date(lastActivityAt ?? start).getTime(), endOfStartDay.getTime()));
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
];

export function getEarnedAchievements(stats, existingAchievements = []) {
  const existingIds = new Set(existingAchievements.map(a => a.badge_name));
  return AVAILABLE_ACHIEVEMENTS.filter(ach => !existingIds.has(ach.badge_name) && ach.condition(stats));
}
