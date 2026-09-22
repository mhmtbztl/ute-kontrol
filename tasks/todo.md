# ChatGPT Analysis Export Tasks

- [x] Task 1: Persist the approved specification and implementation plan.
  - Acceptance: Scope, contracts, risks and delivery gates are recorded.
  - Verify: Files exist and do not overwrite another active plan.

- [x] Task 2: Define the analysis service contract with failing tests.
  - Acceptance: Validation codes, range semantics and package shape are tested.
  - Verify: `node core/analysis_export_service_tests.js` fails for missing implementation.
  - Dependencies: Task 1.

- [x] Task 3: Implement the minimal analysis package builder.
  - Acceptance: Valid input returns a versioned, deterministic allowlisted package.
  - Verify: Focused tests pass; financial and marketing tests remain green.
  - Dependencies: Task 2.

- [x] Task 4: Add range-based finance, booking and availability metrics.
  - Acceptance: Accrual, room revenue, OPEX/CAPEX and core STR KPIs match fixtures.
  - Verify: Split-stay and null/zero tests pass.
  - Dependencies: Task 3.

- [x] Task 5: Add channel, cohort and property aggregation.
  - Acceptance: Existing MarketingEngine outputs are mapped without formula duplication.
  - Verify: Channel totals and property totals reconcile.
  - Dependencies: Task 4.

- [x] Task 6: Add comparison, reconciliation and data-quality validation.
  - Acceptance: Equal-length comparisons and reason-coded unavailable values work.
  - Verify: Comparison and quality fixtures pass.
  - Dependencies: Tasks 4-5.

- [ ] Task 7: Add JSON and ChatGPT prompt builders.
  - Acceptance: Deterministic outputs contain no PII/internal IDs.
  - Verify: Sanitization, snapshot and preview-equality tests pass.
  - Dependencies: Task 6.

- [ ] Task 8: Build the Analysis Center UI and clipboard flow.
  - Acceptance: Filters, summary, preview, copy and responsive states work.
  - Verify: UI tests plus real-browser validation pass.
  - Dependencies: Task 7.

- [ ] Task 9: Complete security, quality and delivery review.
  - Acceptance: No high-severity finding remains and all repository gates pass.
  - Verify: `npm test`, `npm run verify:migrations`, `node stamp_assets.js --check`.
  - Dependencies: Task 8.
