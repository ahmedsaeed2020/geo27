CREATE OR REPLACE FUNCTION public.crm_validate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE target_owner uuid; current_stages jsonb; BEGIN
 IF auth.uid() IS NOT NULL AND public.crm_role() NOT IN ('admin','manager','sales') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF TG_TABLE_NAME IN ('leads','deals') AND TG_OP='UPDATE' AND public.crm_role()='sales' AND NEW.owner IS DISTINCT FROM OLD.owner THEN RAISE EXCEPTION 'Only Admin can assign'; END IF;
 IF TG_TABLE_NAME='leads' THEN IF NEW.status='unqualified' AND trim(NEW.reason)='' THEN RAISE EXCEPTION 'Unqualified reason required'; END IF; IF TG_OP='UPDATE' AND OLD.merged_into IS NOT NULL THEN RAISE EXCEPTION 'Merged record is read only'; END IF; END IF;
 IF TG_TABLE_NAME='deals' THEN
 SELECT owner INTO target_owner FROM public.leads WHERE id=NEW.lead_id AND status='qualified' AND merged_into IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Qualified lead required'; END IF;
 IF TG_OP='INSERT' THEN NEW.owner:=target_owner; END IF;
 SELECT stages INTO current_stages FROM public.crm_settings WHERE id=1;
 current_stages:=COALESCE(current_stages,'["opportunity","meeting held","quotation","negotiation","won","lost"]');
 IF NOT current_stages ? NEW.stage THEN RAISE EXCEPTION 'Invalid stage'; END IF;
 IF NEW.stage='lost' AND trim(NEW.reason)='' THEN RAISE EXCEPTION 'Lost reason required'; END IF;
 IF TG_OP='UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN NEW.stage_changed_at:=now(); END IF;
 END IF;
 IF TG_TABLE_NAME='activities' THEN
 IF NEW.lead_id IS NOT NULL THEN SELECT owner INTO target_owner FROM public.leads WHERE id=NEW.lead_id AND merged_into IS NULL; ELSE SELECT owner INTO target_owner FROM public.deals WHERE id=NEW.deal_id; END IF;
 IF public.crm_role()='sales' AND (target_owner IS DISTINCT FROM auth.uid() OR NEW.owner IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NEW.type IN ('task','meeting') AND NEW.due_at IS NULL THEN RAISE EXCEPTION 'Date required'; END IF;
 END IF; RETURN NEW; END $$;
DROP POLICY IF EXISTS activities_manager ON public.activities;
CREATE POLICY activities_manager ON public.activities FOR ALL TO authenticated
 USING (public.crm_role()='manager' AND (EXISTS(SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.market=public.crm_market()) OR EXISTS(SELECT 1 FROM public.deals d JOIN public.leads l ON l.id=d.lead_id WHERE d.id=deal_id AND l.market=public.crm_market())))
 WITH CHECK (public.crm_role()='manager' AND (EXISTS(SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.market=public.crm_market()) OR EXISTS(SELECT 1 FROM public.deals d JOIN public.leads l ON l.id=d.lead_id WHERE d.id=deal_id AND l.market=public.crm_market())));