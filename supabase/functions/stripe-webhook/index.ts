// stripe-webhook — verifies Stripe events and marks the matching purchase 'paid'.
// The DB trigger (apply_paid_purchase) then bumps sales and burns sell-once listings.
// Deploy with --no-verify-jwt: Stripe calls this with a signature, not a Supabase JWT.
import Stripe from "npm:stripe@^17.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    // constructEventAsync is required in Deno (uses SubtleCrypto under the hood).
    event = await stripe.webhooks.constructEventAsync(body, sig!, WEBHOOK_SECRET);
  } catch (e) {
    return new Response(`Webhook signature verification failed: ${(e as Error).message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { error } = await admin
      .from("purchases")
      .update({ status: "paid" })
      .eq("stripe_session_id", session.id);
    if (error) return new Response(error.message, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
