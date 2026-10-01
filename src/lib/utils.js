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
export function calculateXpGained(totalVolume) {
  return 50 + Math.floor(totalVolume / 100);
}

export function calculateLevelFromXp(xp) {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

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

// Streak calculation logic shared between Home and Calendar
export function calculateStreak(completedHistory, restDaysOfWeek, maxGracePeriodsPerMonth = 3) {
  if (!completedHistory || completedHistory.length === 0) return 0;
  
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

  for (let i = 0; i < 365; i++) {
    const time = currentCheckDate.getTime();
    const isCompleted = completedDates.has(time);
    const dayName = DAYS[currentCheckDate.getDay()];
    const isRestDay = restDaysOfWeek.has(dayName);
    const isToday = i === 0;

    if (currentCheckDate.getMonth() !== currentMonth) {
      currentMonth = currentCheckDate.getMonth();
      gracePeriodsUsedThisMonth = 0; // reset for the past month
    }

    if (isCompleted) {
      streak++;
    } else {
      if (isToday) {
        // skip today if not completed
      } else if (isRestDay) {
        // skip rest day if not completed
      } else {
        // missed a required day
        if (gracePeriodsUsedThisMonth < maxGracePeriodsPerMonth) {
          gracePeriodsUsedThisMonth++;
          // auto-freeze, streak continues! (we don't increment streak, we just don't break it)
        } else {
          // out of shields, streak breaks
          break;
        }
      }
    }
    currentCheckDate.setDate(currentCheckDate.getDate() - 1);
  }
  
  return streak;
}

export function getGracePeriodsUsedThisMonth(completedHistory, restDaysOfWeek) {
  if (!completedHistory || completedHistory.length === 0) return 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let currentCheckDate = new Date(today);
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentMonth = today.getMonth();

  const completedDates = new Set(completedHistory.map(w => {
    const d = new Date(w.completed_at);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }));

  let gracePeriodsUsed = 0;

  for (let i = 0; i < 31; i++) { // check up to 31 days back, bounded by month
    if (currentCheckDate.getMonth() !== currentMonth) break;

    const time = currentCheckDate.getTime();
    const isCompleted = completedDates.has(time);
    const dayName = DAYS[currentCheckDate.getDay()];
    const isRestDay = restDaysOfWeek.has(dayName);
    const isToday = i === 0;

    if (!isCompleted && !isToday && !isRestDay) {
      gracePeriodsUsed++;
    }
    currentCheckDate.setDate(currentCheckDate.getDate() - 1);
  }
  
  return gracePeriodsUsed;
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
