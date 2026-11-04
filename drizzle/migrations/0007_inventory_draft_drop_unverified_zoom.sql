-- The representative inventory draft shows the full reconciliation screenshot; no zoomed region has been approved.
UPDATE public.cms_documents d
SET draft = jsonb_set(jsonb_set(d.draft,
      '{ar,blocks}', (SELECT jsonb_agg(CASE WHEN b->>'id' = 'inv-story-gl' THEN b || '{"focus":null}'::jsonb ELSE b END ORDER BY o) FROM jsonb_array_elements(d.draft->'ar'->'blocks') WITH ORDINALITY AS t(b, o))),
      '{en,blocks}', (SELECT jsonb_agg(CASE WHEN b->>'id' = 'inv-story-gl' THEN b || '{"focus":null}'::jsonb ELSE b END ORDER BY o) FROM jsonb_array_elements(d.draft->'en'->'blocks') WITH ORDINALITY AS t(b, o))),
    updated_at = now()
WHERE d.path = '/modules/inventory' AND d.draft ? 'department' AND jsonb_array_length(d.draft->'ar'->'blocks') > 0 AND jsonb_array_length(d.draft->'en'->'blocks') > 0;