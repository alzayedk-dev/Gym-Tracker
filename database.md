# Lets train 💪 — Database guide

The website stores its data in Supabase, in three tables:

- **`workout`**: your weekly plan, one workout per training day (e.g. Monday – Upper).
- **`exercises`**: the exercises inside each workout. A workout can have 1 exercise or 20.
- **`workout_completions`**: a log of every time you finish a workout.

Each person only ever sees their own rows.

## The tables

### `workout` — your weekly plan

One row for each day you train. A day with no row is a rest day.

| Column         | Type                                                      | Why it's there |
|----------------|-----------------------------------------------------------|----------------|
| `id`           | Whole number, given automatically                         | A unique number for each workout, so the website can find and change it. |
| `user_id`      | User ID, filled in automatically                          | Says whose workout this is. It's what keeps your data private. |
| `day_of_week`  | One of: Monday … Sunday                                   | Which day this workout is on. A fixed list, so it can't be misspelled. |
| `workout_type` | One of: Upper, Lower, Push, Pull, Legs, Full body, Cardio | What kind of workout it is. Used by the "Workout type" filter. |
| `created_at`   | Date and time, filled in automatically                    | When the workout was added. |

Rule: each person can only have **one** workout per day (one Monday, one Tuesday…).

### `exercises` — what's in each workout

One row for each exercise. **Only the exercise name is required**, so everything else can be left empty. That covers bodyweight moves, AMRAP rounds, or anything you just want to list.

| Column          | Type                                                         | Why it's there |
|-----------------|--------------------------------------------------------------|----------------|
| `id`            | Whole number, given automatically                            | A unique number for each exercise, so it can be edited or deleted. |
| `user_id`       | User ID, filled in automatically                             | Says whose exercise this is. Keeps it private. |
| `day_of_week`   | One of: Monday … Sunday                                      | Which workout this exercise belongs to. Links to the `workout` table. |
| `exercise`      | Text, **required**                                           | The exercise name, e.g. "Bench Press". The only field you must fill in. |
| `muscle_groups` | A list of: Chest, Back, Arms, Shoulders, Legs, Core, Full body | Which muscles it works. Can hold several or none. Used by the "Muscle" filter. |
| `sets`          | Whole number, more than 0, can be empty                      | How many sets. |
| `reps`          | Short text (up to 20 characters), can be empty               | How many reps. It's text so it can be a number like `10`, or `AMRAP` / `Max` for as-many-as-possible rounds. |
| `weights`       | A list of numbers (0 or more, up to 2 decimals), can be empty | The weight for each set, e.g. `60, 65, 70`. A list because the weight can change from set to set. Empty for bodyweight. |
| `weight_unit`   | One of: kg, lbs (starts as kg)                               | Whether the weights are in kilograms or pounds. Set by the kg / lbs switch. |
| `rest_seconds`  | Whole number of seconds, in steps of 15, can be empty        | Rest time between sets. Stored as seconds (e.g. `75`); the website shows it as minutes and seconds (`1 min 15 sec`). |
| `created_at`    | Date and time, filled in automatically                       | When it was added. Keeps exercises in the order you added them. |

Rules:
- An exercise can only be added to a day that has a workout in the `workout` table.
- The name can't be blank.
- Rest time must be a multiple of 15 seconds: 15, 30, 45, 60, 75…

### `workout_completions` — workouts you've finished

One row each time you press **Mark done**.

| Column         | Type                                                      | Why it's there |
|----------------|-----------------------------------------------------------|----------------|
| `id`           | Whole number, given automatically                         | A unique number for each entry, so it can be undone. |
| `user_id`      | User ID, filled in automatically                          | Says who did the workout. Keeps it private. |
| `completed_on` | Date (starts as today)                                    | The date you did the workout. Used for the "this week" and "this month" counts. |
| `day_of_week`  | One of: Monday … Sunday                                   | Which day's workout from your plan you did. |
| `workout_type` | One of: Upper, Lower, Push, Pull, Legs, Full body, Cardio | The workout type at the time you did it, so history stays correct even if you change your plan later. |
| `created_at`   | Date and time, filled in automatically                    | When you pressed the button. |

Rule: the same workout can only be marked done **once per date**, so nothing is counted twice.
