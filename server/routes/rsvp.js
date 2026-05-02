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
router.post('/respond/:token', (req, res) => {
  const { status } = req.body || {};
  if (!['attending', 'declined'].includes(status)) {
    return res.status(400).json({ error: '응답은 "참석" 또는 "불참" 만 가능합니다.' });
  }
  const member = db.prepare(
    'SELECT id, meeting_id, name, phone FROM meeting_members WHERE invitation_token = ?'
  ).get(req.params.token);
  if (!member) return res.status(404).json({ error: '잘못된 링크입니다.' });

  const now = new Date().toLocaleString('sv-SE');
  db.prepare('UPDATE meeting_members SET rsvp_status = ?, rsvp_at = ? WHERE id = ?').run(status, now, member.id);

  // "참석" 응답 시 출석부에도 자동 체크 (attendances 에 'present' 기록)
  //   ※ 이미 위임장이 제출된 의원이면 출석 자동 처리 안 함 (관리자가 수동 정리 필요)
  let autoMarked = false;
  let proxyConflict = false;
  if (status === 'attending') {
    const memberPhoneNorm = normalizePhone(member.phone);
    const memberName = (member.name || '').trim();
    const proxies = db.prepare(
      `SELECT id, submitter_name, submitter_phone FROM proxies WHERE meeting_id = ? AND status = 'submitted'`
    ).all(member.meeting_id);
    const matchedProxy = proxies.find(p =>
      (p.submitter_name || '').trim() === memberName &&
      normalizePhone(p.submitter_phone) === memberPhoneNorm
    );
    if (matchedProxy) {
      proxyConflict = true;
    } else {
      const existing = db.prepare('SELECT id FROM attendances WHERE meeting_member_id = ?').get(member.id);
      if (existing) {
        db.prepare('UPDATE attendances SET status = ?, checked_at = ? WHERE id = ?').run('present', now, existing.id);
      } else {
        db.prepare('INSERT INTO attendances (meeting_member_id, status, checked_at) VALUES (?, ?, ?)').run(member.id, 'present', now);
      }
      autoMarked = true;
    }
  } else if (status === 'declined') {
    // 불참 응답: 이전에 출석으로 자동 체크된 경우 해제 (status='absent')
    //   (관리자가 명시적으로 출석 표시한 경우라도 본인이 불참 응답하면 우선)
    const existing = db.prepare('SELECT id FROM attendances WHERE meeting_member_id = ?').get(member.id);
    if (existing) {
      db.prepare('UPDATE attendances SET status = ?, checked_at = ? WHERE id = ?').run('absent', now, existing.id);
    }
  }

  res.json({ ok: true, status, autoMarked, proxyConflict });
});

module.exports = router;
