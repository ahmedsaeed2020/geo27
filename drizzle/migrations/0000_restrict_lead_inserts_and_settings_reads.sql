DROP POLICY IF EXISTS "Anyone can submit a request" ON public.contact_requests;
REVOKE INSERT ON TABLE public.contact_requests FROM anon;
GRANT ALL ON TABLE public.contact_requests TO service_role;

DROP POLICY IF EXISTS "Settings are publicly readable" ON public.site_settings;
REVOKE SELECT ON TABLE public.site_settings FROM anon;
GRANT SELECT ON TABLE public.site_settings TO authenticated;
GRANT ALL ON TABLE public.site_settings TO service_role;
CREATE POLICY "Admins read settings" ON public.site_settings
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));