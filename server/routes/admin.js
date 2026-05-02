const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { adminRequired } = require('../auth-mw');
const passwordPolicy = require('../password-policy');
const emailModule = require('../email');

const router = express.Router();
router.use(adminRequired);

// === 이메일 발송 진단 — 시스템 관리자 전용 ===
//   Resend SDK 환경변수 상태 + 시험 발송
router.get('/smtp-status', (req, res) => {
  const apiKey = process.env.RESEND_API_KEY || '';
  // 키 진단 — 앞 5자 + 길이 + 끝 4자 + 공백/줄바꿈 검사
  const keyDiag = apiKey ? {
    length: apiKey.length,
    prefix: apiKey.slice(0, 5),
    suffix: apiKey.slice(-4),
    starts_with_re_: apiKey.startsWith('re_'),
    has_leading_space: /^\s/.test(apiKey),
    has_trailing_space: /\s$/.test(apiKey),
    has_newline: /[\r\n]/.test(apiKey),
    has_quotes: /["']/.test(apiKey)
  } : null;

  const env = {
    RESEND_API_KEY: apiKey ? `[${apiKey.length}자 설정됨, ${apiKey.slice(0, 5)}...${apiKey.slice(-4)}]` : null,
    SMTP_FROM: process.env.SMTP_FROM || null,
    NODE_ENV: process.env.NODE_ENV || null
  };
  const isEnabled = emailModule.isEnabled();
  res.json({
    enabled: isEnabled,
    provider: 'Resend',
    env_summary: env,
    key_diagnostic: keyDiag,
    computed: {
      from: process.env.SMTP_FROM || 'SmartMeet <onboarding@resend.dev>'
    }
  });
});

// API key 자체를 Resend 에 직접 검증 (실제 발송 ✗)
router.post('/smtp-test-key', async (req, res) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'RESEND_API_KEY 미설정' });

  try {
    // Resend 의 가벼운 GET 엔드포인트로 키 검증
    const resp = await fetch('https://api.resend.com/api-keys', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const body = await resp.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = body; }

    res.json({
      http_status: resp.status,
      ok: resp.ok,
      response: parsed,
      key_length: apiKey.length,
      key_prefix: apiKey.slice(0, 5),
      key_suffix: apiKey.slice(-4)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/smtp-test', async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ error: '수신자 이메일을 입력하세요.' });
  if (!emailModule.isEnabled()) {
    return res.status(400).json({ error: 'RESEND_API_KEY 환경변수가 설정되지 않았습니다.' });
  }
  try {
    await emailModule.sendEmail({
      to,
      subject: '[SmartMeet] 이메일 발송 테스트',
      html: `<div style="font-family:sans-serif;padding:20px;">
        <h2 style="color:#1e40af;">✅ Resend 발송 성공</h2>
        <p>이 메일이 보이시면 Railway 의 이메일 설정이 정상 동작 중입니다.</p>
        <p style="color:#64748b;font-size:13px;">발송 시각: ${new Date().toLocaleString('ko-KR')}</p>
        <p style="color:#64748b;font-size:13px;">Provider: Resend</p>
      </div>`,
      text: 'SmartMeet 이메일 발송 테스트 성공 (via Resend)'
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[email-test] 실패:', e);
    res.status(500).json({
      error: e.message
    });
  }
});

router.get('/stats', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const orgCount = db.prepare('SELECT COUNT(*) AS c FROM organizations').get().c;
  const meetingCount = db.prepare('SELECT COUNT(*) AS c FROM meetings').get().c;
  const memberCount = db.prepare('SELECT COUNT(*) AS c FROM members').get().c;
  const proxyCount = db.prepare('SELECT COUNT(*) AS c FROM proxies').get().c;
  const submittedProxyCount = db.prepare(`SELECT COUNT(*) AS c FROM proxies WHERE status = 'submitted'`).get().c;
  res.json({ userCount, orgCount, meetingCount, memberCount, proxyCount, submittedProxyCount });
});

router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC').all();
  // Attach organization memberships per user
  const memStmt = db.prepare(`
    SELECT om.member_role, o.id AS org_id, o.name AS org_name,
      (CASE WHEN o.owner_id = om.user_id THEN 1 ELSE 0 END) AS is_owner
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = ?
    ORDER BY o.name ASC
  `);
  users.forEach(u => {
    u.organizations = memStmt.all(u.id);
  });
  res.json({ users });
});

router.put('/users/:id', (req, res) => {
  const { name, role, password, phone, major, workplace, bio } = req.body || {};
  if (password) {
    const pwErr = passwordPolicy.validate(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(`UPDATE users SET
        name = COALESCE(?, name), role = COALESCE(?, role),
        password_hash = ?,
        phone = COALESCE(?, phone), major = COALESCE(?, major),
        workplace = COALESCE(?, workplace), bio = COALESCE(?, bio)
      WHERE id = ?`)
      .run(name, role, hash, phone, major, workplace, bio, req.params.id);
  } else {
    db.prepare(`UPDATE users SET
        name = COALESCE(?, name), role = COALESCE(?, role),
        phone = COALESCE(?, phone), major = COALESCE(?, major),
        workplace = COALESCE(?, workplace), bio = COALESCE(?, bio)
      WHERE id = ?`)
      .run(name, role, phone, major, workplace, bio, req.params.id);
  }
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: '자기 자신은 삭제할 수 없습니다.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/organizations', (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, u.name AS owner_name, u.email AS owner_email,
      (SELECT COUNT(*) FROM meetings m WHERE m.organization_id = o.id) AS meeting_count,
      (SELECT COUNT(*) FROM members me WHERE me.organization_id = o.id) AS member_count
    FROM organizations o
    LEFT JOIN users u ON u.id = o.owner_id
    ORDER BY o.created_at DESC
  `).all();
  res.json({ organizations: rows });
});

module.exports = router;
