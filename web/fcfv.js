/* web/fcfv.js
 * Backend bridge for the FCF Ventures marketplace.
 * Loaded as a classic script (after the supabase-js CDN) so the inline page
 * functions can call window.FCFV.* and onclick handlers stay global.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  PASTE YOUR SUPABASE PROJECT VALUES HERE  (Project → Settings → API)
 * ──────────────────────────────────────────────────────────────────────────
 */
const SUPABASE_URL = "https://wugujobccilcvemcfitx.supabase.co";          // e.g. https://abcd1234.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1Z3Vqb2JjY2lsY3ZlbWNmaXR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTA1MjEsImV4cCI6MjA5NjA4NjUyMX0.ttdB3iK94N57T1gCiZrbfZhu92AOS5CtE3efFF1CLs8"; // the public anon/publishable key
// ──────────────────────────────────────────────────────────────────────────

const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sign in anonymously (re-using any existing session) and resolve {id, name}.
async function init() {
  let { data: { session } } = await _sb.auth.getSession();
  if (!session) {
    const { data, error } = await _sb.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  const uid = session.user.id;
  const { data: prof } = await _sb.from("profiles").select("display_name").eq("id", uid).maybeSingle();
  return { id: uid, name: prof?.display_name ?? "You" };
}

// Map a DB row to the shape the page's render code already expects (dollars, not cents).
function mapDataset(r) {
  return {
    id: r.id, title: r.title, cat: r.category, tier: r.tier, mode: r.mode,
    price: r.price_cents / 100, unit: r.unit || "",
    seller: r.seller_name, seller_id: r.seller_id,
    score: r.score, sales: r.sales, tokens: r.tokens, modality: r.modality,
    license: r.license, fresh: r.fresh, desc: r.description, sample: r.sample || "",
    burned: r.burned,
  };
}

async function fetchDatasets() {
  const { data, error } = await _sb.from("datasets").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapDataset);
}

async function fetchPurchases() {
  const { data, error } = await _sb
    .from("purchases")
    .select("dataset_id, license, amount_cents, status")
    .eq("status", "paid");
  if (error) throw error;
  return data.map((p) => ({ id: p.dataset_id, license: p.license, paid: p.amount_cents / 100 }));
}

async function _callFunction(name, payload) {
  const { data: { session } } = await _sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `${name} failed (${res.status})`);
  return out;
}

const createCheckout = (payload) =>
  _callFunction("create-checkout", { ...payload, return_to: location.origin + location.pathname }); // -> { url }
const createListing = (payload) => _callFunction("create-listing", payload);   // -> created row

window.FCFV = { init, fetchDatasets, fetchPurchases, createCheckout, createListing };
