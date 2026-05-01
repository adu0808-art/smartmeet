const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth-mw');
const { requireOrg, getOrgIdFromMeeting } = require('../permissions');

const router = express.Router();
router.use(authRequired);

router.get('/', requireOrg(req => req.query.organization_id, 'read'), (req, res) => {
  const rows = db.prepare('SELECT * FROM meetings WHERE organization_id = ? ORDER BY meeting_date DESC').all(req.orgId);
  res.json({ meetings: rows });
});

router.post('/', requireOrg(req => req.body.organization_id, 'write'), (req, res) => {
  const { title, meeting_type, meeting_date, location, total_members, quorum_ratio, pass_ratio } = req.body || {};
  if (!title) return res.status(400).json({ error: '제목 누락' });
  const memberCount = db.prepare('SELECT COUNT(*) AS c FROM members WHERE organization_id = ?').get(req.orgId).c;
  const total = total_members || memberCount;
  const result = db.prepare(`
    INSERT INTO meetings (organization_id, title, meeting_type, meeting_date, location, total_members, quorum_ratio, pass_ratio, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preparing')
  `).run(req.orgId, title, meeting_type || 'board', meeting_date || '', location || '', total, quorum_ratio || 0.5, pass_ratio || 0.5);
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(result.lastInsertRowid);
  res.json({ meeting });
});

router.get('/:id', requireOrg(req => getOrgIdFromMeeting(req.params.id), 'read'), (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  if (!meeting) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });
  // total_members = 이 회의에 등록된 의원 수 (meeting_members 기준)
  meeting.total_members = db.prepare(
    'SELECT COUNT(*) AS c FROM meeting_members WHERE meeting_id = ?'
  ).get(req.params.id).c;
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(meeting.organization_id);
  res.json({ meeting, organization: org, my_role: req.orgRole });
});

router.put('/:id', requireOrg(req => getOrgIdFromMeeting(req.params.id), 'write'), (req, res) => {
  const { title, meeting_type, meeting_date, location, total_members, quorum_ratio, pass_ratio, status, invitation_message } = req.body || {};
  db.prepare(`
    UPDATE meetings SET
      title = COALESCE(?, title),
      meeting_type = COALESCE(?, meeting_type),
      meeting_date = COALESCE(?, meeting_date),
      location = COALESCE(?, location),
      total_members = COALESCE(?, total_members),
      quorum_ratio = COALESCE(?, quorum_ratio),
      pass_ratio = COALESCE(?, pass_ratio),
      status = COALESCE(?, status),
      invitation_message = COALESCE(?, invitation_message)
    WHERE id = ?
  `).run(title, meeting_type, meeting_date, location, total_members, quorum_ratio, pass_ratio, status, invitation_message, req.params.id);
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  res.json({ meeting });
});

router.delete('/:id', requireOrg(req => getOrgIdFromMeeting(req.params.id), 'write'), (req, res) => {
  try {
    const exists = db.prepare('SELECT id FROM meetings WHERE id = ?').get(req.params.id);
    if (!exists) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });
    // 트랜잭션으로 안전하게 삭제 (FK CASCADE 가 안건·출결·proxies·toc_items 모두 정리)
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM meetings WHERE id = ?').run(req.params.id);
    });
    tx();
    res.json({ ok: true });
  } catch (e) {
    console.error('[meetings DELETE] failed:', e);
    res.status(500).json({ error: '삭제 실패: ' + (e.message || '알 수 없는 오류') });
  }
});

router.get('/:id/quorum', requireOrg(req => getOrgIdFromMeeting(req.params.id), 'read'), (req, res) => {
  const meetingId = req.params.id;
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId);
  if (!meeting) return res.status(404).json({ error: '회의 없음' });

  // 현장 출석 의원 (name + phone 정규화)
  const presentMembers = db.prepare(`
    SELECT mm.name, mm.phone FROM attendances a
    INNER JOIN meeting_members mm ON mm.id = a.meeting_member_id
    WHERE mm.meeting_id = ? AND a.status = 'present'
  `).all(meetingId);
  const present = presentMembers.length;
  const normalizePhone = (s) => String(s || '').replace(/\D/g, '');
  const presentKeys = new Set(presentMembers.map(m => `${(m.name || '').trim()}|${normalizePhone(m.phone)}`));

  // 위임장 제출 — 단, 같은 인물이 출석 체크된 경우는 제외 (이중 카운트 방지)
  const submittedProxies = db.prepare(
    `SELECT submitter_name, submitter_phone FROM proxies WHERE meeting_id = ? AND status = 'submitted'`
  ).all(meetingId);
  const proxyCount = submittedProxies.filter(p => {
    const k = `${(p.submitter_name || '').trim()}|${normalizePhone(p.submitter_phone)}`;
    return !presentKeys.has(k);
  }).length;

  // total = 이 회의에 등록된 의원 수
  const total = db.prepare('SELECT COUNT(*) AS c FROM meeting_members WHERE meeting_id = ?').get(meetingId).c;
  const target = Math.ceil(total * (meeting.quorum_ratio || 0.5));
  const attended = present + proxyCount;
  const majority = Math.floor(attended / 2) + 1;
  res.json({ total, present, proxy: proxyCount, attended, target, quorumMet: attended >= target, majority });
});

module.exports = router;
