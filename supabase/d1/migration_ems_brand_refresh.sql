-- EMS identity refresh: update only legacy seed labels, preserving operator customization.
UPDATE platform_settings
SET setting_value = json_set(setting_value, '$.powered_by', 'Dexter Studio'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE setting_key = 'branding'
  AND json_valid(setting_value)
  AND json_extract(setting_value, '$.powered_by') = 'DoxTox';

UPDATE platform_settings
SET setting_value = json_set(setting_value, '$.product_name', 'EMS'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE setting_key = 'branding'
  AND json_valid(setting_value)
  AND json_extract(setting_value, '$.product_name') = 'EMS V1';

UPDATE platform_settings
SET setting_value = json_set(setting_value, '$.website_name', 'EMS'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE setting_key = 'branding'
  AND json_valid(setting_value)
  AND json_extract(setting_value, '$.website_name') = 'EMS V1';

UPDATE public_pages
SET title = 'About EMS', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE slug = 'about' AND title = 'About EMS V1';
