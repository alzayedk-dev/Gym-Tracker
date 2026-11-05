// The publishable key is meant to be public; Row Level Security keeps each user's data private.
const SUPABASE_URL = "https://endyfafilvcftfdfvrkk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v7iY0ay8IGvxuRMCBrqz0w_LHlckcaw";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TYPES = ["Full body", "Upper", "Lower"];
const MUSCLES = ["Chest", "Back", "Arms", "Shoulders", "Legs", "Core", "Full body"];
const UNITS = ["kg", "lbs"];

const PHOTO_BUCKET = "progress-photos";
const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_REFUSED = "Sorry, only images (JPEG, PNG, WebP or GIF) up to 5 MB can be added.";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let workouts = [];  // workout rows (the plan)
let exercises = []; // exercises planned in each workout
let sessions = [];  // one workout on one date, with the completed tick
let logs = [];      // session_exercises: what was actually done
let weekStart = startOfWeek(today());
let typeFilter = "";

// ---------- Helpers ----------

function showMessage(id, text, isError = false) {
  const node = $(id);
  node.textContent = text;
  node.classList.toggle("error", isError);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

function fillSelect(select, options, allLabel) {
  select.innerHTML = "";
  if (allLabel) select.append(el("option", { value: "", textContent: allLabel }));
  for (const o of options) select.append(el("option", { value: o, textContent: o }));
}

// Dates are local YYYY-MM-DD strings so nothing shifts by timezone.
function isoDate(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function today() { return isoDate(new Date()); }
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
function dayName(s) { return DAYS[(parseDate(s).getDay() + 6) % 7]; }
function startOfWeek(s) { return addDays(s, -((parseDate(s).getDay() + 6) % 7)); }
function localDateOf(timestamp) { return isoDate(new Date(timestamp)); }
function shortDate(s) {
  return parseDate(s).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function longDate(s) {
  return parseDate(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// ---------- Field parsing ----------
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

// A two-option switch (kg | lbs). onChange may return false (or a promise of false) to cancel.
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

function flashSaved(node) {
  node.classList.add("saved");
  setTimeout(() => node.classList.remove("saved"), 800);
}

function planSummary(x) {
  const parts = [];
  if (x.sets || x.reps) parts.push(`${x.sets ?? "–"} × ${x.reps ?? "–"}`);
  if (x.weights?.length) parts.push(`${FIELDS.weights.format(x.weights)} ${x.weight_unit}`);
  if (x.rest_seconds) parts.push(`rest ${formatRest(x.rest_seconds)}`);
  return parts.join(" · ");
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

function showTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  for (const t of ["week", "new", "progress"]) $("tab-" + t).hidden = t !== name;
  showMessage("app-message", "");
}
document.querySelectorAll(".tabs button").forEach((btn) => btn.addEventListener("click", () => showTab(btn.dataset.tab)));

// ---------- Data ----------

async function loadAll() {
  const [w, e, s, l] = await Promise.all([
    db.from("workout").select("*").order("created_at"),
    db.from("exercises").select("*").order("position").order("created_at"),
    db.from("sessions").select("*"),
    db.from("session_exercises").select("*"),
  ]);
  const error = w.error || e.error || s.error || l.error;
  if (error) return showMessage("app-message", error.message, true);
  workouts = w.data;
  exercises = e.data;
  sessions = s.data;
  logs = l.data;
  renderWeek();
  renderProgress();
}

const findSession = (workoutId, date) => sessions.find((s) => s.workout_id === workoutId && s.session_date === date);
const exercisesOf = (workoutId) => exercises.filter((x) => x.workout_id === workoutId);

// Create the session row for a workout on a date the first time it's needed.
const pendingSessions = new Map();
async function ensureSession(w, date) {
  const existing = findSession(w.id, date);
  if (existing) return existing;
  const key = `${w.id}|${date}`;
  if (!pendingSessions.has(key)) {
    pendingSessions.set(key, (async () => {
      const { data, error } = await db.from("sessions")
        .upsert({ user_id: currentUser.id, workout_id: w.id, session_date: date }, { onConflict: "workout_id,session_date" })
        .select().single();
      pendingSessions.delete(key);
      if (error) { showMessage("app-message", error.message, true); return null; }
      sessions.push(data);
      return data;
    })());
  }
  return pendingSessions.get(key);
}

// Values to show for an exercise in a session: what was logged that day,
// else what was done last time, else the plan.
function currentValues(x, session, date) {
  const pick = (r) => ({ sets: r.sets, reps: r.reps, weights: r.weights, weight_unit: r.weight_unit });
  const logged = session && logs.find((l) => l.session_id === session.id && l.exercise_id === x.id);
  if (logged) return { values: pick(logged), source: "logged" };
  const sessionDate = new Map(sessions.map((s) => [s.id, s.session_date]));
  const previous = logs
    .filter((l) => l.exercise_id === x.id && sessionDate.get(l.session_id) < date)
    .sort((a, b) => sessionDate.get(b.session_id).localeCompare(sessionDate.get(a.session_id)))[0];
  if (previous) return { values: pick(previous), source: "last time" };
  return { values: pick(x), source: "plan" };
}

// ---------- Progress photos ----------

// Upload an image to the bucket and return its public link, or throw a message.
async function uploadPhoto(file, folder) {
  const ext = PHOTO_TYPES[file.type];
  if (!ext || file.size > PHOTO_MAX_BYTES) throw PHOTO_REFUSED;
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw /size|mime|type/i.test(error.message) ? PHOTO_REFUSED : error.message;
  return db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Upload a photo and add its link to the session, creating the session if needed.
async function addSessionPhoto(w, date, file) {
  const url = await uploadPhoto(file, currentUser.id);
  const s = await ensureSession(w, date);
  if (!s) throw "Couldn't save the photo to this workout. Please try again.";
  const photo_urls = [...(s.photo_urls ?? []), url];
  const { error } = await db.from("sessions").update({ photo_urls }).eq("id", s.id);
  if (error) throw error.message;
  s.photo_urls = photo_urls;
}

function photoLink(url, alt, caption) {
  return el("a", { href: url, target: "_blank", rel: "noopener", className: "photo" },
    el("img", { src: url, alt, loading: "lazy" }),
    caption && el("span", { className: "photo-caption", textContent: caption }));
}

// Photos on a session card, with the "Add progress photo" button.
function photoStrip(w, date) {
  const grid = el("div", { className: "photo-grid" });
  const draw = () => {
    grid.innerHTML = "";
    for (const url of findSession(w.id, date)?.photo_urls ?? []) {
      grid.append(photoLink(url, `Progress photo, ${longDate(date)}`));
    }
  };

  const input = el("input", { type: "file", accept: Object.keys(PHOTO_TYPES).join(","), hidden: true });
  const button = el("button", { type: "button", className: "secondary photo-btn", textContent: "📷 Add progress photo" });
  const status = el("span", { className: "muted small" });
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    button.disabled = true;
    status.textContent = "Uploading…";
    try {
      await addSessionPhoto(w, date, file);
      draw();
      renderProgress();
      showMessage("app-message", "Photo added. Keep it up! 💪");
    } catch (msg) {
      showMessage("app-message", msg, true);
    } finally {
      button.disabled = false;
      status.textContent = "";
    }
  });

  draw();
  return el("div", { className: "photos" }, grid, el("div", { className: "photo-actions" }, button, status, input));
}

// ---------- This week ----------

function showsOn(w, date) {
  if (findSession(w.id, date)) return true; // anything already tracked stays visible
  if (w.archived_at && date >= localDateOf(w.archived_at)) return false;
  if (w.recurring) return w.days.includes(dayName(date)) && date >= startOfWeek(localDateOf(w.created_at));
  return w.dates.includes(date);
}

function whenText(w) {
  if (w.recurring) {
    const days = DAYS.filter((d) => w.days.includes(d)).map((d) => d.slice(0, 3));
    return `Every ${days.join(", ")}`;
  }
  return "One-off";
}

const typeFilterBar = $("type-filter");
for (const t of ["", ...TYPES]) {
  const b = el("button", { type: "button", textContent: t || "All", className: t ? "" : "on" });
  b.addEventListener("click", () => {
    typeFilter = t;
    typeFilterBar.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    renderWeek();
  });
  typeFilterBar.append(b);
}
fillSelect($("filter-muscle"), MUSCLES, "All muscles");
$("filter-muscle").addEventListener("change", renderWeek);

$("prev-week").addEventListener("click", () => { weekStart = addDays(weekStart, -7); renderWeek(); });
$("next-week").addEventListener("click", () => { weekStart = addDays(weekStart, 7); renderWeek(); });
$("this-week").addEventListener("click", () => { weekStart = startOfWeek(today()); renderWeek(); });

function renderWeek() {
  const end = addDays(weekStart, 6);
  $("week-label").textContent = `${shortDate(weekStart)} – ${shortDate(end)}`;
  $("this-week").hidden = weekStart === startOfWeek(today());

  const muscle = $("filter-muscle").value;
  const list = $("week-list");
  list.innerHTML = "";
  let shown = 0;

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const items = workouts
      .filter((w) => showsOn(w, date))
      .filter((w) => !typeFilter || w.workout_type === typeFilter)
      .filter((w) => !muscle || exercisesOf(w.id).some((x) => x.muscle_groups.includes(muscle)));
    if (!items.length) continue;

    const title = el("h3", { className: "day-title" },
      dayName(date), el("span", { className: "muted", textContent: shortDate(date) }),
      date === today() && el("span", { className: "badge", textContent: "Today" }));
    const group = el("section", { className: "day-group" }, title);
    for (const w of items) group.append(sessionCard(w, date));
    list.append(group);
    shown += items.length;
  }

  if (!shown) {
    const filtered = typeFilter || muscle;
    const create = el("button", { textContent: "Create a workout" });
    create.addEventListener("click", () => showTab("new"));
    list.append(el("div", { className: "card empty" },
      el("p", { textContent: filtered ? "No workouts match these filters this week." : "No workouts this week." }),
      !filtered && create));
  }
}

function sessionCard(w, date) {
  const session = findSession(w.id, date);
  const card = el("article", { className: "card session" + (session?.completed ? " done" : "") });

  const done = el("input", { type: "checkbox", checked: Boolean(session?.completed) });
  done.addEventListener("change", async () => {
    const s = await ensureSession(w, date);
    if (!s) return (done.checked = !done.checked);
    const { error } = await db.from("sessions").update({ completed: done.checked }).eq("id", s.id);
    if (error) {
      done.checked = !done.checked;
      return showMessage("app-message", error.message, true);
    }
    s.completed = done.checked;
    card.classList.toggle("done", done.checked);
    renderProgress();
  });

  card.append(el("div", { className: "session-head" },
    el("div", {},
      el("span", { className: "type-badge", textContent: w.workout_type }),
      el("span", { className: "muted small when", textContent: whenText(w) })),
    el("label", { className: "complete" }, done, el("span", { textContent: "Completed" }))));

  const list = exercisesOf(w.id);
  if (!list.length) card.append(el("p", { className: "muted", textContent: "No exercises in this workout." }));
  for (const x of list) card.append(trackRow(w, date, x));
  card.append(photoStrip(w, date));

  const remove = el("button", { className: "link danger small", textContent: "Remove workout" });
  remove.addEventListener("click", async () => {
    if (!confirm("Remove this workout from your schedule? Workouts you already tracked stay in your history.")) return;
    const { error } = await db.from("workout").update({ archived_at: new Date().toISOString() }).eq("id", w.id);
    if (error) return showMessage("app-message", error.message, true);
    loadAll();
  });
  card.append(el("div", { className: "session-foot" }, remove));
  return card;
}

// One exercise inside a session: edit what you actually did, saved for that date.
function trackRow(w, date, x) {
  const { values, source } = currentValues(x, findSession(w.id, date), date);
  const hint = el("span", { className: "muted small" });
  const setHint = (src) => (hint.textContent = src === "logged" ? "✓ Saved" : src === "last time" ? "From last time" : "");
  setHint(source);

  async function save(field, value) {
    const s = await ensureSession(w, date);
    if (!s) return false;
    const row = { user_id: currentUser.id, session_id: s.id, exercise_id: x.id, ...values, [field]: value };
    const { data, error } = await db.from("session_exercises")
      .upsert(row, { onConflict: "session_id,exercise_id" }).select().single();
    if (error) { showMessage("app-message", error.message, true); return false; }
    values[field] = value;
    logs = logs.filter((l) => l.id !== data.id).concat(data);
    showMessage("app-message", "");
    setHint("logged");
    return true;
  }

  function field(name, label, opts) {
    const { parse, format } = FIELDS[name];
    const input = el("input", { type: "text", value: format(values[name]), placeholder: "–", ...opts });
    input.addEventListener("change", async () => {
      let value;
      try { value = parse(input.value); } catch (msg) {
        input.value = format(values[name]);
        return showMessage("app-message", msg, true);
      }
      if (!(await save(name, value))) return (input.value = format(values[name]));
      input.value = format(value);
      flashSaved(input);
    });
    return el("label", { className: "num" }, el("span", { textContent: label }), input);
  }

  const tags = x.muscle_groups.length
    ? el("div", { className: "tags" }, ...x.muscle_groups.map((m) => el("span", { className: "tag", textContent: m })))
    : null;
  const plan = planSummary(x);

  return el("div", { className: "track" },
    el("div", { className: "track-head" },
      el("div", {}, el("div", { className: "ex-name", textContent: x.exercise }), tags),
      hint),
    plan && el("div", { className: "muted small plan", textContent: `Plan: ${plan}` }),
    el("div", { className: "nums" },
      field("sets", "Sets", { inputMode: "numeric" }),
      field("reps", "Reps"),
      el("div", { className: "num-weight" },
        field("weights", "Weight per set", { inputMode: "decimal" }),
        unitToggle(values.weight_unit, async (u) => {
          if (!(await save("weight_unit", u))) return false;
          rememberUnit(u);
        }))));
}

// ---------- New workout builder ----------

const builder = { type: null, days: new Set(), dates: [] };

function renderTypeOptions() {
  const wrap = $("type-options");
  wrap.innerHTML = "";
  for (const t of TYPES) {
    const b = el("button", { type: "button", className: "type-option" + (builder.type === t ? " on" : ""), textContent: t });
    b.addEventListener("click", () => {
      builder.type = t;
      renderTypeOptions();
      updateSteps();
    });
    wrap.append(b);
  }
}

function renderDayOptions() {
  const wrap = $("day-options");
  wrap.innerHTML = "";
  for (const d of DAYS) {
    const b = el("button", { type: "button", className: "chip" + (builder.days.has(d) ? " on" : ""), textContent: d });
    b.addEventListener("click", () => {
      builder.days.has(d) ? builder.days.delete(d) : builder.days.add(d);
      renderDayOptions();
      updateSteps();
    });
    wrap.append(b);
  }
}

function renderDateList() {
  const wrap = $("date-list");
  wrap.innerHTML = "";
  for (const d of [...builder.dates].sort()) {
    const remove = el("button", { type: "button", className: "chip-x", textContent: "✕", title: "Remove date" });
    remove.addEventListener("click", () => {
      builder.dates = builder.dates.filter((x) => x !== d);
      renderDateList();
      updateSteps();
    });
    wrap.append(el("span", { className: "chip on" }, longDate(d), remove));
  }
}

$("recurring").addEventListener("change", () => {
  $("day-options").hidden = !$("recurring").checked;
  $("date-picker").hidden = $("recurring").checked;
  updateSteps();
});

function addDate() {
  const d = $("date-input").value;
  if (!d) return;
  if (!builder.dates.includes(d)) builder.dates.push(d);
  $("date-input").value = "";
  renderDateList();
  updateSteps();
}
$("add-date").addEventListener("click", addDate);
$("date-input").addEventListener("change", addDate);

function hasWhen() {
  return $("recurring").checked ? builder.days.size > 0 : builder.dates.length > 0;
}

// Reveal each step once the one before it is filled in.
function updateSteps() {
  $("step-when").hidden = !builder.type;
  const ready = Boolean(builder.type) && hasWhen();
  $("step-exercises").hidden = !ready;
  $("lets-train").hidden = !ready;
  if (ready && !$("exercise-cards").children.length) addExerciseCard();
}

function addExerciseCard() {
  const cards = $("exercise-cards");
  const name = el("input", { type: "text", placeholder: "Exercise name, e.g. Bench Press", className: "ex-name-input" });
  const sets = el("input", { type: "text", inputMode: "numeric", placeholder: "e.g. 3" });
  const reps = el("input", { type: "text", placeholder: "e.g. 10, AMRAP" });
  const weights = el("input", { type: "text", inputMode: "decimal", placeholder: "e.g. 60, 65, 70" });
  const rest = el("select");
  fillRestSelect(rest);
  const unit = unitToggle(savedUnit(), (u) => rememberUnit(u));
  const muscles = el("div", { className: "chips small-chips" }, ...MUSCLES.map((m) => {
    const b = el("button", { type: "button", className: "chip", textContent: m });
    b.addEventListener("click", () => b.classList.toggle("on"));
    return b;
  }));

  const remove = el("button", { type: "button", className: "icon-btn danger", textContent: "✕", title: "Remove exercise" });
  const card = el("div", { className: "ex-card" },
    el("div", { className: "ex-card-head" }, el("span", { className: "ex-num" }), name, remove),
    el("div", { className: "ex-grid" },
      el("label", {}, "Sets", sets),
      el("label", {}, "Reps", reps),
      el("div", { className: "field ex-weight" },
        el("span", { className: "field-label", textContent: "Weight per set" }),
        el("div", { className: "weight-row" }, weights, unit)),
      el("label", {}, "Rest", rest)),
    el("details", { className: "muscles" }, el("summary", { textContent: "Muscle groups (optional)" }), muscles));

  remove.addEventListener("click", () => {
    card.remove();
    numberExerciseCards();
  });

  // Read this card's values, or throw a message.
  card.read = () => {
    const exercise = name.value.trim();
    const blank = !exercise && !sets.value.trim() && !reps.value.trim() && !weights.value.trim() && !rest.value;
    if (blank) return null;
    if (!exercise) throw "Each exercise needs a name.";
    return {
      exercise,
      sets: FIELDS.sets.parse(sets.value),
      reps: FIELDS.reps.parse(reps.value),
      weights: FIELDS.weights.parse(weights.value),
      weight_unit: unit.value,
      rest_seconds: rest.value === "" ? null : Number(rest.value),
      muscle_groups: [...muscles.querySelectorAll(".chip.on")].map((b) => b.textContent),
    };
  };

  cards.append(card);
  numberExerciseCards();
  return card;
}

function numberExerciseCards() {
  const cards = [...$("exercise-cards").children];
  cards.forEach((c, i) => {
    c.querySelector(".ex-num").textContent = i + 1;
    c.querySelector(".icon-btn.danger").hidden = cards.length === 1;
  });
}

$("add-exercise").addEventListener("click", () => addExerciseCard().querySelector(".ex-name-input").focus());

function resetBuilder() {
  builder.type = null;
  builder.days.clear();
  builder.dates = [];
  $("recurring").checked = true;
  $("day-options").hidden = false;
  $("date-picker").hidden = true;
  $("exercise-cards").innerHTML = "";
  renderTypeOptions();
  renderDayOptions();
  renderDateList();
  updateSteps();
}

$("lets-train").addEventListener("click", async () => {
  const recurring = $("recurring").checked;
  let list;
  try {
    list = [...$("exercise-cards").children].map((c) => c.read()).filter(Boolean);
  } catch (msg) {
    return showMessage("app-message", msg, true);
  }
  if (!list.length) return showMessage("app-message", "Add at least one exercise.", true);

  const button = $("lets-train");
  button.disabled = true;
  const { data: w, error } = await db.from("workout").insert({
    workout_type: builder.type,
    recurring,
    days: recurring ? DAYS.filter((d) => builder.days.has(d)) : [],
    dates: recurring ? [] : [...builder.dates].sort(),
  }).select().single();
  if (error) {
    button.disabled = false;
    return showMessage("app-message", error.message, true);
  }

  const { error: exError } = await db.from("exercises").insert(list.map((x, i) => ({ ...x, workout_id: w.id, position: i })));
  button.disabled = false;
  if (exError) {
    await db.from("workout").delete().eq("id", w.id);
    return showMessage("app-message", exError.message, true);
  }

  // Jump to the week of the first session.
  const first = recurring
    ? Array.from({ length: 7 }, (_, i) => addDays(today(), i)).find((d) => builder.days.has(dayName(d)))
    : [...builder.dates].sort()[0];
  resetBuilder();
  weekStart = startOfWeek(first ?? today());
  showTab("week");
  showMessage("app-message", `Workout saved. Lets train! 💪`);
  await loadAll();
});

renderTypeOptions();
renderDayOptions();

// ---------- Progress ----------

function renderProgress() {
  const done = sessions.filter((s) => s.completed);
  const week = startOfWeek(today());
  const month = today().slice(0, 7);
  $("stat-week").textContent = done.filter((s) => s.session_date >= week && s.session_date <= addDays(week, 6)).length;
  $("stat-month").textContent = done.filter((s) => s.session_date.startsWith(month)).length;

  // Gallery: every photo, newest session first, newest photo first within a session.
  const gallery = $("photo-gallery");
  gallery.innerHTML = "";
  const photos = [...sessions]
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .flatMap((s) => [...(s.photo_urls ?? [])].reverse().map((url) => ({ url, s })));
  if (!photos.length) {
    gallery.append(el("p", { className: "muted", textContent: "No progress photos yet. Add one to a workout in This week." }));
  }
  for (const { url, s } of photos) {
    const type = workouts.find((w) => w.id === s.workout_id)?.workout_type ?? "Workout";
    gallery.append(photoLink(url, `Progress photo, ${longDate(s.session_date)}`, `${shortDate(s.session_date)} · ${type}`));
  }

  const list = $("history-list");
  list.innerHTML = "";
  if (!done.length) {
    list.append(el("p", { className: "muted", textContent: "No completed workouts yet. Tick \"Completed\" on a workout in This week." }));
    return;
  }
  for (const s of [...done].sort((a, b) => b.session_date.localeCompare(a.session_date))) {
    const w = workouts.find((x) => x.id === s.workout_id);
    const count = exercisesOf(s.workout_id).length;
    const open = el("button", { className: "link small", textContent: "View" });
    open.addEventListener("click", () => {
      weekStart = startOfWeek(s.session_date);
      showTab("week");
      renderWeek();
    });
    list.append(el("div", { className: "history-row" },
      el("div", {}, el("div", { className: "ex-name", textContent: longDate(s.session_date) }),
        el("div", { className: "muted small", textContent: `${w?.workout_type ?? "Workout"} · ${count} exercise${count === 1 ? "" : "s"}` })),
      open));
  }
}
