-- Accounting terms in the English inventory draft: a stock movement posts a journal entry and a stock count posts an adjustment.
UPDATE public.cms_documents
SET draft = jsonb_set(
      draft,
      '{en}',
      replace(replace(replace(
        (draft->'en')::text,
        '"Movement → Entry"', '"Movement → Journal entry"'),
        '"Stocktake → Settlement"', '"Stock count → Adjustment"'),
        'and stocktaking generates a settlement', 'and a stock count posts an adjustment')::jsonb),
    version = version + 1,
    updated_at = now()
WHERE path = '/modules/inventory'
  AND published IS NULL
  AND draft ? 'department';