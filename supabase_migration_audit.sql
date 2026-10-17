-- ==========================================
-- ONE-TIME MIGRATION (Oct 2026 audit) for an existing database.
-- Safe to run on live data: changes rules and adds XP functions, deletes nothing you use.
-- Run once in Supabase → SQL Editor. Fresh installs use supabase_schema.sql instead.
-- ==========================================

-- 1. Weight logs and exercises: only the owner can read them
DROP POLICY IF EXISTS "Weight logs viewable by everyone" ON weight_logs;
DROP POLICY IF EXISTS "Users view own weight_logs" ON weight_logs;
CREATE POLICY "Users view own weight_logs" ON weight_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Exercises viewable by everyone" ON exercises;
DROP POLICY IF EXISTS "Users view own exercises" ON exercises;
CREATE POLICY "Users view own exercises" ON exercises FOR SELECT USING (
  EXISTS (SELECT 1 FROM workouts WHERE workouts.id = exercises.workout_id AND workouts.user_id = auth.uid())
);

-- 2. Unused table (replaced by auto-shields)
DROP TABLE IF EXISTS streak_freezes CASCADE;

-- 3. Server-side XP (same block as section 8 of supabase_schema.sql)
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS xp_awarded INTEGER;

REVOKE INSERT, UPDATE ON profiles FROM anon, authenticated;
GRANT INSERT (id, display_name, color, updated_at) ON profiles TO authenticated;
GRANT UPDATE (display_name, color, updated_at) ON profiles TO authenticated;

REVOKE INSERT, UPDATE ON workouts FROM anon, authenticated;
GRANT INSERT (user_id, day_of_week, routine_name, is_rest_day, completed, completed_at) ON workouts TO authenticated;
GRANT UPDATE (day_of_week, routine_name, is_rest_day, completed_at) ON workouts TO authenticated;

CREATE OR REPLACE FUNCTION public.workout_xp(p_workout_id BIGINT)
RETURNS INTEGER LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT 50 + floor(COALESCE(SUM(
    CASE WHEN jsonb_typeof(e.logged_sets) = 'object' AND e.logged_sets <> '{}'::jsonb THEN
      (SELECT SUM(COALESCE(substring(s.value->>'reps' from '\d+')::numeric, 0)
                * COALESCE(substring(s.value->>'weight' from '^\s*(-?\d*\.?\d+)')::numeric, 0))
       FROM jsonb_each(e.logged_sets) s)
    ELSE COALESCE(e.sets, 0) * COALESCE(substring(e.reps from '\d+')::numeric, 0) * COALESCE(e.weight, 0)
    END), 0) / 100)::int
  FROM exercises e WHERE e.workout_id = p_workout_id;
$$;

CREATE OR REPLACE FUNCTION public.award_workout_xp(p_workout_id BIGINT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gain INTEGER; v_level INTEGER;
BEGIN
  UPDATE workouts SET xp_awarded = workout_xp(p_workout_id)
  WHERE id = p_workout_id AND user_id = auth.uid() AND completed AND xp_awarded IS NULL
  RETURNING xp_awarded INTO v_gain;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workout not found or XP already awarded'; END IF;

  UPDATE profiles SET xp = xp + v_gain, level = floor(sqrt((xp + v_gain) / 100.0))::int + 1
  WHERE id = auth.uid()
  RETURNING level INTO v_level;

  RETURN json_build_object('xp_gained', v_gain, 'new_level', v_level);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_workout_xp(p_workout_id BIGINT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_xp INTEGER;
BEGIN
  DELETE FROM workouts WHERE id = p_workout_id AND user_id = auth.uid() AND completed
  RETURNING COALESCE(xp_awarded, 0) INTO v_xp;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workout not found'; END IF;

  UPDATE profiles SET xp = GREATEST(0, xp - v_xp), level = floor(sqrt(GREATEST(0, xp - v_xp) / 100.0))::int + 1
  WHERE id = auth.uid();
  RETURN v_xp;
END;
$$;

-- 4. Mark past workouts as already awarded, so Undo takes back the right amount
--    and old workouts can't be awarded a second time.
UPDATE workouts SET xp_awarded = workout_xp(id) WHERE completed AND xp_awarded IS NULL;
