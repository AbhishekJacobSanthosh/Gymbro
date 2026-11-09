-- ==========================================
-- ONE-TIME MIGRATION: Planner "Rearrange week". Run AFTER supabase_migration_offline.sql.
-- Run once in Supabase → SQL Editor (dev first, then main). Safe to run again.
-- ==========================================

-- Moves plans to new days in one transaction (same as section 10 of supabase_schema.sql).
-- p_moves: [{id, day_of_week}]. p_blank_days: days left without a plan, which get a blank one.
CREATE OR REPLACE FUNCTION public.rearrange_week(p_moves JSONB, p_blank_days TEXT[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_moved INTEGER;
  v_days CONSTANT TEXT[] := ARRAY['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_moves) x WHERE NOT (x->>'day_of_week' = ANY (v_days)))
     OR NOT (COALESCE(p_blank_days, '{}') <@ v_days) THEN
    RAISE EXCEPTION 'Unknown day';
  END IF;

  -- created_at = now(): the newest plan on a day is the one shown, so the moved plan wins over older rows there
  UPDATE workouts w SET day_of_week = x->>'day_of_week', created_at = now()
  FROM jsonb_array_elements(p_moves) x
  WHERE w.id = (x->>'id')::bigint AND w.user_id = auth.uid() AND NOT w.completed;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  IF v_moved <> jsonb_array_length(p_moves) THEN RAISE EXCEPTION 'Plan not found'; END IF;

  INSERT INTO workouts (user_id, day_of_week) SELECT auth.uid(), d FROM unnest(p_blank_days) d;
END;
$$;
