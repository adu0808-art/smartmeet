const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, authRequired } = require('../auth-mw');
const passwordPolicy = require('../password-policy');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();

router.post('/register', (req, res) => {
  const { email, password, name, phone, workplace, invite_token, org_id } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: '모든 항목을 입력해주세요.' });
  const pwErr = passwordPolicy.validate(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: '이미 등록된 이메일입니다.' });

  // Validate invitation if provided
  let invitation = null;
  if (invite_token) {
    invitation = db.prepare('SELECT * FROM invitations WHERE token = ?').get(invite_token);
    if (!invitation) return res.status(400).json({ error: '유효하지 않은 초대 토큰입니다.' });
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ error: '만료된 초대 링크입니다.' });
    }
    if (invitation.max_uses > 0 && invitation.used_count >= invitation.max_uses) {
      return res.status(400).json({ error: '사용 한도를 초과한 초대 링크입니다.' });
    }
  }

  // 초대 없이도 org_id 가 들어오면 기관 홈 가입 — 해당 기관이 실제로 존재하는지 확인
  let ctxOrg = null;
  if (!invitation && org_id) {
    const oid = Number(org_id);
    if (oid) {
      ctxOrg = db.prepare('SELECT id FROM organizations WHERE id = ?').get(oid);
    }
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (email, password_hash, name, role, phone, workplace) VALUES (?, ?, ?, ?, ?, ?)')
    .run(email, hash, name, 'user', normalizePhone(phone), workplace || '');
  const userId = result.lastInsertRowid;

  // 기관 자동 소속
  let joinedOrgId = null;
  if (invitation) {
    db.prepare('INSERT OR IGNORE INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, ?)')
      .run(invitation.organization_id, userId, invitation.default_role);
    db.prepare('UPDATE invitations SET used_count = used_count + 1 WHERE id = ?').run(invitation.id);
    joinedOrgId = invitation.organization_id;
  } else if (ctxOrg) {
    // 기관 홈에서 직접 가입 → 일반 회원(staff) 으로 자동 등록
    db.prepare('INSERT OR IGNORE INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, ?)')
      .run(ctxOrg.id, userId, 'staff');
    joinedOrgId = ctxOrg.id;
  }

  const user = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(userId);
  const token = sign(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
  res.json({ user, token, joined_organization_id: joinedOrgId });
});

// ====================================================================
// 이메일 인증 기반 회원가입 (신규 흐름)
// ====================================================================
//   1) /auth/register-request — 폼 제출 → 임시 저장 + 인증 메일 발송
//   2) /auth/verify-email     — 메일 링크 토큰 → users 테이블 INSERT + 자동 로그인
// ====================================================================

const _vUuid = require('uuid');
const _emailEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

router.post('/register-request', async (req, res) => {
  const { email, password, name, phone, workplace, invite_token, org_id } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: '모든 항목을 입력해주세요.' });
  const normEmail = String(email).trim().toLowerCase();
  if (!/^.+@.+\..+$/.test(normEmail)) return res.status(400).json({ error: '올바른 이메일 형식이 아닙니다.' });
  const pwErr = passwordPolicy.validate(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  // 중복 이메일 차단
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normEmail);
  if (existing) {
    return res.status(400).json({ error: '이미 등록된 이메일입니다. 로그인 페이지에서 로그인해주세요.', alreadyRegistered: true });
  }
  // 만료/사용된 verification 정리
  try {
    db.prepare("DELETE FROM email_verifications WHERE expires_at < datetime('now', 'localtime') OR used_at IS NOT NULL").run();
  } catch {}
  // 같은 이메일로 진행 중인 미사용 verification 은 갱신 (재발송)
  try { db.prepare("DELETE FROM email_verifications WHERE email = ? AND used_at IS NULL").run(normEmail); } catch {}

  const hash = bcrypt.hashSync(password, 10);
  const token = _vUuid.v4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toLocaleString('sv-SE');
  const oidNum = Number(org_id) || null;
  db.prepare(`
    INSERT INTO email_verifications (token, email, name, password_hash, phone, workplace, invite_token, org_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(token, normEmail, String(name).trim(), hash, normalizePhone(phone), String(workplace || '').trim(), invite_token || null, oidNum, expiresAt);

  // 가입 후 자동 소속될 기관 정보 (메일 본문에 안내)
  let orgName = '';
  if (invite_token) {
    const inv = db.prepare(`
      SELECT o.name FROM invitations i JOIN organizations o ON o.id = i.organization_id WHERE i.token = ?
    `).get(invite_token);
    if (inv) orgName = inv.name;
  } else if (oidNum) {
    const o = db.prepare('SELECT name FROM organizations WHERE id = ?').get(oidNum);
    if (o) orgName = o.name;
  }

  // 메일 발송
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host');
  const verifyUrl = `${protocol}://${host}/verify-email?token=${token}`;
  const emailModule = require('../email');
  if (!emailModule.isEnabled()) {
    return res.status(500).json({ error: '인증 메일 발송이 설정되지 않았습니다. 시스템 관리자에게 문의해주세요.' });
  }
  try {
    await emailModule.sendEmail({
      to: normEmail,
      subject: '[SmartMeet] 이메일 인증 — 회원가입을 완료해주세요',
      html: `
        <div style="font-family:'Pretendard','Malgun Gothic',sans-serif;max-width:560px;margin:auto;padding:24px;color:#1a202c;">
          <div style="background:linear-gradient(135deg,#0f2c5c,#1e40af);color:#fff;padding:24px;border-radius:12px;text-align:center;">
            <div style="font-size:13px;color:#fbbf24;letter-spacing:2px;margin-bottom:8px;">📩 EMAIL VERIFICATION</div>
            <h1 style="font-size:22px;font-weight:800;margin:8px 0;color:#fff;">SmartMeet 회원가입</h1>
          </div>
          <div style="margin:24px 0;">
            <p style="font-size:15px;color:#374151;">안녕하세요, <strong>${_emailEsc(name)}</strong> 님.</p>
            <p style="font-size:14px;color:#374151;line-height:1.7;">
              SmartMeet 회원가입을 완료하려면 아래 버튼을 눌러 이메일을 인증해주세요.
            </p>
            ${orgName ? `<div style="background:#eef2ff;border-left:3px solid #6366f1;padding:12px 14px;border-radius:8px;margin:14px 0;font-size:14px;line-height:1.7;">
              ✓ 인증 완료 시 <b>${_emailEsc(orgName)}</b> 의 회원으로 자동 등록됩니다.
            </div>` : ''}
            <p style="text-align:center;margin:24px 0;">
              <a href="${verifyUrl}"
                 style="background:#10b981;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">
                ✓ 이메일 인증하고 가입 완료
              </a>
            </p>
            <p style="font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;">
              버튼이 동작하지 않으면 다음 링크를 브라우저에 붙여넣으세요:<br>
              <a href="${verifyUrl}" style="color:#3b82f6;word-break:break-all;">${verifyUrl}</a>
            </p>
            <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:18px;">
              이 링크는 <b>1시간 동안</b>만 유효합니다.<br>
              본인이 신청하지 않았다면 이 메일을 무시하셔도 됩니다.
            </p>
          </div>
        </div>`,
      text: `[SmartMeet] 이메일 인증\n\n${name}님, 다음 링크를 클릭하여 회원가입을 완료해주세요 (1시간 유효):\n${verifyUrl}${orgName ? `\n\n인증 완료 시 "${orgName}" 회원으로 자동 등록됩니다.` : ''}`
    });
  } catch (e) {
    console.error('[register-request] email send failed:', e);
    return res.status(500).json({ error: '인증 메일 발송에 실패했습니다: ' + e.message });
  }
  res.json({ ok: true, email: normEmail });
});

router.post('/verify-email', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: '인증 토큰이 없습니다.' });
  const v = db.prepare('SELECT * FROM email_verifications WHERE token = ?').get(token);
  if (!v) return res.status(400).json({ error: '유효하지 않은 인증 링크입니다.' });
  if (v.used_at) return res.status(400).json({ error: '이미 사용된 인증 링크입니다.' });
  if (new Date(v.expires_at) < new Date()) {
    return res.status(400).json({ error: '만료된 인증 링크입니다. 가입 페이지에서 다시 시도해주세요.' });
  }
  // race condition 방지 — 사이에 같은 이메일로 가입됐는지 재확인
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(v.email);
  if (existing) {
    db.prepare("UPDATE email_verifications SET used_at = datetime('now', 'localtime') WHERE id = ?").run(v.id);
    return res.status(400).json({ error: '이미 등록된 이메일입니다.' });
  }
  // 사용자 생성
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, name, role, phone, workplace) VALUES (?, ?, ?, ?, ?, ?)
  `).run(v.email, v.password_hash, v.name, 'user', v.phone || '', v.workplace || '');
  const userId = result.lastInsertRowid;

  // 기관 자동 가입 (초대 또는 기관 컨텍스트)
  let joinedOrgId = null;
  if (v.invite_token) {
    const inv = db.prepare('SELECT * FROM invitations WHERE token = ?').get(v.invite_token);
    if (inv) {
      const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
      const overUsed = inv.max_uses > 0 && inv.used_count >= inv.max_uses;
      if (!expired && !overUsed) {
        db.prepare('INSERT OR IGNORE INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, ?)')
          .run(inv.organization_id, userId, inv.default_role);
        db.prepare('UPDATE invitations SET used_count = used_count + 1 WHERE id = ?').run(inv.id);
        joinedOrgId = inv.organization_id;
      }
    }
  } else if (v.org_id) {
    const org = db.prepare('SELECT id FROM organizations WHERE id = ?').get(v.org_id);
    if (org) {
      db.prepare('INSERT OR IGNORE INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, ?)')
        .run(org.id, userId, 'staff');
      joinedOrgId = org.id;
    }
  }
  // verification 사용 처리
  db.prepare("UPDATE email_verifications SET used_at = datetime('now', 'localtime') WHERE id = ?").run(v.id);
  // 자동 로그인 (쿠키)
  const user = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(userId);
  const jwt = sign(user);
  res.cookie('token', jwt, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
  res.json({ ok: true, user, joined_organization_id: joinedOrgId });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(400).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }
  const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  const token = sign(safeUser);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
  res.json({ user: safeUser, token });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, phone, major, workplace, profile_image, bio FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json({ user });
});

router.put('/profile', authRequired, (req, res) => {
  const { name, phone, major, workplace, bio, profile_image } = req.body || {};
  if (name && !name.trim()) return res.status(400).json({ error: '이름은 비울 수 없습니다.' });
  // 전화번호는 숫자만 저장 (사용자가 어떤 형식으로 입력하든)
  const normalizedPhone = phone !== undefined ? normalizePhone(phone) : undefined;
  db.prepare(`UPDATE users SET
    name = COALESCE(?, name),
    phone = COALESCE(?, phone),
    major = COALESCE(?, major),
    workplace = COALESCE(?, workplace),
    bio = COALESCE(?, bio),
    profile_image = COALESCE(?, profile_image)
    WHERE id = ?`)
    .run(name, normalizedPhone, major, workplace, bio, profile_image, req.user.id);
  const user = db.prepare('SELECT id, email, name, role, phone, major, workplace, profile_image, bio FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// === 비밀번호 변경 (로그인 상태) ===
router.post('/change-password', authRequired, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
  }
  const pwErr = passwordPolicy.validate(new_password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (current_password === new_password) {
    return res.status(400).json({ error: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

// === 아이디 찾기 (이름 + 전화번호 → 마스킹된 이메일) ===
router.post('/find-id', (req, res) => {
  const { name, phone } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: '이름과 전화번호를 모두 입력하세요.' });
  const norm = (s) => String(s || '').replace(/\D/g, '');
  const phoneNorm = norm(phone);
  // 이름 + 전화번호 매칭 (전화번호는 숫자만 비교)
  const users = db.prepare(`SELECT id, email FROM users WHERE name = ?`).all(String(name).trim());
  const matched = users.find(u => {
    const userPhone = db.prepare('SELECT phone FROM users WHERE id = ?').get(u.id);
    return norm(userPhone?.phone) === phoneNorm && phoneNorm.length >= 10;
  });
  if (!matched) {
    return res.status(404).json({ error: '입력하신 정보로 등록된 계정을 찾을 수 없습니다.' });
  }
  // 이메일 마스킹: 첫 2자 + *** + @도메인
  const [local, domain] = matched.email.split('@');
  const masked = (local.length <= 2 ? local[0] + '*' : local.slice(0, 2) + '*'.repeat(Math.min(local.length - 2, 4))) + '@' + domain;
  res.json({ email: masked, full_email: matched.email });
});

// === 비밀번호 재설정 요청 (이메일로 링크 발송) ===
const { v4: uuidv4 } = require('uuid');
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: '이메일을 입력하세요.' });
  const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!user) {
    // 보안: 등록되지 않은 이메일이라도 동일 응답 (정보 노출 방지)
    return res.json({ ok: true, sent: false });
  }
  // 토큰 생성 — 1시간 유효
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toLocaleString('sv-SE');
  db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
    .run(user.id, token, expiresAt);

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host');
  const resetUrl = `${protocol}://${host}/reset-password?token=${token}`;

  const email_module = require('../email');

  console.log('[debug] isEnabled:', email_module.isEnabled());
  console.log('[debug] RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY);

  if (!email_module.isEnabled()) {
    console.warn('[forgot-password] 이메일 모듈 비활성화');
    return res.json({
      ok: true,
      sent: false,
      message: '이메일 발송이 설정되지 않아 재설정 링크를 발송하지 못했습니다. 시스템 관리자에게 문의해주세요.'
    });
  }

  try {
    console.log('[debug] 이메일 발송 시도 → ', user.email);
    await email_module.sendEmail({
      to: user.email,
      subject: '[SmartMeet] 비밀번호 재설정 안내',
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;color:#1a202c;">
          <h2 style="color:#0f2c5c;">비밀번호 재설정</h2>
          <p>${user.name}님, 안녕하세요.</p>
          <p>SmartMeet 비밀번호 재설정 요청이 접수되었습니다. 아래 버튼을 클릭하여 새 비밀번호를 설정해주세요.</p>
          <p style="margin:24px 0;">
            <a href="${resetUrl}"
               style="background:#1e40af;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
              비밀번호 재설정
            </a>
          </p>
          <p style="font-size:13px;color:#64748b;">또는 다음 링크를 브라우저에 붙여넣으세요:<br>
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
          <p style="font-size:13px;color:#64748b;">이 링크는 <b>1시간 동안</b>만 유효합니다.</p>
          <p style="font-size:13px;color:#64748b;">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>
        </div>`,
      text: `[SmartMeet] 비밀번호 재설정\n\n${user.name}님, 다음 링크에서 비밀번호를 재설정하세요 (1시간 유효):\n${resetUrl}`
    });
    console.log('[debug] 이메일 발송 완료');
    return res.json({ ok: true, sent: true });
  } catch (e) {
    console.error('[debug] 이메일 발송 에러:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// === 비밀번호 재설정 완료 (토큰으로 새 비밀번호 설정) ===
router.post('/reset-password', (req, res) => {
  const { token, new_password } = req.body || {};
  if (!token || !new_password) return res.status(400).json({ error: '토큰과 새 비밀번호를 모두 입력하세요.' });
  const pwErr = passwordPolicy.validate(new_password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const row = db.prepare('SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = ?').get(token);
  if (!row) return res.status(400).json({ error: '유효하지 않은 토큰입니다.' });
  if (row.used_at) return res.status(400).json({ error: '이미 사용된 토큰입니다.' });
  if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: '토큰이 만료되었습니다. 다시 요청해주세요.' });
  const hash = bcrypt.hashSync(new_password, 10);
  const now = new Date().toLocaleString('sv-SE');
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, row.id);
  });
  tx();
  res.json({ ok: true });
});

// Authenticated user joining via invite (already logged in)
router.post('/join', authRequired, (req, res) => {
  const { invite_token } = req.body || {};
  if (!invite_token) return res.status(400).json({ error: '초대 토큰이 필요합니다.' });
  const invitation = db.prepare('SELECT * FROM invitations WHERE token = ?').get(invite_token);
  if (!invitation) return res.status(400).json({ error: '유효하지 않은 초대 토큰입니다.' });
  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    return res.status(400).json({ error: '만료된 초대 링크입니다.' });
  }
  if (invitation.max_uses > 0 && invitation.used_count >= invitation.max_uses) {
    return res.status(400).json({ error: '사용 한도를 초과했습니다.' });
  }
  const exists = db.prepare('SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?')
    .get(invitation.organization_id, req.user.id);
  if (exists) return res.json({ ok: true, already_member: true, organization_id: invitation.organization_id });
  db.prepare('INSERT INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, ?)')
    .run(invitation.organization_id, req.user.id, invitation.default_role);
  db.prepare('UPDATE invitations SET used_count = used_count + 1 WHERE id = ?').run(invitation.id);
  res.json({ ok: true, organization_id: invitation.organization_id });
});

module.exports = router;
