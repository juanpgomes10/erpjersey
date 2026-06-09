
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS gender text;

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_gender ON public.products(gender);

-- Auto-categorize the pre-seeded catalog based on supplier (league name)
UPDATE public.products SET category = 'brasileiros'
  WHERE category IS NULL AND supplier ILIKE '%Brasileir%';
UPDATE public.products SET category = 'selecoes'
  WHERE category IS NULL AND (supplier ILIKE '%Sele%' OR supplier ILIKE '%Copa%');
UPDATE public.products SET category = 'internacionais'
  WHERE category IS NULL AND (
    supplier ILIKE '%Premier%' OR supplier ILIKE '%La Liga%' OR supplier ILIKE '%Serie A%'
    OR supplier ILIKE '%Bundesliga%' OR supplier ILIKE '%Portuguesa%' OR supplier ILIKE '%Ligue%'
    OR supplier ILIKE '%Saudi%' OR supplier ILIKE '%Am%rica do Sul%'
  );
