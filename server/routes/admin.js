const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { adminRequired } = require('../auth-mw');
const passwordPolicy = require('../password-policy');
const emailModule = require('../email');

const router = express.Router();
router.use(adminRequired);

// === SMTP 진단 — 시스템 관리자 전용 ===
//   현재 SMTP 환경변수 상태 + 연결 테스트 + 시험 발송
router.get('/smtp-status', (req, res) => {
  const env = {
    SMTP_HOST: process.env.SMTP_HOST || null,
    SMTP_PORT: process.env.SMTP_PORT || null,
    SMTP_SECURE: process.env.SMTP_SECURE || null,
    SMTP_USER: process.env.SMTP_USER ? `${process.env.SMTP_USER.slice(0, 3)}***${process.env.SMTP_USER.includes('@') ? '@' + process.env.SMTP_USER.split('@')[1] : ''}` : null,
    SMTP_PASS: process.env.SMTP_PASS ? `[${process.env.SMTP_PASS.length}자 설정됨]` : null,
    SMTP_FROM: process.env.SMTP_FROM || null,
    NODE_ENV: process.env.NODE_ENV || null
  };
  const isEnabled = emailModule.isEnabled();
  const computedSecure = (() => {
    const v = String(process.env.SMTP_SECURE || '').toLowerCase().trim();
    if (['true','1','yes','on'].includes(v)) return true;
    if (['false','0','no','off'].includes(v)) return false;
    return Number(process.env.SMTP_PORT) === 465;
  })();
  res.json({
    enabled: isEnabled,
    env_summary: env,
    computed: {
      port: Number(process.env.SMTP_PORT) || 587,
      secure: computedSecure
    }
  });
});

router.post('/smtp-test', async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ error: '수신자 이메일을 입력하세요.' });
  if (!emailModule.isEnabled()) {
    return res.status(400).json({ error: 'SMTP_HOST 환경변수가 설정되지 않았습니다.' });
  }
  try {
    await emailModule.sendEmail({
      to,
      subject: '[SmartMeet] SMTP 테스트 메일',
      html: `<div style="font-family:sans-serif;padding:20px;">
        <h2 style="color:#1e40af;">✅ SMTP 발송 성공</h2>
        <p>이 메일이 보이시면 Railway 의 SMTP 설정이 정상 동작 중입니다.</p>
        <p style="color:#64748b;font-size:13px;">발송 시각: ${new Date().toLocaleString('ko-KR')}</p>
      </div>`,
      text: 'SmartMeet SMTP 테스트 발송 성공'
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[smtp-test] 실패:', e);
    res.status(500).json({
      error: e.message,
      code: e.code,
      command: e.command,
      response: e.response
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
