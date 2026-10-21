-- EMS identity refresh: update only legacy seed labels, preserving owner customization.
UPDATE public.platform_settings
SET setting_value = jsonb_set(setting_value, '{powered_by}', '"Dexter Studio"'::jsonb, true),
    updated_at = now()
WHERE setting_key = 'branding'
  AND setting_value ->> 'powered_by' = 'DoxTox';

UPDATE public.platform_settings
SET setting_value = jsonb_set(setting_value, '{product_name}', '"EMS"'::jsonb, true),
    updated_at = now()
WHERE setting_key = 'branding'
  AND setting_value ->> 'product_name' = 'EMS V1';

UPDATE public.platform_settings
SET setting_value = jsonb_set(setting_value, '{website_name}', '"EMS"'::jsonb, true),
    updated_at = now()
WHERE setting_key = 'branding'
  AND setting_value ->> 'website_name' = 'EMS V1';

UPDATE public.public_pages
SET title = 'About EMS', updated_at = now()
WHERE slug = 'about' AND title = 'About EMS V1';
