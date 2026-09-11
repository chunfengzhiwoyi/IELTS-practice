# Deferred Supabase Migration — 0009 (p6 instrumentation)

## FILE

0009_p6_instrumentation.sql

## STATUS

DEFERRED

## BLOCKER

ENV-SUPABASE-01

## ORIGINAL_PATH

supabase/migrations/0009_p6_instrumentation.sql

## DO_NOT_APPLY_AUTOMATICALLY

YES

## ACTIVATION_RULE

只有未来 ENV-SUPABASE-01 解除，
完成远程 schema/environment verification，
才允许重新评审是否进入 active migrations。

## Preservation Notes

- This asset is preserved verbatim (byte-for-byte, SHA256-identical) from the legacy dirty
  canonical working tree, where it existed as an untracked file never committed to Git.
- It is stored under `docs/deferred/supabase/` **not** `supabase/migrations/`, so it enters
  Git history but is never picked up as an active Supabase migration.
- Any migration runner / tooling MUST ignore this directory.
- See `manifest.json` in this directory for the exact preservation record.
