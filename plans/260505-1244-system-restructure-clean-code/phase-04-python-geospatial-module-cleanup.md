# Phase 04 - Python Geospatial Module Cleanup

## Context Links

- Overview: [plan.md](./plan.md)
- Research: [research-synthesis.md](./reports/research-synthesis.md)

## Overview

- Priority: P2
- Status: Pending
- Estimate: 1-2 days
- Goal: clean ECCAD Python geospatial scripts without forcing a full Python package migration.

## Requirements

### Functional

- Preserve behavior of `grid_processing.py`, `factor.py`, and `run-*.py` runners.
- Remove duplicated coordinate/regridder setup.
- Separate pure grid/factor logic from IO and runner code.

### Non-functional

- Keep Python dependencies unchanged unless a missing requirements file must document them.
- Tests use tiny in-memory xarray/shapely fixtures where possible.
- Do not refactor notebooks into production code in this phase.

## Architecture

Target Python shape:

```text
eccad/handle/src/py/
  grid/
    coordinates.py
    regridder.py
  factors/
    intersection.py
    export.py
  io/
    datasets.py
    geojson.py
  runners/
    ant2.py
    bio2.py
    qfed.py
```

Compatibility wrappers stay in current locations:

```python
# eccad/handle/run-ant2.py
from src.py.runners.ant2 import main

if __name__ == "__main__":
    main()
```

## Related Code Files

### Modify

- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/grid_processing.py`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/factor.py`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/mem.py`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/run-ant2.py`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/run-bio2.py`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/run-qfed.py`

### Create

- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/src/py/grid/`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/src/py/factors/`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/src/py/io/`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/src/py/runners/`

## Implementation Steps

1. Extract coordinate grid creation into one function.
2. Extract regridder creation and reuse-weight behavior.
3. Extract dataset sorting/contiguous-array normalization.
4. Extract intersection percentage calculation from export logic.
5. Extract JSON export from `factor.py`.
6. Convert `run-*.py` scripts into wrappers around runner modules.
7. Keep `mem.py` as utility but document Linux-only `/proc/meminfo` dependency.
8. Add tiny tests for coordinate generation and intersection math.

## Todo List

- [ ] Extract coordinate creation helper.
- [ ] Extract regridder helper.
- [ ] Extract dataset sorting helper.
- [ ] Extract factor intersection function.
- [ ] Extract factor JSON export function.
- [ ] Wrap `run-ant2.py` with runner module.
- [ ] Wrap `run-bio2.py` and `run-qfed.py`.
- [ ] Add Python fixture tests.

## Success Criteria

- `grid_processing.py` no longer duplicates coordinate setup.
- Factor calculation can be tested without writing files.
- Runner scripts still execute through compatibility wrappers.
- Python logic has at least basic unit tests.

## Risk Assessment

- xESMF/regridding can be environment-sensitive. Keep integration tests optional if native dependencies are unavailable.
- Geospatial area calculations depend on coordinate assumptions. Document assumptions explicitly.

## Security Considerations

- Do not load arbitrary paths from unvalidated CLI input.
- Avoid logging sensitive local filesystem paths unless needed for debugging.

## Next Steps

After this phase, decide whether Python code needs a `pyproject.toml` in a separate plan.
