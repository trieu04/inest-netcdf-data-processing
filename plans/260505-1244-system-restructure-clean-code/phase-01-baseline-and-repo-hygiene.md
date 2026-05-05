# Phase 01 - Baseline and Repo Hygiene

## Context Links

- Overview: [plan.md](./plan.md)
- Research: [research-synthesis.md](./reports/research-synthesis.md)

## Overview

- Priority: P1
- Status: Pending
- Estimate: 1-2 days
- Goal: create a safety net before moving production logic.

## Requirements

### Functional

- Preserve existing CLI entrypoints.
- Add minimal root documentation.
- Add tiny fixture-based characterization tests.
- Establish commands for validation.

### Non-functional

- Tests must run without full datasets.
- Tests must not require live Mongo/Redis.
- Keep setup simple.

## Architecture

Create baseline checks around current behavior before extraction:

```text
current script + tiny fixture -> output -> normalized summary -> expected snapshot
```

Use summaries, not huge golden files:

- headers
- row count
- first/last row sample
- totals by species/pollutant
- exit code and warnings

## Related Code Files

### Create

- `/home/devt/projects/inest-netcdf-data-processing/README.md`
- `/home/devt/projects/inest-netcdf-data-processing/docs/system-architecture.md`
- `/home/devt/projects/inest-netcdf-data-processing/docs/code-standards.md`
- `/home/devt/projects/inest-netcdf-data-processing/docs/runbook.md`
- `/home/devt/projects/inest-netcdf-data-processing/tests/`
- `/home/devt/projects/inest-netcdf-data-processing/tests/fixtures/`
- `/home/devt/projects/inest-netcdf-data-processing/tests/characterization/`

### Inspect

- `/home/devt/projects/inest-netcdf-data-processing/cmaq/run.js`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/runResidential.js`
- `/home/devt/projects/inest-netcdf-data-processing/cmaq/runStraw.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf-monthly.js`

## Implementation Steps

1. Add root README with current known commands and data prerequisites.
2. Add architecture doc describing `cmaq` and `eccad/handle` bounded contexts.
3. Add code standards doc:
   - thin entrypoints
   - no side effects on import
   - config before execution
   - pure domain functions
   - adapters for IO/external services
4. Create fixture folders.
5. Build a small output-summary helper for CSV outputs.
6. Capture baseline for one CMAQ flow with mocked/adapted data if live DB unavailable.
7. Capture baseline for one ECCAD daily flow using tiny JSON/config fixtures.
8. Document full-data manual validation separately from automated tests.

## Todo List

- [ ] Document current entrypoints and prerequisites.
- [ ] Add root docs skeleton.
- [ ] Add fixture directory structure.
- [ ] Add CSV/output summary helper.
- [ ] Add first ECCAD characterization test.
- [ ] Add first CMAQ characterization test or mock boundary.
- [ ] Document validation command in README.

## Success Criteria

- `README.md` exists and explains project purpose/run commands.
- Docs describe current and target architecture.
- At least two characterization tests or scripts exist.
- Tests run without large NetCDF resources.
- Future phases have a baseline to compare against.

## Risk Assessment

- CMAQ may be hard to test because of `../../v1` dependencies. Mitigate by snapshotting extracted pure functions first or mocking adapters.
- Existing scripts may require missing local data. Mitigate with tiny synthetic fixtures.

## Security Considerations

- Do not commit secrets or local absolute paths.
- Document required environment variables without values.

## Next Steps

Proceed to Phase 2, 3, and 4 only after baseline strategy is accepted.
