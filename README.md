# FCF Ventures — Data Marketplace

A marketplace for model-ready datasets: tiered listings (Bronze/Silver/Gold),
multi-license or sell-once ("burn") modes, Stripe checkout, and a per-account
dashboard. Static front-end + Supabase (Postgres, Auth, Edge Functions) + Stripe.

**Live:** https://mattigerber.github.io/fcfventures/ (GitHub Pages, served from `main`)

> The previous static company site is preserved on the **`backup-pre-marketplace`**
> branch (`git checkout backup-pre-marketplace`) and can be restored at any time.

## Layout

```
index.html                     marketplace (loads data from Supabase, redirects to Stripe)
legal.html                     legal index ─┐
privacy-policy.html            privacy      ├─ all share style.css (uniform design)
terms-of-service.html          terms       ─┘
style.css                      shared design system for the static/legal pages
logo.png  favicon.ico          branding
web/fcfv.js                    Supabase client + API calls  ← public anon key lives here
supabase/
  config.toml                  function settings (verify_jwt off)
  migrations/
    001_core.sql               profiles, datasets, enums, anon-profile trigger
    002_marketplace.sql        purchases + burn/sales trigger
    003_policies_and_seed.sql  RLS policies + 8 seed datasets
  functions/
    create-checkout/           creates a Stripe Checkout session (+ pending purchase)
    stripe-webhook/            marks purchase paid → trigger burns/bumps sales
    create-listing/            validated, rate-limited server-side listing insert
.env.example                   Stripe secrets template (real .env is gitignored)
```

## Architecture

- **Auth**: Supabase **anonymous** sessions — each browser gets a user id so purchases
  and listings attach to it and RLS works. No login friction. *Upgrade path: magic-link
  email for verified sellers/buyers.*
- **Payments**: Stripe **test-mode**, hosted **Checkout** redirect. A 20% platform fee
  is recorded per sale. The Checkout return URL is derived from the client's own page
  URL, so redirects work on both the Pages subpath and `localhost`. *Upgrade path:
  Stripe Connect for real seller payouts.*
- **Writes** to `datasets`/`purchases` happen only inside Edge Functions (service role),
  so RLS exposes the catalog read-only and purchases read-own.
- **Hardening** (`create-listing`): input validation (title 3–120, description ≤2000,
  price 1–1,000,000), category/tier whitelists + field length caps, and rate limits
  (**max 5 listings/hour, 30 per account**) to curb spam from the open anonymous API.

## Design

All pages share one visual system — IBM Plex Mono, the `--ink`/`--bg` token palette,
pill buttons, and an identical sticky header + footer. The marketplace keeps its styles
inline (in `index.html`); the legal pages pull the same tokens from `style.css`.

## Deploy from scratch

```bash
npm install -g supabase            # or use: npx supabase@latest ...
supabase login                     # or export SUPABASE_ACCESS_TOKEN=<PAT>
supabase link --project-ref <REF>
supabase db push                   # runs 001 → 002 → 003
```

Enable **Authentication → Providers → Anonymous** in the dashboard, then:

```bash
cp .env.example .env               # add your sk_test_ and whsec_ keys
supabase secrets set --env-file .env
supabase functions deploy create-checkout
supabase functions deploy create-listing
supabase functions deploy stripe-webhook --no-verify-jwt
```

Register a Stripe webhook (test mode) for `checkout.session.completed` at
`https://<REF>.supabase.co/functions/v1/stripe-webhook`, put its signing secret in
`.env`, and re-run `supabase secrets set`. Finally set `SUPABASE_URL` +
`SUPABASE_ANON_KEY` in `web/fcfv.js`.

## Run locally

```bash
python3 -m http.server 8000        # http://localhost:8000
```

Browse the seeded datasets, buy with Stripe test card `4242 4242 4242 4242` (any future
expiry/CVC). The purchase appears under **Dashboard → Purchases**; a sell-once dataset
flips to **Burned**.

## Current deployment

- Supabase project ref: `wugujobccilcvemcfitx`
- Edge Functions: `create-checkout`, `create-listing`, `stripe-webhook` (all ACTIVE)
- Stripe: test mode; webhook registered for `checkout.session.completed`
