const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired, optionalAuth } = require('../auth-mw');

const router = express.Router();

// 전화번호 숫자만 추출 (010-1234-5678 → 01012345678)
function normalizePhone(s) { return String(s || '').replace(/\D/g, ''); }

// Public: get proxy info by token (no auth required for member to view)
router.get('/by-token/:token', (req, res) => {
  const proxy = db.prepare('SELECT * FROM proxies WHERE token = ?').get(req.params.token);
  if (!proxy) return res.status(404).json({ error: '위임장을 찾을 수 없습니다.' });
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(proxy.meeting_id);
  const org = meeting ? db.prepare('SELECT * FROM organizations WHERE id = ?').get(meeting.organization_id) : null;
  const agendas = db.prepare(`
    SELECT id, agenda_no, title, summary, agenda_type, content, presenter, budget_data, sort_order
    FROM agendas WHERE meeting_id = ? ORDER BY sort_order ASC
  `).all(proxy.meeting_id);
  // proxy.member_id 가 있으면 (특정인 지정 토큰): 그 임원 정보를 반환 (참조용)
  //   주의: member_id 는 옛 members 테이블 ID — 이름·전화는 표시용으로만 사용
  const member = proxy.member_id ? db.prepare('SELECT id, name, position, phone FROM members WHERE id = ?').get(proxy.member_id) : null;
  res.json({ proxy, meeting, organization: org, agendas, member });
});

// Public: 본인 확인 — 입력한 이름·전화번호가 회의 의원(meeting_members)에 등록되어 있는지 검증
router.post('/verify/:token', (req, res) => {
  const { name, phone } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: '성명과 전화번호를 모두 입력하세요.' });
  const proxy = db.prepare('SELECT * FROM proxies WHERE token = ?').get(req.params.token);
  if (!proxy) return res.status(404).json({ error: '위임장을 찾을 수 없습니다.' });
  if (proxy.status === 'submitted') return res.status(400).json({ error: '이미 제출된 위임장입니다.' });

  const trimmedName = String(name).trim();
  const phoneDigits = normalizePhone(phone);
  if (!trimmedName) return res.status(400).json({ error: '성명을 입력하세요.' });
  if (!phoneDigits) return res.status(400).json({ error: '유효한 전화번호를 입력하세요.' });

  // 이 회의의 의원(meeting_members) 중에서 이름 + 전화 매칭
  const members = db.prepare(
    'SELECT id, name, phone, position FROM meeting_members WHERE meeting_id = ?'
  ).all(proxy.meeting_id);
  const match = members.find(m =>
    String(m.name || '').trim() === trimmedName &&
    normalizePhone(m.phone) === phoneDigits
  );
  if (!match) {
    return res.status(400).json({
      error: '입력하신 성명과 전화번호로 등록된 의원을 찾을 수 없습니다. 회의 의원 명단에 등록된 정보와 일치하는지 확인해주세요.'
    });
  }

  // 이미 이 의원이 위임장을 제출했는지 검사 (이름 + 전화 normalize 매칭)
  const already = db.prepare(
    `SELECT submitter_phone FROM proxies WHERE meeting_id = ? AND submitter_name = ? AND status = 'submitted'`
  ).all(proxy.meeting_id, trimmedName).some(p =>
    normalizePhone(p.submitter_phone) === phoneDigits
  );
  if (already) {
    return res.status(400).json({ error: '이미 위임장을 제출하셨습니다.' });
  }
  res.json({ ok: true, member: { id: match.id, name: match.name, position: match.position } });
});

// Public: submit proxy — 본인 확인 (meeting_members 매칭 필수)
router.post('/submit/:token', (req, res) => {
  const { submitter_name, submitter_phone, signature_data } = req.body || {};
  if (!submitter_name || !submitter_phone || !signature_data) {
    return res.status(400).json({ error: '모든 항목을 입력해주세요.' });
  }
  const proxy = db.prepare('SELECT * FROM proxies WHERE token = ?').get(req.params.token);
  if (!proxy) return res.status(404).json({ error: '위임장을 찾을 수 없습니다.' });

  const submitterPhoneNorm = normalizePhone(submitter_phone);
  const submitterName = String(submitter_name).trim();
  if (!submitterName || !submitterPhoneNorm) {
    return res.status(400).json({ error: '성명과 전화번호를 정확히 입력하세요.' });
  }

  // 본인 확인: meeting_members 에 등록된 의원과 매칭 — 일치 안 하면 거부
  const meetingMembers = db.prepare(
    'SELECT id, name, phone FROM meeting_members WHERE meeting_id = ?'
  ).all(proxy.meeting_id);
  const matched = meetingMembers.find(m =>
    String(m.name || '').trim() === submitterName &&
    normalizePhone(m.phone) === submitterPhoneNorm
  );
  if (!matched) {
    return res.status(400).json({
      error: '입력하신 성명과 전화번호로 등록된 의원을 찾을 수 없습니다. 회의 의원 명단에 등록된 정보와 일치하는지 확인해주세요.'
    });
  }
  const matchedId = matched.id;
  const now = new Date().toLocaleString('sv-SE');

  // PUBLIC 토큰 (member_id == NULL): 토큰 유지하고 매칭된 의원으로 새 proxy row 생성
  if (!proxy.member_id) {
    const exists = db.prepare(
      `SELECT submitter_phone FROM proxies WHERE meeting_id = ? AND submitter_name = ? AND status = 'submitted'`
    ).all(proxy.meeting_id, submitterName).some(r =>
      normalizePhone(r.submitter_phone) === submitterPhoneNorm
    );
    if (exists) return res.status(400).json({ error: '이미 위임장을 제출하셨습니다.' });
    const newToken = uuidv4();
    db.prepare(`INSERT INTO proxies (meeting_id, member_id, token, submitter_name, submitter_phone, signature_data, status, submitted_at) VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?)`)
      .run(proxy.meeting_id, matchedId, newToken, submitterName, submitter_phone, signature_data, now);
    return res.json({ ok: true, matched: true });
  }

  // 특정인 지정 토큰: 이미 제출됐으면 거부
  if (proxy.status === 'submitted') return res.status(400).json({ error: '이미 제출된 위임장입니다.' });
  db.prepare(`UPDATE proxies SET submitter_name=?, submitter_phone=?, signature_data=?, status='submitted', submitted_at=?, member_id=? WHERE token = ?`)
    .run(submitterName, submitter_phone, signature_data, now, matchedId, req.params.token);
  res.json({ ok: true, matched: true });
});

router.use(authRequired);

router.get('/', (req, res) => {
  const { meeting_id } = req.query;
  if (!meeting_id) return res.status(400).json({ error: 'meeting_id 필요' });
  const rows = db.prepare(`
    SELECT p.*, m.name AS member_name, m.position AS member_position, m.phone AS member_phone
    FROM proxies p
    LEFT JOIN members m ON m.id = p.member_id
    WHERE p.meeting_id = ?
    ORDER BY p.created_at DESC
  `).all(meeting_id);
  res.json({ proxies: rows });
});

router.post('/issue', (req, res) => {
  const { meeting_id, member_id } = req.body || {};
  if (!meeting_id) return res.status(400).json({ error: '필수값 누락' });
  // Reuse existing pending proxy
  if (member_id) {
    const existing = db.prepare(`SELECT * FROM proxies WHERE meeting_id = ? AND member_id = ? AND status = 'pending'`).get(meeting_id, member_id);
    if (existing) return res.json({ proxy: existing });
  } else {
    // Reuse first pending public (memberless) token
    const existing = db.prepare(`SELECT * FROM proxies WHERE meeting_id = ? AND member_id IS NULL AND status = 'pending' ORDER BY id ASC LIMIT 1`).get(meeting_id);
    if (existing) return res.json({ proxy: existing });
  }
  const token = uuidv4();
  const result = db.prepare('INSERT INTO proxies (meeting_id, member_id, token, status) VALUES (?, ?, ?, ?)')
    .run(meeting_id, member_id || null, token, 'pending');
  const proxy = db.prepare('SELECT * FROM proxies WHERE id = ?').get(result.lastInsertRowid);
  res.json({ proxy });
});

router.post('/issue-all', (req, res) => {
  const { meeting_id } = req.body || {};
  if (!meeting_id) return res.status(400).json({ error: 'meeting_id 필요' });
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meeting_id);
  if (!meeting) return res.status(404).json({ error: '회의 없음' });
  const members = db.prepare('SELECT id FROM members WHERE organization_id = ?').all(meeting.organization_id);
  const ins = db.prepare('INSERT INTO proxies (meeting_id, member_id, token, status) VALUES (?, ?, ?, ?)');
  const tx = db.transaction(() => {
    members.forEach(m => {
      const exists = db.prepare(`SELECT id FROM proxies WHERE meeting_id = ? AND member_id = ?`).get(meeting_id, m.id);
      if (!exists) ins.run(meeting_id, m.id, uuidv4(), 'pending');
    });
  });
  tx();
  res.json({ ok: true, issued: members.length });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM proxies WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
