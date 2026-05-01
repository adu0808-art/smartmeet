const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, authRequired } = require('../auth-mw');

const router = express.Router();

router.post('/register', (req, res) => {
  const { email, password, name, phone, workplace, invite_token } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: '모든 항목을 입력해주세요.' });
  if (password.length < 6) return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });

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

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (email, password_hash, name, role, phone, workplace) VALUES (?, ?, ?, ?, ?, ?)')
    .run(email, hash, name, 'user', phone || '', workplace || '');
  const userId = result.lastInsertRowid;

  // If invite, attach to org
  if (invitation) {
    db.prepare('INSERT OR IGNORE INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, ?)')
      .run(invitation.organization_id, userId, invitation.default_role);
    db.prepare('UPDATE invitations SET used_count = used_count + 1 WHERE id = ?').run(invitation.id);
  }

  const user = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(userId);
  const token = sign(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
  res.json({ user, token, joined_organization_id: invitation ? invitation.organization_id : null });
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
  db.prepare(`UPDATE users SET
    name = COALESCE(?, name),
    phone = COALESCE(?, phone),
    major = COALESCE(?, major),
    workplace = COALESCE(?, workplace),
    bio = COALESCE(?, bio),
    profile_image = COALESCE(?, profile_image)
    WHERE id = ?`)
    .run(name, phone, major, workplace, bio, profile_image, req.user.id);
  const user = db.prepare('SELECT id, email, name, role, phone, major, workplace, profile_image, bio FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
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
