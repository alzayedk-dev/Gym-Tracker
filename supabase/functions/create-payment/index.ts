// Creates a MyFatoorah payment link for a subscription and returns it.
// The MyFatoorah page shows the amount, the customer's name, email and mobile, and lets them pay by KNET.
// The price comes from here (PLANS), never from the browser.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { cors, json, myfatoorah, PLANS, type Plan } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!user) return json({ error: "Please log in to subscribe." }, 401);

  let body: { plan?: unknown; name?: unknown; mobile?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const plan = body.plan as Plan;
  if (!(plan in PLANS)) return json({ error: "Please choose monthly or yearly." }, 400);
  const { amount, name: item } = PLANS[plan];

  // Customer details shown on the MyFatoorah page.
  const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 100) ||
    String(user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? "").trim() || "Lets train member";
  const mobile = String(body.mobile ?? "").replace(/\D/g, "").replace(/^(00965|965)/, "");
  if (mobile && !/^[0-9]{8}$/.test(mobile)) return json({ error: "Please enter an 8-digit Kuwait mobile number." }, 400);
  const email = user.email ?? null;

  // Only this function (with the service role) can write subscriptions.
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: row, error } = await admin.from("subscriptions")
    .insert({
      user_id: user.id, plan, amount, currency: "KWD", status: "pending",
      customer_name: name, customer_email: email, customer_mobile: mobile || null,
    })
    .select("id").single();
  if (error) return json({ error: error.message }, 500);

  try {
    const back = `${url}/functions/v1/payment-callback`;
    const pay = await myfatoorah("SendPayment", {
      NotificationOption: "LNK",            // just make the link; we send the user there ourselves
      InvoiceValue: amount,
      DisplayCurrencyIso: "KWD",
      CustomerName: name,
      CustomerEmail: email ?? undefined,
      ...(mobile ? { MobileCountryCode: "+965", CustomerMobile: mobile } : {}),
      CustomerReference: String(row.id),    // our subscription row
      UserDefinedField: user.id,
      CallBackUrl: back,                    // MyFatoorah sends the user here after paying...
      ErrorUrl: back,                       // ...or after a failed / cancelled payment
      Language: "en",
      InvoiceItems: [{ ItemName: item, Quantity: 1, UnitPrice: amount }],
    });

    await admin.from("subscriptions").update({ invoice_id: pay.InvoiceId, payment_url: pay.InvoiceURL }).eq("id", row.id);
    return json({ url: pay.InvoiceURL });
  } catch (msg) {
    await admin.from("subscriptions").update({ status: "failed" }).eq("id", row.id);
    return json({ error: typeof msg === "string" ? msg : "Couldn't start the payment. Please try again." }, 502);
  }
});
