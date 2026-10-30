CREATE OR REPLACE FUNCTION public.cms_published() RETURNS TABLE(path text,kind text,published jsonb,published_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT path,kind,published,published_at FROM public.cms_documents WHERE published IS NOT NULL AND state<>'archived' $$;
GRANT EXECUTE ON FUNCTION public.cms_published() TO anon,authenticated,service_role;
CREATE POLICY cms_media_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='digit-cms-media' AND public.cms_access('content'));
CREATE POLICY cms_media_view ON storage.objects FOR SELECT TO authenticated USING(bucket_id='digit-cms-media' AND public.cms_access('content'));
