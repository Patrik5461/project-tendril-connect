-- User tender actions (saved/hidden)
CREATE TABLE public.user_tender_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('saved','hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tender_id, action)
);

CREATE INDEX user_tender_actions_user_action_idx ON public.user_tender_actions (user_id, action);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tender_actions TO authenticated;
GRANT ALL ON public.user_tender_actions TO service_role;

ALTER TABLE public.user_tender_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tender actions"
  ON public.user_tender_actions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable unaccent for diacritics-insensitive search
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Allow anon SELECT on tenders (for shareable public tender detail page)
-- Existing policy already allows authenticated; add anon read
CREATE POLICY "Public can read tenders"
  ON public.tenders FOR SELECT
  TO anon
  USING (true);

GRANT SELECT ON public.tenders TO anon;