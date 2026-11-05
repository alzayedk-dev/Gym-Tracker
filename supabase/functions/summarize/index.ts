// Workout summary: called when a session is ticked Completed.
// Works out the numbers (sets, reps, weight lifted, changes since last time),
// asks a free OpenRouter model for a short coach note, and saves both on the session.
// If the AI fails, the numbers are still saved and the note is left for the user to write.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MODELS = ["google/gemma-4-31b-it:free", "openrouter/free"];

const SYSTEM = `You are the encouraging strength coach in "Lets train", a gym tracker.
The user just finished a workout. Write a short note (2-3 sentences, under 60 words) about it:
praise something specific from their numbers, mention what improved or stayed the same compared with last time,
and give one practical tip for next time. Plain text only: no headings, lists, emojis or markdown. Use their unit (kg or lbs).`;

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
const topWeight = (x: Nums) => (x.weights?.length ? Math.max(...x.weights.map(Number)) : null);

// "3 × 8 @ 60, 65 kg"
function numbersText(x: Nums) {
  let out = `${x.sets ?? "?"} × ${x.reps ?? "?"}`;
  if (x.weights?.length) out += ` @ ${x.weights.map(Number).join(", ")} ${x.weight_unit}`;
  return out;
}

// Total reps and weight lifted (reps × weight for each set). AMRAP / Max reps can't be counted.
function totals(x: Nums) {
  const sets = x.sets ?? (x.weights?.length || 0);
  const reps = repsNumber(x.reps);
  if (!sets || reps === null) return { sets, reps: null, volume: null };
  let volume = 0;
  for (let i = 0; i < sets; i++) {
    const w = x.weights?.length ? Number(x.weights[Math.min(i, x.weights.length - 1)]) : 0;
    volume += reps * w;
  }
  return { sets, reps: sets * reps, volume: x.weights?.length ? round(volume) : null };
}

// What changed for one exercise since the previous session.
function changeText(now: Nums, before: Nums | null) {
  if (!before) return "First time logged";
  const parts: string[] = [];
  const a = topWeight(before), b = topWeight(now);
  if (a !== null && b !== null && now.weight_unit === before.weight_unit && a !== b) {
    const d = round(b - a);
    parts.push(`top weight ${d > 0 ? "+" : ""}${d} ${now.weight_unit}`);
  }
  if ((before.reps ?? "") !== (now.reps ?? "")) parts.push(`reps ${before.reps ?? "–"} → ${now.reps ?? "–"}`);
  if ((before.sets ?? 0) !== (now.sets ?? 0)) parts.push(`sets ${before.sets ?? "–"} → ${now.sets ?? "–"}`);
  if (!parts.length) return "Same as last time";
  const s = parts.join(", ");
  return s[0].toUpperCase() + s.slice(1);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  // Act as the logged-in user so Row Level Security only allows their own rows.
  const authHeader = req.headers.get("Authorization") ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!user) return json({ error: "Please log in first." }, 401);

  let body: { session_id?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const sessionId = Number(body.session_id);
  if (!Number.isInteger(sessionId)) return json({ error: "Which session?" }, 400);

  const { data: session } = await db.from("sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session) return json({ error: "Session not found." }, 404);

  const [w, e, s, l] = await Promise.all([
    db.from("workout").select("id, workout_type").eq("id", session.workout_id).single(),
    db.from("exercises").select("*").eq("workout_id", session.workout_id).order("position"),
    db.from("sessions").select("id, session_date").eq("workout_id", session.workout_id),
    db.from("session_exercises").select("*"),
  ]);
  const exercises = e.data ?? [];
  const dateOf = new Map((s.data ?? []).map((x) => [x.id, x.session_date as string]));
  const logs = (l.data ?? []).filter((x) => dateOf.has(x.session_id));
  const pick = (r: Nums): Nums => ({ sets: r.sets, reps: r.reps, weights: r.weights, weight_unit: r.weight_unit });

  // Latest log for an exercise before this session's date.
  const lastBefore = (exerciseId: number) =>
    logs
      .filter((x) => x.exercise_id === exerciseId && dateOf.get(x.session_id)! < session.session_date)
      .sort((a, b) => dateOf.get(b.session_id)!.localeCompare(dateOf.get(a.session_id)!))[0] ?? null;

  // Same rule as the website: what was logged today, else last time's numbers (shown pre-filled), else the plan.
  const rows = exercises.map((x) => {
    const today = logs.find((r) => r.session_id === sessionId && r.exercise_id === x.id);
    const before = lastBefore(x.id);
    const now = pick(today ?? before ?? x);
    return { exercise: x.exercise as string, now, before: before ? pick(before) : null };
  });

  const volume: Record<string, number> = {};
  let sets = 0, reps = 0;
  const lines = rows.map(({ exercise, now, before }) => {
    const t = totals(now);
    sets += t.sets || 0;
    reps += t.reps || 0;
    if (t.volume) volume[now.weight_unit] = round((volume[now.weight_unit] ?? 0) + t.volume);
    return { exercise, done: numbersText(now), change: changeText(now, before) };
  });
  const stats = {
    workout_type: w.data?.workout_type ?? "Workout",
    exercises: rows.length,
    sets,
    reps,
    volume: Object.entries(volume).map(([unit, total]) => ({ unit, total })),
    lines,
  };

  // Ask the AI for a short note. Failing here is fine: the numbers are saved anyway.
  // Rate guard: at most 5 AI requests a minute in total. Over the limit, skip the AI and keep the numbers.
  let note: string | null = null;
  let limited = false;
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (key && rows.length) {
    const { data: ok } = await db.rpc("ai_take_slot", { fn: "summarize" });
    limited = ok !== true;
  }
  if (key && rows.length && !limited) {
    const prompt = [
      `${stats.workout_type} workout on ${session.session_date}.`,
      `Totals: ${sets} sets, ${reps} reps` +
        (stats.volume.length ? `, ${stats.volume.map((v) => `${v.total} ${v.unit}`).join(" + ")} lifted` : "") + ".",
      ...lines.map((x) => `- ${x.exercise}: ${x.done} (${x.change})`),
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
          max_tokens: 200,
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
  const old = session.summary as { note?: string; note_by?: string } | null;
  const summary = note
    ? { stats, note, note_by: "ai", made_at: new Date().toISOString() }
    : { stats, note: old?.note_by === "you" ? old.note : null, note_by: old?.note_by === "you" ? "you" : null, made_at: new Date().toISOString() };

  const { error } = await db.from("sessions").update({ summary }).eq("id", sessionId);
  if (error) return json({ error: error.message }, 500);
  return json({ summary, limited });
});
