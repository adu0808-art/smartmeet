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

// === 위임장 이메일 발송 (선택 / 일괄) ===
//   body: { meeting_id, meeting_member_ids?: [id,...] }
//     meeting_member_ids 미지정 시 → 회의 의원 전체에 발송
router.post('/send-emails', async (req, res) => {
  const { meeting_id, meeting_member_ids } = req.body || {};
  if (!meeting_id) return res.status(400).json({ error: 'meeting_id 필요' });

  const emailModule = require('../email');
  if (!emailModule.isEnabled()) {
    return res.status(400).json({ error: '이메일 발송이 설정되지 않았습니다 (SMTP 환경변수 미설정).\n시스템 관리자에게 문의해주세요.' });
  }

  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meeting_id);
  if (!meeting) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(meeting.organization_id);

  // 대상 의원 조회
  let members;
  if (Array.isArray(meeting_member_ids) && meeting_member_ids.length) {
    const placeholders = meeting_member_ids.map(() => '?').join(',');
    members = db.prepare(
      `SELECT id, name, email, phone FROM meeting_members WHERE meeting_id = ? AND id IN (${placeholders})`
    ).all(meeting_id, ...meeting_member_ids);
  } else {
    members = db.prepare(
      'SELECT id, name, email, phone FROM meeting_members WHERE meeting_id = ?'
    ).all(meeting_id);
  }

  if (!members.length) return res.status(400).json({ error: '대상 의원이 없습니다.' });

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host') || 'localhost';
  const baseUrl = `${protocol}://${host}`;

  // 각 의원별로 발송
  const results = { sent: 0, skipped: 0, failed: 0, errors: [] };
  for (const m of members) {
    if (!m.email || !/.+@.+\..+/.test(m.email)) {
      results.skipped++;
      results.errors.push(`${m.name}: 이메일 없음`);
      continue;
    }
    // 이 의원의 위임장 토큰 가져오기 (없으면 생성). 새 의원관리에서는 source_member_id 가 있을 수 있음
    let proxy = db.prepare(
      `SELECT * FROM proxies WHERE meeting_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
    ).get(meeting_id);
    // 또는 공용 토큰을 모두에게 같이 발송 (사용자가 본인 확인하여 제출)
    if (!proxy) {
      const newToken = uuidv4();
      db.prepare('INSERT INTO proxies (meeting_id, member_id, token, status) VALUES (?, NULL, ?, ?)')
        .run(meeting_id, newToken, 'pending');
      proxy = db.prepare(`SELECT * FROM proxies WHERE token = ?`).get(newToken);
    }

    const proxyUrl = `${baseUrl}/proxy?token=${proxy.token}`;
    const dateStr = meeting.meeting_date ? String(meeting.meeting_date).replace('T', ' ').slice(0, 16) : '';
    const subject = `[${org?.name || 'SmartMeet'}] ${meeting.title} 위임장 안내`;
    const customMessage = (meeting.invitation_message || '').replace(/\n/g, '<br>');

    const html = `
      <div style="font-family:'Pretendard','Malgun Gothic',sans-serif;max-width:560px;margin:auto;padding:24px;color:#1a202c;">
        <div style="background:linear-gradient(135deg,#0f2c5c,#1e40af);color:#fff;padding:28px;border-radius:12px;text-align:center;">
          <div style="font-size:13px;color:#fbbf24;letter-spacing:2px;margin-bottom:8px;">📋 MEETING NOTIFICATION</div>
          <h1 style="font-size:22px;font-weight:800;margin:8px 0;color:#fff;">${(org?.name || '').replace(/</g,'&lt;')}</h1>
          <h2 style="font-size:16px;font-weight:600;margin:0;color:#dbeafe;">${(meeting.title || '').replace(/</g,'&lt;')}</h2>
        </div>
        <div style="margin:24px 0;">
          <p style="font-size:15px;color:#374151;">안녕하세요, <strong>${(m.name || '').replace(/</g,'&lt;')}</strong> 님.</p>
          ${customMessage ? `<div style="background:#f9fafb;padding:14px 18px;border-radius:8px;margin:14px 0;border-left:4px solid #fbbf24;font-size:14px;line-height:1.7;">${customMessage}</div>` : ''}
          <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:13px;">
            ${dateStr ? `<tr><td style="padding:6px 10px;color:#64748b;">일시</td><td style="padding:6px 10px;font-weight:600;">${dateStr}</td></tr>` : ''}
            ${meeting.location ? `<tr><td style="padding:6px 10px;color:#64748b;">장소</td><td style="padding:6px 10px;font-weight:600;">${(meeting.location || '').replace(/</g,'&lt;')}</td></tr>` : ''}
          </table>
          <p style="font-size:14px;color:#374151;line-height:1.7;">
            회의 참석이 어려우신 경우 아래 버튼을 클릭하여 <strong>위임장을 제출</strong>해 주시기 바랍니다.
          </p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${proxyUrl}"
               style="background:#1e40af;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">
              ✍️ 위임장 작성·제출
            </a>
          </p>
          <p style="font-size:12px;color:#94a3b8;text-align:center;">
            또는 다음 링크를 브라우저에 붙여넣으세요:<br>
            <a href="${proxyUrl}" style="color:#3b82f6;word-break:break-all;">${proxyUrl}</a>
          </p>
        </div>
        <div style="border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;font-size:11px;color:#94a3b8;">
          본 메일은 ${org?.name || 'SmartMeet'} 의 시스템에서 자동 발송되었습니다.
        </div>
      </div>
    `;
    const text = `[${org?.name || 'SmartMeet'}] ${meeting.title}\n\n${m.name} 님,\n\n회의 참석이 어려우시면 다음 링크에서 위임장을 제출해주세요:\n${proxyUrl}\n\n일시: ${dateStr}\n장소: ${meeting.location || ''}`;

    try {
      await emailModule.sendEmail({ to: m.email, subject, html, text });
      results.sent++;
    } catch (e) {
      results.failed++;
      results.errors.push(`${m.name} (${m.email}): ${e.message}`);
      console.warn('[proxy email] 발송 실패:', m.email, e.message);
    }
  }

  res.json(results);
});

module.exports = router;
