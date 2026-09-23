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

- [x] Task 7: Add JSON and ChatGPT prompt builders.
  - Acceptance: Deterministic outputs contain no PII/internal IDs.
  - Verify: Sanitization, snapshot and preview-equality tests pass.
  - Dependencies: Task 6.

- [x] Task 8: Build the Analysis Center UI and clipboard flow.
  - Acceptance: Filters, summary, preview, copy and responsive states work.
  - Verify: UI tests plus real-browser validation pass.
  - Dependencies: Task 7.

- [x] Task 9: Complete security, quality and delivery review.
  - Acceptance: No high-severity finding remains and all repository gates pass.
  - Verify: `npm test`, `npm run verify:migrations`, `node stamp_assets.js --check`.
  - Dependencies: Task 8.

- [x] Task 10: Specify the market-context extension and Phase 40 boundaries.
  - Acceptance: Location, social links, custom OTA, competitor comparison and
    special-date contracts are documented.
  - Verify: Spec and plan preserve the completed initial-version history.

- [x] Task 11: Add failing Phase 40 and context-service tests.
  - Acceptance: Tenant/property validation, roles, grants, HTTPS links and
    schema-unavailable behavior are covered.
  - Verify: New focused tests fail before implementation.
  - Dependencies: Task 10.

- [x] Task 12: Implement Phase 40 and the property analysis-context service.
  - Acceptance: One tenant-safe row per property; explicit authenticated-only
    save contract; no change to property CRUD schema.
  - Verify: Migration chain and focused service/schema tests pass.
  - Dependencies: Task 11.

- [x] Task 13: Build the villa location and social-profile UI.
  - Acceptance: Country, state/province, city, district/region and six public
    profile links have accessible loading/error/success states.
  - Verify: UI contract tests and real-browser keyboard/responsive checks pass.
  - Dependencies: Task 12.

- [x] Task 14: Make custom OTA entry explicit and export safe OTA links.
  - Acceptance: `OTHER_OTA` requires a name such as ETS Tur; analysis receives
    only channel, display name and HTTPS URL.
  - Verify: Marketing service/data/UI tests cover manual OTA behavior.
  - Dependencies: Task 12.

- [x] Task 15: Extend the ChatGPT export research brief.
  - Acceptance: Markets are deduplicated; each market requests ten sourced
    competitors, strengths/weaknesses and selected-period special dates.
  - Verify: Export snapshots contain no internal property/listing IDs, raw
    references, metadata, PII or non-HTTPS URLs.
  - Dependencies: Tasks 13-14.

- [x] Task 16: Complete security, browser and delivery verification.
  - Acceptance: No required review finding remains; Phase 40 is bootstrapped
    and isolated in the dedicated test project.
  - Verify: focused tests, `npm test`, `npm run verify:migrations`,
    `node stamp_assets.js --check`, bootstrap and relevant live tests pass.
  - Dependencies: Task 15.
