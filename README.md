# GymBro

Workout tracker for two training partners: weekly templates, set-by-set logging, streaks with monthly shields, XP/levels, PRs, badges, a shared calendar and an activity feed.

React + Vite frontend, Supabase (Postgres + Auth) backend.

## Setup

1. `npm install`
2. Create `.env.local`:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
3. New Supabase project: run `supabase_schema.sql` in the SQL Editor. **It drops all tables first, never run it on live data.**
   Existing project: run the `supabase_migration_*.sql` files you haven't run yet.
4. In Supabase → Authentication, turn off new sign-ups once both accounts exist.

## Scripts

- `npm run dev`: local dev server
- `npm run build`: production build
- `npm test`: unit tests for streak, shield and volume logic (`src/lib/utils.test.js`)
- `npm run lint`: oxlint

## Install on a phone

Hosted on Cloudflare Pages (build `npm run build`, output `dist`). `public/_headers` keeps the service worker fresh.

- iPhone: open the link in Safari → Share → Add to Home Screen.
- Android: open in Chrome → Install app.

## Offline

- The installed app opens without signal (`public/sw.js` caches the app's own files).
- The Today page works fully offline: a workout in progress is kept on the phone (`src/lib/offline.js`), and Finish puts it in a queue that uploads when the app is open with signal (on open, when signal returns, when brought to the foreground).
- A workout is dated by the day it was started, so finishing after midnight still saves it to that day.
- Each upload carries an id made on the phone, and `finish_workout` saves everything in one transaction, so retries never duplicate a workout.
- Other pages need signal.

## Notes

- XP is calculated in the database (`award_workout_xp` / `revoke_workout_xp`). The volume rule there must match `calculateVolume` in `src/lib/utils.js`.
- A "template" is a `workouts` row with `completed = false`; finished workouts are copied into new rows with `completed = true`.
