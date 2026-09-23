# Implementation Plan: ChatGPT Analysis Export

## Overview

Deliver the Analysis Center in small, independently verified slices while
reusing LexBnB's canonical financial and marketing engines. The approved
market-context extension is delivered through additive Phase 40 without
coupling the existing property CRUD payload to the new schema.

## Architecture Decisions

- `analysis_export_service` is an orchestration and export boundary, not a new
  source of financial formulas.
- Internal ranges are end-exclusive and date bases are explicit.
- The initial implementation uses tenant data already loaded through the
  existing RLS-protected, paged application loader.
- JSON and prompt are derived from the same allowlisted analysis package.
- Missing data is represented by `null` plus a data-quality finding.
- Existing `property_channel_listings` remains the single OTA source of truth;
  manual platforms use `OTHER_OTA` plus a required display name.
- Property market context lives in a separate one-row-per-property table so an
  unapplied migration cannot break ordinary property saves.
- Competitor discovery and special-date research happen in ChatGPT after copy;
  LexBnB exports only the research brief and allowlisted source links.

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

## Phase 6: Market Context Contract (Migration Phase 40)

- Task 15: Extend the spec and add failing export/context/schema tests.
- Task 16: Add `property_analysis_context`, role-aware RLS and a restricted
  authenticated save RPC in `migration_phase40_property_analysis_context.sql`.
- Task 17: Add the client context service with ISO country labels, HTTPS-only
  social profiles and schema-tolerant reads.

### Checkpoint: Context Foundation

- Migration verification and focused context tests pass.
- Existing property saves remain independent of Phase 40.

## Phase 8: Research Export and UI

- Task 18: Add accessible villa location/social fields and explicit Phase 40
  loading, success and unavailable states.
- Task 19: Make custom OTA entry explicit (`ETS Tur` and similar) and expose
  safe OTA URLs to the analysis adapter.
- Task 20: Export deduplicated markets, property links, the ten-competitor
  comparison brief and selected-period special-date research brief.

### Checkpoint: Market Research Flow

- One generated prompt contains safe location, OTA and social context.
- Ten competitors are requested per unique market, not per duplicate villa.
- Strengths, weaknesses and special dates require cited current evidence.

## Phase 10: Security and Browser Verification

- Task 21: Review RLS, grants, RPC authority, URL validation, prompt injection,
  cross-tenant behavior and PII/ID allowlists.
- Task 22: Verify keyboard, responsive, modal, save, export and clipboard flows
  in a real browser with a clean console.

## Phase 12: Delivery Gates

- Task 23: Run focused, full, migration and asset-stamp gates.
- Task 24: Bootstrap Phase 40 into the dedicated test project and run the
  relevant live isolation suite; do not touch production without separate
  explicit migration approval.

## Open Questions Resolved for Initial Version

- Default comparison: prior-year same dates.
- ALOS, lead time and cancellation: booking-created cohort.
- Stay performance: stay-date basis.
- Owner blocks: unavailable until a real persisted source exists.
- Database migration: none unless implementation evidence proves it necessary.
