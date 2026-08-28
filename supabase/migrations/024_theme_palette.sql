-- Global EMS visual palette controlled by EMS Owner.
insert into public.platform_settings(setting_key,setting_value) values
('theme','{"primary":"#3975eb","secondary":"#2759ce","accent":"#8b5cf6","main_background":"#f4f7fb","surface_background":"#ffffff","elevated_background":"#eef7ff","main_text":"#172b4d","secondary_text":"#62748a","muted_text":"#7e8ba0","text_on_primary":"#ffffff","button_background":"#3975eb","button_hover":"#2759ce","border":"#dbe4ee","input_background":"#ffffff","focus_ring":"#8bb5ff","divider":"#e5e8ed","success":"#16803a","warning":"#b7791f","danger":"#c62828","info":"#1769e0","sidebar_background":"#eaf5ff","sidebar_text":"#1e3a5f","sidebar_active":"#d7eaff","header_background":"#3975eb","link_color":"#2563eb"}'::jsonb)
on conflict(setting_key) do nothing;
