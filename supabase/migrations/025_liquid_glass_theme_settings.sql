-- Replace broad palette with brand, base, navigation, system, and liquid-glass settings.
update public.platform_settings
set setting_value = setting_value || '{"primary":"#3975eb","secondary":"#2759ce","accent":"#8b5cf6","page_background":"#f4f7fb","main_text":"#172b4d","secondary_text":"#62748a","border":"#dbe4ee","sidebar_background":"#eaf5ff","sidebar_text":"#1e3a5f","sidebar_active":"#d7eaff","success":"#16803a","warning":"#b7791f","error":"#c62828","info":"#1769e0","glass_tint":"#eaf5ff","glass_opacity":"0.72","glass_blur":"18","glass_border_opacity":"0.82"}'::jsonb,
updated_at=now()
where setting_key='theme';
