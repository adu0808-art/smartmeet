const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth-mw');
const { requireOrg, getOrgIdFromMeeting, getOrgIdFromAgenda } = require('../permissions');

const router = express.Router();
router.use(authRequired);

router.get('/', requireOrg(req => getOrgIdFromMeeting(req.query.meeting_id), 'read'), (req, res) => {
  const rows = db.prepare('SELECT * FROM agendas WHERE meeting_id = ? ORDER BY sort_order ASC, agenda_no ASC').all(req.query.meeting_id);
  res.json({ agendas: rows });
});

router.post('/', requireOrg(req => getOrgIdFromMeeting(req.body.meeting_id), 'write'), (req, res) => {
  const { meeting_id, agenda_type, title, presenter, summary, content, agenda_no, budget_data } = req.body || {};
  if (!title) return res.status(400).json({ error: '제목 누락' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM agendas WHERE meeting_id = ?').get(meeting_id).m;
  const no = agenda_no || (db.prepare('SELECT COUNT(*) AS c FROM agendas WHERE meeting_id = ?').get(meeting_id).c + 1);
  const result = db.prepare(`
    INSERT INTO agendas (meeting_id, agenda_no, agenda_type, title, presenter, summary, content, budget_data, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(meeting_id, no, agenda_type || 'general', title, presenter || '', summary || '', content || '', budget_data || '', max + 1);
  const agenda = db.prepare('SELECT * FROM agendas WHERE id = ?').get(result.lastInsertRowid);
  res.json({ agenda });
});

router.get('/:id', requireOrg(req => getOrgIdFromAgenda(req.params.id), 'read'), (req, res) => {
  const agenda = db.prepare('SELECT * FROM agendas WHERE id = ?').get(req.params.id);
  if (!agenda) return res.status(404).json({ error: '의안 없음' });
  res.json({ agenda });
});

router.put('/:id', requireOrg(req => getOrgIdFromAgenda(req.params.id), 'write'), (req, res) => {
  const { agenda_type, title, presenter, summary, content, agenda_no, budget_data } = req.body || {};
  db.prepare(`
    UPDATE agendas SET
      agenda_type = COALESCE(?, agenda_type),
      title = COALESCE(?, title),
      presenter = COALESCE(?, presenter),
      summary = COALESCE(?, summary),
      content = COALESCE(?, content),
      agenda_no = COALESCE(?, agenda_no),
      budget_data = COALESCE(?, budget_data)
    WHERE id = ?
  `).run(agenda_type, title, presenter, summary, content, agenda_no, budget_data, req.params.id);
  const agenda = db.prepare('SELECT * FROM agendas WHERE id = ?').get(req.params.id);
  res.json({ agenda });
});

router.post('/:id/vote', requireOrg(req => getOrgIdFromAgenda(req.params.id), 'write'), (req, res) => {
  const { approve_count, oppose_count, abstain_count, vote_result, vote_summary, budget_data } = req.body || {};
  db.prepare(`UPDATE agendas SET
      approve_count = ?, oppose_count = ?, abstain_count = ?,
      vote_result = ?, vote_summary = COALESCE(?, vote_summary),
      budget_data = COALESCE(?, budget_data)
    WHERE id = ?`)
    .run(approve_count || 0, oppose_count || 0, abstain_count || 0, vote_result || '', vote_summary, budget_data, req.params.id);
  const agenda = db.prepare('SELECT * FROM agendas WHERE id = ?').get(req.params.id);
  res.json({ agenda });
});

router.post('/reorder', authRequired, (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items 배열 필요' });
  const orgId = getOrgIdFromAgenda(items[0].id);
  if (!orgId) return res.status(404).json({ error: '의안을 찾을 수 없습니다.' });
  const { getOrgRole, isAdmin } = require('../permissions');
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  const update = db.prepare('UPDATE agendas SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((arr) => arr.forEach((it, idx) => update.run(idx, it.id)));
  tx(items);
  res.json({ ok: true });
});

router.delete('/:id', requireOrg(req => getOrgIdFromAgenda(req.params.id), 'write'), (req, res) => {
  db.prepare('DELETE FROM agendas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
