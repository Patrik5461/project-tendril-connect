DELETE FROM public.tenders WHERE source <> 'TED' OR publication_number IS NULL;
DROP INDEX IF EXISTS public.tenders_publication_number_key;
ALTER TABLE public.tenders ADD CONSTRAINT tenders_publication_number_key UNIQUE (publication_number);