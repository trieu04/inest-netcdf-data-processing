# Phase 02 - CMAQ Boundary Extraction

## Context Links

- Overview: [plan.md](./plan.md)
- Baseline phase: [Phase 01](./phase-01-baseline-and-repo-hygiene.md)

## Overview

- Priority: P1
- Status: Pending
- Estimate: 2-3 days
- Goal: split CMAQ scripts into config, adapters, domain, and pipelines while keeping old entrypoints.

## Requirements

### Functional

- Preserve existing `node cmaq/*.js` behavior.
- Isolate `../../v1` imports in adapter modules.
- Extract pure calculations from `emissionNetcdf.js` and `emission-json.js`.
- Keep cache/output behavior compatible.

### Non-functional

- No import-time DB initialization in domain/pipeline modules.
- Domain functions testable without Mongo/Redis.
- Use compatibility wrappers instead of moving entrypoints abruptly.

## Architecture

Target CMAQ shape:

```text
cmaq/
  bin/
    run.js
    run-residential.js
    run-straw.js
  src/
    config/
      cmaq-config.js
      species-mapping.js
      day-factors.js
    adapters/
      legacy-services.js
      database.js
      cache-store.js
      csv-writer.js
    domain/
      emission-source.js
      species-calculator.js
      temporal-factors.js
    pipelines/
      combine-emissions.js
      residential.js
      straw.js
      point-source.js
```

Compatibility wrappers can leave existing files in place initially:

```js
// cmaq/run.js
const { runCombineCli } = require('./src/pipelines/combine-emissions');
if (require.main === module) runCombineCli(process.argv.slice(2));
```

## Related Code Files

### Modify

- `/home/devt/projects/inest-netcdf-data-processing/cmaq/run.js`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/runResidential.js`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/runStraw.js`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/emissionNetcdf.js`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/emission-json.js`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/pointSource.js`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/constrains.js`

### Create

- `/home/devt/projects/inest-netcdf-data-processing/cmaq/src/config/`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/src/adapters/`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/src/domain/`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/src/pipelines/`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/test-fixtures/`

## Implementation Steps

1. Extract CLI argument parsing from `run.js` into a reusable helper.
2. Extract day/weekend/UTC/day-factor logic into `src/domain/temporal-factors.js`.
3. Extract species-to-pollutant conversion into `src/domain/species-calculator.js`.
4. Move `../../v1` imports into `src/adapters/legacy-services.js`.
5. Move Mongo/Redis connect/disconnect into `src/adapters/database.js`.
6. Move cache read/write into `src/adapters/cache-store.js`.
7. Create `src/pipelines/combine-emissions.js` that accepts adapters/config explicitly.
8. Convert `run.js` into a thin wrapper.
9. Repeat for residential/straw wrappers.
10. Keep old export names temporarily if other scripts depend on them.
11. Rename `constrains.js` only after compatibility layer exists; provide alias if needed.

## Todo List

- [ ] Extract CLI parser.
- [ ] Extract temporal/day-factor functions with tests.
- [ ] Extract species calculator with tests.
- [ ] Create legacy service adapter.
- [ ] Create database adapter.
- [ ] Create cache adapter.
- [ ] Create combine pipeline module.
- [ ] Update `run.js` wrapper.
- [ ] Update residential/straw wrappers.
- [ ] Add compatibility exports for old imports.
- [ ] Compare baseline output summaries.

## Success Criteria

- CMAQ domain modules can be imported without connecting to Mongo/Redis.
- Baseline output summaries match for selected fixture flows.
- `run.js`, `runResidential.js`, and `runStraw.js` remain usable.
- `../../v1` imports appear only under `cmaq/src/adapters/` or documented transitional files.

## Risk Assessment

- External services may encode business rules. Keep adapter thin and do not rewrite service calls.
- Global maps may hide execution ordering. Preserve order, then reduce state after tests pass.

## Security Considerations

- Keep DB credentials/env access inside adapter/config layer.
- Avoid logging sensitive connection details.

## Next Steps

After stable CMAQ boundary extraction, simplify duplicate output variants if baseline remains green.
