-- ==========================================
-- ONE-TIME MIGRATION: swap and remove exercises mid-workout. Run AFTER supabase_migration_rearrange.sql.
-- Run once in Supabase → SQL Editor (dev first, then main). Safe to run again.
-- ==========================================

-- finish_workout gains p_removed_from_plan; the old 6-argument version must go or calls become ambiguous
DROP FUNCTION IF EXISTS public.finish_workout(UUID, BIGINT, TEXT, TEXT, TIMESTAMPTZ, JSONB);

-- Saves a whole finished workout in one transaction (same as section 9 of supabase_schema.sql)
CREATE OR REPLACE FUNCTION public.finish_workout(
  p_client_id UUID, p_template_id BIGINT, p_routine_name TEXT, p_day_of_week TEXT,
  p_completed_at TIMESTAMPTZ, p_exercises JSONB, p_removed_from_plan BIGINT[] DEFAULT '{}')
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

  IF EXISTS (SELECT 1 FROM workouts WHERE id = p_template_id AND user_id = auth.uid() AND NOT completed) THEN
    -- Planned reps/weight go back to the plan; a swap made with "Update my plan" ('replace') takes the old one's place
    UPDATE exercises AS t
    SET reps = COALESCE(x->>'reps', t.reps), weight = COALESCE((x->>'weight')::numeric, t.weight),
        name = CASE WHEN x->>'plan_change' = 'replace' THEN COALESCE(NULLIF(x->>'name', ''), t.name) ELSE t.name END,
        sets = CASE WHEN x->>'plan_change' = 'replace' THEN COALESCE((x->>'sets')::int, t.sets) ELSE t.sets END,
        minutes = CASE WHEN x->>'plan_change' = 'replace' THEN COALESCE((x->>'minutes')::int, t.minutes) ELSE t.minutes END,
        completed = FALSE, logged_sets = NULL
    FROM jsonb_array_elements(p_exercises) x
    WHERE t.workout_id = p_template_id AND t.id = (x->>'template_exercise_id')::bigint;

    -- Exercises added mid-workout join the plan only when asked ('add'). Workouts queued by older app
    -- versions have no plan_change and keep the old always-add. Names already planned are skipped (Undo, then finish again).
    INSERT INTO exercises (workout_id, name, sets, reps, weight, minutes)
    SELECT p_template_id, x->>'name', COALESCE((x->>'sets')::int, 0), COALESCE(x->>'reps', '0'),
           COALESCE((x->>'weight')::numeric, 0), COALESCE((x->>'minutes')::int, 0)
    FROM jsonb_array_elements(p_exercises) x
    WHERE x->>'template_exercise_id' IS NULL
      AND (x->>'plan_change' = 'add' OR NOT x ? 'plan_change')
      AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.workout_id = p_template_id AND lower(e.name) = lower(x->>'name'));

    -- Removed mid-workout with "Remove from my plan too"
    DELETE FROM exercises WHERE workout_id = p_template_id AND id = ANY (COALESCE(p_removed_from_plan, '{}'));
  END IF;

  v_award := award_workout_xp(v_id);
  RETURN json_build_object('workout_id', v_id, 'xp_gained', (v_award->>'xp_gained')::int,
    'new_level', (v_award->>'new_level')::int, 'already_saved', FALSE);
END;
$$;
