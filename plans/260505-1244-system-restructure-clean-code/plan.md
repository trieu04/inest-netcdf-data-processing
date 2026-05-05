---
title: "System Restructure and Clean Code Plan"
description: "Refactor the CMAQ and ECCAD data-processing scripts into safer layered modules without changing runtime behavior."
status: pending
priority: P1
effort: 8-12d
branch: main
tags: [refactor, tech-debt, backend, data-processing]
blockedBy: []
blocks: []
created: 2026-05-05
---

# System Restructure and Clean Code Plan

## Overview

Refactor this repository from script-centric pipelines into maintainable, testable modules. Keep existing commands working. Do not rewrite the system or switch languages. Use gradual extraction with baseline validation so clean-code work does not change scientific/emission outputs silently.

## Scope

### In scope

- Organize `cmaq/` and `eccad/handle/` as separate bounded contexts.
- Add minimal project documentation and run instructions.
- Add characterization tests and tiny fixtures before moving logic.
- Extract config, IO adapters, pure domain functions, and pipeline orchestration.
- Isolate legacy `../../v1` service imports behind CMAQ adapters.
- Reduce duplication across `eccad/handle/netcdf*.js` and `cmaq/emission*.js`.

### Out of scope

- Big-bang rewrite.
- TypeScript migration.
- Full Python package migration for all code.
- Airflow/Prefect/Nextflow/Docker orchestration.
- Replacing Mongo/Redis/`../../v1` services.
- Changing numerical formulas without explicit scientific review.

## Current Evidence

- `cmaq/emissionNetcdf.js` and `cmaq/emission-json.js` are ~500+ LOC monoliths with duplicate logic.
- `eccad/handle/netcdf*.js` scripts repeat mapping, aggregation, date handling, and CSV output.
- `cmaq/run.js` hard-codes stage order and depends on mutable exports from `emissionNetcdf.js`.
- `cmaq/constrains.js` likely contains a typo and mixes constants/config loading.
- `eccad/handle/grid_processing.py` duplicates coordinate/regridder setup.
- No root `README.md`, root package manifest, or visible tests were found.

See [Research Synthesis](./reports/research-synthesis.md).

## Target Architecture

```text
CLI/bin
  -> pipeline/use-case orchestration
      -> domain calculations and transformations
      -> adapters for filesystem, CSV/XLSX/JSON/NetCDF, Mongo/Redis/legacy services
      -> config/path loaders
```

### Target folders

```text
cmaq/
  bin/                         # thin wrappers preserving current CLI behavior
  src/
    config/                    # constants, path/env parsing, validation
    adapters/                  # legacy services, Mongo/Redis, filesystem/cache
    domain/                    # pure emission calculations, mapping, calendars
    pipelines/                 # residential/straw/traffic/industry/combine flows
    utils/                     # small generic helpers only
  test-fixtures/               # tiny representative data

eccad/handle/
  bin/                         # thin wrappers for existing netcdf/run scripts
  src/
    js/
      config/
      adapters/
      domain/
      pipelines/
      utils/
    py/
      grid/
      factors/
      io/
  notebooks/                   # move exploratory notebooks here if needed
  test-fixtures/
```

## Cross-Plan Dependencies

No unfinished existing plans found under `./plans/**/plan.md` during pre-creation scan.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Baseline and Repo Hygiene](./phase-01-baseline-and-repo-hygiene.md) | Pending |
| 2 | [CMAQ Boundary Extraction](./phase-02-cmaq-boundary-extraction.md) | Pending |
| 3 | [ECCAD Pipeline Consolidation](./phase-03-eccad-pipeline-consolidation.md) | Pending |
| 4 | [Python Geospatial Module Cleanup](./phase-04-python-geospatial-module-cleanup.md) | Pending |
| 5 | [Integration Validation and Documentation](./phase-05-integration-validation-and-documentation.md) | Pending |

## File Ownership Matrix

| Phase | Primary files/directories | Rule |
|-------|---------------------------|------|
| 1 | `README.md`, `docs/`, `tests/`, fixtures, package/test config | Establish safety net only |
| 2 | `cmaq/` JS scripts and new `cmaq/src/` modules | CMAQ only |
| 3 | `eccad/handle/netcdf*.js`, `eccad/handle/netcdf/`, new `eccad/handle/src/js/` | ECCAD JS only |
| 4 | `eccad/handle/*.py`, new `eccad/handle/src/py/` | ECCAD Python only |
| 5 | docs, integration scripts, final cleanup | Cross-cutting validation only |

## Execution Strategy

1. Phase 1 must run first.
2. Phases 2, 3, and 4 can run after Phase 1. They should avoid editing each other's files.
3. Phase 5 runs last.

## Success Criteria

- Existing entrypoints still work or have documented wrappers:
  - `node cmaq/run.js <startDay> <endDay>`
  - `node cmaq/runResidential.js <startDay> <endDay>`
  - `node cmaq/runStraw.js <startDay> <endDay>`
  - representative `node eccad/handle/netcdf*.js <startDay> <endDay>` commands
  - representative Python runners in `eccad/handle/run-*.py`
- Characterization tests compare old/new outputs for small fixtures.
- No import-time DB bootstrap outside adapters.
- No duplicated date/grid/CSV writer logic across migrated ECCAD scripts.
- Hard-coded paths reduced to config modules or explicit defaults.
- Docs explain how to run, validate, and extend the pipelines.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Output changes silently | Scientific results become wrong | Baseline fixtures and checksums before refactor |
| External `../../v1` services unavailable | CMAQ tests fail locally | Adapter boundary + mocks/fixtures |
| Large NetCDF/resource files slow tests | CI unusable | Tiny fixtures only; full run manual |
| Over-abstracted pipeline framework | More complexity than current scripts | Extract only repeated logic seen in 2-3 files |
| Mixed Node/Python workflows diverge | Confusing handoff | Keep runtime-specific boundaries; share only file contracts/docs |

## Anti-Overengineering Guardrails

- Do not introduce a generic workflow engine.
- Do not create a repository-wide `core/` package until both `cmaq` and `eccad` truly share stable logic.
- Do not migrate to TypeScript or Python packaging unless a later plan proves the need.
- Do not refactor notebooks as production code until classified.
- Do not rename/move all files at once; keep compatibility wrappers.

## Cook Handoff

After review, implement with:

```bash
/sk:cook --parallel /home/devt/projects/inest-netcdf-data-processing/plans/260505-1244-system-restructure-clean-code/plan.md
```

Best practice: run `/clear` before implementation to reduce planning-context carryover.
