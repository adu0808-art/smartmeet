const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { adminRequired } = require('../auth-mw');

const router = express.Router();
router.use(adminRequired);

router.get('/stats', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const orgCount = db.prepare('SELECT COUNT(*) AS c FROM organizations').get().c;
  const meetingCount = db.prepare('SELECT COUNT(*) AS c FROM meetings').get().c;
  const memberCount = db.prepare('SELECT COUNT(*) AS c FROM members').get().c;
  const proxyCount = db.prepare('SELECT COUNT(*) AS c FROM proxies').get().c;
  const submittedProxyCount = db.prepare(`SELECT COUNT(*) AS c FROM proxies WHERE status = 'submitted'`).get().c;
  res.json({ userCount, orgCount, meetingCount, memberCount, proxyCount, submittedProxyCount });
});

router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC').all();
  // Attach organization memberships per user
  const memStmt = db.prepare(`
    SELECT om.member_role, o.id AS org_id, o.name AS org_name,
      (CASE WHEN o.owner_id = om.user_id THEN 1 ELSE 0 END) AS is_owner
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = ?
    ORDER BY o.name ASC
  `);
  users.forEach(u => {
    u.organizations = memStmt.all(u.id);
  });
  res.json({ users });
});

router.put('/users/:id', (req, res) => {
  const { name, role, password, phone, major, workplace, bio } = req.body || {};
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(`UPDATE users SET
        name = COALESCE(?, name), role = COALESCE(?, role),
        password_hash = ?,
        phone = COALESCE(?, phone), major = COALESCE(?, major),
        workplace = COALESCE(?, workplace), bio = COALESCE(?, bio)
      WHERE id = ?`)
      .run(name, role, hash, phone, major, workplace, bio, req.params.id);
  } else {
    db.prepare(`UPDATE users SET
        name = COALESCE(?, name), role = COALESCE(?, role),
        phone = COALESCE(?, phone), major = COALESCE(?, major),
        workplace = COALESCE(?, workplace), bio = COALESCE(?, bio)
      WHERE id = ?`)
      .run(name, role, phone, major, workplace, bio, req.params.id);
  }
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: '자기 자신은 삭제할 수 없습니다.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/organizations', (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, u.name AS owner_name, u.email AS owner_email,
      (SELECT COUNT(*) FROM meetings m WHERE m.organization_id = o.id) AS meeting_count,
      (SELECT COUNT(*) FROM members me WHERE me.organization_id = o.id) AS member_count
    FROM organizations o
    LEFT JOIN users u ON u.id = o.owner_id
    ORDER BY o.created_at DESC
  `).all();
  res.json({ organizations: rows });
});

module.exports = router;
