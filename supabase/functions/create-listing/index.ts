// create-listing — server-side validated insert of a new dataset listing.
// Runs as service role (bypasses RLS) after authenticating the caller's JWT,
// so it can record the rights warranty and own the seller_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const TIERS = ["Bronze", "Silver", "Gold"];

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

    const b = await req.json();
    const title = (b.title ?? "").trim();
    const price = parseInt(b.price, 10);
    if (!title) return json({ error: "title required" }, 400);
    if (!price || price < 1) return json({ error: "valid price required" }, 400);
    if (!b.rights) return json({ error: "rights warranty must be confirmed" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: prof } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const seller_name = prof?.display_name ?? "Anonymous Seller";

    const mode = b.mode === "burn" ? "burn" : "multi";
    const tier = TIERS.includes(b.tier) ? b.tier : "Silver";

    const row = {
      title,
      category: b.category || "Training",
      tier,
      mode,
      price_cents: price * 100,
      unit: tier === "Gold" ? "/mo" : "",
      seller_id: user.id,
      seller_name,
      score: "new",
      sales: 0,
      tokens: b.tokens || "—",
      modality: b.modality || "—",
      license: mode === "burn" ? "Exclusive" : (b.license || "Commercial"),
      fresh: tier === "Gold" ? "Weekly" : "Static",
      description: b.description || "(no description)",
      sample: "(sample auto-generated from upload)",
      rights_warranty: true,
    };

    const { data, error } = await admin.from("datasets").insert(row).select().single();
    if (error) return json({ error: error.message }, 500);
    return json(data);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
