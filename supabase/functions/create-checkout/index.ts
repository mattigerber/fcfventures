// create-checkout — creates a Stripe Checkout Session (test mode) for a dataset
// purchase and records a pending purchase row. Returns { url } to redirect to.
import Stripe from "npm:stripe@^17.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);

    const { dataset_id, license_type, email, org, return_to } = await req.json();
    if (!dataset_id) return json({ error: "dataset_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: d, error } = await admin.from("datasets").select("*").eq("id", dataset_id).single();
    if (error || !d) return json({ error: "dataset not found" }, 404);
    if (d.burned) return json({ error: "this dataset has been burned" }, 409);

    const exclusive = license_type === "exclusive";
    const origin = req.headers.get("Origin") ?? "http://localhost:8000";
    // The client sends its own page URL so redirects work under a subpath
    // (e.g. GitHub Pages /repo/) as well as at the root (localhost).
    const base = (typeof return_to === "string" && return_to.startsWith("http"))
      ? return_to
      : `${origin}/index.html`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: d.price_cents,
          product_data: {
            name: d.title,
            description: `${exclusive ? "Exclusive license" : "Multi-license"} · ${d.tier}`,
          },
        },
      }],
      success_url: `${base}?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}?status=cancel`,
      metadata: {
        dataset_id: String(dataset_id),
        buyer_id: user.id,
        license: exclusive ? "Exclusive" : "Multi-license",
      },
    });

    const fee = Math.round(d.price_cents * 0.20);
    const { error: insErr } = await admin.from("purchases").insert({
      dataset_id,
      buyer_id: user.id,
      buyer_email: email || null,
      buyer_org: org || null,
      license: exclusive ? "Exclusive" : "Multi-license",
      amount_cents: d.price_cents,
      fee_cents: fee,
      stripe_session_id: session.id,
      status: "pending",
    });
    if (insErr) return json({ error: insErr.message }, 500);

    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
