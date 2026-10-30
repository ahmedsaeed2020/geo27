-- Public, read-only dimensions and focal points for approved library images so pages can reserve space and crop correctly.
CREATE OR REPLACE FUNCTION public.cms_media_public()
RETURNS TABLE(url text, width integer, height integer, focal_x integer, focal_y integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.url, m.width, m.height, m.focal_x::integer, m.focal_y::integer
  FROM public.cms_media m
  WHERE m.approval = 'approved'
    AND m.archived_at IS NULL
    AND m.url LIKE '/api/public/cms-media/%'
$$;

REVOKE ALL ON FUNCTION public.cms_media_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cms_media_public() TO anon, authenticated, service_role;