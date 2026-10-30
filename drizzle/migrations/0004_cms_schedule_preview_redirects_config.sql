-- Scheduling on documents
ALTER TABLE public.cms_documents ADD COLUMN scheduled jsonb, ADD COLUMN publish_at timestamptz, ADD COLUMN unpublish_at timestamptz, ADD COLUMN scheduled_by uuid;

CREATE OR REPLACE FUNCTION public.cms_published() RETURNS TABLE(path text,kind text,published jsonb,published_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.path, d.kind,
    CASE WHEN d.scheduled IS NOT NULL AND d.publish_at <= now() THEN d.scheduled ELSE d.published END,
    CASE WHEN d.scheduled IS NOT NULL AND d.publish_at <= now() THEN d.publish_at ELSE d.published_at END
  FROM public.cms_documents d
  WHERE ((d.published IS NOT NULL AND d.state <> 'archived') OR (d.scheduled IS NOT NULL AND d.publish_at <= now()))
    AND (d.unpublish_at IS NULL OR d.unpublish_at > now())
$$;
GRANT EXECUTE ON FUNCTION public.cms_published() TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cms_apply_schedules() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer := 0; m integer := 0;
BEGIN
  UPDATE public.cms_documents SET published=scheduled, published_at=publish_at, state='published', scheduled=NULL, publish_at=NULL, version=version+1, updated_at=now(), updated_by=COALESCE(scheduled_by, updated_by), scheduled_by=NULL
   WHERE scheduled IS NOT NULL AND publish_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.cms_documents SET published=NULL, state='archived', unpublish_at=NULL, version=version+1, updated_at=now()
   WHERE unpublish_at IS NOT NULL AND unpublish_at <= now();
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END $$;
REVOKE ALL ON FUNCTION public.cms_apply_schedules() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cms_apply_schedules() TO service_role;

-- Revisions record the real author (server writes use the service role) and the exact action; server code writes audit rows with the actor.
CREATE OR REPLACE FUNCTION public.audit_cms_document() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.cms_revisions(document_id,snapshot,action,author_id)
  VALUES(NEW.id,to_jsonb(NEW),
    CASE WHEN TG_OP='INSERT' THEN 'create'
         WHEN NEW.published IS NULL AND OLD.published IS NOT NULL THEN 'unpublish'
         WHEN NEW.published IS DISTINCT FROM OLD.published THEN 'publish'
         WHEN NEW.scheduled IS DISTINCT FROM OLD.scheduled OR NEW.unpublish_at IS DISTINCT FROM OLD.unpublish_at THEN 'schedule'
         ELSE 'save' END,
    COALESCE(auth.uid(), NEW.updated_by));
  RETURN NEW;
END $$;

-- Expiring, revocable preview links (only hashes are stored)
CREATE TABLE public.cms_preview_tokens (token_hash text PRIMARY KEY, document_id uuid NOT NULL REFERENCES public.cms_documents(id) ON DELETE CASCADE, created_by uuid NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, last_used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.cms_preview_tokens TO authenticated; GRANT ALL ON public.cms_preview_tokens TO service_role;
ALTER TABLE public.cms_preview_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY cms_preview_tokens_read ON public.cms_preview_tokens FOR SELECT TO authenticated USING (public.cms_access('content'));
CREATE INDEX cms_preview_tokens_document ON public.cms_preview_tokens(document_id, created_at DESC);

-- Redirect manager
CREATE TABLE public.cms_redirects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), from_path text UNIQUE NOT NULL, to_path text NOT NULL, status_code integer NOT NULL DEFAULT 301 CHECK (status_code IN (301,302,307,308)), enabled boolean NOT NULL DEFAULT true, note text NOT NULL DEFAULT '', hits integer NOT NULL DEFAULT 0, last_hit_at timestamptz, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.cms_redirects TO authenticated; GRANT ALL ON public.cms_redirects TO service_role;
ALTER TABLE public.cms_redirects ENABLE ROW LEVEL SECURITY;
CREATE POLICY cms_redirects_read ON public.cms_redirects FOR SELECT TO authenticated USING (public.cms_access('content'));

CREATE OR REPLACE FUNCTION public.cms_resolve_redirect(p_path text) RETURNS TABLE(to_path text, status_code integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY UPDATE public.cms_redirects r SET hits = r.hits + 1, last_hit_at = now() WHERE r.from_path = p_path AND r.enabled RETURNING r.to_path, r.status_code;
END $$;
REVOKE ALL ON FUNCTION public.cms_resolve_redirect(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cms_resolve_redirect(text) TO anon, authenticated, service_role;

-- Site-wide editable settings with draft/published snapshots
CREATE TABLE public.cms_site_config (key text PRIMARY KEY CHECK (key IN ('branding','forms','home','pro','security')), draft jsonb NOT NULL DEFAULT '{}'::jsonb, published jsonb, version integer NOT NULL DEFAULT 1, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz);
GRANT SELECT ON public.cms_site_config TO authenticated; GRANT ALL ON public.cms_site_config TO service_role;
ALTER TABLE public.cms_site_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY cms_site_config_read ON public.cms_site_config FOR SELECT TO authenticated USING (public.cms_access('content') OR (key = 'security' AND public.cms_access('leads')));

CREATE TABLE public.cms_config_revisions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), config_key text NOT NULL, snapshot jsonb NOT NULL, action text NOT NULL, author_id uuid, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.cms_config_revisions TO authenticated; GRANT ALL ON public.cms_config_revisions TO service_role;
ALTER TABLE public.cms_config_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cms_config_revisions_read ON public.cms_config_revisions FOR SELECT TO authenticated USING (public.cms_access('content'));
CREATE INDEX cms_config_revisions_key ON public.cms_config_revisions(config_key, created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_cms_site_config() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.cms_config_revisions(config_key,snapshot,action,author_id)
  VALUES(NEW.key,to_jsonb(NEW),
    CASE WHEN TG_OP='INSERT' THEN 'create'
         WHEN NEW.published IS NULL AND OLD.published IS NOT NULL THEN 'unpublish'
         WHEN NEW.published IS DISTINCT FROM OLD.published THEN 'publish'
         ELSE 'save' END,
    COALESCE(auth.uid(), NEW.updated_by));
  RETURN NEW;
END $$;
CREATE TRIGGER cms_site_config_history AFTER INSERT OR UPDATE ON public.cms_site_config FOR EACH ROW EXECUTE FUNCTION public.audit_cms_site_config();

CREATE OR REPLACE FUNCTION public.cms_site_published() RETURNS TABLE(key text, published jsonb, published_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.key, c.published, c.published_at FROM public.cms_site_config c WHERE c.published IS NOT NULL AND c.key IN ('branding','forms','home','pro')
$$;
GRANT EXECUTE ON FUNCTION public.cms_site_published() TO anon, authenticated, service_role;

-- Media versions, responsive sizes and archive state
ALTER TABLE public.cms_media ADD COLUMN variants jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN archived_at timestamptz, ADD COLUMN replaced_at timestamptz, ADD COLUMN bytes integer, ADD COLUMN mime text;
CREATE INDEX cms_media_url ON public.cms_media(url);

-- Sales and owners read visitor chat transcripts
CREATE POLICY chat_threads_cms_read ON public.chat_threads FOR SELECT TO authenticated USING (public.cms_access('leads'));
CREATE POLICY chat_messages_cms_read ON public.chat_messages FOR SELECT TO authenticated USING (public.cms_access('leads'));