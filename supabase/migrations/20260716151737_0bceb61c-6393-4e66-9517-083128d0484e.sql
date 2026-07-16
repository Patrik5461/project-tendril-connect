ALTER TABLE public.tenders ADD COLUMN IF NOT EXISTS structured_criteria jsonb;
CREATE INDEX IF NOT EXISTS tenders_structured_criteria_source_idx
  ON public.tenders ((structured_criteria->>'selection_criteria_source'))
  WHERE structured_criteria IS NOT NULL;