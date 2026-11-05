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

- **Workout summary**: ticking **Completed** calls the `summarize` edge function. It shows totals (sets, reps, weight lifted), what changed since last time and a short AI coach note under the workout, saved in `sessions.summary`.
- **Week summary**: when every workout in a week is ticked (or on request for a finished week), the `week-summary` edge function reads your exercise names to work out which muscles you trained ([`_shared/muscles.ts`](supabase/functions/_shared/muscles.ts): your picked muscles, then name matching, then the AI for unknown names) and shows sets per muscle (not trained / light / good / a lot) and AI tips on what needs work or was overworked, saved in `week_summaries`.
- **AI safety**: the browser only calls Supabase edge functions, never OpenRouter. A rate guard (`ai_take_slot`) allows at most 5 AI requests a minute in total. If the AI fails or is limited, the numbers still show and you can write the note yourself.

## Database

See [database.md](database.md) for a plain-English guide to every table and column.

| Table               | What it holds                                                       |
|---------------------|---------------------------------------------------------------------|
| `workout`           | A planned workout: type, recurring weekdays or one-off dates.      |
| `exercises`         | The exercises in a workout, with the planned numbers.              |
| `sessions`          | One workout on one date, with the Completed tick, photo links and summary.  |
| `session_exercises` | What was actually done for each exercise in a session.             |
| `week_summaries`    | One summary per finished week: muscle balance and coach tips.      |
| `ai_requests`       | Rate-guard log of AI requests (not readable from the website).     |

Every table has a `user_id` and Row Level Security, so users only see and change their own rows.

Schema lives in [`supabase/migrations`](supabase/migrations). The Supabase URL and publishable key are in `app.js`; the publishable key is safe to expose in a browser.
