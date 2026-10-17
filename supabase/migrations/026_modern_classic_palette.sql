-- Modern Classic (Rust) palette defaults. No theme packages.
update public.platform_settings
set setting_value=setting_value || '{"classic_ink":"#172536","classic_navy":"#173b59","classic_navy_deep":"#102d45","classic_slate":"#607184","classic_cream":"#f7f4ee","classic_paper":"#fffdfa","classic_line":"#e2ddd3","classic_teal":"#2f806f","classic_teal_dark":"#236456","classic_gold":"#c8954e","classic_red":"#b64f4b"}'::jsonb,
updated_at=now()
where setting_key='theme';
