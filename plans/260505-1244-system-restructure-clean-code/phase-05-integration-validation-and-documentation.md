# Phase 05 - Integration Validation and Documentation

## Context Links

- Overview: [plan.md](./plan.md)
- All prior phases must be complete or explicitly skipped.

## Overview

- Priority: P1
- Status: Pending
- Estimate: 1-2 days
- Goal: prove the refactor preserved behavior and make the new structure usable.

## Requirements

### Functional

- Run characterization tests.
- Run representative CLI commands on tiny fixtures.
- Document the new module boundaries and extension path.

### Non-functional

- Validation output must be easy to interpret.
- Docs must state known limitations.
- No new architecture should remain undocumented.

## Architecture

Final validation flow:

```text
fixture inputs
  -> old-compatible entrypoint
  -> new modules
  -> output summary
  -> compare expected baseline
```

Docs should answer:

- Which script should I run?
- Where do I add a new pollutant/species mapping?
- Where do I add a new ECCAD dataset variant?
- Where do I add a new CMAQ source?
- How do I validate output before PR?

## Related Code Files

### Modify

- `/home/devt/projects/inest-netcdf-data-processing/README.md`
- `/home/devt/projects/inest-netcdf-data-processing/docs/system-architecture.md`
- `/home/devt/projects/inest-netcdf-data-processing/docs/code-standards.md`
- `/home/devt/projects/inest-netcdf-data-processing/docs/runbook.md`
- `/home/devt/projects/inest-netcdf-data-processing/tests/`

### Inspect

- All wrappers touched in Phases 2-4.

## Implementation Steps

1. Run all unit and characterization tests.
2. Run representative CMAQ fixture validation.
3. Run representative ECCAD JS fixture validation.
4. Run representative Python fixture validation.
5. Compare baseline summaries.
6. Add docs for target architecture and module ownership.
7. Add docs for adding a new dataset/source variant.
8. Add docs for troubleshooting missing files, memory limits, and external service availability.
9. Remove dead transitional code only if tests prove it unused.

## Todo List

- [ ] Run unit tests.
- [ ] Run characterization tests.
- [ ] Run representative CMAQ fixture command.
- [ ] Run representative ECCAD JS fixture command.
- [ ] Run representative Python fixture command.
- [ ] Update architecture docs.
- [ ] Update runbook.
- [ ] Document extension workflows.
- [ ] Remove safe dead code.

## Success Criteria

- All configured tests pass.
- Baseline summaries match.
- README contains current run/validation commands.
- Architecture doc matches actual folder structure.
- Code standards document the new boundaries.

## Risk Assessment

- Full datasets may be unavailable. Keep full-data validation as manual checklist.
- Some transitional wrappers may remain intentionally. Document them rather than deleting too early.

## Security Considerations

- Verify docs do not include secrets or local credentials.
- Verify generated outputs/resources are covered by `.gitignore` where appropriate.

## Next Steps

If this plan succeeds, consider a follow-up plan for package/tooling standardization only if the team needs installable commands or CI.
