# Research Synthesis

## Context

- User request: `tái thiết kế cấu trúc hệ thống, clean code`.
- Scope: planning only. No code implementation.
- Repo evidence: root contains `cmaq/` and `eccad/`; root `README.md`, root package manifest, root tests, and expected docs were not found during planning scan.

## Current Architecture

### CMAQ bounded context

- `cmaq/run.js`: CLI wrapper and orchestration for combined emission generation.
- `cmaq/emissionNetcdf.js`: central god module, about 537 lines, mixes DB bootstrap, cache, emission loading, domain rules, maps, CSV output, and exports.
- `cmaq/emission-json.js`: sibling module, about 547 lines, duplicates large parts of `emissionNetcdf.js`.
- `cmaq/pointSource.js`: additional point-source pipeline with same side-effect-heavy pattern.
- `cmaq/constrains.js`: constants/mapping module; likely misspelled, loads config at import time.
- Hard external dependency: `../../v1` services/models/Mongo/Redis.

### ECCAD bounded context

- `eccad/handle/netcdf*.js`: repeated daily/monthly/sum/merge converter variants.
- `eccad/handle/netcdf/bio.js`, `netcdf/finn.js`: daily source-specific converters.
- `eccad/handle/grid_processing.py`, `factor.py`, `run-*.py`: Python geospatial/regridding/support scripts.
- `eccad/handle/config/`: pollutant-to-CMAQ mapping CSVs.
- `eccad/handle/resources/`: JSON/GEOJSON/NetCDF resources.

## Main Smells

1. **Monolithic scripts**: large files mix CLI, IO, config, domain math, and output.
2. **Duplication**: `cmaq/emission*.js` and `eccad/handle/netcdf*.js` repeat pipeline logic.
3. **Global mutable state**: module-scoped `Map` objects and config values make tests hard.
4. **Side effects on import**: DB init, config reads, folder creation, logs.
5. **Hard-coded paths/constants**: years, grid sizes, output folders, source patterns, day windows.
6. **Weak validation**: no visible characterization tests, no root test script, no fixtures.
7. **Boundary leaks**: `../../v1` imports spread directly into CMAQ logic.
8. **Naming debt**: `constrains.js`, `specy`, inconsistent species/pollutant terms.

## External Guidance Applied

- Prefer pragmatic layered architecture: `CLI -> pipeline/use-case -> domain -> IO adapters/config`.
- Keep NetCDF/filesystem/engine details at boundaries.
- Use fixtures and characterization tests before refactor.
- Avoid big-bang rewrite, TypeScript/Python migration, workflow engines, or shared framework until justified.

## Recommended Target Shape

```text
cmaq/
  bin/
  src/
    config/
    adapters/
    domain/
    pipelines/
    utils/
  test-fixtures/

eccad/handle/
  bin/
  src/
    js/
      config/
      adapters/
      domain/
      pipelines/
    py/
      grid/
      factors/
      io/
  resources/
  config/
  notebooks/
  test-fixtures/
```

## Design Decision

Use **strangler refactor**:

- Keep existing entrypoints stable.
- Extract one pipeline at a time.
- Add baseline output checks before moving logic.
- Extract adapters around external dependencies rather than replacing them.
- Extract shared helpers only after duplication is proven in 2-3 concrete flows.

## Validation Principle

For each migrated script, compare old vs new behavior on small fixtures:

- output file count
- CSV headers
- row count
- sample row values
- pollutant/species totals with tolerance
- NetCDF dimensions/coordinates/variables when relevant
- logs/exit code for missing inputs
