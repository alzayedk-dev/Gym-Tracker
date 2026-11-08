// Where MyFatoorah sends the user's browser after KNET (success or failure).
// It never trusts the address it was opened with: it asks MyFatoorah for the real payment status,
// matches it to our pending subscription and amount, then sends the user to the success or failed page.
// Opened by a browser redirect without a login token, so this function has JWT checking off.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { activeUntil, addMonths, myfatoorah, PLANS, SITE_URL, type Plan } from "../_shared/payments.ts";

const go = (page: string, params: Record<string, string> = {}) =>
  new Response(null, { status: 303, headers: { Location: `${SITE_URL}/${page}?${new URLSearchParams(params)}` } });

Deno.serve(async (req) => {
  const paymentId = new URL(req.url).searchParams.get("paymentId") ?? "";
  if (!/^[0-9A-Za-z-]{1,64}$/.test(paymentId)) return go("payment-failed.html", { reason: "missing" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let status;
  try {
    status = await myfatoorah("GetPaymentStatus", { Key: paymentId, KeyType: "PaymentId" });
  } catch {
    return go("payment-failed.html", { reason: "check" });
  }

  const { data: sub } = await admin.from("subscriptions").select("*").eq("invoice_id", status.InvoiceId).maybeSingle();
  if (!sub) {
    console.error("Payment for unknown invoice", status.InvoiceId);
    return go("payment-failed.html", { reason: "unknown" });
  }

  // Already confirmed (e.g. the page was refreshed): just show success again.
  if (sub.status === "paid") {
    return go("payment-success.html", { plan: sub.plan, until: String(sub.ends_at).slice(0, 10) });
  }

  const paid = status.InvoiceStatus === "Paid" && Number(status.InvoiceValue) === Number(sub.amount);
  if (!paid) {
    await admin.from("subscriptions").update({ status: "failed", payment_id: paymentId }).eq("id", sub.id).eq("status", "pending");
    return go("payment-failed.html", { reason: "declined" });
  }

  // New time starts when any time you already have runs out, so renewing early never loses days.
  const { data: rows } = await admin.from("subscriptions").select("status, ends_at").eq("user_id", sub.user_id);
  const start = activeUntil(rows ?? []) ?? new Date();
  const end = addMonths(start, PLANS[sub.plan as Plan].months);

  const { data: updated, error } = await admin.from("subscriptions")
    .update({ status: "paid", payment_id: paymentId, paid_at: new Date().toISOString(), starts_at: start.toISOString(), ends_at: end.toISOString() })
    .eq("id", sub.id).in("status", ["pending", "failed"]) // a retry on the same page after a failed try still counts
    .select("ends_at").maybeSingle();
  if (error || !updated) {
    console.error("Couldn't save payment", sub.id, error?.message ?? "row changed meanwhile");
    return go("payment-failed.html", { reason: "save" });
  }
  const until = String(updated.ends_at).slice(0, 10);
  return go("payment-success.html", { plan: sub.plan, until });
});
