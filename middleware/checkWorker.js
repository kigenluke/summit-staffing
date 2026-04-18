const checkWorker = (req, res, next) => {
  if (!req.user || req.user.role !== 'worker') {
    return res.status(403).json({
      ok: false,
      error: 'This action is only available for support worker accounts.',
    });
  }

  return next();
};

module.exports = checkWorker;
