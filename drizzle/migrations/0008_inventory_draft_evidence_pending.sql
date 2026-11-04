-- The inventory department draft replaced earlier test content, so its earlier evidence approval no longer covers it; the owner must re-approve before publishing.
UPDATE public.cms_documents
SET draft = jsonb_set(draft, '{evidence}', '"pending"'::jsonb),
    version = version + 1,
    updated_at = now()
WHERE path = '/modules/inventory'
  AND published IS NULL
  AND draft ? 'department'
  AND draft->>'evidence' = 'approved';