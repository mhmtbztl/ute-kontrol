// =============================================================================
// LEXBNB PHASE 11 — GAP NIGHT & ORPHAN GAP DETECTION ENGINE
// Identifies 1-night & 2-night gaps, detects orphan gaps (gap < minStay),
// enables minStay relaxation, and calculates affected date windows.
// =============================================================================

/**
 * Calculates the date window affected by a booking modification.
 * Used for targeted, windowed gap recomputation without full calendar scans.
 * @param {Object} booking - { check_in, check_out }
 * @param {number} bufferDays Default 3 days before check-in and after check-out
 * @returns {{ startDate: string, endDate: string }}
 */
function getAffectedRecomputeWindow(booking, bufferDays = 3) {
  const inD = new Date(booking.check_in || booking.checkIn);
  const outD = new Date(booking.check_out || booking.checkOut);

  inD.setUTCDate(inD.getUTCDate() - bufferDays);
  outD.setUTCDate(outD.getUTCDate() + bufferDays);

  return {
    startDate: inD.toISOString().split('T')[0],
    endDate: outD.toISOString().split('T')[0]
  };
}

/**
 * Detects gap nights and orphan gaps for a property over a date range.
 * @param {Object} params - { propertyId, bookings, blocks, startDate, endDate, defaultMinStay }
 * @returns {Map<string, { isGapNight: boolean, gapLength: number, isOrphanGap: boolean, relaxedMinStay: number }>}
 */
function detectGapNights(params) {
  const {
    propertyId,
    bookings = [],
    blocks = [],
    startDate,
    endDate,
    defaultMinStay = 2
  } = params;

  // 1. Build day-by-day occupancy map
  const occupancyMap = new Map(); // dateStr -> boolean (true = occupied/blocked)
  const startD = new Date(startDate);
  const endD = new Date(endDate);
  const curr = new Date(startD);

  while (curr <= endD) {
    occupancyMap.set(curr.toISOString().split('T')[0], false);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  // Mark bookings
  for (const b of bookings) {
    if (b.property_id && b.property_id !== propertyId) continue;
    if (b.status === 'CANCELLED') continue;

    const bIn = new Date(b.check_in || b.checkIn);
    const bOut = new Date(b.check_out || b.checkOut);
    const d = new Date(bIn);
    while (d < bOut) {
      const ds = d.toISOString().split('T')[0];
      if (occupancyMap.has(ds)) {
        occupancyMap.set(ds, true);
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  // Mark blocks (owner blocks, maintenance P1/P2)
  for (const blk of blocks) {
    if (blk.property_id && blk.property_id !== propertyId) continue;
    if (blk.status === 'CANCELLED') continue;

    const blkIn = new Date(blk.start_date || blk.check_in);
    const blkOut = new Date(blk.end_date || blk.check_out || blkIn);
    const d = new Date(blkIn);
    while (d <= blkOut) {
      const ds = d.toISOString().split('T')[0];
      if (occupancyMap.has(ds)) {
        occupancyMap.set(ds, true);
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  // 2. Identify contiguous free slots and tag gaps
  const sortedDates = Array.from(occupancyMap.keys()).sort();
  const gapResults = new Map();

  let i = 0;
  while (i < sortedDates.length) {
    const dStr = sortedDates[i];
    const isOccupied = occupancyMap.get(dStr);

    if (isOccupied) {
      gapResults.set(dStr, {
        isGapNight: false,
        gapLength: 0,
        isOrphanGap: false,
        relaxedMinStay: defaultMinStay
      });
      i++;
      continue;
    }

    // Measure contiguous vacant slot length
    let slotLength = 0;
    let j = i;
    while (j < sortedDates.length && !occupancyMap.get(sortedDates[j])) {
      slotLength++;
      j++;
    }

    // Check if bounded by bookings/blocks
    const prevDateIndex = i - 1;
    const nextDateIndex = j;
    const hasPrecedingOccupancy = prevDateIndex >= 0 && occupancyMap.get(sortedDates[prevDateIndex]);
    const hasSucceedingOccupancy = nextDateIndex < sortedDates.length && occupancyMap.get(sortedDates[nextDateIndex]);
    const isBoundedGap = hasPrecedingOccupancy && hasSucceedingOccupancy;

    const isGap = isBoundedGap && (slotLength === 1 || slotLength === 2);
    const isOrphan = isBoundedGap && slotLength < defaultMinStay;
    const relaxedMinStay = isOrphan ? slotLength : defaultMinStay;

    for (let k = i; k < j; k++) {
      gapResults.set(sortedDates[k], {
        isGapNight: isGap,
        gapLength: slotLength,
        isOrphanGap: isOrphan,
        relaxedMinStay
      });
    }

    i = j;
  }

  return gapResults;
}

module.exports = {
  getAffectedRecomputeWindow,
  detectGapNights
};
