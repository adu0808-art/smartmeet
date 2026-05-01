const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'smartmeet-secret-change-me';

function sign(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: '세션이 만료되었습니다.' });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    next();
  });
}

function optionalAuth(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (token) {
    try { req.user = jwt.verify(token, SECRET); } catch (e) {}
  }
  next();
}

module.exports = { sign, authRequired, adminRequired, optionalAuth, SECRET };
