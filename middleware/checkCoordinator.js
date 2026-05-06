const checkCoordinator = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: No user found' });
  }

  if (req.user.role !== 'coordinator') {
    return res.status(403).json({
      ok: false,
      error: `Forbidden: Your role is '${req.user.role}', but this action requires 'coordinator' role`
    });
  }

  return next();
};

module.exports = checkCoordinator;
