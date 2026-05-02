// 행사(event) 타입 이벤트의 자유 신청 — 공개 (인증 불필요)
//   - GET /by-token/:token  → 이벤트 정보 (이름·일시·장소·기관) 반환
//   - POST /submit/:token   → 이름·소속·전화번호 받아 meeting_members 에 추가
//
// 보안:
//   - 같은 (이름 + 정규화 전화번호) 가 이미 등록되어 있으면 중복 거부
//   - 이벤트 종료 일시(end_date)가 지났으면 거부
//   - 행사 타입(meeting_type='event')이 아니면 거부

const express = require('express');
const db = require('../db');

const router = express.Router();

function normalizePhone(s) { return String(s || '').replace(/\D/g, ''); }

router.get('/by-token/:token', (req, res) => {
  const meeting = db.prepare(
    `SELECT id, organization_id, title, meeting_type, meeting_date, end_date, location, invitation_message, status
     FROM meetings WHERE public_register_token = ?`
  ).get(req.params.token);
  if (!meeting) return res.status(404).json({ error: '잘못된 신청 링크입니다.' });
  if (meeting.meeting_type !== 'event') {
    return res.status(400).json({ error: '이 링크는 행사 신청용이 아닙니다.' });
  }
  const org = db.prepare('SELECT id, name, logo_url FROM organizations WHERE id = ?').get(meeting.organization_id);
  // 종료 시각 체크
  let closed = false;
  if (meeting.end_date) {
    const endTs = new Date(meeting.end_date).getTime();
    if (!isNaN(endTs) && Date.now() > endTs) closed = true;
  }
  res.json({ meeting, organization: org, closed });
});

router.post('/submit/:token', (req, res) => {
  const { name, workplace, phone } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: '이름과 전화번호는 필수입니다.' });
  const trimmedName = String(name).trim();
  const phoneNorm = normalizePhone(phone);
  if (!trimmedName) return res.status(400).json({ error: '이름을 입력해주세요.' });
  if (!phoneNorm) return res.status(400).json({ error: '유효한 전화번호를 입력해주세요.' });

  const meeting = db.prepare(
    `SELECT id, organization_id, title, meeting_type, end_date FROM meetings WHERE public_register_token = ?`
  ).get(req.params.token);
  if (!meeting) return res.status(404).json({ error: '잘못된 신청 링크입니다.' });
  if (meeting.meeting_type !== 'event') {
    return res.status(400).json({ error: '이 링크는 행사 신청용이 아닙니다.' });
  }

  // 종료 시각 체크
  if (meeting.end_date) {
    const endTs = new Date(meeting.end_date).getTime();
    if (!isNaN(endTs) && Date.now() > endTs) {
      return res.status(400).json({ error: '신청 기간이 종료되었습니다.' });
    }
  }

  // 전화번호 중복 검사 (이름과 무관 — 한 사람이 여러 이름으로 우회 신청 차단)
  const existing = db.prepare(
    'SELECT id, name, phone FROM meeting_members WHERE meeting_id = ?'
  ).all(meeting.id);
  const dup = existing.find(m => normalizePhone(m.phone) === phoneNorm);
  if (dup) {
    return res.status(400).json({
      error: `이미 같은 전화번호로 신청된 내역이 있습니다 (${dup.name || ''}). 중복 신청은 불가합니다.`
    });
  }

  // 다음 seq 계산
  const lastSeq = db.prepare('SELECT MAX(seq) AS m FROM meeting_members WHERE meeting_id = ?').get(meeting.id).m || 0;
  const result = db.prepare(`
    INSERT INTO meeting_members (meeting_id, seq, position, name, phone, email, major, workplace, photo, source_member_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(meeting.id, lastSeq + 1, '', trimmedName, String(phone || ''), '', '', String(workplace || '').trim(), '', null);

  console.log(`[public-register] event #${meeting.id} - new registrant: ${trimmedName} / ${phone}`);
  res.json({ ok: true, member_id: result.lastInsertRowid });
});

module.exports = router;
