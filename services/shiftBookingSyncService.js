const pool = require('../config/database');
const { resolveWorkLocationCoords } = require('../utils/bookingLocation');

/** Run a query; inside a transaction use SAVEPOINT so a failed attempt does not abort the whole tx. */
async function runWithOptionalSavepoint(db, fn) {
  const txRes = await db.query('SELECT txid_current_if_assigned() IS NOT NULL AS in_tx');
  const inTx = Boolean(txRes.rows[0]?.in_tx);

  if (inTx) {
    await db.query('SAVEPOINT shift_booking_sp');
    try {
      const result = await fn();
      await db.query('RELEASE SAVEPOINT shift_booking_sp');
      return { ok: true, result };
    } catch (err) {
      await db.query('ROLLBACK TO SAVEPOINT shift_booking_sp');
      return { ok: false, err };
    }
  }

  try {
    const result = await fn();
    return { ok: true, result };
  } catch (err) {
    return { ok: false, err };
  }
}

async function findExistingBookingForShift(db, shift, shiftId) {
  const matchByTimeParams = [
    shift.participant_id,
    shift.filled_by_worker_id,
    shift.start_time,
    shift.end_time,
  ];
  const matchByTimeSql = `
    SELECT b.*
    FROM bookings b
    WHERE b.participant_id = (SELECT id FROM participants WHERE user_id = $1 LIMIT 1)
      AND b.worker_id = (SELECT id FROM workers WHERE user_id = $2 LIMIT 1)
      AND b.start_time = $3
      AND b.end_time = $4
    ORDER BY b.created_at DESC
    LIMIT 1`;

  const byShift = await runWithOptionalSavepoint(db, () =>
    db.query(
      `SELECT b.* FROM bookings b WHERE b.source_shift_id = $1 ORDER BY b.created_at DESC LIMIT 1`,
      [shiftId]
    )
  );
  if (byShift.ok && byShift.result.rowCount > 0) return byShift.result.rows[0];
  if (!byShift.ok && byShift.err.code !== '42703') throw byShift.err;

  const byTime = await db.query(matchByTimeSql, matchByTimeParams);
  return byTime.rowCount > 0 ? byTime.rows[0] : null;
}

/**
 * Create (or return existing) confirmed booking for a filled shift.
 * Used on accept + repair when shift was filled but booking row is missing.
 */
async function ensureBookingForShift(shiftId, db = pool) {
  const shiftRes = await db.query('SELECT * FROM shifts WHERE id = $1 LIMIT 1', [shiftId]);
  if (shiftRes.rowCount === 0) {
    throw Object.assign(new Error('Shift not found'), { code: 'shift_not_found' });
  }
  const shift = shiftRes.rows[0];

  if (shift.status !== 'filled' || !shift.filled_by_worker_id) {
    throw Object.assign(new Error('Shift is not assigned to a worker'), { code: 'shift_not_filled' });
  }

  const existing = await findExistingBookingForShift(db, shift, shiftId);
  if (existing) {
    return { booking: existing, created: false };
  }

  const [ndis, breakMeta] = await Promise.all([
    import('../utils/ndisParticipantRates.mjs'),
    import('../utils/shiftBreakMeta.mjs'),
  ]);
  const { TRAVEL_NON_LABOUR_PER_KM } = ndis;
  const { getShiftPayEstimate } = breakMeta;

  const participantRes = await db.query(
    'SELECT id, latitude, longitude, address FROM participants WHERE user_id = $1 LIMIT 1',
    [shift.participant_id]
  );
  const workerRes = await db.query(
    'SELECT id FROM workers WHERE user_id = $1 LIMIT 1',
    [shift.filled_by_worker_id]
  );

  if (participantRes.rowCount === 0) {
    throw Object.assign(new Error('Participant profile not found for this shift'), { code: 'participant_profile_missing' });
  }
  if (workerRes.rowCount === 0) {
    throw Object.assign(new Error('Worker profile not found — worker must complete profile before booking is created'), { code: 'worker_profile_missing' });
  }

  const participant = participantRes.rows[0];
  const workerId = workerRes.rows[0].id;

  const payEst = getShiftPayEstimate(shift.start_time, shift.end_time, shift.hourly_rate, shift.description, {
    sleepoverFlatAmount: shift.sleepover_flat_amount != null ? Number(shift.sleepover_flat_amount) : 0,
    travelKm: shift.travel_distance_km != null ? Number(shift.travel_distance_km) : 0,
    travelRatePerKm: shift.travel_rate_per_km != null ? Number(shift.travel_rate_per_km) : undefined,
  });
  const totalAmount = payEst.estimatedTotal.toFixed(2);

  const bookingAddress = shift.location || participant.address || null;
  const coords = await resolveWorkLocationCoords({
    location_lat: shift.location_lat,
    location_lng: shift.location_lng,
    location_address: bookingAddress,
    participantLat: participant.latitude,
    participantLng: participant.longitude,
  });

  const baseParams = [
    participant.id,
    workerId,
    shift.service_type,
    shift.start_time,
    shift.end_time,
    bookingAddress,
    coords.lat,
    coords.lng,
    totalAmount,
    shift.hourly_rate,
  ];

  let insertRes;
  const fullInsert = await runWithOptionalSavepoint(db, () =>
    db.query(
      `INSERT INTO bookings (
         participant_id,
         worker_id,
         service_type,
         start_time,
         end_time,
         status,
         location_address,
         location_lat,
         location_lng,
         total_amount,
         hourly_rate,
         high_intensity,
         travel_distance_km,
         sleepover_flat_amount,
         travel_rate_per_km,
         source_shift_id
       )
       VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        ...baseParams,
        Boolean(shift.high_intensity),
        shift.travel_distance_km != null ? Number(shift.travel_distance_km) : null,
        shift.sleepover_flat_amount != null ? Number(shift.sleepover_flat_amount) : null,
        shift.travel_rate_per_km != null ? Number(shift.travel_rate_per_km) : TRAVEL_NON_LABOUR_PER_KM,
        shiftId,
      ]
    )
  );

  if (fullInsert.ok) {
    insertRes = fullInsert.result;
  } else if (fullInsert.err.code === '42703') {
    insertRes = await db.query(
      `INSERT INTO bookings (
         participant_id,
         worker_id,
         service_type,
         start_time,
         end_time,
         status,
         location_address,
         location_lat,
         location_lng,
         total_amount,
         hourly_rate
       )
       VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, $8, $9, $10)
       RETURNING *`,
      baseParams
    );
  } else {
    throw fullInsert.err;
  }

  return { booking: insertRes.rows[0], created: true };
}

/** Backfill bookings for filled shifts that never got a booking row (legacy / partial accept). */
async function syncMissingBookingsForUser(userId, role) {
  if (role !== 'worker' && role !== 'participant') return { repaired: 0 };

  let shiftRows = [];
  if (role === 'worker') {
    const res = await pool.query(
      `SELECT s.id
       FROM shifts s
       WHERE s.status = 'filled'
         AND s.filled_by_worker_id = $1
         AND s.end_time > NOW() - INTERVAL '7 days'
         AND NOT EXISTS (
           SELECT 1 FROM bookings b
           JOIN participants p ON p.id = b.participant_id
           JOIN workers w ON w.id = b.worker_id
           WHERE p.user_id = s.participant_id
             AND w.user_id = s.filled_by_worker_id
             AND b.start_time = s.start_time
             AND b.end_time = s.end_time
         )
       ORDER BY s.start_time ASC
       LIMIT 20`,
      [userId]
    );
    shiftRows = res.rows;
  } else {
    const res = await pool.query(
      `SELECT s.id
       FROM shifts s
       WHERE s.status = 'filled'
         AND s.participant_id = $1
         AND s.end_time > NOW() - INTERVAL '7 days'
         AND NOT EXISTS (
           SELECT 1 FROM bookings b
           JOIN participants p ON p.id = b.participant_id
           JOIN workers w ON w.id = b.worker_id
           WHERE p.user_id = s.participant_id
             AND w.user_id = s.filled_by_worker_id
             AND b.start_time = s.start_time
             AND b.end_time = s.end_time
         )
       ORDER BY s.start_time ASC
       LIMIT 20`,
      [userId]
    );
    shiftRows = res.rows;
  }

  let repaired = 0;
  for (const row of shiftRows) {
    try {
      const result = await ensureBookingForShift(row.id);
      if (result.created) repaired += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[shiftBookingSync] could not repair shift', row.id, err.message);
    }
  }
  return { repaired };
}

module.exports = {
  ensureBookingForShift,
  syncMissingBookingsForUser,
};
