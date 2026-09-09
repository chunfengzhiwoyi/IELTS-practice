-- =============================================================
-- 种子数据
-- P0 阶段仅示范如何插入公共 learning_items；用户数据不预置。
-- 需以 service role 运行（或在 Supabase Studio 的 SQL editor 中执行）。
-- 注意：canonical_key 列由 migration 0009 提供（Bad Case 035 词法规范键），
-- seed 的 canonical_key = lower(canonical_form)（seed 无连字符/变体词）。
-- =============================================================

insert into public.learning_items (item_type, canonical_form, canonical_key, content_json, topic_tags)
values
  (
    'PHRASE',
    'take something for granted',
    'take something for granted',
    jsonb_build_object(
      'coreMeaningZh', '把某事视为理所当然',
      'partOfSpeech', 'phrase',
      'examples', jsonb_build_array(
        jsonb_build_object('en', 'We often take our health for granted.')
      )
    ),
    array['daily', 'ielts-part1']
  ),
  (
    'WORD',
    'sustainable',
    'sustainable',
    jsonb_build_object(
      'coreMeaningZh', '可持续的',
      'partOfSpeech', 'adjective',
      'pronunciation', '/səˈsteɪ.nə.bəl/',
      'examples', jsonb_build_array(
        jsonb_build_object('en', 'We need a sustainable solution to this problem.')
      )
    ),
    array['environment', 'ielts-part3']
  )
on conflict (item_type, canonical_form) do nothing;
