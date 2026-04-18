const { verifyToken } = require('../utils/jwt');

const auth = (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const token = header.slice('Bearer '.length).trim();
    const decoded = verifyToken(token);

    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
};

module.exports = auth;
