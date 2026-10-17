import { supabase } from './supabase';
import { calculateVolume, calculateStreak, getActiveTemplates, getRestDays, getEarnedAchievements } from './utils';

// Saves one finished workout (workout + exercises + template update + XP in a single database
// transaction), then checks PRs, badges and posts to the feed. Used by the outbox and by Calendar.
export async function submitWorkout(userId, op) {
  const { data, error } = await supabase.rpc('finish_workout', {
    p_client_id: op.clientId,
    p_template_id: op.templateId,
    p_routine_name: op.routineName,
    p_day_of_week: op.dayOfWeek,
    p_completed_at: op.completedAt,
    p_exercises: op.exercises,
  });
  if (error) throw error;

  const result = {
    clientId: op.clientId,
    workoutId: data.workout_id,
    xpGained: data.xp_gained,
    routineName: op.routineName,
    completedAt: op.completedAt,
    prsHit: [],
    earnedAchievements: [],
  };
  // A retry of a workout that was already saved: its bonuses were handled the first time
  if (data.already_saved) return result;

  // --- PR CHECK: best weight from other finished workouts ---
  await Promise.all(op.exercises.map(async (ex) => {
    const weight = parseFloat(ex.weight) || 0;
    if (!ex.name || weight <= 0) return;

    const { data: pastEx } = await supabase
      .from('exercises')
      .select('weight, workouts!inner(user_id, completed)')
      .ilike('name', ex.name.replace(/[\\%_]/g, '\\$&')) // case-insensitive exact match, not a pattern
      .eq('workouts.user_id', userId)
      .eq('workouts.completed', true)
      .neq('workout_id', result.workoutId)
      .order('weight', { ascending: false })
      .limit(1);

    const pastMax = pastEx?.length ? parseFloat(pastEx[0].weight) : 0;
    if (weight > pastMax && pastMax > 0) {
      result.prsHit.push({ name: ex.name, weight });
    }
  }));

  // --- ACHIEVEMENTS: same streak rules as the dashboard ---
  const { data: allWorkouts } = await supabase
    .from('workouts')
    .select('completed, completed_at, is_rest_day, day_of_week, created_at, routine_name')
    .eq('user_id', userId);

  const completedHistory = (allWorkouts || []).filter(w => w.completed);
  const stats = {
    totalWorkouts: completedHistory.length,
    currentStreak: calculateStreak(completedHistory, getRestDays(getActiveTemplates(allWorkouts)), 3).streak,
    level: data.new_level,
    maxVolume: calculateVolume(op.exercises)
  };

  const { data: existingAchievements } = await supabase.from('achievements').select('badge_name').eq('user_id', userId);
  result.earnedAchievements = getEarnedAchievements(stats, existingAchievements || []);

  if (result.earnedAchievements.length > 0) {
    await supabase.from('achievements').insert(
      result.earnedAchievements.map(ach => ({
        user_id: userId,
        badge_name: ach.badge_name,
        description: ach.description
      }))
    );
  }

  // --- ACTIVITY FEED ---
  const { routineName, retro } = op;
  const xp = result.xpGained;
  const cleanRoutineName = routineName.toLowerCase().includes('workout') ? routineName : `${routineName} workout`;
  const retroSuffix = retro ? ' retroactively' : '';
  let feedAction = `crushed ${retro ? 'a retroactive' : 'their'} ${cleanRoutineName}! (+${xp} XP)`;
  if (result.prsHit.length > 0) {
    const prText = result.prsHit.map(pr => `${pr.name} (${pr.weight}kg)`).join(', ');
    feedAction = `hit a PR on ${prText}${retroSuffix}! (+${xp} XP)`;
  } else if (result.earnedAchievements.length > 0) {
    feedAction = `earned the ${result.earnedAchievements[0].badge_name} badge${retroSuffix}! (+${xp} XP)`;
  }

  await supabase.from('activity_feed').insert([{ user_id: userId, action: feedAction }]);

  return result;
}
