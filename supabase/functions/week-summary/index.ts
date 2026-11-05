// Week summary: called when every workout in a week is done (or for a finished week).
// Adds up the week (workouts, sets, reps, weight lifted), counts sets per muscle to spot
// muscles that were missed or worked a lot, asks a free OpenRouter model for tips, and saves it.
// If the AI fails or the rate guard says no, the numbers are still saved and the user can write the note.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MODELS = ["google/gemma-4-31b-it:free", "openrouter/free"];
const MUSCLES = ["Chest", "Back", "Arms", "Shoulders", "Legs", "Core"];

const SYSTEM = `You are the encouraging strength coach in "Lets train", a gym tracker.
Write a short review of the user's training week (3-5 sentences, under 100 words):
one line of praise for what they did, then tips on balance: which muscles need more work, which got a lot
(and may need rest or less volume next week), and one concrete change for next week (for example an exercise
to add, or sets to move from one muscle to another). Use their numbers and unit. Plain text only: no headings, lists, emojis or markdown.
Weekly sets per muscle guide: 0 = not trained, under 6 = light, 6-20 = good, over 20 = a lot.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Nums = { sets: number | null; reps: string | null; weights: number[] | null; weight_unit: string };

const round = (n: number) => Math.round(n * 10) / 10;
const repsNumber = (reps: string | null) => (reps && /^\d+$/.test(reps.trim()) ? Number(reps) : null);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const level = (sets: number) => (sets === 0 ? "none" : sets < 6 ? "light" : sets <= 20 ? "good" : "lot");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!user) return json({ error: "Please log in first." }, 401);

  let body: { week_start?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const weekStart = String(body.week_start ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || new Date(weekStart + "T00:00:00Z").getUTCDay() !== 1) {
    return json({ error: "The week must start on a Monday." }, 400);
  }
  const weekEnd = addDays(weekStart, 6);

  const [w, e, s, l, old] = await Promise.all([
    db.from("workout").select("id, workout_type"),
    db.from("exercises").select("*").order("position"),
    db.from("sessions").select("id, workout_id, session_date, completed"),
    db.from("session_exercises").select("*"),
    db.from("week_summaries").select("summary").eq("week_start", weekStart).maybeSingle(),
  ]);
  const workouts = w.data ?? [];
  const exercises = e.data ?? [];
  const allSessions = s.data ?? [];
  const logs = l.data ?? [];
  const dateOf = new Map(allSessions.map((x) => [x.id, x.session_date as string]));
  const pick = (r: Nums): Nums => ({ sets: r.sets, reps: r.reps, weights: r.weights, weight_unit: r.weight_unit });

  const done = allSessions
    .filter((x) => x.completed && x.session_date >= weekStart && x.session_date <= weekEnd)
    .sort((a, b) => a.session_date.localeCompare(b.session_date));
  if (!done.length) return json({ error: "No completed workouts this week yet." }, 400);

  // Per muscle sets; an exercise marked "Full body" counts towards every muscle.
  const muscleSets: Record<string, number> = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
  const volume: Record<string, number> = {};
  const types: Record<string, number> = {};
  let sets = 0, reps = 0, unlabelled = 0;
  const lines: string[] = [];

  for (const se of done) {
    const wk = workouts.find((x) => x.id === se.workout_id);
    const type = wk?.workout_type ?? "Workout";
    types[type] = (types[type] ?? 0) + 1;
    const items: string[] = [];
    for (const x of exercises.filter((x) => x.workout_id === se.workout_id)) {
      // Same rule as the website: logged that day, else the last numbers before, else the plan.
      const today = logs.find((r) => r.session_id === se.id && r.exercise_id === x.id);
      const before = logs
        .filter((r) => r.exercise_id === x.id && (dateOf.get(r.session_id) ?? "") < se.session_date)
        .sort((a, b) => dateOf.get(b.session_id)!.localeCompare(dateOf.get(a.session_id)!))[0];
      const n = pick(today ?? before ?? x);
      const nSets = n.sets ?? (n.weights?.length || 0);
      const nReps = repsNumber(n.reps);
      sets += nSets;
      if (nReps !== null) {
        reps += nSets * nReps;
        if (n.weights?.length) {
          let v = 0;
          for (let i = 0; i < nSets; i++) v += nReps * Number(n.weights[Math.min(i, n.weights.length - 1)]);
          volume[n.weight_unit] = round((volume[n.weight_unit] ?? 0) + v);
        }
      }
      const muscles: string[] = x.muscle_groups ?? [];
      const hit = muscles.includes("Full body") ? MUSCLES : muscles.filter((m) => MUSCLES.includes(m));
      if (!hit.length) unlabelled += nSets;
      for (const m of hit) muscleSets[m] += nSets;
      items.push(`${x.exercise} ${nSets}×${n.reps ?? "?"}${n.weights?.length ? ` @ ${n.weights.join(", ")} ${n.weight_unit}` : ""}` +
        (hit.length ? ` [${muscles.join(", ")}]` : ""));
    }
    lines.push(`${se.session_date} ${type}: ${items.join("; ") || "no exercises"}`);
  }

  const muscles = MUSCLES.map((m) => ({ muscle: m, sets: muscleSets[m], level: level(muscleSets[m]) }));
  const stats = {
    week_start: weekStart,
    workouts: done.length,
    types: Object.entries(types).map(([type, count]) => ({ type, count })),
    sets,
    reps,
    volume: Object.entries(volume).map(([unit, total]) => ({ unit, total })),
    muscles,
    unlabelled_sets: unlabelled,
  };

  // AI tips, behind the rate guard (5 AI requests a minute in total).
  let note: string | null = null;
  let limited = false;
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (key) {
    const { data: ok } = await db.rpc("ai_take_slot", { fn: "week-summary" });
    limited = ok !== true;
  }
  if (key && !limited) {
    const prompt = [
      `Week ${weekStart} to ${weekEnd}: ${done.length} workouts, ${sets} sets, ${reps} reps` +
        (stats.volume.length ? `, ${stats.volume.map((v) => `${v.total} ${v.unit}`).join(" + ")} lifted` : "") + ".",
      `Sets per muscle: ${muscles.map((m) => `${m.muscle} ${m.sets}`).join(", ")}` +
        (unlabelled ? ` (plus ${unlabelled} sets with no muscle chosen)` : "") + ".",
      "Sessions:",
      ...lines.map((x) => `- ${x}`),
    ].join("\n");
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://letstrain-iota.vercel.app",
          "X-Title": "Lets train",
        },
        body: JSON.stringify({
          model: MODELS[0],
          models: MODELS,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
          max_tokens: 300,
          temperature: 0.6,
        }),
        signal: AbortSignal.timeout(25000),
      });
      const data = await res.json().catch(() => null);
      note = data?.choices?.[0]?.message?.content?.trim()?.replace(/\*\*/g, "") || null;
      if (!res.ok || !note) {
        note = null;
        console.error("OpenRouter error", res.status, JSON.stringify(data?.error ?? data).slice(0, 500));
      }
    } catch (err) {
      console.error("OpenRouter failed", String(err));
    }
  }

  // Keep a note the user wrote themselves if the AI couldn't write a new one.
  const prev = old.data?.summary as { note?: string; note_by?: string } | undefined;
  const mine = prev?.note_by === "you";
  const summary = {
    stats,
    note: note ?? (mine ? prev!.note : null),
    note_by: note ? "ai" : mine ? "you" : null,
    made_at: new Date().toISOString(),
  };

  const { error } = await db.from("week_summaries")
    .upsert({ user_id: user.id, week_start: weekStart, summary }, { onConflict: "user_id,week_start" });
  if (error) return json({ error: error.message }, 500);
  return json({ summary, limited });
});
