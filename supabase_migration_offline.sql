-- ==========================================
-- ONE-TIME MIGRATION: offline workouts. Run AFTER supabase_migration_audit.sql.
-- Run once in Supabase → SQL Editor (dev first, then main). Safe to run again.
-- ==========================================

-- 1. Each finished workout carries an id made on the phone, so a retried upload is never saved twice
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS client_id UUID UNIQUE;

-- 2. Workouts in progress now live on the phone. Clear what the old app version left on the server:
--    unfinished spontaneous workouts, and ticks stored on templates.
--    (Anyone mid-way through a spontaneous workout while this runs loses that one session.)
DELETE FROM workouts WHERE NOT completed AND routine_name = 'Spontaneous Workout';
UPDATE exercises SET completed = FALSE, logged_sets = NULL
WHERE workout_id IN (SELECT id FROM workouts WHERE NOT completed)
  AND (completed OR logged_sets IS NOT NULL);

-- 3. Saves a whole finished workout in one transaction (same as section 9 of supabase_schema.sql)
CREATE OR REPLACE FUNCTION public.finish_workout(
  p_client_id UUID, p_template_id BIGINT, p_routine_name TEXT, p_day_of_week TEXT,
  p_completed_at TIMESTAMPTZ, p_exercises JSONB)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id BIGINT; v_xp INTEGER; v_award JSON;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  -- A retry of a finish that already went through: return what was saved
  SELECT id, xp_awarded INTO v_id, v_xp FROM workouts WHERE client_id = p_client_id AND user_id = auth.uid();
  IF FOUND THEN
    RETURN json_build_object('workout_id', v_id, 'xp_gained', v_xp,
      'new_level', (SELECT level FROM profiles WHERE id = auth.uid()), 'already_saved', TRUE);
  END IF;

  IF p_completed_at > now() + INTERVAL '1 hour' THEN RAISE EXCEPTION 'Workout date is in the future'; END IF;

  INSERT INTO workouts (user_id, day_of_week, routine_name, completed, completed_at, client_id)
  VALUES (auth.uid(), p_day_of_week, COALESCE(NULLIF(p_routine_name, ''), 'Workout'), TRUE, p_completed_at, p_client_id)
  RETURNING id INTO v_id;

  INSERT INTO exercises (workout_id, name, sets, reps, weight, minutes, logged_sets, completed)
  SELECT v_id, x->>'name', COALESCE((x->>'sets')::int, 0), COALESCE(x->>'reps', '0'),
         COALESCE((x->>'weight')::numeric, 0), COALESCE((x->>'minutes')::int, 0),
         NULLIF(x->'logged_sets', 'null'::jsonb), TRUE
  FROM jsonb_array_elements(p_exercises) x;

  -- Save planned reps/weight back to the template, and add exercises created during the workout
  IF EXISTS (SELECT 1 FROM workouts WHERE id = p_template_id AND user_id = auth.uid() AND NOT completed) THEN
    UPDATE exercises AS t
    SET reps = COALESCE(x->>'reps', t.reps), weight = COALESCE((x->>'weight')::numeric, t.weight),
        completed = FALSE, logged_sets = NULL
    FROM jsonb_array_elements(p_exercises) x
    WHERE t.workout_id = p_template_id AND t.id = (x->>'template_exercise_id')::bigint;

    INSERT INTO exercises (workout_id, name, sets, reps, weight, minutes)
    SELECT p_template_id, x->>'name', COALESCE((x->>'sets')::int, 0), COALESCE(x->>'reps', '0'),
           COALESCE((x->>'weight')::numeric, 0), COALESCE((x->>'minutes')::int, 0)
    FROM jsonb_array_elements(p_exercises) x
    WHERE x->>'template_exercise_id' IS NULL;
  END IF;

  v_award := award_workout_xp(v_id);
  RETURN json_build_object('workout_id', v_id, 'xp_gained', (v_award->>'xp_gained')::int,
    'new_level', (v_award->>'new_level')::int, 'already_saved', FALSE);
END;
$$;
