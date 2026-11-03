# Gym Tracker

A website where people log in and record their workouts. Data is stored in Supabase.

## Running it

It's a plain HTML/CSS/JS site, no build step. Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

Sign up with an email and password. Supabase sends a confirmation email by default; confirm it, then log in.

## Database

Table `public.workouts` — one row per exercise on a given date.

| Column        | Type                         | Notes                                   |
|---------------|------------------------------|-----------------------------------------|
| `id`          | bigint (identity)            | Primary key                             |
| `user_id`     | uuid → `auth.users`          | Set automatically to the logged-in user |
| `entry_date`  | date                         | Defaults to today                       |
| `day_of_week` | enum `Monday` … `Sunday`     | Filled from `entry_date` by the site    |
| `exercise`    | text                         | e.g. `Bench Press`                      |
| `sets`        | smallint                     | Must be > 0                             |
| `reps`        | smallint                     | Must be > 0                             |
| `weight`      | numeric(6,2)                 | Optional, ≥ 0 (e.g. `62.5`)             |
| `completed`   | boolean                      | Defaults to `false`                     |
| `created_at`  | timestamptz                  | Defaults to `now()`                     |

Row Level Security: each user can only read and change their own rows.

Schema lives in [`supabase/migrations`](supabase/migrations). The Supabase URL and publishable key are in `app.js`; the publishable key is safe to expose in a browser.
