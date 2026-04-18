const pool = require('../config/database');

const roundToOneDecimal = (value) => {
  const num = Number(value || 0);
  return Math.round(num * 10) / 10;
};

const calculateAverageRating = async (workerId) => {
  const workerRes = await pool.query('SELECT id, user_id FROM workers WHERE id = $1 LIMIT 1', [workerId]);
  if (workerRes.rowCount === 0) {
    const err = new Error('Worker not found');
    err.statusCode = 404;
    throw err;
  }

  const workerUserId = workerRes.rows[0].user_id;

  const aggRes = await pool.query(
    `SELECT COALESCE(AVG(r.rating), 0)::numeric AS avg_rating,
            COUNT(*)::int AS total_reviews
     FROM reviews r
     WHERE r.reviewee_id = $1`,
    [workerUserId]
  );

  const avg = roundToOneDecimal(aggRes.rows[0]?.avg_rating);
  const total = Number(aggRes.rows[0]?.total_reviews || 0);

  await pool.query('UPDATE workers SET rating = $2, total_reviews = $3, updated_at = now() WHERE id = $1', [workerId, avg, total]);

  return { rating: avg, total_reviews: total };
};

module.exports = {
  calculateAverageRating
};
