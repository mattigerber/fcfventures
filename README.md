# FCF Ventures — Data Marketplace

A marketplace for model-ready datasets: tiered listings (Bronze/Silver/Gold),
multi-license or sell-once ("burn") modes, Stripe checkout, and a per-account
dashboard. Static front-end + Supabase (Postgres, Auth, Edge Functions) + Stripe.

```
index.html                     front-end (loads data from Supabase, redirects to Stripe)
legal.html                     static legal page
web/fcfv.js                    Supabase client + API calls  ← paste your keys here
supabase/
  config.toml                  function settings (verify_jwt off)
  migrations/
    001_core.sql               profiles, datasets, enums, anon-profile trigger
    002_marketplace.sql        purchases + burn/sales trigger
    003_policies_and_seed.sql  RLS policies + 8 seed datasets
  functions/
    create-checkout/           creates a Stripe Checkout session
    stripe-webhook/            marks purchase paid → trigger burns/bumps sales
    create-listing/            validated server-side listing insert
.env.example                   Stripe secrets template
```

## Architecture (test-mode defaults)

- **Auth**: Supabase **anonymous** sessions. Each browser gets a user id so purchases
  and listings attach to it and RLS works. *Production upgrade: magic-link email.*
- **Payments**: single Stripe **test-mode** account, hosted **Checkout** redirect.
  A 20% platform fee is recorded per sale. *Production upgrade: Stripe Connect for
  real seller payouts.*
- **Writes** to `datasets`/`purchases` happen only inside Edge Functions (service
  role), so RLS exposes the catalog read-only and purchases read-own.

## Deploy

### 0. Install the Supabase CLI
```bash
npm install -g supabase
supabase --version
```

### 1. Create & link the project
Create a project at https://supabase.com/dashboard (note the **project ref** in the URL),
then:
```bash
supabase login                       # opens browser
supabase link --project-ref <REF>
```

### 2. Push the migrations (in order)
```bash
supabase db push
```
This runs `001 → 002 → 003`. Verify in the dashboard: **Table Editor** should show
`profiles`, `datasets` (8 rows), `purchases`.

### 3. Enable anonymous sign-ins
Dashboard → **Authentication → Providers → Anonymous** → enable.
(Without this the front-end can't sign in and the grid stays empty.)

### 4. Set Stripe secrets & deploy the functions
```bash
cp .env.example .env        # then edit .env with your test-mode keys
supabase secrets set --env-file .env
supabase functions deploy create-checkout
supabase functions deploy create-listing
supabase functions deploy stripe-webhook --no-verify-jwt
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically into deployed functions — you do **not** set them.

### 5. Register the Stripe webhook
Stripe Dashboard (test mode) → **Developers → Webhooks → Add endpoint**:
- URL: `https://<REF>.functions.supabase.co/stripe-webhook`
- Event: `checkout.session.completed`

Copy the endpoint's **Signing secret** (`whsec_…`) into `.env` as
`STRIPE_WEBHOOK_SECRET`, then re-run `supabase secrets set --env-file .env`.

### 6. Wire the front-end keys
In `web/fcfv.js`, set `SUPABASE_URL` and `SUPABASE_ANON_KEY`
(Dashboard → **Settings → API**).

### 7. Run locally against the live backend
```bash
python3 -m http.server 8000
# open http://localhost:8000
```
Browse the seeded datasets, click one, **Continue to payment** → Stripe test
checkout (card `4242 4242 4242 4242`, any future expiry/CVC). On return, the
purchase appears under **Dashboard → Purchases**; a sell-once dataset shows
**Burned**.

> The success page reads back from the DB after the webhook fires. If the webhook
> isn't registered (step 5), payment still succeeds in Stripe but the purchase stays
> `pending` and won't show as owned.
