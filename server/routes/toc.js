const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth-mw');
const { requireOrg, getOrgIdFromMeeting, getOrgIdFromTocItem, getOrgRole, isAdmin } = require('../permissions');

const router = express.Router();
router.use(authRequired);

router.get('/', requireOrg(req => getOrgIdFromMeeting(req.query.meeting_id), 'read'), (req, res) => {
  const rows = db.prepare('SELECT * FROM toc_items WHERE meeting_id = ? ORDER BY sort_order ASC, id ASC').all(req.query.meeting_id);
  res.json({ items: rows });
});

router.post('/', requireOrg(req => getOrgIdFromMeeting(req.body.meeting_id), 'write'), (req, res) => {
  const { meeting_id, title, description, agenda_id } = req.body || {};
  if (!title) return res.status(400).json({ error: '제목 누락' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM toc_items WHERE meeting_id = ?').get(meeting_id).m;
  const result = db.prepare('INSERT INTO toc_items (meeting_id, title, description, agenda_id, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(meeting_id, title, description || '', agenda_id || null, max + 1);
  const item = db.prepare('SELECT * FROM toc_items WHERE id = ?').get(result.lastInsertRowid);
  res.json({ item });
});

router.put('/:id', requireOrg(req => getOrgIdFromTocItem(req.params.id), 'write'), (req, res) => {
  const { title, description, agenda_id } = req.body || {};
  db.prepare('UPDATE toc_items SET title = COALESCE(?, title), description = COALESCE(?, description), agenda_id = ? WHERE id = ?')
    .run(title, description, (agenda_id === undefined ? null : agenda_id), req.params.id);
  const item = db.prepare('SELECT * FROM toc_items WHERE id = ?').get(req.params.id);
  res.json({ item });
});

router.delete('/:id', requireOrg(req => getOrgIdFromTocItem(req.params.id), 'write'), (req, res) => {
  db.prepare('DELETE FROM toc_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/reorder', authRequired, (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items 배열 필요' });
  const orgId = getOrgIdFromTocItem(items[0].id);
  if (!orgId) return res.status(404).json({ error: '대상이 없습니다.' });
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  const update = db.prepare('UPDATE toc_items SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((arr) => arr.forEach((it, idx) => update.run(idx, it.id)));
  tx(items);
  res.json({ ok: true });
});

module.exports = router;
