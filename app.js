// The publishable key is meant to be public; Row Level Security keeps each user's data private.
const SUPABASE_URL = "https://endyfafilvcftfdfvrkk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v7iY0ay8IGvxuRMCBrqz0w_LHlckcaw";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const $ = (id) => document.getElementById(id);

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

$("sign-out").addEventListener("click", () => db.auth.signOut());

db.auth.onAuthStateChange((_event, session) => render(session));

function render(session) {
  const loggedIn = Boolean(session);
  $("auth-view").hidden = loggedIn;
  $("app-view").hidden = !loggedIn;
  $("user-bar").hidden = !loggedIn;
  if (loggedIn) {
    $("user-email").textContent = session.user.email;
    loadWorkouts();
  }
}

// ---------- Workouts ----------

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function dayName(dateStr) {
  // Parse as local date so the weekday doesn't shift by timezone.
  const [y, m, d] = dateStr.split("-").map(Number);
  return DAYS[new Date(y, m - 1, d).getDay()];
}

$("entry-date").value = today();

$("workout-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const entryDate = $("entry-date").value;
  const weight = $("weight").value;

  const { error } = await db.from("workouts").insert({
    entry_date: entryDate,
    day_of_week: dayName(entryDate),
    exercise: $("exercise").value.trim(),
    sets: Number($("sets").value),
    reps: Number($("reps").value),
    weight: weight === "" ? null : Number(weight),
    completed: $("completed").checked,
  });
  if (error) return showMessage("form-message", error.message, true);

  showMessage("form-message", "Added.");
  $("exercise").value = "";
  $("sets").value = "";
  $("reps").value = "";
  $("weight").value = "";
  $("completed").checked = false;
  $("exercise").focus();
  loadWorkouts();
});

async function loadWorkouts() {
  const { data, error } = await db
    .from("workouts")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: true });

  const list = $("workout-list");
  if (error) {
    list.innerHTML = "";
    return showMessage("form-message", error.message, true);
  }
  if (!data.length) {
    list.innerHTML = `<div class="card empty">No workouts yet. Add your first exercise above.</div>`;
    return;
  }

  const byDate = {};
  for (const w of data) (byDate[w.entry_date] ??= []).push(w);

  list.innerHTML = "";
  for (const [date, rows] of Object.entries(byDate)) {
    const card = document.createElement("div");
    card.className = "card day";
    card.innerHTML = `<h3>${rows[0].day_of_week} <span>${date}</span></h3>`;
    for (const w of rows) card.appendChild(entryRow(w));
    list.appendChild(card);
  }
}

function entryRow(w) {
  const row = document.createElement("div");
  row.className = "entry" + (w.completed ? " done" : "");

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = w.completed;
  check.title = "Completed";
  check.addEventListener("change", async () => {
    const { error } = await db.from("workouts").update({ completed: check.checked }).eq("id", w.id);
    if (error) return showMessage("form-message", error.message, true);
    row.classList.toggle("done", check.checked);
  });

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = w.exercise;

  const detail = document.createElement("div");
  detail.className = "detail";
  detail.textContent = `${w.sets} × ${w.reps}` + (w.weight != null ? ` @ ${Number(w.weight)}` : "");

  const del = document.createElement("button");
  del.className = "delete";
  del.textContent = "Delete";
  del.addEventListener("click", async () => {
    if (!confirm(`Delete ${w.exercise}?`)) return;
    const { error } = await db.from("workouts").delete().eq("id", w.id);
    if (error) return showMessage("form-message", error.message, true);
    loadWorkouts();
  });

  row.append(check, name, detail, del);
  return row;
}

function showMessage(id, text, isError = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("error", isError);
}
