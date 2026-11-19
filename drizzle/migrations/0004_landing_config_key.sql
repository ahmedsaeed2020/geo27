ALTER TABLE public.cms_site_config DROP CONSTRAINT cms_site_config_key_check;
ALTER TABLE public.cms_site_config ADD CONSTRAINT cms_site_config_key_check CHECK (key = ANY (ARRAY['branding','forms','home','pro','security','catalog','landing']));
CREATE OR REPLACE FUNCTION public.cms_site_published()
 RETURNS TABLE(key text, published jsonb, published_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT c.key, c.published, c.published_at FROM public.cms_site_config c WHERE c.published IS NOT NULL AND c.key IN ('branding','forms','home','pro','catalog','landing') $$;