// Works out which muscles an exercise trains from the name you typed.
// 1. Muscles you picked on the exercise card always win.
// 2. Otherwise the name is matched against common gym words (free, instant).
// 3. Names it still doesn't recognise are sent to the AI in one batch (behind the rate guard).

export const MUSCLES = ["Chest", "Back", "Arms", "Shoulders", "Legs", "Core"] as const;
export type Muscle = typeof MUSCLES[number];

// Checked in order; the first rules catch names that would otherwise be matched wrongly
// ("leg curl" is legs, not arms; "leg raise" is core, not legs).
const RULES: [RegExp, Muscle[]][] = [
  [/burpee|thruster|clean and|power clean|snatch|kettlebell swing|kb swing|man ?maker|turkish get/, [...MUSCLES]],
  [/leg (curl|extension|press)|hamstring curl/, ["Legs"]],
  [/(leg|knee) raise|toes to bar|knee tuck/, ["Core"]],
  [/back extension|hyperextension|superman/, ["Back", "Core"]],
  [/face ?pull|rear delt|reverse fly/, ["Shoulders", "Back"]],
  [/upright row/, ["Shoulders"]],
  [/close[- ]grip bench|dip/, ["Chest", "Arms"]],
  [/deadlift|rdl|romanian|good ?morning/, ["Legs", "Back"]],
  [/squat|lunge/, ["Legs"]],
  [/curl|bicep|tricep|skull ?crusher|push[- ]?down|kickback|french press|forearm|wrist|farmer|\barms?\b/, ["Arms"]],
  [/bench|chest|\bfly|flye|\bpec|push[- ]?ups?|press[- ]?ups?|incline|decline/, ["Chest"]],
  [/pull[- ]?ups?|chin[- ]?ups?|\blats?\b|pull[- ]?down|\brows?\b|rowing|pullover|shrug|\bback\b/, ["Back"]],
  [/shoulder|overhead|ohp|military|lateral raise|side raise|front raise|delt|arnold|landmine|\bpress\s*$/, ["Shoulders"]],
  [/leg|glute|hip thrust|bridge|calf|calves|step[- ]?ups?|quad|hamstring|hack|box jump|wall ?ball|split/, ["Legs"]],
  [/plank|crunch|sit[- ]?ups?|\babs?\b|core|twist|hollow|dead ?bug|pallof|wood ?chop|mountain climber|rollout|v[- ]?ups?|oblique/, ["Core"]],
  [/\brun|jog|sprint|treadmill|bike|cycling|jump rope|skipping/, ["Legs"]],
];

export function guessMuscles(name: string): Muscle[] {
  const n = ` ${name.toLowerCase().replace(/[_]+/g, " ")} `;
  for (const [re, muscles] of RULES) if (re.test(n)) return muscles;
  return [];
}

// Muscles you picked on the card (Full body = every muscle).
export function pickedMuscles(groups: string[] | null): Muscle[] {
  const g = groups ?? [];
  if (g.includes("Full body")) return [...MUSCLES];
  return MUSCLES.filter((m) => g.includes(m));
}

// Ask the AI about names the word list didn't recognise. Returns {} if it can't help.
export async function askAiForMuscles(names: string[], key: string): Promise<Record<string, Muscle[]>> {
  if (!names.length) return {};
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
        model: "google/gemma-4-31b-it:free",
        models: ["google/gemma-4-31b-it:free", "openrouter/free"],
        messages: [{
          role: "user",
          content: `For each gym exercise name below, list the main muscle groups it trains, using only: ${MUSCLES.join(", ")}.
Reply with JSON only, no other text, like {"Exercise name": ["Chest", "Arms"]}. Use [] if it isn't an exercise.
${names.map((n) => `- ${n}`).join("\n")}`,
        }],
        max_tokens: 400,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => null);
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const found = text.match(/\{[\s\S]*\}/);
    if (!res.ok || !found) {
      console.error("Muscle lookup failed", res.status, text.slice(0, 300));
      return {};
    }
    const parsed = JSON.parse(found[0]) as Record<string, unknown>;
    const out: Record<string, Muscle[]> = {};
    for (const name of names) {
      const v = parsed[name];
      if (Array.isArray(v)) out[name] = MUSCLES.filter((m) => v.includes(m));
    }
    return out;
  } catch (err) {
    console.error("Muscle lookup failed", String(err));
    return {};
  }
}

// Muscles for every exercise: picked → name match → AI (only if a slot is free).
export async function musclesFor(
  exercises: { exercise: string; muscle_groups: string[] | null }[],
  useAi: () => Promise<string | null>, // returns the OpenRouter key if the AI may be used now
): Promise<Map<string, { muscles: Muscle[]; how: "picked" | "name" | "ai" | "unknown" }>> {
  const out = new Map<string, { muscles: Muscle[]; how: "picked" | "name" | "ai" | "unknown" }>();
  const unknown: string[] = [];
  for (const x of exercises) {
    if (out.has(x.exercise)) continue;
    const picked = pickedMuscles(x.muscle_groups);
    if (picked.length) { out.set(x.exercise, { muscles: picked, how: "picked" }); continue; }
    const guessed = guessMuscles(x.exercise);
    if (guessed.length) { out.set(x.exercise, { muscles: guessed, how: "name" }); continue; }
    unknown.push(x.exercise);
  }
  if (unknown.length) {
    const key = await useAi();
    const ai = key ? await askAiForMuscles(unknown, key) : {};
    for (const name of unknown) {
      const m = ai[name] ?? [];
      out.set(name, { muscles: m, how: m.length ? "ai" : "unknown" });
    }
  }
  return out;
}
