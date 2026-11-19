ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'sa' CHECK (market IN ('sa','eg'));
ALTER TABLE public.crm_users ADD COLUMN IF NOT EXISTS market text CHECK (market IN ('sa','eg'));
ALTER TABLE public.crm_users DROP CONSTRAINT IF EXISTS crm_users_role_check;
ALTER TABLE public.crm_users ADD CONSTRAINT crm_users_role_check CHECK (role IN ('admin','manager','sales'));
CREATE INDEX IF NOT EXISTS leads_market_idx ON public.leads(market);
UPDATE public.leads l SET market='eg' FROM public.contact_requests c WHERE l.request_id=c.id AND c.page_path LIKE '/e%' AND c.page_path NOT LIKE '/en%';

CREATE OR REPLACE FUNCTION public.crm_market() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT market FROM public.crm_users WHERE user_id=auth.uid() AND active $$;
GRANT EXECUTE ON FUNCTION public.crm_market() TO authenticated; REVOKE EXECUTE ON FUNCTION public.crm_market() FROM PUBLIC,anon;

CREATE OR REPLACE FUNCTION public.crm_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src text; ref text := lower(COALESCE(NEW.referrer,''));
BEGIN
 src := NULLIF(lower(NEW.utm->>'utm_source'),'');
 IF src IS NULL THEN src := CASE WHEN ref ~ 'facebook|fb\.|instagram' THEN 'facebook' WHEN ref ~ 'google' THEN 'google' WHEN ref ~ 'tiktok' THEN 'tiktok' WHEN ref ~ 'linkedin|lnkd' THEN 'linkedin' WHEN ref ~ 't\.co|twitter|x\.com' THEN 'x' WHEN ref ~ 'snapchat' THEN 'snapchat' ELSE 'direct' END; END IF;
 INSERT INTO public.leads(name,phone,email,company,source,attribution,consent,request_id,created_at,market)
 VALUES(NEW.name,NEW.phone,NEW.email,NEW.company,src,COALESCE(NEW.utm,'{}'::jsonb)||jsonb_build_object('page_path',NEW.page_path,'referrer',NEW.referrer),NEW.consent,NEW.id,NEW.created_at,
  CASE WHEN NEW.page_path ~ '^/e(/|$|\?)' THEN 'eg' ELSE 'sa' END);
 RETURN NEW; END $$;

DROP POLICY IF EXISTS leads_access ON public.leads;
CREATE POLICY leads_access ON public.leads FOR ALL TO authenticated
 USING (public.crm_role()='admin' OR (public.crm_role()='manager' AND market=public.crm_market()) OR (public.crm_role()='sales' AND owner=auth.uid()))
 WITH CHECK (public.crm_role()='admin' OR (public.crm_role()='manager' AND market=public.crm_market()) OR (public.crm_role()='sales' AND owner=auth.uid()));
DROP POLICY IF EXISTS deals_access ON public.deals;
CREATE POLICY deals_access ON public.deals FOR ALL TO authenticated
 USING (public.crm_role()='admin' OR (public.crm_role()='manager' AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.market=public.crm_market())) OR (public.crm_role()='sales' AND owner=auth.uid()))
 WITH CHECK (public.crm_role()='admin' OR (public.crm_role()='manager' AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.market=public.crm_market())) OR (public.crm_role()='sales' AND owner=auth.uid()));

CREATE OR REPLACE FUNCTION public.crm_assign(ids uuid[], rep uuid DEFAULT NULL, rotating boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reps uuid[]; item uuid; chosen uuid; cursor_value integer; me text := public.crm_role(); mk text := public.crm_market();
BEGIN
 IF me NOT IN ('admin','manager') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF me='manager' AND EXISTS(SELECT 1 FROM public.leads WHERE id=ANY(ids) AND market IS DISTINCT FROM mk) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 INSERT INTO public.crm_settings(id) VALUES(1) ON CONFLICT DO NOTHING; SELECT round_robin_cursor INTO cursor_value FROM public.crm_settings WHERE id=1 FOR UPDATE;
 IF rotating THEN SELECT array_agg(user_id ORDER BY created_at,user_id) INTO reps FROM public.crm_users WHERE active AND role='sales' AND (me='admin' OR market=mk); IF COALESCE(array_length(reps,1),0)=0 THEN RAISE EXCEPTION 'No active Sales users'; END IF;
 ELSIF rep IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_users WHERE user_id=rep AND active AND (me='admin' OR market=mk)) THEN RAISE EXCEPTION 'Inactive owner'; END IF;
 FOREACH item IN ARRAY ids LOOP chosen:=rep; IF rotating THEN chosen:=reps[1+(cursor_value % array_length(reps,1))]; cursor_value:=cursor_value+1; END IF;
  UPDATE public.leads SET owner=chosen WHERE id=item AND merged_into IS NULL; UPDATE public.deals SET owner=chosen WHERE lead_id=item; UPDATE public.activities SET owner=COALESCE(chosen,owner) WHERE lead_id=item OR deal_id IN (SELECT id FROM public.deals WHERE lead_id=item); END LOOP;
 UPDATE public.crm_settings SET round_robin_cursor=cursor_value WHERE id=1; END $$;