-- Nullverse universal gallery image credits
-- Safe to run more than once. Existing values and rows are preserved.
-- New/edited gallery items always send explicit credit data from the UI.
-- Legacy rows are intentionally left NULL so the public UI shows "Credit Needed"
-- instead of falsely assuming old artwork was made by the uploader.

alter table if exists public.creator_proof_gallery
    add column if not exists image_credit_type text,
    add column if not exists image_credit_name text,
    add column if not exists image_credit_url text,
    add column if not exists image_credit_note text,
    add column if not exists image_credit_no_ai boolean default false,
    add column if not exists image_credit_nullverse_username text;
