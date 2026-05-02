const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth-mw');
const { requireOrg, getOrgIdFromCharterVersion, getOrgIdFromOrgChartVersion, getOrgIdFromSchedule, getOrgRole, isAdmin } = require('../permissions');

const router = express.Router();
router.use(authRequired);

// ===== 정관 =====
router.get('/charter/:orgId', requireOrg(req => req.params.orgId, 'read'), (req, res) => {
  const charter = db.prepare('SELECT * FROM charters WHERE organization_id = ?').get(req.params.orgId);
  const versions = db.prepare('SELECT * FROM charter_versions WHERE organization_id = ? ORDER BY created_at DESC').all(req.params.orgId);
  res.json({ charter: charter || { content: '' }, versions });
});

router.post('/charter/:orgId', requireOrg(req => req.params.orgId, 'write'), (req, res) => {
  const { content } = req.body || {};
  const existing = db.prepare('SELECT id FROM charters WHERE organization_id = ?').get(req.params.orgId);
  const now = new Date().toLocaleString('sv-SE');
  if (existing) {
    db.prepare('UPDATE charters SET content = ?, updated_at = ? WHERE id = ?').run(content || '', now, existing.id);
  } else {
    db.prepare('INSERT INTO charters (organization_id, content, updated_at) VALUES (?, ?, ?)').run(req.params.orgId, content || '', now);
  }
  res.json({ ok: true });
});

router.post('/charter/:orgId/version', requireOrg(req => req.params.orgId, 'write'), (req, res) => {
  const { version_name, content } = req.body || {};
  if (!version_name) return res.status(400).json({ error: '버전명 필요' });
  db.prepare('INSERT INTO charter_versions (organization_id, version_name, content) VALUES (?, ?, ?)').run(req.params.orgId, version_name, content || '');
  res.json({ ok: true });
});

router.post('/charter/:orgId/restore/:versionId', requireOrg(req => req.params.orgId, 'write'), (req, res) => {
  const v = db.prepare('SELECT * FROM charter_versions WHERE id = ?').get(req.params.versionId);
  if (!v) return res.status(404).json({ error: '버전 없음' });
  const existing = db.prepare('SELECT id FROM charters WHERE organization_id = ?').get(req.params.orgId);
  const now = new Date().toLocaleString('sv-SE');
  if (existing) {
    db.prepare('UPDATE charters SET content = ?, updated_at = ? WHERE id = ?').run(v.content, now, existing.id);
  } else {
    db.prepare('INSERT INTO charters (organization_id, content, updated_at) VALUES (?, ?, ?)').run(req.params.orgId, v.content, now);
  }
  res.json({ ok: true });
});

router.delete('/charter/version/:id', authRequired, (req, res) => {
  const orgId = getOrgIdFromCharterVersion(req.params.id);
  if (!orgId) return res.status(404).json({ error: '버전 없음' });
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  db.prepare('DELETE FROM charter_versions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== 조직도 =====
router.get('/orgchart/:orgId', requireOrg(req => req.params.orgId, 'read'), (req, res) => {
  const row = db.prepare('SELECT * FROM org_charts WHERE organization_id = ?').get(req.params.orgId);
  const versions = db.prepare('SELECT id, version_name, created_at FROM org_chart_versions WHERE organization_id = ? ORDER BY created_at DESC').all(req.params.orgId);
  res.json({ orgchart: row || { data: '' }, versions });
});

router.post('/orgchart/:orgId', requireOrg(req => req.params.orgId, 'write'), (req, res) => {
  const { data } = req.body || {};
  const existing = db.prepare('SELECT id FROM org_charts WHERE organization_id = ?').get(req.params.orgId);
  const now = new Date().toLocaleString('sv-SE');
  if (existing) {
    db.prepare('UPDATE org_charts SET data = ?, updated_at = ? WHERE id = ?').run(data || '', now, existing.id);
  } else {
    db.prepare('INSERT INTO org_charts (organization_id, data, updated_at) VALUES (?, ?, ?)').run(req.params.orgId, data || '', now);
  }
  res.json({ ok: true });
});

router.post('/orgchart/:orgId/version', requireOrg(req => req.params.orgId, 'write'), (req, res) => {
  const { version_name, data } = req.body || {};
  if (!version_name) return res.status(400).json({ error: '버전명 필요' });
  db.prepare('INSERT INTO org_chart_versions (organization_id, version_name, data) VALUES (?, ?, ?)').run(req.params.orgId, version_name, data || '');
  res.json({ ok: true });
});

router.post('/orgchart/:orgId/restore/:versionId', requireOrg(req => req.params.orgId, 'write'), (req, res) => {
  const v = db.prepare('SELECT * FROM org_chart_versions WHERE id = ?').get(req.params.versionId);
  if (!v) return res.status(404).json({ error: '버전 없음' });
  const existing = db.prepare('SELECT id FROM org_charts WHERE organization_id = ?').get(req.params.orgId);
  const now = new Date().toLocaleString('sv-SE');
  if (existing) {
    db.prepare('UPDATE org_charts SET data = ?, updated_at = ? WHERE id = ?').run(v.data, now, existing.id);
  } else {
    db.prepare('INSERT INTO org_charts (organization_id, data, updated_at) VALUES (?, ?, ?)').run(req.params.orgId, v.data, now);
  }
  res.json({ ok: true, data: v.data });
});

router.delete('/orgchart/version/:id', authRequired, (req, res) => {
  const orgId = getOrgIdFromOrgChartVersion(req.params.id);
  if (!orgId) return res.status(404).json({ error: '버전 없음' });
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  db.prepare('DELETE FROM org_chart_versions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 단일 버전 조회 — 히스토리 보기용 (data 까지 함께 반환)
router.get('/orgchart/version/:id', authRequired, (req, res) => {
  const orgId = getOrgIdFromOrgChartVersion(req.params.id);
  if (!orgId) return res.status(404).json({ error: '버전 없음' });
  if (!getOrgRole(req.user, orgId)) return res.status(403).json({ error: '접근 권한이 없습니다.' });
  const v = db.prepare('SELECT id, organization_id, version_name, data, created_at FROM org_chart_versions WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: '버전 없음' });
  res.json({ version: v });
});

// ===== 일정 =====
router.get('/schedules/:orgId', requireOrg(req => req.params.orgId, 'read'), (req, res) => {
  const rows = db.prepare('SELECT * FROM schedules WHERE organization_id = ? ORDER BY schedule_date ASC').all(req.params.orgId);
  res.json({ schedules: rows });
});

router.post('/schedules/:orgId', requireOrg(req => req.params.orgId, 'write'), (req, res) => {
  const { title, schedule_date, description } = req.body || {};
  if (!title || !schedule_date) return res.status(400).json({ error: '필수값 누락' });
  const result = db.prepare('INSERT INTO schedules (organization_id, title, schedule_date, description) VALUES (?, ?, ?, ?)')
    .run(req.params.orgId, title, schedule_date, description || '');
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid);
  res.json({ schedule });
});

router.put('/schedules/:id', authRequired, (req, res) => {
  const sched = db.prepare('SELECT id, organization_id, meeting_id FROM schedules WHERE id = ?').get(req.params.id);
  if (!sched) return res.status(404).json({ error: '일정 없음' });
  if (!isAdmin(getOrgRole(req.user, sched.organization_id))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  // ★ 회의에서 자동 생성된 일정은 직접 수정 차단 (회의 자체를 수정해야 함)
  if (sched.meeting_id) {
    return res.status(400).json({
      error: '이 일정은 회의에서 자동 생성된 항목입니다.\n수정하려면 회의 관리에서 해당 회의를 수정하세요.',
      meetingId: sched.meeting_id
    });
  }
  const { title, schedule_date, description } = req.body || {};
  db.prepare('UPDATE schedules SET title = ?, schedule_date = ?, description = ? WHERE id = ?').run(title, schedule_date, description || '', req.params.id);
  res.json({ ok: true });
});

router.delete('/schedules/:id', authRequired, (req, res) => {
  const sched = db.prepare('SELECT id, organization_id, meeting_id FROM schedules WHERE id = ?').get(req.params.id);
  if (!sched) return res.status(404).json({ error: '일정 없음' });
  if (!isAdmin(getOrgRole(req.user, sched.organization_id))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  // ★ 회의 연결 일정은 직접 삭제 불가 — 회의 자체 삭제 시에만 자동 제거됨 (CASCADE)
  if (sched.meeting_id) {
    return res.status(400).json({
      error: '이 일정은 회의에서 자동 생성된 항목입니다.\n삭제하려면 회의 관리에서 해당 회의를 삭제하세요.\n(회의 삭제 시 연결된 일정도 함께 삭제됩니다.)',
      meetingId: sched.meeting_id
    });
  }
  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== 임원 명단 =====
router.get('/executives/:orgId', requireOrg(req => req.params.orgId, 'read'), (req, res) => {
  const generations = db.prepare(`SELECT DISTINCT generation FROM members WHERE organization_id = ? AND generation != '' ORDER BY generation DESC`).all(req.params.orgId);
  res.json({ generations: generations.map(g => g.generation) });
});

module.exports = router;
