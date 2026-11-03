# Gym Tracker

A weekly gym schedule backed by Supabase.

## Database

Table `public.workouts` — one row per exercise on a training day. Days with no rows are rest days.

| Column        | Type                         | Notes                  |
|---------------|------------------------------|------------------------|
| `id`          | bigint (identity)            | Primary key            |
| `day_of_week` | enum `Monday` … `Sunday`     | Required               |
| `exercise`    | text                         | e.g. `Bench Press`     |
| `sets`        | smallint                     | Must be > 0            |
| `reps`        | smallint                     | Must be > 0            |
| `weight`      | numeric(6,2)                 | Optional, ≥ 0 (e.g. `62.5`) |
| `entry_date`  | date                         | Defaults to today      |
| `completed`   | boolean                      | Defaults to `false`    |
| `created_at`  | timestamptz                  | Defaults to `now()`    |

Schema lives in [`supabase/migrations`](supabase/migrations).

## Setup

Copy `.env.example` to `.env` and fill in your Supabase project URL and anon/publishable key.
