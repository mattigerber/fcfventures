-- 003_policies_and_seed.sql
-- Row Level Security + seed catalog.
-- Writes to datasets/purchases happen only through Edge Functions (service role,
-- which bypasses RLS), so the public policies below are deliberately read-only.

alter table public.profiles  enable row level security;
alter table public.datasets  enable row level security;
alter table public.purchases enable row level security;

-- profiles: anyone may read (seller names are public); no public writes (trigger creates them).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (true);

-- datasets: the catalog is public to browse. No insert/update policy => no public writes.
drop policy if exists datasets_select on public.datasets;
create policy datasets_select on public.datasets
  for select using (true);

-- purchases: a buyer may read only their own. No public writes (webhook writes via service role).
drop policy if exists purchases_select_own on public.purchases;
create policy purchases_select_own on public.purchases
  for select using (auth.uid() = buyer_id);

-- ---------- seed catalog ----------
-- Demo listings carried over from the prototype. seller_id is NULL (no real owner);
-- prices are stored in cents.
insert into public.datasets
  (title, category, tier, mode, price_cents, unit, seller_name, score, sales, tokens, modality, license, fresh, description, sample, rights_warranty)
values
  ('Agent Tool-Use Traces','Agent','Gold','multi',480000,'/mo','Helix Labs','elite',38,'1.2B','JSONL','Commercial','Daily',
   'Real multi-step agent trajectories — tool calls, observations, retries, outcomes. Benchmark-decontaminated.',
   E'{"task":"book_flight","steps":[\n  {"tool":"search_flights","obs":"3 results"},\n  {"tool":"select","obs":"selected"}\n]}', true),

  ('Financial Filings — 10-K Corpus','Finance','Silver','multi',190000,'','Atlas Data','trusted',14,'640M','Parquet','Commercial','Quarterly',
   'Every US 10-K since 2010, entity-resolved to canonical issuer IDs, normalized, validated tables.',
   E'issuer_id | section      | text\nAAPL-001  | risk_factors | "The Company..."', true),

  ('Multilingual Instruction Pairs','Training','Gold','multi',620000,'/mo','Helix Labs','elite',51,'3.4B','JSONL','Commercial','Weekly',
   'Human-reviewed instruction/response pairs across 40 languages, deduped and decontaminated. Built for SFT.',
   E'{"lang":"de","instruction":"Fasse zusammen.","output":"..."}', true),

  ('Sovereign Infrastructure Graph','Alt-Data','Silver','burn',3800000,'','M. Gerber','trusted',2,'120M','JSON','Exclusive','Static',
   'Ownership mapping across EPCs, SOEs, SPVs and sovereign vehicles in GCC infrastructure. Sell-once exclusive.',
   E'{"entity":"SPV-Δ","owners":[{"id":"SOE-7","pct":51}]}', true),

  ('Code Review Conversations','Training','Bronze','multi',24000,'','devcorpus','new',0,'890M','JSONL','Permissive','Static',
   'Raw pull-request review threads from permissively-licensed repos. Untouched — clean it your way.',
   E'{"pr":1423,"comment":"nit: extract to a helper"}', true),

  ('RAG Eval — Hard Retrieval','Eval','Gold','multi',310000,'/mo','Atlas Data','trusted',22,'45M','JSONL','Commercial','Monthly',
   'Adversarial retrieval questions with gold passages and distractors. Versioned, leakage-guaranteed splits.',
   E'{"q":"What clause governs termination?","gold":"doc_88#p3"}', true),

  ('Voice Command Intents','Multimodal','Silver','burn',1450000,'','Sonic AI','new',0,'210M','JSONL','Exclusive','Static',
   'Transcribed voice-command intents for edge agents, entity-resolved and normalized. Sell-once.',
   E'{"audio_id":"v_0012","transcript":"turn off lights","intent":"device.off"}', true),

  ('E-commerce Product Graph','Alt-Data','Silver','multi',270000,'','devcorpus','new',1,'1.1B','Parquet','Commercial','Monthly',
   'Cross-retailer catalog, entity-resolved to canonical SKUs, normalized attributes, validated prices.',
   E'sku_id | title         | brand | price\nSKU-9  | "USB-C Cable" | Anker | 12.99', true);
