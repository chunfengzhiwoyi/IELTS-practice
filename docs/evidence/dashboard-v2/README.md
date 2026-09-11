# Dashboard V2 — Permanent Project Evidence

This directory preserves the **permanent project evidence** produced during the
Dashboard V2 development / acceptance phases (P4–P7.5), as determined by
`REPO-ARCH-03G-PRECHECK` (permanent asset classification).

## Purpose

- Historical acceptance evidence for the Dashboard V2 workstream.
- Read-only record: these files are **evidence preservation** — contents,
  conclusions, and wording are NOT to be rewritten, reformatted, or summarized away.

## Layering

| Tier | Directory | Contents |
|---|---|---|
| P4 | `p4/` | Metric formula audit; real-repository report (V2) |
| P5 | `p5/` | Correctness report (V2); exit-gate audit; fixture matrix (V2); mutation guards |
| P6 | `p6/` | P6.1 emit-point / privacy / runtime-source / wiring audits; content reuse; instrumentation; migration; report reentry; trace durability |
| P7 | `p7/` | API QA; final acceptance matrix; instrumentation E2E; integration QA; interaction QA; security & deployment gates; visual QA |
| P7.5 | `p7-5/` | Authorization audit; deployment gate matrix; eval packaging audit |
| System/Data | `system/` | `REAL_EVENT_MAPPING_FINAL.csv`; `v2-system-audit.md` |

## Source provenance

- Source: `D:\Codex\IELTS-practice` (legacy canonical worktree, read-only)
- Migration: **DOC-ABSORB-01** (task), 2026-09-11
- Integrity: source SHA256 == target SHA256 for all 27 files
  (see `docs/architecture/permanent-evidence-migration-manifest.json`)

## Notes

- These files are **historical acceptance evidence** tied to the Dashboard V2
  development timeline. They describe what was verified at that time; they are
  not a live status report. For current project state see
  `docs/handoffs/CURRENT-PROJECT-STATE.md`.
- Temporary working notes and superseded V1 documents were intentionally NOT migrated.
