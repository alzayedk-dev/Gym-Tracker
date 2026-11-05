# Lets train 💪

A gym tracker website. People log in, build workouts, and track the sets, reps and weights they actually do each session. Data is stored in Supabase. Live at https://letstrain-iota.vercel.app (deployed by Vercel on every push to `main`).

## Running it locally

Plain HTML/CSS/JS, no build step. Serve the folder with any static server, e.g.:

```bash
npx serve .
```

## Features

- **New workout**: pick one type (Full body, Upper, Lower), then weekdays (recurring every week) or exact dates (one-off), then add as many exercises as you like: name, sets, reps (a number, AMRAP or max), weight per set, kg/lbs and rest time. Save with **Lets train**.
- **This week**: every workout on every date, with a **Completed** box. Sets, reps and weights are editable and saved for that date, pre-filled from last time. Filter by type or muscle; step back and forward through weeks.
- **Progress photos**: add pictures to any session (JPEG, PNG, WebP or GIF, up to 5 MB). They're stored in the public `progress-photos` bucket and shown on the session card and in a gallery.
- **Progress**: completed workouts this week / this month, the photo gallery and the full list.
- **Coach**: an AI coach chat for questions about exercises and how to change workout type, reps or exercises. It reads your plan and recent sessions and only gives advice. Runs in the `coach` Supabase Edge Function ([`supabase/functions/coach`](supabase/functions/coach)), which calls a free OpenRouter model using the `OPENROUTER_API_KEY` Supabase secret; logged-in users only, chats aren't saved.

## Database

See [database.md](database.md) for a plain-English guide to every table and column.

| Table               | What it holds                                                       |
|---------------------|---------------------------------------------------------------------|
| `workout`           | A planned workout: type, recurring weekdays or one-off dates.      |
| `exercises`         | The exercises in a workout, with the planned numbers.              |
| `sessions`          | One workout on one date, with the Completed tick and photo links.  |
| `session_exercises` | What was actually done for each exercise in a session.             |

Every table has a `user_id` and Row Level Security, so users only see and change their own rows.

Schema lives in [`supabase/migrations`](supabase/migrations). The Supabase URL and publishable key are in `app.js`; the publishable key is safe to expose in a browser.
