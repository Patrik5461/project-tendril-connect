
-- billing_details: 1 row per user
CREATE TABLE public.billing_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  name TEXT NOT NULL,
  ico TEXT,
  ic_dph TEXT,
  street TEXT,
  city TEXT,
  zip TEXT,
  country TEXT NOT NULL DEFAULT 'SK',
  email TEXT NOT NULL,
  faktero_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.billing_details TO authenticated;
GRANT ALL ON public.billing_details TO service_role;

ALTER TABLE public.billing_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own billing details"
  ON public.billing_details FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_billing_details_updated
  BEFORE UPDATE ON public.billing_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  gopay_payment_id TEXT NOT NULL UNIQUE,
  faktero_invoice_id TEXT,
  invoice_number TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending', -- pending|issued|paid_marked|sent|failed
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_invoices_updated
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX invoices_user_id_idx ON public.invoices(user_id);
CREATE INDEX invoices_status_idx ON public.invoices(status);
