# System Restructure Clean Code Plan Journal

---
created: 2026-05-05
type: planning
plan: ../plans/260505-1244-system-restructure-clean-code/plan.md
---

## Context

The user requested a system restructuring and clean-code plan for the NetCDF/emission data-processing repository. The repo did not have the expected root `README.md`, root `CLAUDE.md`, or the documented docs files from global instructions. Actual structure is centered on `cmaq/` and `eccad/handle/`.

## What Happened

- Scanned existing plans; none found under `./plans/**/plan.md`.
- Launched explore agents for architecture mapping and code-smell detection.
- Launched librarian for external clean architecture guidance for NetCDF/data-processing projects.
- Consulted Oracle for architecture risk review.
- Created plan directory: `plans/260505-1244-system-restructure-clean-code/`.
- Wrote `plan.md`, five phase files, and `reports/research-synthesis.md`.

## Decisions

- Use strangler refactor, not big-bang rewrite.
- Keep `cmaq` and `eccad/handle` as separate bounded contexts.
- Keep Node and Python runtimes separate.
- Preserve existing entrypoints through thin wrappers.
- Add characterization tests before moving logic.
- Isolate `../../v1` dependencies behind CMAQ adapters.

## Notes

Attempted to set active plan using `$HOME/.claude/scripts/set-active-plan.cjs`, but that script does not exist in this environment. Plan files remain the persistent source of truth.

## Next

Run implementation with:

```bash
/sk:cook --parallel /home/devt/projects/inest-netcdf-data-processing/plans/260505-1244-system-restructure-clean-code/plan.md
```
