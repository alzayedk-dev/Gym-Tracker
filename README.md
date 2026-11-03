# Lets train 💪

A gym tracker website. People log in (email/password or Google), build a weekly workout plan, edit sets/reps/weight as they train, and mark workouts done to see how many they did this week and month. Data is stored in Supabase.

## Running it

Plain HTML/CSS/JS, no build step. Serve the folder with any static server, e.g.:

```bash
npx serve .
```

## Features

- **Schedule**: the week's plan, filterable by day, workout type (Upper, Lower, Push, Pull, Legs, Full body, Cardio) or muscle group (Chest, Back, Arms, Shoulders, Legs, Core, Full body).
- **Edit as you go**: sets, reps (a number, AMRAP or max), weight per set, kg/lbs and rest time are editable in place and save automatically. Only the exercise name is required.
- **Mark done**: mark a day's workout completed on any date.
- **Progress**: workouts this week / this month and full history.

## Database

See [database.md](database.md) for a plain-English guide to every table and column.

| Table                 | What it holds                                                              |
|-----------------------|----------------------------------------------------------------------------|
| `workout`             | A user's weekly plan: one workout per training day with its `workout_type`. |
| `exercises`           | The 1 or more exercises in a workout: name, muscle groups, sets, reps, weights, kg/lbs, rest. |
| `workout_completions` | One row each time a workout is marked done on `completed_on`.             |

Every table has a `user_id` and Row Level Security, so users only see and change their own rows.

Schema lives in [`supabase/migrations`](supabase/migrations). The Supabase URL and publishable key are in `app.js`; the publishable key is safe to expose in a browser.
