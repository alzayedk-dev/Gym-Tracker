# Lets train 💪 — Database guide

The website stores its data in Supabase, in four tables:

- **`workout`**: a workout you planned, with one type, on some weekdays (recurring) or on exact dates (one-off).
- **`exercises`**: the exercises in each workout. A workout can have 1 exercise or 20.
- **`sessions`**: one workout on one date. This is where **Completed** is ticked.
- **`session_exercises`**: what you actually did for each exercise in a session (sets, reps, weights).

Each person only ever sees their own rows.

## The tables

### `workout` — what you planned

One row each time you press **Lets train 💪** on the New workout page.

| Column         | Type                                          | Why it's there |
|----------------|-----------------------------------------------|----------------|
| `id`           | Whole number, given automatically             | A unique number for each workout, so exercises and sessions can point to it. |
| `user_id`      | User ID, filled in automatically              | Says whose workout this is. It's what keeps your data private. |
| `workout_type` | One of: Full body, Upper, Lower               | The kind of workout. You pick exactly one. Used by the type filter. |
| `recurring`    | True / false (starts as true)                 | The **Recurring session** box. True = repeats every week; false = only on the dates you picked. |
| `days`         | A list of: Monday … Sunday                    | For recurring workouts: which weekdays it repeats on. Can be several. Empty for one-offs. |
| `dates`        | A list of dates                               | For one-off workouts: the exact dates. Can be several. Empty for recurring. |
| `archived_at`  | Date and time, can be empty                   | Set when you press **Remove workout**. It stops showing from then on, but past sessions stay in your history. |
| `created_at`   | Date and time, filled in automatically        | When the workout was made. A recurring workout starts showing from that week. |

Rule: a recurring workout must have at least one day and no dates; a one-off must have at least one date and no days.

### `exercises` — the plan for each exercise

One row for each exercise card you filled in. **Only the name is required.**

| Column          | Type                                                         | Why it's there |
|-----------------|--------------------------------------------------------------|----------------|
| `id`            | Whole number, given automatically                            | A unique number for each exercise. |
| `user_id`       | User ID, filled in automatically                             | Keeps it private. |
| `workout_id`    | The `id` of a workout                                        | Which workout this exercise belongs to. |
| `position`      | Whole number                                                 | The order you added them in (1st, 2nd, 3rd…). |
| `exercise`      | Text, **required**                                           | The exercise name, e.g. "Bench Press". |
| `muscle_groups` | A list of: Chest, Back, Arms, Shoulders, Legs, Core, Full body | Optional. Which muscles it works. Used by the muscle filter. |
| `sets`          | Whole number, more than 0, can be empty                      | Planned number of sets. |
| `reps`          | Short text (up to 20 characters), can be empty               | Planned reps. Text so it can be `10`, `AMRAP` or `Max`. |
| `weights`       | A list of numbers (0 or more), can be empty                  | Planned weight per set, e.g. `60, 65, 70`. Empty for bodyweight. |
| `weight_unit`   | One of: kg, lbs (starts as kg)                               | The kg / lbs switch. |
| `rest_seconds`  | Whole number of seconds, in steps of 15, can be empty        | Rest between sets. Stored as seconds (`75`), shown as `1 min 15 sec`. |
| `created_at`    | Date and time, filled in automatically                       | When it was added. |

### `sessions` — one workout on one date

Made the first time you tick **Completed** or type a number into a workout on the This week page.

| Column         | Type                                   | Why it's there |
|----------------|----------------------------------------|----------------|
| `id`           | Whole number, given automatically      | A unique number for each session. |
| `user_id`      | User ID, filled in automatically       | Keeps it private. |
| `workout_id`   | The `id` of a workout                  | Which workout was done. |
| `session_date` | Date                                   | Which date it was done on. |
| `completed`    | True / false (starts as false)         | The **Completed** box. Completed sessions are what the week and month counts add up. |
| `photo_urls`   | A list of links, empty when there are none | Progress photos for this session. Each **Add progress photo** upload adds its link here. Most sessions won't have any, and that's fine. |
| `created_at`   | Date and time, filled in automatically | When the session was first saved. |

Rule: one session per workout per date, so nothing is counted twice.

### `session_exercises` — what you actually did

One row per exercise per session, saved as soon as you change a number on the This week page.

| Column        | Type                                   | Why it's there |
|---------------|----------------------------------------|----------------|
| `id`          | Whole number, given automatically      | A unique number for each entry. |
| `user_id`     | User ID, filled in automatically       | Keeps it private. |
| `session_id`  | The `id` of a session                  | Which day's session this belongs to. |
| `exercise_id` | The `id` of an exercise                | Which exercise it is. |
| `sets`        | Whole number, more than 0, can be empty | Sets you actually did. |
| `reps`        | Short text, can be empty               | Reps you actually did (`12`, `AMRAP`, `Max`…). |
| `weights`     | A list of numbers, can be empty        | Weight you actually used per set. |
| `weight_unit` | One of: kg, lbs                        | Unit for those weights. |
| `created_at`  | Date and time, filled in automatically | When it was first saved. |

Rule: one entry per exercise per session.

### `progress-photos` — the photo storage bucket

Not a table: a public folder in Supabase Storage that holds the picture files. The links in `sessions.photo_urls` point here.

| Setting        | Value                          | Why |
|----------------|--------------------------------|-----|
| Public         | Yes                            | Anyone with a photo's link can view it, so pictures load on the website without extra steps. |
| File types     | JPEG, PNG, WebP, GIF only      | Images that every browser can show. Anything else is refused. |
| Max size       | 5 MB per file                  | Keeps storage small and pages fast. |
| Who can upload | Anyone                         | As requested for now. |
| Who can delete | Nobody, from the website       | There's no delete permission, so photos can't be removed by accident or by others. |

Files are saved as `<user id>/<random name>.<jpg|png|webp|gif>`, so each person's photos sit in their own folder.

## Example rows

One person makes two workouts. (`id`, `user_id` and `created_at` are left out to keep it readable.)

### `workout`

| id | workout_type | recurring | days             | dates      |
|----|--------------|-----------|------------------|------------|
| 1  | Upper        | true      | Monday, Thursday |            |
| 2  | Lower        | false     |                  | 2026-11-20 |

- Workout 1 shows **every** Monday and Thursday.
- Workout 2 shows **only** on Friday 20 Nov 2026.

### `exercises`

| workout_id | position | exercise    | sets | reps  | weights    | weight_unit | rest_seconds |
|------------|----------|-------------|------|-------|------------|-------------|--------------|
| 1          | 0        | Bench Press | 3    | 8     | 60, 65, 70 | kg          | 90           |
| 1          | 1        | Pull-ups    | 3    | Max   |            | kg          | 75           |
| 2          | 0        | Squat       | 5    | 5     | 100        | kg          | 120          |
| 2          | 1        | Plank       |      |       |            | kg          |              |

- **Bench Press** goes up in weight each set, so it has three weights.
- **Pull-ups** use `Max` and no weight, since they're bodyweight.
- **Plank** only has a name, the one required field.
- Rest `90` shows as `1 min 30 sec`, `75` as `1 min 15 sec`, `120` as `2 min`.

### `sessions`

| id | workout_id | session_date | completed |
|----|------------|--------------|-----------|
| 1  | 1          | 2026-11-02   | true      |
| 2  | 1          | 2026-11-05   | true      |
| 3  | 1          | 2026-11-09   | false     |

- Monday 2 Nov and Thursday 5 Nov were done.
- Monday 9 Nov has a number typed in but isn't ticked yet.

### `session_exercises`

| session_id | exercise_id   | sets | reps | weights        | weight_unit |
|------------|---------------|------|------|----------------|-------------|
| 1          | (Bench Press) | 3    | 8    | 60, 65, 70     | kg          |
| 2          | (Bench Press) | 3    | 8    | 62.5, 67.5, 72.5 | kg        |
| 2          | (Pull-ups)    | 3    | 10   |                | kg          |
| 3          | (Bench Press) | 3    | 6    | 65, 70, 75     | kg          |

- On 5 Nov the bench went up 2.5 kg a set compared to 2 Nov.
- On 9 Nov the boxes started pre-filled with 5 Nov's numbers, and only the reps and weights that changed were edited.

## Questions

**How does tracking work week to week?**
On This week, each workout shows its exercises with Sets, Reps and Weight boxes. The boxes start with what you did **last time**, or with your plan if it's the first time. Change whatever is different today and it saves for that date only. Your plan and past weeks stay as they were.

**What's the difference between recurring and one-off?**
Tick **Recurring session** and pick weekdays: the workout shows every week on those days. Untick it and pick exact dates: it shows only on those dates.

**Can one workout be on several days?**
Yes. Pick as many weekdays (or dates) as you like. It's the same workout, with the same exercises, on each of them, and each date is tracked separately.

**What does Completed do?**
It marks that workout as done on that date. The Progress page counts completed sessions this week (Monday–Sunday) and this month.

**What happens if I remove a workout?**
It stops appearing from today on. Sessions you already tracked stay, so your history and counts don't change.

**Why are there separate tables for plan and sessions?**
The plan says what you *intend* to do; sessions say what you *actually did* on a date. Keeping them apart means you can change the plan without rewriting history, and look back at any week.

**Why is `reps` text?**
So it can hold `AMRAP` or `Max` as well as numbers. Typing `amrap` or `max` in any capitalisation is saved as `AMRAP` / `Max`.

**How do I enter different weights per set?**
Separate them with commas, e.g. `60, 65, 70`. One number is fine if every set is the same.

**Does kg ↔ lbs convert the numbers?**
No. It only changes the label. It's for picking the right unit, not converting.

**How do progress photos work?**
On any workout in This week, press **Add progress photo** and pick a picture. It's uploaded to the `progress-photos` bucket, and its link is added to that session's `photo_urls`. You can add several per session. All photos also appear in the **Progress photos** gallery on the Progress page, newest first.

**What happens if I pick a file that isn't an image, or is too big?**
The website says: *"Sorry, only images (JPEG, PNG, WebP or GIF) up to 5 MB can be added."* The bucket also refuses it on its own, so the rule holds even if someone skips the website.

**Can photos be deleted?**
Not from the website. There are no delete buttons and the bucket has no delete permission.

**Who can see my progress photos?**
The bucket is public: anyone who has a photo's link can open it. Links are long and random, so they're hard to guess, but if you share one, whoever gets it can see that picture.

**Does the AI coach store anything?**
No. The coach reads your plan and your last few sessions (only your own rows, the same privacy rules apply) to tailor its answers, but it doesn't write to any table and chats aren't saved.

**Can other people see my workouts?**
No. Every table has a `user_id`, and the database only lets you read or change rows with your own ID.

**Where are logins stored?**
In Supabase's built-in user list (`auth.users`), not in these tables. Passwords are handled by Supabase and never stored in plain text.

**Where is the SQL that built these tables?**
In [`supabase/migrations`](supabase/migrations), one file per change, in the order they were run.
