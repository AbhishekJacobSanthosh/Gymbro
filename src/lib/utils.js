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
export function calculateStreak(completedHistory, restDaysOfWeek, freezeDatesSet = new Set()) {
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

  for (let i = 0; i < 365; i++) {
    const time = currentCheckDate.getTime();
    const isCompleted = completedDates.has(time);
    const dayName = DAYS[currentCheckDate.getDay()];
    const isRestDay = restDaysOfWeek.has(dayName);
    const isFreezeDay = freezeDatesSet.has(time);
    const isToday = i === 0;

    if (isCompleted) {
      streak++;
    } else {
      if (isToday) {
        // skip today if not completed
      } else if (isRestDay || isFreezeDay) {
        // skip rest day or freeze day if not completed
      } else {
        // missing a required day breaks streak
        break;
      }
    }
    currentCheckDate.setDate(currentCheckDate.getDate() - 1);
  }
  
  return streak;
}
