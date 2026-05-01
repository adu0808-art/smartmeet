const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired } = require('../auth-mw');
const { requireOrg, getOrgIdFromInvitation } = require('../permissions');

const router = express.Router();

// Public: look up an invitation by token (for register page preview)
router.get('/by-token/:token', (req, res) => {
  const inv = db.prepare(`
    SELECT i.*, o.name AS organization_name, o.description AS organization_description, o.logo_url
    FROM invitations i
    JOIN organizations o ON o.id = i.organization_id
    WHERE i.token = ?
  `).get(req.params.token);
  if (!inv) return res.status(404).json({ error: '유효하지 않은 초대입니다.' });
  // Check expiration / usage
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    return res.status(400).json({ error: '만료된 초대 링크입니다.' });
  }
  if (inv.max_uses > 0 && inv.used_count >= inv.max_uses) {
    return res.status(400).json({ error: '사용 한도를 초과한 초대 링크입니다.' });
  }
  res.json({ invitation: inv });
});

// Authenticated routes
router.use(authRequired);

router.get('/', requireOrg(req => req.query.organization_id, 'write'), (req, res) => {
  const rows = db.prepare(`
    SELECT i.*, u.name AS creator_name
    FROM invitations i
    LEFT JOIN users u ON u.id = i.created_by
    WHERE i.organization_id = ?
    ORDER BY i.created_at DESC
  `).all(req.orgId);
  res.json({ invitations: rows });
});

router.post('/', requireOrg(req => req.body.organization_id, 'write'), (req, res) => {
  const { default_role = 'member', max_uses = 0, expires_at = null } = req.body || {};
  if (!['admin', 'member'].includes(default_role)) return res.status(400).json({ error: '잘못된 기본 역할' });
  const token = uuidv4().replace(/-/g, '').slice(0, 16);
  const result = db.prepare(`
    INSERT INTO invitations (organization_id, token, default_role, max_uses, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.orgId, token, default_role, Number(max_uses) || 0, expires_at || null, req.user.id);
  const inv = db.prepare('SELECT * FROM invitations WHERE id = ?').get(result.lastInsertRowid);
  res.json({ invitation: inv });
});

router.delete('/:id', (req, res) => {
  const orgId = getOrgIdFromInvitation(req.params.id);
  if (!orgId) return res.status(404).json({ error: '초대를 찾을 수 없습니다.' });
  const role = req.user.role === 'admin' ? 'system_admin' : null;
  if (!role) {
    const { getOrgRole, isAdmin } = require('../permissions');
    if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '권한이 없습니다.' });
  }
  db.prepare('DELETE FROM invitations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
