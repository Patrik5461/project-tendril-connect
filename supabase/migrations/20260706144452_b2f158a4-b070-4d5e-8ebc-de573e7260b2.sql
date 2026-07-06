
ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS publication_number text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'TED';

ALTER TABLE public.tenders ALTER COLUMN description DROP NOT NULL;
ALTER TABLE public.tenders ALTER COLUMN cpv_code DROP NOT NULL;
ALTER TABLE public.tenders ALTER COLUMN region DROP NOT NULL;
ALTER TABLE public.tenders ALTER COLUMN source_url DROP NOT NULL;
ALTER TABLE public.tenders ALTER COLUMN deadline DROP NOT NULL;
ALTER TABLE public.tenders ALTER COLUMN published_at DROP NOT NULL;

ALTER TABLE public.tenders ALTER COLUMN deadline TYPE timestamptz USING deadline::timestamptz;
ALTER TABLE public.tenders ALTER COLUMN published_at TYPE timestamptz USING published_at::timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS tenders_publication_number_key
  ON public.tenders (publication_number)
  WHERE publication_number IS NOT NULL;

GRANT ALL ON public.tenders TO service_role;

DROP POLICY IF EXISTS "Service role manages tenders" ON public.tenders;
CREATE POLICY "Service role manages tenders"
  ON public.tenders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
