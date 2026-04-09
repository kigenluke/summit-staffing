const checkWorker = (req, res, next) => {
  if (!req.user || req.user.role !== 'worker') {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  return next();
};

module.exports = checkWorker;
