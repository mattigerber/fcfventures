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
const CATEGORIES = ["Agent", "Training", "Eval", "Finance", "Alt-Data", "Multimodal"];

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

    // ---- input validation (reject early, with clear messages) ----
    const title = String(b.title ?? "").trim();
    const description = String(b.description ?? "").trim();
    const price = parseInt(b.price, 10);
    if (title.length < 3 || title.length > 120) return json({ error: "title must be 3–120 characters" }, 400);
    if (description.length > 2000) return json({ error: "description too long (max 2000 characters)" }, 400);
    if (!Number.isFinite(price) || price < 1 || price > 1_000_000) return json({ error: "price must be between 1 and 1,000,000 USD" }, 400);
    if (b.rights !== true) return json({ error: "rights warranty must be confirmed" }, 400);

    // ---- normalize / sanitize against whitelists + length caps ----
    const category = CATEGORIES.includes(b.category) ? b.category : "Training";
    const tier = TIERS.includes(b.tier) ? b.tier : "Silver";
    const mode = b.mode === "burn" ? "burn" : "multi";
    const tokens = (String(b.tokens ?? "").trim().slice(0, 24)) || "—";
    const modality = (String(b.modality ?? "").trim().slice(0, 24)) || "—";
    const licenseIn = String(b.license ?? "").trim().slice(0, 40);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ---- rate limiting: cap spam from the open/anonymous API ----
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count: recent } = await admin.from("datasets")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", user.id).gte("created_at", oneHourAgo);
    if ((recent ?? 0) >= 5) return json({ error: "rate limit: max 5 listings per hour" }, 429);

    const { count: total } = await admin.from("datasets")
      .select("id", { count: "exact", head: true }).eq("seller_id", user.id);
    if ((total ?? 0) >= 30) return json({ error: "account listing cap reached (30)" }, 429);

    const { data: prof } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const seller_name = prof?.display_name ?? "Anonymous Seller";

    const row = {
      title,
      category,
      tier,
      mode,
      price_cents: price * 100,
      unit: tier === "Gold" ? "/mo" : "",
      seller_id: user.id,
      seller_name,
      score: "new",
      sales: 0,
      tokens,
      modality,
      license: mode === "burn" ? "Exclusive" : (licenseIn || "Commercial"),
      fresh: tier === "Gold" ? "Weekly" : "Static",
      description: description || "(no description)",
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
