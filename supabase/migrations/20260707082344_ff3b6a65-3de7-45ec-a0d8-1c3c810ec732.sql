ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_summary_generated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tenders_ai_summary_missing
  ON public.tenders (deadline)
  WHERE ai_summary IS NULL;