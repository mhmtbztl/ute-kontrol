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

