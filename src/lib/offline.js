import { submitWorkout } from './awardWorkout';

// Per-user data kept on the phone so the Today page works without signal.
const storageKey = (userId, name) => `gymbro:${name}:${userId}`;

export function readStore(userId, name, fallback) {
  try {
    const value = localStorage.getItem(storageKey(userId, name));
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStore(userId, name, value) {
  try {
    if (value == null) localStorage.removeItem(storageKey(userId, name));
    else localStorage.setItem(storageKey(userId, name), JSON.stringify(value));
  } catch (error) {
    console.error('Could not save on this device', error);
  }
}

// ---- Outbox: finished workouts waiting to reach Supabase ----
const notify = () => window.dispatchEvent(new Event('gymbro:outbox'));

export const getQueued = (userId) => readStore(userId, 'outbox', []);
export const getFailed = (userId) => readStore(userId, 'failed', []);

export function enqueueWorkout(userId, op) {
  writeStore(userId, 'outbox', [...getQueued(userId), op]);
  notify();
}

let inFlight = null;

// Takes a workout back out of the queue (Undo). Returns null if it is already uploading or gone.
export function removeQueued(userId, clientId) {
  const queued = getQueued(userId);
  const op = queued.find(o => o.clientId === clientId);
  if (!op || inFlight === clientId) return null;
  writeStore(userId, 'outbox', queued.filter(o => o.clientId !== clientId));
  notify();
  return op;
}

export function retryFailed(userId) {
  // eslint-disable-next-line no-unused-vars
  const failed = getFailed(userId).map(({ error, ...op }) => op);
  writeStore(userId, 'outbox', [...getQueued(userId), ...failed]);
  writeStore(userId, 'failed', null);
  notify();
  return flushOutbox(userId);
}

// Network drops and expired logins retry later; anything else the server rejects is parked so it can't block the queue
const isTransient = (error) => !error?.code || error.code === '23505' || String(error.code).startsWith('PGRST3');

let running = null;

// Uploads queued workouts in order. Safe to call often: concurrent calls share one run,
// and each workout carries a client id so a retry after a dropped response is not saved twice.
export function flushOutbox(userId) {
  running ??= (async () => {
    try {
      let op;
      while ((op = getQueued(userId)[0])) {
        inFlight = op.clientId;
        let result = null;
        try {
          result = await submitWorkout(userId, op);
        } catch (error) {
          if (isTransient(error)) break;
          console.error(error);
          writeStore(userId, 'failed', [...getFailed(userId), { ...op, error: error.message }]);
        }

        writeStore(userId, 'outbox', getQueued(userId).filter(o => o.clientId !== op.clientId));
        if (result) {
          const last = readStore(userId, 'lastFinished', null);
          if (last?.clientId === op.clientId) writeStore(userId, 'lastFinished', { ...last, workoutId: result.workoutId });
          window.dispatchEvent(new CustomEvent('gymbro:synced', { detail: result }));
        }
        notify();
        if (getQueued(userId)[0]?.clientId === op.clientId) break; // storage refused the write; don't loop forever
      }
    } finally {
      inFlight = null;
      running = null;
    }
  })();
  return running;
}

export function confirmSignOut(userId) {
  const pending = getQueued(userId).length + getFailed(userId).length;
  return pending === 0 || window.confirm(
    `${pending} workout${pending === 1 ? " hasn't" : "s haven't"} synced yet. They stay on this phone and upload the next time you sign in here. Sign out anyway?`
  );
}
