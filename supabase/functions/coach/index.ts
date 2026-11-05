// AI coach: answers training questions using the logged-in user's own workouts.
// The OpenRouter key stays here on the server (Supabase secret OPENROUTER_API_KEY).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

// Free models; OpenRouter tries them in order if one is busy.
const MODELS = ["google/gemma-4-31b-it:free", "openrouter/free"];

const SYSTEM = `You are the friendly, encouraging strength coach inside "Lets train", a gym tracker app.
Answer questions about exercises, technique, and how to change workouts: the workout type (the app supports Full body, Upper and Lower), training days, sets, reps, weights, rest times, and which exercises to add, drop or swap.
Use the user's training data below when it helps, and refer to their actual exercises and numbers.
You can only give advice; you cannot change their plan. When they should change something, tell them where: the "New workout" tab creates a workout, and on "This week" they edit the sets, reps and weights they did.
Keep answers short and practical: a few sentences or a short list using "-". No headings or tables.
Use the same unit (kg or lbs) the user uses.
For pain, injuries or medical conditions, give general guidance only and suggest seeing a doctor or physiotherapist.
Stay on fitness, training, nutrition-for-training and recovery topics; politely steer anything else back to training.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatRest(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} sec`;
  return s ? `${m} min ${s} sec` : `${m} min`;
}

// "3 × 8 @ 60, 65 kg"
function numbers(x: { sets: number | null; reps: string | null; weights: number[] | null; weight_unit: string }) {
  let out = `${x.sets ?? "?"} × ${x.reps ?? "?"}`;
  if (x.weights?.length) out += ` @ ${x.weights.map(Number).join(", ")} ${x.weight_unit}`;
  return out;
}

// A plain-text summary of the user's plan and recent sessions for the model.
async function trainingSummary(db: SupabaseClient) {
  const [w, e, s, l] = await Promise.all([
    db.from("workout").select("id, workout_type, recurring, days, dates, archived_at"),
    db.from("exercises").select("id, workout_id, exercise, muscle_groups, sets, reps, weights, weight_unit, rest_seconds").order("position"),
    db.from("sessions").select("id, workout_id, session_date, completed").order("session_date", { ascending: false }).limit(12),
    db.from("session_exercises").select("session_id, exercise_id, sets, reps, weights, weight_unit"),
  ]);
  const workouts = w.data ?? [];
  const exercises = e.data ?? [];
  const sessions = s.data ?? [];
  const logs = l.data ?? [];

  const lines = [`Today is ${new Date().toISOString().slice(0, 10)}.`, "", "USER'S CURRENT PLAN:"];
  const active = workouts.filter((x) => !x.archived_at);
  if (!active.length) lines.push("- No workouts planned yet.");
  for (const wk of active) {
    const when = wk.recurring
      ? `every ${DAY_ORDER.filter((d) => wk.days.includes(d)).join(", ")}`
      : `one-off on ${wk.dates.join(", ")}`;
    lines.push(`- ${wk.workout_type} workout (${when}):`);
    for (const x of exercises.filter((x) => x.workout_id === wk.id)) {
      const muscles = x.muscle_groups?.length ? ` [${x.muscle_groups.join(", ")}]` : "";
      const rest = x.rest_seconds ? `, rest ${formatRest(x.rest_seconds)}` : "";
      lines.push(`  - ${x.exercise}${muscles}: ${numbers(x)}${rest}`);
    }
  }

  lines.push("", "RECENT SESSIONS (newest first, what they actually did):");
  if (!sessions.length) lines.push("- None logged yet.");
  for (const se of sessions) {
    const wk = workouts.find((x) => x.id === se.workout_id);
    lines.push(`- ${se.session_date} ${wk?.workout_type ?? "Workout"}${se.completed ? " (completed)" : ""}:`);
    const done = logs.filter((x) => x.session_id === se.id);
    if (!done.length) lines.push("  - no numbers logged");
    for (const d of done) {
      const name = exercises.find((x) => x.id === d.exercise_id)?.exercise ?? "Exercise";
      lines.push(`  - ${name}: ${numbers(d)}`);
    }
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) return json({ error: "The coach isn't set up yet (the OpenRouter key is missing)." }, 500);

  // Act as the logged-in user so Row Level Security only returns their own rows.
  const authHeader = req.headers.get("Authorization") ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!user) return json({ error: "Please log in to talk to the coach." }, 401);

  let body: { messages?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  // Keep the last few turns of the chat, each trimmed to a sensible length.
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m): m is { role: "user" | "assistant"; content: string } =>
      (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim() !== "")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "Ask the coach a question." }, 400);
  }

  const context = await trainingSummary(db);

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
      messages: [{ role: "system", content: `${SYSTEM}\n\n${context}` }, ...messages],
      max_tokens: 700,
      temperature: 0.6,
    }),
  });

  const data = await res.json().catch(() => null);
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!res.ok || !reply) {
    console.error("OpenRouter error", res.status, JSON.stringify(data?.error ?? data).slice(0, 500));
    return json({
      error: res.status === 429
        ? "The coach is busy right now (free model limit). Please try again in a minute."
        : "The coach couldn't answer right now. Please try again.",
    }, 502);
  }
  return json({ reply, model: data.model });
});
