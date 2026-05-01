const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth-mw');
const { requireOrg, getOrgIdFromNotice, getOrgRole, isAdmin } = require('../permissions');

const router = express.Router();
router.use(authRequired);

router.get('/', requireOrg(req => req.query.organization_id, 'read'), (req, res) => {
  const rows = db.prepare(`
    SELECT n.*, u.name AS author_name
    FROM notices n
    LEFT JOIN users u ON u.id = n.author_id
    WHERE n.organization_id = ?
    ORDER BY n.is_pinned DESC, n.created_at DESC
  `).all(req.orgId);
  res.json({ notices: rows });
});

router.post('/', requireOrg(req => req.body.organization_id, 'write'), (req, res) => {
  const { title, content, is_pinned } = req.body || {};
  if (!title) return res.status(400).json({ error: '제목 누락' });
  const result = db.prepare('INSERT INTO notices (organization_id, title, content, is_pinned, author_id) VALUES (?, ?, ?, ?, ?)')
    .run(req.orgId, title, content || '', is_pinned ? 1 : 0, req.user.id);
  const notice = db.prepare('SELECT * FROM notices WHERE id = ?').get(result.lastInsertRowid);
  res.json({ notice });
});

router.get('/:id', authRequired, (req, res) => {
  const notice = db.prepare(`
    SELECT n.*, u.name AS author_name
    FROM notices n LEFT JOIN users u ON u.id = n.author_id
    WHERE n.id = ?
  `).get(req.params.id);
  if (!notice) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
  if (!getOrgRole(req.user, notice.organization_id)) return res.status(403).json({ error: '접근 권한이 없습니다.' });
  db.prepare('UPDATE notices SET view_count = view_count + 1 WHERE id = ?').run(req.params.id);
  res.json({ notice });
});

router.put('/:id', authRequired, (req, res) => {
  const orgId = getOrgIdFromNotice(req.params.id);
  if (!orgId) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  const { title, content, is_pinned } = req.body || {};
  const now = new Date().toLocaleString('sv-SE');
  db.prepare('UPDATE notices SET title = COALESCE(?, title), content = COALESCE(?, content), is_pinned = COALESCE(?, is_pinned), updated_at = ? WHERE id = ?')
    .run(title, content, is_pinned !== undefined ? (is_pinned ? 1 : 0) : null, now, req.params.id);
  const notice = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);
  res.json({ notice });
});

router.delete('/:id', authRequired, (req, res) => {
  const orgId = getOrgIdFromNotice(req.params.id);
  if (!orgId) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  db.prepare('DELETE FROM notices WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
