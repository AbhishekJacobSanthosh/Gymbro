import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { calculateStreak, calculateVolume, parseReps, getActiveTemplates, getRestDays, getLevelProgress, workoutCompletedAt, lastPerformanceByName, plannedSetDrafts, formatSet } from './utils.js';

// Fixed "today": Saturday 17 Oct 2026, noon local time
beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 17, 12) }));
afterEach(() => mock.timers.reset());

const day = (d, m = 9) => ({ completed_at: new Date(2026, m, d, 18).toISOString() });
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => day(from + i));
const noRest = new Set();

test('counts consecutive days and skips an unfinished today', () => {
  assert.equal(calculateStreak(range(14, 16), noRest).streak, 3);
});

test('rest days neither break the streak nor use a shield', () => {
  // Wed 14 missing, but Wednesday is a rest day
  const result = calculateStreak([...range(10, 13), ...range(15, 16)], new Set(['Wednesday']));
  assert.deepEqual(result, { streak: 6, shieldsUsed: 0 });
});

test('a missed day inside the streak uses one shield', () => {
  const result = calculateStreak([...range(10, 13), ...range(15, 16)], noRest);
  assert.deepEqual(result, { streak: 6, shieldsUsed: 1 });
});

test('days before you started do not count as used shields', () => {
  // Started on the 10th: Oct 1-9 are missed but sit outside the streak
  assert.deepEqual(calculateStreak(range(10, 16), noRest), { streak: 7, shieldsUsed: 0 });
});

test('the fourth missed day in a month breaks the streak', () => {
  // Misses on 15, 13, 11 use the 3 shields; the miss on 9 breaks it
  const history = [day(10), day(12), day(14), day(16)];
  assert.equal(calculateStreak(history, noRest).streak, 4);
  assert.equal(calculateStreak([day(8), ...history], noRest).streak, 4);
});

test('shields reset in the previous month', () => {
  // Sep 28-30 missed (3 shields of September), Oct streak untouched
  const history = [...Array.from({ length: 3 }, (_, i) => day(25 + i, 8)), ...range(1, 16)];
  assert.deepEqual(calculateStreak(history, noRest), { streak: 19, shieldsUsed: 0 });
});

test('empty history', () => {
  assert.deepEqual(calculateStreak([], noRest), { streak: 0, shieldsUsed: 0 });
});

test('parseReps reads the first number', () => {
  assert.equal(parseReps('x10'), 10);
  assert.equal(parseReps('8-12'), 8);
  assert.equal(parseReps('AMRAP'), 0);
  assert.equal(parseReps(5), 5);
  assert.equal(parseReps(null), 0);
});

test('volume uses logged sets when present, planned sets otherwise', () => {
  const planned = { sets: 3, reps: 'x10', weight: 100, logged_sets: null };
  const logged = { sets: 3, reps: '10', weight: 80, logged_sets: { 0: { reps: '10', weight: '60' }, 1: { reps: '10', weight: 70 } } };
  const emptyArray = { sets: 2, reps: '5', weight: 50, logged_sets: [] };
  assert.equal(calculateVolume([planned]), 3000);
  assert.equal(calculateVolume([logged]), 1300);
  assert.equal(calculateVolume([emptyArray]), 500);
  assert.equal(calculateVolume(undefined), 0);
});

test('active templates ignore history and spontaneous workouts', () => {
  const workouts = [
    { day_of_week: 'Sunday', is_rest_day: true, completed: false, routine_name: 'Rest', created_at: '2026-01-01' },
    { day_of_week: 'Sunday', is_rest_day: false, completed: false, routine_name: 'Spontaneous Workout', created_at: '2026-10-11' },
    { day_of_week: 'Sunday', is_rest_day: false, completed: true, routine_name: 'Legs', created_at: '2026-10-11' },
  ];
  assert.deepEqual([...getRestDays(getActiveTemplates(workouts))], ['Sunday']);
});

test('a workout is saved to the day it was started', () => {
  const friday = (h, m = 0) => new Date(2026, 9, 16, h, m);
  const saturday = (h, m = 0) => new Date(2026, 9, 17, h, m);

  // Finished the same day: saved at the time Finish was pressed
  assert.deepEqual(workoutCompletedAt(friday(18), friday(19), friday(19, 30)), friday(19, 30));
  // Finished at home after midnight: saved at the last logged set on Friday
  assert.deepEqual(workoutCompletedAt(friday(22), friday(23, 10), saturday(0, 40)), friday(23, 10));
  // Last set itself was after midnight: capped at the end of Friday
  assert.deepEqual(workoutCompletedAt(friday(23), saturday(0, 15), saturday(9)), new Date(2026, 9, 16, 23, 59, 59, 999));
  // Never started (Finish without any change): now
  assert.deepEqual(workoutCompletedAt(null, null, saturday(10)), saturday(10));
});

test('level progress is clamped to 0-100', () => {
  assert.deepEqual(getLevelProgress(250, 2), { progress: 50, nextLevelXp: 400 });
  assert.equal(getLevelProgress(0, 3).progress, 0);
});

test('last time per exercise: newest session, logged sets in order, case-insensitive', () => {
  const rows = [
    { name: 'Bench Press ', sets: 3, reps: '8-12', weight: 80, logged_sets: { 1: { reps: '9', weight: 82.5 }, 0: { reps: '10', weight: 80 } } },
    { name: 'bench press', sets: 3, reps: '8', weight: 70, logged_sets: null },
    { name: 'Plank', sets: 2, reps: '60s', weight: 0, logged_sets: null },
  ];
  const last = lastPerformanceByName(rows);
  assert.deepEqual(last['bench press'], [{ reps: '10', weight: 80 }, { reps: '9', weight: 82.5 }]);
  assert.deepEqual(last.plank, [{ reps: '60s', weight: 0 }, { reps: '60s', weight: 0 }]);
});

test('set boxes follow last time unless the plan changed', () => {
  const lastSets = [{ reps: '10', weight: 60 }, { reps: '8', weight: 80 }];
  // Plan still equals last time's heaviest set: weights follow last time, extra sets repeat the last one
  assert.deepEqual(plannedSetDrafts(3, '8-12', 80, lastSets), {
    0: { reps: '8-12', weight: 60 }, 1: { reps: '8-12', weight: 80 }, 2: { reps: '8-12', weight: 80 },
  });
  // Plan raised to 85 in the Planner: use the plan
  assert.deepEqual(plannedSetDrafts(2, '8-12', 85, lastSets), {
    0: { reps: '8-12', weight: 85 }, 1: { reps: '8-12', weight: 85 },
  });
  // Never done before
  assert.deepEqual(plannedSetDrafts(1, '5', 100), { 0: { reps: '5', weight: 100 } });
});

test('formatSet shows weight × reps, or reps alone for bodyweight', () => {
  assert.equal(formatSet({ reps: '10', weight: '82.5' }), '82.5 × 10');
  assert.equal(formatSet({ reps: '12', weight: 0 }), '12');
  assert.equal(formatSet(undefined), null);
});
