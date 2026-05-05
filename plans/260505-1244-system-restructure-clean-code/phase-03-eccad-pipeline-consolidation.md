# Phase 03 - ECCAD Pipeline Consolidation

## Context Links

- Overview: [plan.md](./plan.md)
- Research: [research-synthesis.md](./reports/research-synthesis.md)

## Overview

- Priority: P1
- Status: Pending
- Estimate: 2-3 days
- Goal: reduce copy-paste across ECCAD Node converters by extracting shared config, mapping, aggregation, date, and CSV modules.

## Requirements

### Functional

- Preserve representative ECCAD CLI behavior.
- Support daily, monthly, merge, sum, BIO, FINN, QFED, ANT variants through config/strategy.
- Keep source-specific formulas explicit.

### Non-functional

- No heavy pipeline framework.
- No global mutable state in shared modules.
- Small fixtures should validate output summaries.

## Architecture

Target ECCAD JS shape:

```text
eccad/handle/
  bin/
  src/js/
    config/
      dataset-presets.js
      path-config.js
    adapters/
      csv-writer.js
      json-reader.js
      mapping-reader.js
      factor-reader.js
    domain/
      date-range.js
      grid-aggregation.js
      pollutant-species-mapping.js
      unit-conversion.js
    pipelines/
      daily-converter.js
      monthly-converter.js
      sum-converter.js
      merge-converter.js
```

Shared pipeline skeleton:

```js
async function runConverter(config, adapters) {
  const mapping = adapters.mappingReader.load(config.mappingFile);
  const factors = adapters.factorReader.loadOptional(config.factorFile);
  const grid = aggregateInputs(config, mapping, factors);
  return adapters.csvWriter.writeDateRange(config, grid);
}
```

## Related Code Files

### Modify

- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf-monthly.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf-monthly-merge.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf-monthly-bio.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf-monthly-merge-bio.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf-monthly-sum.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf-monthly-sum-bio.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf-monthly-sum-qfed.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf-qfed.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf/bio.js`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/netcdf/finn.js`

### Create

- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/src/js/config/`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/src/js/adapters/`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/src/js/domain/`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/src/js/pipelines/`
- `/home/devt/projects/inest-netcdf-data-processing/eccad/handle/test-fixtures/`

## Implementation Steps

1. Extract CLI day-range parsing shared by `netcdf*.js`.
2. Extract date/day/month utilities.
3. Extract mapping readers for CSV/XLSX/hardcoded mapping variants.
4. Extract factor reader for province percentage JSON files.
5. Extract grid key helpers and aggregation functions.
6. Extract CSV writer with stable header generation.
7. Create dataset presets for GFED4, ANT2, BIO, FINN, QFED.
8. Migrate `netcdf.js` first as a reference implementation.
9. Migrate `netcdf-monthly.js` second to prove daily/monthly strategy split.
10. Migrate remaining variants only after output summaries match.

## Todo List

- [ ] Extract CLI/date utilities.
- [ ] Extract mapping/factor readers.
- [ ] Extract grid aggregation logic.
- [ ] Extract CSV writer.
- [ ] Create dataset preset config.
- [ ] Migrate `netcdf.js` behind wrapper.
- [ ] Migrate `netcdf-monthly.js` behind wrapper.
- [ ] Migrate sum/merge/QFED/BIO/FINN variants.
- [ ] Compare output summaries for each migrated variant.

## Success Criteria

- Shared date/grid/CSV logic exists in one place.
- At least two converter variants use the shared pipeline.
- Migrated variants match baseline summaries.
- Source-specific config remains readable and explicit.

## Risk Assessment

- Similar scripts may contain subtle source-specific differences. Capture differences as presets/strategies; do not force identical behavior.
- Synchronous IO may be acceptable for simplicity. Replace only where memory/runtime evidence requires streaming.

## Security Considerations

- Validate input paths remain inside expected data/resource directories where possible.
- Avoid committing generated output or large source data.

## Next Steps

After ECCAD JS consolidation, evaluate whether any shared module deserves promotion beyond ECCAD. Default: keep local.
