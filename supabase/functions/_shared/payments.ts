// Shared payment settings and MyFatoorah calls.
// The API key is the Supabase secret MYFATOORAH_API_KEY and never reaches the browser.
// MYFATOORAH_BASE_URL picks the server: the test server unless set to https://api.myfatoorah.com (live, Kuwait).

export const PLANS = {
  monthly: { amount: 3, months: 1, name: "Lets train AI coach – Monthly" },
  yearly: { amount: 30, months: 12, name: "Lets train AI coach – Yearly" },
} as const;
export type Plan = keyof typeof PLANS;

export const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://letstrain-iota.vercel.app").replace(/\/$/, "");
const BASE_URL = (Deno.env.get("MYFATOORAH_BASE_URL") ?? "https://apitest.myfatoorah.com").replace(/\/$/, "");

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Call a MyFatoorah v2 endpoint. Returns Data on success, or throws a short message.
export async function myfatoorah(path: string, body: unknown) {
  const key = Deno.env.get("MYFATOORAH_API_KEY");
  if (!key) throw "Payments aren't set up yet (the MyFatoorah key is missing).";
  const res = await fetch(`${BASE_URL}/v2/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.IsSuccess) {
    console.error("MyFatoorah error", path, res.status, JSON.stringify(data).slice(0, 500));
    throw "The payment service didn't respond as expected. Please try again.";
  }
  return data.Data;
}

// The active subscription's end date (the latest paid ends_at still in the future), or null.
export function activeUntil(rows: { status: string; ends_at: string | null }[], now = new Date()) {
  const ends = rows
    .filter((r) => r.status === "paid" && r.ends_at && new Date(r.ends_at) > now)
    .map((r) => new Date(r.ends_at!).getTime());
  return ends.length ? new Date(Math.max(...ends)) : null;
}

export function addMonths(d: Date, months: number) {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}
