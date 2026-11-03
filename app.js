// The publishable key is meant to be public; Row Level Security keeps each user's data private.
const SUPABASE_URL = "https://endyfafilvcftfdfvrkk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v7iY0ay8IGvxuRMCBrqz0w_LHlckcaw";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TYPES = ["Upper", "Lower", "Push", "Pull", "Legs", "Full body", "Cardio"];
const MUSCLES = ["Chest", "Back", "Arms", "Shoulders", "Legs", "Core", "Full body"];
const UNITS = ["kg", "lbs"];

const $ = (id) => document.getElementById(id);

let currentUser = null;
let days = [];        // workout rows (one per planned day)
let exercises = [];   // exercises rows
let completions = []; // workout_completions rows

// ---------- Helpers ----------

function showMessage(id, text, isError = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function fillSelect(select, options, allLabel) {
  select.innerHTML = "";
  if (allLabel) select.append(el("option", { value: "", textContent: allLabel }));
  for (const o of options) select.append(el("option", { value: o, textContent: o }));
}

// Dates as local YYYY-MM-DD strings so nothing shifts by timezone.
function isoDate(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function today() { return isoDate(new Date()); }
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayName() { return DAYS[(new Date().getDay() + 6) % 7]; }
function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return isoDate(d);
}
function startOfMonth() {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}
// A two-option switch (kg | lbs). Calls onChange with the new value.
function unitToggle(value, onChange) {
  const wrap = el("div", { className: "unit-toggle", role: "radiogroup", ariaLabel: "Weight unit" });
  const buttons = UNITS.map((u) => {
    const b = el("button", { type: "button", textContent: u, role: "radio" });
    b.addEventListener("click", async () => {
      if (u === wrap.value) return;
      if ((await onChange(u)) === false) return;
      set(u);
    });
    return b;
  });
  function set(u) {
    wrap.value = u;
    buttons.forEach((b) => {
      b.classList.toggle("on", b.textContent === u);
      b.ariaChecked = String(b.textContent === u);
    });
  }
  wrap.append(...buttons);
  set(value);
  return wrap;
}

// Remember the last unit picked on this device for new exercises.
function savedUnit() {
  try { return localStorage.getItem("weightUnit") === "lbs" ? "lbs" : "kg"; } catch { return "kg"; }
}
function rememberUnit(u) {
  try { localStorage.setItem("weightUnit", u); } catch {}
}

function prettyDate(s) {
  return parseDate(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// ---------- Auth ----------

let signUpMode = false;

function setAuthMode(isSignUp) {
  signUpMode = isSignUp;
  $("auth-title").textContent = isSignUp ? "Sign up" : "Log in";
  $("auth-submit").textContent = isSignUp ? "Create account" : "Log in";
  $("auth-switch-text").textContent = isSignUp ? "Already have an account?" : "No account yet?";
  $("auth-switch").textContent = isSignUp ? "Log in" : "Sign up";
  $("auth-password").autocomplete = isSignUp ? "new-password" : "current-password";
  showMessage("auth-message", "");
}

$("auth-switch").addEventListener("click", () => setAuthMode(!signUpMode));

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;

  if (signUpMode) {
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) return showMessage("auth-message", error.message, true);
    if (!data.session) {
      setAuthMode(false);
      showMessage("auth-message", "Check your email to confirm your account, then log in.");
    }
  } else {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) return showMessage("auth-message", error.message, true);
  }
});

$("google-sign-in").addEventListener("click", async () => {
  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) showMessage("auth-message", error.message, true);
});

$("sign-out").addEventListener("click", () => db.auth.signOut());

let authReady = false;
db.auth.onAuthStateChange((_event, session) => {
  const user = session?.user ?? null;
  if (authReady && user?.id === currentUser?.id) return;
  authReady = true;
  currentUser = user;
  $("auth-view").hidden = Boolean(user);
  $("app-view").hidden = !user;
  $("user-bar").hidden = !user;
  if (user) {
    $("user-email").textContent = user.email;
    loadAll();
  }
});

// ---------- Tabs ----------

document.querySelectorAll(".tabs button").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    for (const t of ["schedule", "progress", "add"]) $("tab-" + t).hidden = t !== btn.dataset.tab;
    showMessage("app-message", "");
  })
);

// ---------- Data ----------

async function loadAll() {
  const [d, e, c] = await Promise.all([
    db.from("workout").select("*"),
    db.from("exercises").select("*").order("created_at"),
    db.from("workout_completions").select("*").order("completed_on", { ascending: false }),
  ]);
  const error = d.error || e.error || c.error;
  if (error) return showMessage("app-message", error.message, true);
  days = d.data.sort((a, b) => DAYS.indexOf(a.day_of_week) - DAYS.indexOf(b.day_of_week));
  exercises = e.data;
  completions = c.data;
  renderSchedule();
  renderProgress();
}

// ---------- Schedule ----------

fillSelect($("filter-day"), DAYS, "All days");
fillSelect($("filter-type"), TYPES, "All types");
fillSelect($("filter-muscle"), MUSCLES, "All muscles");
for (const id of ["filter-day", "filter-type", "filter-muscle"]) $(id).addEventListener("change", renderSchedule);

function renderSchedule() {
  const dayF = $("filter-day").value;
  const typeF = $("filter-type").value;
  const muscleF = $("filter-muscle").value;
  const list = $("schedule-list");
  list.innerHTML = "";

  if (!days.length) {
    list.append(el("div", { className: "card empty", textContent: "Your plan is empty. Use \"Add exercise\" to build your week." }));
    return;
  }

  let shown = 0;
  for (const day of days) {
    if (dayF && day.day_of_week !== dayF) continue;
    if (typeF && day.workout_type !== typeF) continue;
    let dayExercises = exercises.filter((x) => x.day_of_week === day.day_of_week);
    if (muscleF) {
      dayExercises = dayExercises.filter((x) => x.muscle_groups.includes(muscleF));
      if (!dayExercises.length) continue;
    }
    list.append(dayCard(day, dayExercises));
    shown++;
  }
  if (!shown) list.append(el("div", { className: "card empty", textContent: "Nothing matches these filters." }));
}

function dayCard(day, dayExercises) {
  const card = el("div", { className: "card day" });

  // Header: day name, type, today badge
  const typeSelect = el("select", { className: "type-select", title: "Workout type" });
  fillSelect(typeSelect, TYPES);
  typeSelect.value = day.workout_type;
  typeSelect.addEventListener("change", async () => {
    const { error } = await db.from("workout").update({ workout_type: typeSelect.value }).eq("id", day.id);
    if (error) return showMessage("app-message", error.message, true);
    loadAll();
  });
  const title = el("h3", {}, day.day_of_week);
  if (day.day_of_week === todayName()) title.append(el("span", { className: "badge", textContent: "Today" }));
  card.append(el("div", { className: "day-head" }, title, typeSelect));

  // Exercises
  if (!dayExercises.length) card.append(el("p", { className: "muted", textContent: "No exercises yet." }));
  for (const x of dayExercises) card.append(exerciseRow(x));

  // Mark done
  const dateInput = el("input", { type: "date", value: today(), max: today() });
  const doneBtn = el("button", { textContent: "Mark done" });
  doneBtn.addEventListener("click", async () => {
    const { error } = await db.from("workout_completions").insert({
      completed_on: dateInput.value,
      day_of_week: day.day_of_week,
      workout_type: day.workout_type,
    });
    if (error) {
      const msg = error.code === "23505" ? `${day.day_of_week} is already marked done on ${prettyDate(dateInput.value)}.` : error.message;
      return showMessage("app-message", msg, true);
    }
    showMessage("app-message", `${day.day_of_week} – ${day.workout_type} marked done on ${prettyDate(dateInput.value)}.`);
    loadAll();
  });

  const weekDone = completions.filter((c) => c.day_of_week === day.day_of_week && c.completed_on >= startOfWeek());
  const doneNote = el("span", { className: "muted small" },
    weekDone.length ? `Done this week: ${weekDone.map((c) => prettyDate(c.completed_on)).join(", ")}` : "Not done this week");

  const removeDay = el("button", { className: "link danger small", textContent: "Remove day" });
  removeDay.addEventListener("click", async () => {
    if (!confirm(`Remove ${day.day_of_week} and all its exercises from your plan?`)) return;
    const { error } = await db.from("workout").delete().eq("id", day.id);
    if (error) return showMessage("app-message", error.message, true);
    loadAll();
  });

  card.append(el("div", { className: "day-foot" }, el("div", { className: "done-row" }, dateInput, doneBtn), doneNote, removeDay));
  return card;
}

// ---------- Exercise fields: read what was typed, show what's stored ----------
// Each parser returns the value to save (null = empty) or throws a message to show.

const FIELDS = {
  sets: {
    parse(s) {
      s = s.trim();
      if (!s) return null;
      if (!/^\d+$/.test(s) || Number(s) < 1) throw "Sets must be a whole number like 3.";
      return Number(s);
    },
    format: (v) => (v == null ? "" : String(v)),
  },
  reps: {
    parse(s) {
      s = s.trim();
      if (!s) return null;
      if (s.length > 20) throw "Reps must be 20 characters or less.";
      return /^amrap$/i.test(s) ? "AMRAP" : /^max$/i.test(s) ? "Max" : s;
    },
    format: (v) => v ?? "",
  },
  weights: {
    parse(s) {
      const parts = s.split(/[,\s]+/).filter(Boolean);
      if (!parts.length) return null;
      const nums = parts.map(Number);
      if (nums.some((n) => !Number.isFinite(n) || n < 0)) throw "Weights must be numbers, e.g. 60, 65, 70.";
      return nums;
    },
    format: (v) => (v?.length ? v.map(Number).join(", ") : ""),
  },
};

// 15 sec, 30 sec, 45 sec, 1 min, 1 min 15 sec ... up to 10 min.
const REST_OPTIONS = Array.from({ length: 40 }, (_, i) => (i + 1) * 15);
function formatRest(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} sec`;
  return s ? `${m} min ${s} sec` : `${m} min`;
}
function fillRestSelect(select, value) {
  select.innerHTML = "";
  select.append(el("option", { value: "", textContent: "No rest set" }));
  for (const s of REST_OPTIONS) select.append(el("option", { value: s, textContent: formatRest(s) }));
  select.value = value ?? "";
}

function flashSaved(node) {
  node.classList.add("saved");
  setTimeout(() => node.classList.remove("saved"), 800);
}

async function saveExercise(x, field, value) {
  const { error } = await db.from("exercises").update({ [field]: value }).eq("id", x.id);
  if (error) { showMessage("app-message", error.message, true); return false; }
  x[field] = value;
  return true;
}

// A small text box that saves to the exercise as soon as it's changed.
function editableField(x, field, label, opts) {
  const { parse, format } = FIELDS[field];
  const input = el("input", { type: "text", value: format(x[field]), ...opts });
  input.addEventListener("change", async () => {
    let value;
    try { value = parse(input.value); } catch (msg) {
      input.value = format(x[field]);
      return showMessage("app-message", msg, true);
    }
    if (!(await saveExercise(x, field, value))) return (input.value = format(x[field]));
    input.value = format(value);
    showMessage("app-message", "");
    flashSaved(input);
  });
  return el("label", { className: "num" }, el("span", { textContent: label }), input);
}

function exerciseRow(x) {
  const tags = el("div", { className: "tags" }, ...x.muscle_groups.map((m) => el("span", { className: "tag", textContent: m })));

  const rest = el("select");
  fillRestSelect(rest, x.rest_seconds);
  rest.addEventListener("change", async () => {
    const value = rest.value === "" ? null : Number(rest.value);
    if (await saveExercise(x, "rest_seconds", value)) flashSaved(rest);
    else rest.value = x.rest_seconds ?? "";
  });

  const detail = el("div", { className: "nums" },
    editableField(x, "sets", "Sets", { inputMode: "numeric", placeholder: "–" }),
    editableField(x, "reps", "Reps", { placeholder: "–" }),
    el("div", { className: "num-weight" },
      editableField(x, "weights", "Weight per set", { inputMode: "decimal", placeholder: "–" }),
      unitToggle(x.weight_unit, async (u) => {
        if (!(await saveExercise(x, "weight_unit", u))) return false;
        rememberUnit(u);
      })),
    el("label", { className: "num" }, el("span", { textContent: "Rest" }), rest));
  const del = el("button", { className: "delete", textContent: "✕", title: "Delete exercise" });
  del.addEventListener("click", async () => {
    if (!confirm(`Delete ${x.exercise}?`)) return;
    const { error } = await db.from("exercises").delete().eq("id", x.id);
    if (error) return showMessage("app-message", error.message, true);
    loadAll();
  });
  return el("div", { className: "entry" },
    el("div", { className: "name" }, el("div", { className: "ex-name", textContent: x.exercise }), tags),
    detail,
    del);
}

// ---------- Progress ----------

function renderProgress() {
  const week = startOfWeek();
  const month = startOfMonth();
  const now = today();
  $("stat-week").textContent = completions.filter((c) => c.completed_on >= week && c.completed_on <= now).length;
  $("stat-month").textContent = completions.filter((c) => c.completed_on >= month && c.completed_on <= now).length;

  const list = $("history-list");
  list.innerHTML = "";
  if (!completions.length) {
    list.append(el("p", { className: "muted", textContent: "No completed workouts yet. Mark one done from your schedule." }));
    return;
  }
  for (const c of completions) {
    const undo = el("button", { className: "delete", textContent: "Undo" });
    undo.addEventListener("click", async () => {
      const { error } = await db.from("workout_completions").delete().eq("id", c.id);
      if (error) return showMessage("app-message", error.message, true);
      loadAll();
    });
    list.append(el("div", { className: "entry" },
      el("div", { className: "name", textContent: prettyDate(c.completed_on) }),
      el("div", { className: "detail", textContent: `${c.day_of_week} – ${c.workout_type}` }),
      undo));
  }
}

// ---------- Add exercise ----------

fillSelect($("ex-day"), DAYS);
fillSelect($("ex-type"), TYPES);
$("ex-day").value = todayName();
const exUnit = unitToggle(savedUnit(), (u) => rememberUnit(u));
$("ex-unit").replaceWith(exUnit);
fillRestSelect($("ex-rest"));
for (const m of MUSCLES) {
  $("ex-muscles").append(el("label", { className: "chip" }, el("input", { type: "checkbox", value: m }), m));
}

// When picking a day that's already planned, show its current type.
function syncTypeToDay() {
  const existing = days.find((d) => d.day_of_week === $("ex-day").value);
  if (existing) $("ex-type").value = existing.workout_type;
}
$("ex-day").addEventListener("change", syncTypeToDay);
document.querySelector('[data-tab="add"]').addEventListener("click", syncTypeToDay);

$("exercise-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const day = $("ex-day").value;
  const muscles = [...$("ex-muscles").querySelectorAll("input:checked")].map((i) => i.value);

  let sets, reps, weights;
  try {
    sets = FIELDS.sets.parse($("ex-sets").value);
    reps = FIELDS.reps.parse($("ex-reps").value);
    weights = FIELDS.weights.parse($("ex-weights").value);
  } catch (msg) {
    return showMessage("app-message", msg, true);
  }

  const { error: dayError } = await db.from("workout").upsert(
    { user_id: currentUser.id, day_of_week: day, workout_type: $("ex-type").value },
    { onConflict: "user_id,day_of_week" }
  );
  if (dayError) return showMessage("app-message", dayError.message, true);

  const { error } = await db.from("exercises").insert({
    day_of_week: day,
    exercise: $("ex-name").value.trim(),
    muscle_groups: muscles,
    sets,
    reps,
    weights,
    weight_unit: exUnit.value,
    rest_seconds: $("ex-rest").value === "" ? null : Number($("ex-rest").value),
  });
  if (error) return showMessage("app-message", error.message, true);

  showMessage("app-message", `Added ${$("ex-name").value.trim()} to ${day}.`);
  for (const id of ["ex-name", "ex-sets", "ex-reps", "ex-weights", "ex-rest"]) $(id).value = "";
  $("ex-muscles").querySelectorAll("input").forEach((i) => (i.checked = false));
  $("ex-name").focus();
  loadAll();
});
