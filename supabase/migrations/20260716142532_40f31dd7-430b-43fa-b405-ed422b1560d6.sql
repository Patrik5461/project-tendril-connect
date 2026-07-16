CREATE TABLE public.tender_subcontracting (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL,
  suggested jsonb NOT NULL DEFAULT '[]'::jsonb,
  firma_zvladne_sama boolean NOT NULL DEFAULT false,
  poznamka text,
  selections jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_versions jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, tender_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tender_subcontracting TO authenticated;
GRANT ALL ON public.tender_subcontracting TO service_role;
ALTER TABLE public.tender_subcontracting ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own subcontracting" ON public.tender_subcontracting
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_tender_subcontracting_updated_at
  BEFORE UPDATE ON public.tender_subcontracting
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();