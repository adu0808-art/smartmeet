// 초대장 RSVP — 의원이 참석/불참 응답하는 공개 엔드포인트
//   - 토큰 기반 (인증 불필요): meeting_members.invitation_token
//   - GET /by-token/:token  → 회의·기관·의원 정보 반환 (응답 페이지 렌더용)
//   - POST /respond/:token  → 'attending' | 'declined' 기록
//       'attending' 일 때는 attendances 에 자동으로 status='present' 기록
//       (단, 이미 위임장 제출 상태면 출석 자동 처리 안 함)

const express = require('express');
const db = require('../db');

const router = express.Router();

function normalizePhone(s) { return String(s || '').replace(/\D/g, ''); }

// 토큰으로 RSVP 정보 조회 (공개 — 인증 불필요)
router.get('/by-token/:token', (req, res) => {
  const member = db.prepare(
    'SELECT id, meeting_id, name, position, email, phone, rsvp_status, rsvp_at FROM meeting_members WHERE invitation_token = ?'
  ).get(req.params.token);
  if (!member) return res.status(404).json({ error: '잘못된 링크입니다. (의원 정보를 찾을 수 없음)' });

  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(member.meeting_id);
  if (!meeting) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });
  const org = db.prepare('SELECT id, name, logo_url FROM organizations WHERE id = ?').get(meeting.organization_id);

  // 위임장 제출 여부도 함께 (제출했으면 RSVP 변경 시 안내)
  const hasProxy = db.prepare(
    `SELECT 1 FROM proxies WHERE meeting_id = ? AND status = 'submitted'
       AND submitter_name = ?`
  ).all(meeting.id, (member.name || '').trim()).some(r => true);  // simple existence check

  res.json({
    member: { id: member.id, name: member.name, position: member.position, rsvp_status: member.rsvp_status, rsvp_at: member.rsvp_at },
    meeting: { id: meeting.id, title: meeting.title, meeting_type: meeting.meeting_type, meeting_date: meeting.meeting_date, location: meeting.location, invitation_message: meeting.invitation_message },
    organization: org,
    hasProxy
  });
});

// RSVP 응답 (공개 — 인증 불필요)
//   ※ 출석부(attendances) 자동 갱신 없음 — RSVP 응답은 의향 기록만, 실제 출석은 관리자가 별도로 체크
router.post('/respond/:token', (req, res) => {
  const { status } = req.body || {};
  if (!['attending', 'declined'].includes(status)) {
    return res.status(400).json({ error: '응답은 "참석" 또는 "불참" 만 가능합니다.' });
  }
  const member = db.prepare(
    'SELECT id, meeting_id, name FROM meeting_members WHERE invitation_token = ?'
  ).get(req.params.token);
  if (!member) return res.status(404).json({ error: '잘못된 링크입니다.' });

  const now = new Date().toLocaleString('sv-SE');
  db.prepare('UPDATE meeting_members SET rsvp_status = ?, rsvp_at = ? WHERE id = ?').run(status, now, member.id);
  res.json({ ok: true, status });
});

module.exports = router;
