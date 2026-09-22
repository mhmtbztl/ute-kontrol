# Implementation Plan: ChatGPT Analysis Export

## Overview

Deliver the Analysis Center in small, independently verified slices while
reusing LexBnB's canonical financial and marketing engines. No migration is
planned for the initial version.

## Architecture Decisions

- `analysis_export_service` is an orchestration and export boundary, not a new
  source of financial formulas.
- Internal ranges are end-exclusive and date bases are explicit.
- The initial implementation uses tenant data already loaded through the
  existing RLS-protected, paged application loader.
- JSON and prompt are derived from the same allowlisted analysis package.
- Missing data is represented by `null` plus a data-quality finding.

## Dependency Graph

```text
analysis contract
  -> range finance + booking/channel aggregation
  -> property reconciliation + comparison
  -> data quality
  -> JSON/prompt export
  -> Analysis Center UI + clipboard
  -> security/browser/code review
```

## Task List

### Phase 1: Contract and Foundation

- Task 1: Persist approved spec and task plan.
- Task 2: Add failing contract tests for validation, date ranges and output shape.
- Task 3: Implement the minimal analysis package builder.

### Checkpoint: Foundation

- Focused analysis tests pass.
- Existing financial and marketing tests pass.

### Phase 2: Complete Aggregation

- Task 4: Add finance, booking and availability range aggregation.
- Task 5: Add channel/cohort and property aggregation.
- Task 6: Add equal-length comparison and reconciliation.
- Task 7: Add data-quality findings and strict null/zero behavior.

### Checkpoint: Aggregation

- Split stays, cancellation, missing data and property/portfolio reconciliation pass.
- No duplicate KPI formula exists outside canonical services.

### Phase 3: Export and UI

- Task 8: Add deterministic JSON and ChatGPT prompt builders.
- Task 9: Add Analysis Center navigation, filters and results UI.
- Task 10: Add preview, clipboard and accessible feedback states.

### Checkpoint: User Flow

- A user can select a period/properties/sections, preview and copy one package.
- Preview and copied content are identical.

### Phase 4: Hardening and Delivery

- Task 11: Run security and PII allowlist review.
- Task 12: Validate the full flow in a real browser.
- Task 13: Run code-quality review and simplify if warranted.
- Task 14: Run the repository delivery gates and prepare atomic commits.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Duplicate KPI logic | Critical | Extend/orchestrate canonical services only |
| Tenant or PII leak | Critical | RLS, explicit tenant scope, output allowlist, tests |
| Revenue classification drift | Critical | Reuse financial service and reconciliation fixtures |
| Null converted to zero | High | Explicit nullable helpers and contract tests |
| Cohort/stay-date confusion | High | Export `dateBasis` per metric group |
| Portfolio/property mismatch | High | Preserve unallocated portfolio expenses |
| Missing owner blocks | High | Quality finding; never infer blocked inventory |
| Large browser dataset | Medium | Reuse current cache initially; measure before RPC migration |

## Verification

- Focused test after every behavioral slice.
- Existing finance/marketing tests at each checkpoint.
- `npm test`, `npm run verify:migrations`, `node stamp_assets.js --check` before delivery.
- Browser DOM, console, network, clipboard and responsive checks after UI integration.

## Open Questions Resolved for Initial Version

- Default comparison: prior-year same dates.
- ALOS, lead time and cancellation: booking-created cohort.
- Stay performance: stay-date basis.
- Owner blocks: unavailable until a real persisted source exists.
- Database migration: none unless implementation evidence proves it necessary.
