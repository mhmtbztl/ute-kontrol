# LexBnB Phase 17 — Marketing Metric Contract

This document is the implementation contract for the Revenue, Distribution and
Listing Intelligence work. It intentionally precedes database and UI changes.

## Scope and ownership

- The canonical room-revenue accrual remains
  `core/financial_metrics_service.js#splitBookingStayNights`.
- Marketing code may consume that contract, but must not create a competing
  definition of room revenue, ADR or stay nights.
- `app.js` and `index.html` are integration surfaces, not homes for marketing
  domain logic.
- Missing data is represented as `null` or an explicit quality warning. It is
  never imputed as a neutral marketing score.

## Monetary definitions

| Field | Definition |
| --- | --- |
| `bookingRevenueAfterDiscount` | Guest-facing booking total after discount. It may include cleaning revenue. |
| `roomRevenueBeforeDistribution` | Booking total less cleaning revenue and discount, accrued by stay night. |
| `distributionCost` | Recorded OTA/channel commission accrued by stay night. It is not total variable cost. |
| `roomRevenueAfterDistribution` | Room revenue before distribution less recorded distribution cost. |
| `roomAdr` | Room revenue before distribution divided by sold room nights. |
| `netRoomAdr` | Room revenue after distribution divided by sold room nights. |

`roomRevenueAfterDistribution` is not profit or contribution margin. Payment
processing, refunds, taxes, promotions and other variable costs are not yet
part of this metric.

All monetary aggregation is performed in the tenant base currency. Until a
dated FX model exists, a booking that explicitly declares a different currency
must fail strict aggregation instead of being silently converted.

## Date bases

- Revenue, room nights and ADR use stay-date accrual: check-in is inclusive and
  check-out is exclusive.
- Lead time and cancellation rate are booking-cohort metrics. They must use a
  real booking creation timestamp and are not mixed into stay-date metrics.
- Cohort start is inclusive and cohort end is exclusive. A record without a
  valid creation timestamp is excluded and reported as missing provenance.
- Average lead time and average length of stay use only non-cancelled bookings.
- A booking that overlaps a reporting period contributes only the nights inside
  that period.

## Channel identity

The raw source value is preserved for audit. Reporting uses these canonical
distribution channels:

- `AIRBNB`
- `BOOKING_COM`
- `VRBO`
- `EXPEDIA`
- `DIRECT`
- `OTHER_OTA`
- `UNKNOWN`

WhatsApp, Instagram, website, telephone and repeat-guest bookings are direct
subchannels, not separate distribution channels. Unknown values must remain
visible in data-quality output and must never default to `DIRECT`.

## Availability and RevPAR

Property/portfolio RevPAR may be calculated only when an explicit available
night count is supplied. Channel-level RevPAR additionally requires
channel-specific available inventory. A shared property denominator must not be
presented as channel inventory.

## Phase 17B acceptance conditions

- Cancelled bookings do not contribute stay revenue or sold nights.
- Split-month bookings are accrued only to in-period stay nights.
- Unknown channels are reported, not hidden.
- Explicit mixed currencies fail in strict mode.
- ADR is `null` when no room nights exist.
- Channel RevPAR is `null` without channel availability.
- Totals reconcile exactly to the sum of channel rows.
- Booking-cohort cancellation rate never uses stay-date filtering.

## Change-impact evaluation contract

- A single-listing before/after comparison is observational; it is not an A/B
  test and never produces a causal claim.
- The default evidence threshold is 14 complete days and 300 search
  impressions in each window for CTR. Conversion uses listing views as its
  denominator and requires at least 50 views in each window.
- Windows are start-inclusive and end-exclusive. The before window must end on
  or before the recorded change date, and the after window must start on or
  after it.
- A result is not evaluated before the after window has completed.
- Displayed-price drift over 15%, season transitions, campaigns and other known
  concurrent changes mark the comparison as `CONFOUNDED` rather than assigning
  the observed movement to the listing change.
- A small or statistically unclear movement is `NO_CLEAR_CHANGE`; this does not
  prove that the change had no effect.
- Experiment evidence points to immutable raw performance snapshots so the
  inputs remain auditable.

## Photo-intelligence contract

- Vision providers return `photo-analysis-v1`; unstructured text is not a
  trusted analysis result.
- Cache identity includes the immutable media hash, property-context hash,
  prompt version and result-schema version. A cache hit expires after 30 days
  by default, and a record without a validated result is never reused.
- Returned run, property and media identifiers must match the submitted scope.
  Cover candidates and story-order entries cannot introduce unseen media IDs.
- Scores are bounded, duplicate media/order entries are rejected, and only the
  explicit safe-edit operation allowlist is accepted.
- The model must explicitly state that it did not recommend fabrication.
  Adding amenities, rooms or views that do not exist is never an allowed edit.
- Missing visual coverage is a low-confidence observation requiring human
  review. It is not proof that an amenity is absent from the property.
- Only `RESHOOT` results become physical-work candidates, and even those require
  explicit user acceptance before an operational task can be created.

## Marketing-health contract

- The eight component weights total 100, but a missing component remains
  `UNAVAILABLE`; no neutral score is inserted in its place.
- Available components are renormalized only after at least 50% weighted data
  coverage is present.
- Coverage and confidence are separate. A numerically complete but unreliable
  input set still produces `INSUFFICIENT_DATA` and no headline score.
- Every component carries evidence and provenance. Ratio-based components must
  satisfy their own denominator and sample thresholds.
- Net economics means retained room revenue after recorded distribution cost;
  it is not profit or total contribution margin.
- Persisted health snapshots are immutable, backend-derived and idempotent for
  the same property, input fingerprint and scoring version.

## Marketing-action priority contract

- Workspace ranking uses a versioned, explainable
  `impact × confidence × urgency × revenue multiplier ÷ effort` score.
- The revenue multiplier is `1 + log10(1 + opportunity)` so zero opportunity
  remains finite and valid.
- Explicit effort is bounded from 1–5; otherwise a conservative default is
  derived from the action kind. Physical work ranks as more costly than review.
- Terminal findings and `KEEP` observations are excluded. Duplicate active
  fingerprints are collapsed defensively to the most recently observed record.
- At most three real marketing actions are returned. Empty capacity is never
  filled with weak or fabricated recommendations.
- Marketing workspace ranking does not replace the Executive Today engine;
  adapted findings still pass through Today's existing cross-domain quota.

## Seasonal-creative contract

- Seasonal logic is advisory only. It cannot update channel cover placement.
- The initial calendar is explicit for the Turkey/northern-hemisphere product
  context: winter 15 November–15 March and summer 15 May–15 September, with
  spring and autumn covering the intervening dates.
- Recommendations require a season-tagged candidate, minimum confidence and a
  meaningful cover-score improvement. Weak changes create no noisy finding.
- A seasonal recommendation becomes a digital human-review finding. If accepted,
  the cover change should start a before/after measurement window.

## Photo-analysis job contract

- Repeated requests for the same active property/context return the existing
  run ID. A different context is rejected while that run is active.
- A matching `SUCCEEDED` or `PARTIAL` run may be reused during the five-minute
  cooldown. Failed and cancelled runs are never reused as successful work.
- Run transitions are one-way: queued → processing → terminal. Terminal runs
  cannot be restarted or rewritten into another lifecycle.
- Completion requires the expected unique media set. Mixed successes and
  failures produce `PARTIAL`; total failure requires an explicit error code.
