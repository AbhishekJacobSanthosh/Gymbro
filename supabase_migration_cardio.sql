-- ==========================================
-- ONE-TIME MIGRATION: cardio (activity types, time/distance/pace, effort, cardio XP). Run AFTER supabase_migration_swap.sql.
-- Run once in Supabase → SQL Editor (dev first, then main). Safe to run again.
-- ==========================================

-- Cardio fields on exercises: plan rows use duration_seconds / distance_km / intervals as targets,
-- logged rows as what was done. `minutes` is still filled (rounded) so older app versions show it.
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS kind TEXT,                 -- 'lift' | 'cardio'; NULL on older rows (no sets + minutes = cardio)
  ADD COLUMN IF NOT EXISTS activity TEXT,             -- run, walk, cycle, row, swim, elliptical, stairs, jump_rope, hiit
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS effort SMALLINT,           -- 1 Easy, 2 Moderate, 3 Hard, 4 All-out
  ADD COLUMN IF NOT EXISTS calories NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_hr NUMERIC,
  ADD COLUMN IF NOT EXISTS incline NUMERIC,
  ADD COLUMN IF NOT EXISTS intervals JSONB;           -- {work, rest, rounds}, seconds

UPDATE exercises SET kind = 'cardio', duration_seconds = COALESCE(duration_seconds, minutes * 60)
WHERE kind IS NULL AND COALESCE(sets, 0) = 0 AND COALESCE(minutes, 0) > 0;

-- XP = 50 + kg·reps/100 (lifting, matches calculateVolume() in src/lib/utils.js)
--        + cardio minutes × effort (Easy ×0.75, Moderate/none ×1, Hard ×1.25, All-out ×1.5), max 180 min per exercise.
-- Workouts already awarded keep their XP.
CREATE OR REPLACE FUNCTION public.workout_xp(p_workout_id BIGINT)
RETURNS INTEGER LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT 50 + floor(COALESCE(SUM(
    CASE WHEN jsonb_typeof(e.logged_sets) = 'object' AND e.logged_sets <> '{}'::jsonb THEN
      (SELECT SUM(COALESCE(substring(s.value->>'reps' from '\d+')::numeric, 0)
                * COALESCE(substring(s.value->>'weight' from '^\s*(-?\d*\.?\d+)')::numeric, 0))
       FROM jsonb_each(e.logged_sets) s)
    ELSE COALESCE(e.sets, 0) * COALESCE(substring(e.reps from '\d+')::numeric, 0) * COALESCE(e.weight, 0)
    END), 0) / 100)::int
  + floor(COALESCE(SUM(
    CASE WHEN COALESCE(e.kind = 'cardio', COALESCE(e.sets, 0) = 0 AND COALESCE(e.minutes, 0) > 0) THEN
      LEAST(GREATEST(COALESCE(e.duration_seconds / 60.0, e.minutes, 0), 0), 180)
      * CASE e.effort WHEN 1 THEN 0.75 WHEN 3 THEN 1.25 WHEN 4 THEN 1.5 ELSE 1 END
    END), 0))::int
  FROM exercises e WHERE e.workout_id = p_workout_id;
$$;

-- Saves a whole finished workout in one transaction (same as section 9 of supabase_schema.sql).
-- Cardio: the logged row gets what was done; plan rows get x->'target' (a plan's targets aren't overwritten by a session).
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

  INSERT INTO exercises (workout_id, name, sets, reps, weight, minutes, logged_sets, completed,
                         kind, activity, distance_km, duration_seconds, effort, calories, avg_hr, incline, intervals)
  SELECT v_id, x->>'name', COALESCE((x->>'sets')::int, 0), COALESCE(x->>'reps', '0'),
         COALESCE((x->>'weight')::numeric, 0), COALESCE((x->>'minutes')::int, 0),
         NULLIF(x->'logged_sets', 'null'::jsonb), TRUE,
         x->>'kind', x->>'activity', (x->>'distance_km')::numeric, (x->>'duration_seconds')::int,
         (x->>'effort')::smallint, (x->>'calories')::numeric, (x->>'avg_hr')::numeric, (x->>'incline')::numeric,
         NULLIF(x->'intervals', 'null'::jsonb)
  FROM jsonb_array_elements(p_exercises) x;

  IF EXISTS (SELECT 1 FROM workouts WHERE id = p_template_id AND user_id = auth.uid() AND NOT completed) THEN
    -- Planned reps/weight go back to the plan; a swap made with "Update my plan" ('replace') takes the old one's place
    UPDATE exercises AS t
    SET reps = COALESCE(x->>'reps', t.reps), weight = COALESCE((x->>'weight')::numeric, t.weight),
        name = CASE WHEN x->>'plan_change' = 'replace' THEN COALESCE(NULLIF(x->>'name', ''), t.name) ELSE t.name END,
        sets = CASE WHEN x->>'plan_change' = 'replace' THEN COALESCE((x->>'sets')::int, t.sets) ELSE t.sets END,
        minutes = CASE WHEN x->>'plan_change' = 'replace'
                  THEN COALESCE((x->'target'->>'minutes')::int, (x->>'minutes')::int, t.minutes) ELSE t.minutes END,
        kind = CASE WHEN x->>'plan_change' = 'replace' THEN x->>'kind' ELSE t.kind END,
        activity = CASE WHEN x->>'plan_change' = 'replace' THEN x->>'activity' ELSE t.activity END,
        duration_seconds = CASE WHEN x->>'plan_change' = 'replace' THEN (x->'target'->>'duration_seconds')::int ELSE t.duration_seconds END,
        distance_km = CASE WHEN x->>'plan_change' = 'replace' THEN (x->'target'->>'distance_km')::numeric ELSE t.distance_km END,
        intervals = CASE WHEN x->>'plan_change' = 'replace' THEN NULLIF(x->'target'->'intervals', 'null'::jsonb) ELSE t.intervals END,
        completed = FALSE, logged_sets = NULL
    FROM jsonb_array_elements(p_exercises) x
    WHERE t.workout_id = p_template_id AND t.id = (x->>'template_exercise_id')::bigint;

    -- Exercises added mid-workout join the plan only when asked ('add'). Workouts queued by older app
    -- versions have no plan_change and keep the old always-add. Names already planned are skipped (Undo, then finish again).
    INSERT INTO exercises (workout_id, name, sets, reps, weight, minutes, kind, activity, duration_seconds, distance_km, intervals)
    SELECT p_template_id, x->>'name', COALESCE((x->>'sets')::int, 0), COALESCE(x->>'reps', '0'),
           COALESCE((x->>'weight')::numeric, 0), COALESCE((x->'target'->>'minutes')::int, (x->>'minutes')::int, 0),
           x->>'kind', x->>'activity', (x->'target'->>'duration_seconds')::int, (x->'target'->>'distance_km')::numeric,
           NULLIF(x->'target'->'intervals', 'null'::jsonb)
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
