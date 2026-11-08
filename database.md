# Lets train 💪 — Database guide

The website stores its data in Supabase. The four main tables are below, plus `week_summaries` and `ai_requests`, which are explained further down:

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
| `summary`      | JSON, can be empty                     | The **Workout summary** shown under a completed workout: totals (sets, reps, weight lifted), what changed since last time, and a short note from the AI coach (or your own). Made when you tick **Completed**. |
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

### `week_summaries`: how your week went

One row per person per week, made when every workout in the week is ticked **Completed** (or when you press **Summarize my week** on a finished week).

| Column       | Type                                   | Why it's there |
|--------------|----------------------------------------|----------------|
| `id`         | Whole number, given automatically      | A unique number for each summary. |
| `user_id`    | User ID, filled in automatically       | Keeps it private. |
| `week_start` | Date, always a Monday                  | Which week it's about. |
| `summary`    | JSON                                   | Workouts done, total sets, reps and weight lifted, **sets per muscle** (Not trained / Light / Good / A lot), and the coach's tips on which muscles need work or got too much (or your own note). |
| `created_at` | Date and time, filled in automatically | When it was first made. |

Rule: one summary per person per week.

### `subscriptions`: payments for the AI coach

One row each time someone presses **Pay with KNET** on the Subscribe tab. Monthly is 3 KD, yearly is 30 KD, paid by KNET on MyFatoorah. Rows are written **only** by the payment edge functions. You can read your own rows (to see if you're subscribed), but nobody can add or change them from the website, so nobody can mark themselves as paid.

| Column            | Type                                   | Why it's there |
|-------------------|----------------------------------------|----------------|
| `id`              | Whole number, given automatically      | A unique number for each payment attempt. Sent to MyFatoorah as the "customer reference". |
| `user_id`         | User ID                                | Who is paying. |
| `plan`            | `monthly` or `yearly`                  | Which plan they chose. |
| `amount`          | Number (3 decimals)                    | The price, set by the server (3 or 30), never by the browser. |
| `currency`        | Text (`KWD`)                           | Kuwaiti dinar. |
| `status`          | `pending`, `paid` or `failed`          | `pending` when the payment link is made, then `paid` or `failed` once MyFatoorah confirms. |
| `customer_name`   | Text                                   | The name shown on the MyFatoorah payment page. |
| `customer_email`  | Text                                   | Your login email; MyFatoorah shows it and sends the receipt there. |
| `customer_mobile` | 8 digits, can be empty                 | Kuwait mobile (shown as +965…) on the payment page. Optional. |
| `invoice_id`      | Whole number                           | MyFatoorah's invoice for this attempt. |
| `invoice_reference` | Text                                 | MyFatoorah's invoice reference, as printed on the receipt. |
| `payment_id`      | Text                                   | MyFatoorah's payment ID once KNET has answered. |
| `payment_url`     | Text                                   | The MyFatoorah payment link. |
| `payment_method`  | Text                                   | How it was paid, as MyFatoorah reports it (e.g. KNET). |
| `transaction_id`  | Text                                   | MyFatoorah's transaction ID. |
| `reference_id`    | Text                                   | The bank / KNET reference number, for matching bank statements. |
| `track_id`        | Text                                   | KNET's track ID. |
| `authorization_id`| Text                                   | KNET's authorization code (successful payments). |
| `failure_reason`  | Text                                   | Why it failed, as MyFatoorah explains it (e.g. cancelled, declined). |
| `starts_at`, `ends_at` | Date and time                     | The time this payment covers. If you renew early, it starts when your current time runs out. |
| `created_at`      | Date and time                          | **When the payment was started** (the link was made). |
| `paid_at`         | Date and time                          | **When the payment was confirmed** by MyFatoorah. |
| `failed_at`       | Date and time                          | **When it failed or was cancelled.** Every failed row must have one. |
| `updated_at`      | Date and time                          | **Last time the row changed**, kept up to date automatically. |

You're subscribed while you have a `paid` row whose `ends_at` is in the future.

**Who can write payments.** Only the server: the service role, used by the `create-payment` and `payment-callback` edge functions. Three layers protect this, so one mistake later can't open it up:
1. **Permissions:** website users (logged in or not) can only *read*, and only their own rows. The server can add and update, but nobody can delete or wipe payments; they're a permanent record.
2. **"Never" policies:** restrictive Row Level Security policies refuse every insert, update and delete from website users. They override any policy added later.
3. **Column guard:** a database trigger refuses any change to `status`, `amount`, `plan`, `user_id`, `paid_at`, `starts_at`, `ends_at` or `payment_id` unless it comes from the service role.

### `ai_requests`: the AI rate guard

A behind-the-scenes log of AI requests (coach questions and summaries). Before calling the AI, each edge function asks the database for a slot. **At most 5 AI requests a minute in total** are allowed, so nobody can use up the free OpenRouter allowance (about 50 a day). Nobody can read or change this table from the website; rows older than a day are cleaned up automatically.

| Column       | Type                         | Why it's there |
|--------------|------------------------------|----------------|
| `id`         | Whole number                 | A unique number for each request. |
| `user_id`    | User ID                      | Who asked. |
| `fn`         | Text                         | Which function asked: `coach`, `summarize` or `week-summary`. |
| `created_at` | Date and time                | When, so the last minute can be counted. |

### `progress-photos` — the photo storage bucket

Not a table: a **private** folder in Supabase Storage that holds the picture files. `sessions.photo_urls` stores where each photo sits in it.

| Setting        | Value                          | Why |
|----------------|--------------------------------|-----|
| Public         | No                             | Photos can only be opened with a private link that lasts 1 hour, and only the owner can get one. |
| File types     | JPEG, PNG, WebP, GIF only      | Images that every browser can show. Anything else is refused. |
| Max size       | 5 MB per file                  | Keeps storage small and pages fast. |
| Who can upload | Logged-in users, into their own folder only | Nobody can add files to someone else's folder, and people who aren't logged in can't upload. |
| Who can view   | Only the owner                 | Each person can only see the files in their own folder. |
| Who can delete | Nobody, from the website       | There's no delete permission, so photos can't be removed by accident or by others. |

Files are saved as `<user id>/<random name>.<jpg|png|webp|gif>`, so each person's photos sit in their own folder.

## Privacy rules (Row Level Security)

Every table that holds your data has a `user_id` column. It's filled in automatically with the Supabase Auth ID of whoever created the row, and it links to that login, so if an account is deleted, its rows go with it. On every one of those tables (`workout`, `exercises`, `sessions`, `session_exercises`, `week_summaries`) the same four rules apply, only for logged-in users:

| Rule | What it means |
|------|---------------|
| **own read**   | You can only see rows where `user_id` is your ID. Other people's rows are invisible, not just locked. |
| **own insert** | You can only add rows with your own ID. You can't create a row "as" someone else. |
| **own update** | You can only change your own rows, and you can't hand a row over to someone else by changing its `user_id`. |
| **own delete** | You can only delete your own rows. |

On top of that:
- **People who aren't logged in get nothing.** They can't read, add, change or delete anything in any table.
- **Links stay inside your own data.** An exercise can only belong to your own workout, a session to your own workout, a logged result to your own session and your own exercise, and a session's photos must be in your own photo folder.
- **No shortcuts.** The website roles can't empty a whole table (TRUNCATE) or add triggers, which would bypass the rules above.
- **`ai_requests`** can't be read or changed by anyone from the website at all; only the rate guard touches it.
- **Your profile** (email, display name, sign-in methods) lives in Supabase Auth, not in these tables. Only you can read or change your own profile, and nobody else can see it.

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
Only you. The bucket is private: the website asks for a private link that lasts 1 hour, and only the photo's owner can get one. Even if you copy a photo's link and share it, it stops working after an hour.

**Does the AI coach store anything?**
No. The coach reads your plan and your last few sessions (only your own rows, the same privacy rules apply) to tailor its answers, but it doesn't write to any table and chats aren't saved.

**How do the workout and week summaries work?**
Tick **Completed** and the `summarize` edge function adds up that workout and asks the AI for a short note. A thinking face 🤔 shows while it works. When the last workout of the week is ticked, the `week-summary` function does the same for the whole week and gives tips on muscles that need work or got a lot. The website only ever calls these Supabase functions; the OpenRouter key stays on Supabase and never reaches the browser.

**How does it know which muscles I worked?**
It reads the exercise names you typed. If you picked muscles on an exercise card, those are used. Otherwise the name is matched against common gym words: "bench press" → Chest, "pullup" → Back, "dips" → Chest + Arms, "back squat" → Legs, "leg raise" → Core, and so on. Any name it still doesn't recognise is sent to the AI to work out (this uses one of the 5-a-minute AI requests). If even that fails, the summary lists those exercises so you can pick their muscles yourself.

**How does paying work?**
On the **⭐ Subscribe** tab, pick Monthly (3 KD) or Yearly (30 KD), check your name and (optionally) mobile, and press **Pay with KNET**. The `create-payment` edge function makes a pending row and a MyFatoorah payment link showing the amount, your name, email and mobile. You pay by KNET there. MyFatoorah then sends you to the `payment-callback` edge function, which asks MyFatoorah whether it was really paid and for the right amount. If it was, your row becomes `paid` and you land on the **Payment confirmed** page. Otherwise you land on **Payment failed**. The MyFatoorah key is the Supabase secret `MYFATOORAH_API_KEY` and never reaches the browser.

**What does subscribing unlock?**
The AI coach chat. Workout and week summaries (including their AI notes) stay free. The coach function checks for an active subscription itself, so it can't be skipped from the browser.

**Does it renew automatically?**
No, KNET can't charge automatically. A banner appears 3 days before your subscription ends, and paying again adds the time on top of what you have left.

**What if the AI fails or is busy?**
The numbers still show and are saved. The note box stays empty for you to write your own, and you can always edit the note.

**Can other people see my workouts?**
No. Every table has a `user_id`, and the database only lets you read or change rows with your own ID.

**Where are logins stored?**
In Supabase's built-in user list (`auth.users`), not in these tables. Passwords are handled by Supabase and never stored in plain text.

**Where is the SQL that built these tables?**
In [`supabase/migrations`](supabase/migrations), one file per change, in the order they were run.
