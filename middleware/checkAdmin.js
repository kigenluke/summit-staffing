const checkAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  return next();
};

module.exports = checkAdmin;
