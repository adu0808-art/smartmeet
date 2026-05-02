const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authRequired } = require('../auth-mw');
const { getOrgRole, requireOrg, isAdmin } = require('../permissions');
const passwordPolicy = require('../password-policy');

const router = express.Router();
router.use(authRequired);

// List orgs (system admin: all; others: orgs they belong to)
router.get('/', (req, res) => {
  let rows;
  if (req.user.role === 'admin') {
    rows = db.prepare(`
      SELECT o.*, u.name AS owner_name,
        (SELECT COUNT(*) FROM meetings m WHERE m.organization_id = o.id) AS meeting_count,
        (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) AS member_count,
        'system_admin' AS my_role
      FROM organizations o
      LEFT JOIN users u ON u.id = o.owner_id
      ORDER BY o.created_at DESC
    `).all();
  } else {
    rows = db.prepare(`
      SELECT o.*, u.name AS owner_name,
        (SELECT COUNT(*) FROM meetings m WHERE m.organization_id = o.id) AS meeting_count,
        (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) AS member_count,
        CASE
          WHEN o.owner_id = ? THEN 'admin'
          WHEN om2.member_role = 'admin' THEN 'admin'
          ELSE 'member'
        END AS my_role
      FROM organizations o
      LEFT JOIN users u ON u.id = o.owner_id
      LEFT JOIN organization_members om2 ON om2.organization_id = o.id AND om2.user_id = ?
      WHERE o.owner_id = ? OR om2.user_id = ?
      ORDER BY o.created_at DESC
    `).all(req.user.id, req.user.id, req.user.id, req.user.id);
  }
  res.json({ organizations: rows });
});

// Create org — creator becomes admin
router.post('/', (req, res) => {
  const { name, description, logo_url, logo_text_url, logo_combo_url, hero_image_url, footer_html, intro_html } = req.body || {};
  if (!name) return res.status(400).json({ error: '기관명을 입력하세요.' });
  const result = db.prepare('INSERT INTO organizations (name, description, logo_url, logo_text_url, logo_combo_url, hero_image_url, footer_html, intro_html, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(name, description || '', logo_url || '', logo_text_url || '', logo_combo_url || '', hero_image_url || '', footer_html || '', intro_html || '', req.user.id);
  const orgId = result.lastInsertRowid;
  db.prepare('INSERT INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, ?)')
    .run(orgId, req.user.id, 'admin');
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  res.json({ organization: org });
});

// Single org — read access
router.get('/:id', requireOrg(req => req.params.id, 'read'), (req, res) => {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.params.id);
  if (!org) return res.status(404).json({ error: '기관을 찾을 수 없습니다.' });
  res.json({ organization: org, my_role: req.orgRole });
});

router.put('/:id', requireOrg(req => req.params.id, 'write'), (req, res) => {
  const body = req.body || {};
  // Partial update — only update fields that are provided
  const existing = db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '기관을 찾을 수 없습니다.' });
  const merged = {
    name: body.name !== undefined ? body.name : existing.name,
    description: body.description !== undefined ? body.description : existing.description,
    logo_url: body.logo_url !== undefined ? body.logo_url : existing.logo_url,
    logo_text_url: body.logo_text_url !== undefined ? body.logo_text_url : existing.logo_text_url,
    logo_combo_url: body.logo_combo_url !== undefined ? body.logo_combo_url : existing.logo_combo_url,
    hero_image_url: body.hero_image_url !== undefined ? body.hero_image_url : existing.hero_image_url,
    footer_html: body.footer_html !== undefined ? body.footer_html : existing.footer_html,
    intro_html: body.intro_html !== undefined ? body.intro_html : existing.intro_html,
    hero_sub: body.hero_sub !== undefined ? body.hero_sub : existing.hero_sub,
    slogan: body.slogan !== undefined ? body.slogan : existing.slogan
  };
  db.prepare('UPDATE organizations SET name = ?, description = ?, logo_url = ?, logo_text_url = ?, logo_combo_url = ?, hero_image_url = ?, footer_html = ?, intro_html = ?, hero_sub = ?, slogan = ? WHERE id = ?')
    .run(merged.name, merged.description || '', merged.logo_url || '', merged.logo_text_url || '', merged.logo_combo_url || '', merged.hero_image_url || '', merged.footer_html || '', merged.intro_html || '', merged.hero_sub || '', merged.slogan || '', req.params.id);
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.params.id);
  res.json({ organization: org });
});

router.delete('/:id', requireOrg(req => req.params.id, 'write'), (req, res) => {
  db.prepare('DELETE FROM organizations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 도메인 설정 (서브도메인 / 커스텀 도메인)
//   기관 관리자 또는 시스템 관리자만 호출 가능
router.put('/:id/domain', requireOrg(req => req.params.id, 'write'), (req, res) => {
  const { subdomain, custom_domain } = req.body || {};
  // 검증: 서브도메인 형식 (소문자, 숫자, 하이픈, 2~30자)
  let normalizedSub = null;
  if (subdomain !== undefined && subdomain !== null) {
    const s = String(subdomain).trim().toLowerCase();
    if (s) {
      if (!/^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/.test(s)) {
        return res.status(400).json({ error: '서브도메인은 영문 소문자·숫자·하이픈만 사용 가능합니다 (2~30자, 처음과 끝은 영문/숫자).' });
      }
      const reserved = ['www', 'api', 'admin', 'app', 'mail', 'static', 'cdn', 'ftp', 'localhost'];
      if (reserved.includes(s)) {
        return res.status(400).json({ error: `'${s}' 은 예약된 서브도메인입니다.` });
      }
      // 다른 기관과 중복 확인
      const dup = db.prepare('SELECT id, name FROM organizations WHERE LOWER(subdomain) = ? AND id != ?').get(s, req.params.id);
      if (dup) return res.status(400).json({ error: `이미 사용 중인 서브도메인입니다: ${dup.name}` });
      normalizedSub = s;
    }
  }
  // 검증: 커스텀 도메인 형식
  let normalizedCustom = null;
  if (custom_domain !== undefined && custom_domain !== null) {
    const c = String(custom_domain).trim().toLowerCase();
    if (c) {
      if (!/^[a-z0-9]([a-z0-9-.]*[a-z0-9])?\.[a-z]{2,}$/.test(c) || c.length > 253) {
        return res.status(400).json({ error: '유효한 도메인 형식이 아닙니다 (예: kistem.or.kr).' });
      }
      const dup = db.prepare('SELECT id, name FROM organizations WHERE LOWER(custom_domain) = ? AND id != ?').get(c, req.params.id);
      if (dup) return res.status(400).json({ error: `이미 사용 중인 도메인입니다: ${dup.name}` });
      normalizedCustom = c;
    }
  }
  // 부분 갱신 (제공된 필드만)
  const sets = [];
  const params = [];
  if (subdomain !== undefined) { sets.push('subdomain = ?'); params.push(normalizedSub); }
  if (custom_domain !== undefined) { sets.push('custom_domain = ?'); params.push(normalizedCustom); }
  if (!sets.length) return res.status(400).json({ error: '변경할 필드가 없습니다.' });
  params.push(req.params.id);
  db.prepare(`UPDATE organizations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const org = db.prepare('SELECT id, name, subdomain, custom_domain FROM organizations WHERE id = ?').get(req.params.id);
  res.json({ organization: org });
});

router.get('/:id/dashboard', requireOrg(req => req.params.id, 'read'), (req, res) => {
  const orgId = req.params.id;
  const meetings = db.prepare('SELECT * FROM meetings WHERE organization_id = ? ORDER BY meeting_date DESC').all(orgId);
  const memberCount = db.prepare('SELECT COUNT(*) AS c FROM members WHERE organization_id = ?').get(orgId).c;
  const upcomingSchedules = db.prepare(`
    SELECT * FROM schedules WHERE organization_id = ? AND schedule_date >= date('now', 'localtime') ORDER BY schedule_date ASC LIMIT 5
  `).all(orgId);
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM organization_members WHERE organization_id = ?').get(orgId).c;
  res.json({ meetings, memberCount, upcomingSchedules, userCount, my_role: req.orgRole });
});

// Org users (members of the system, not 의원) — admins only
router.get('/:id/users', requireOrg(req => req.params.id, 'read'), (req, res) => {
  const orgId = req.params.id;
  // Exclude system admins (users.role = 'admin') from the org member list
  const rows = db.prepare(`
    SELECT u.id, u.email, u.name, u.phone, u.major, u.workplace, u.profile_image, u.bio,
      om.member_role, om.id AS membership_id, u.created_at,
      (CASE WHEN o.owner_id = u.id THEN 1 ELSE 0 END) AS is_owner
    FROM organization_members om
    JOIN users u ON u.id = om.user_id
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.organization_id = ? AND u.role != 'admin'
    ORDER BY om.member_role DESC, u.name ASC
  `).all(orgId);
  res.json({ users: rows });
});

router.put('/:id/users/:userId', requireOrg(req => req.params.id, 'write'), (req, res) => {
  const { member_role } = req.body || {};
  if (!['admin', 'member'].includes(member_role)) return res.status(400).json({ error: '잘못된 역할' });
  const owner = db.prepare('SELECT owner_id FROM organizations WHERE id = ?').get(req.params.id);
  if (owner && owner.owner_id === Number(req.params.userId) && member_role !== 'admin') {
    return res.status(400).json({ error: '소유자의 권한은 변경할 수 없습니다.' });
  }
  db.prepare('UPDATE organization_members SET member_role = ? WHERE organization_id = ? AND user_id = ?')
    .run(member_role, req.params.id, req.params.userId);
  res.json({ ok: true });
});

router.delete('/:id/users/:userId', requireOrg(req => req.params.id, 'write'), (req, res) => {
  const owner = db.prepare('SELECT owner_id FROM organizations WHERE id = ?').get(req.params.id);
  if (owner && owner.owner_id === Number(req.params.userId)) return res.status(400).json({ error: '소유자는 삭제할 수 없습니다.' });
  db.prepare('DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  res.json({ ok: true });
});

// 기관 관리자용: 소속 회원의 비밀번호 초기화
router.post('/:id/users/:userId/reset-password', requireOrg(req => req.params.id, 'write'), (req, res) => {
  const { password } = req.body || {};
  const pwErr = passwordPolicy.validate(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const member = db.prepare('SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?')
    .get(req.params.id, req.params.userId);
  if (!member) return res.status(404).json({ error: '소속 회원이 아닙니다.' });
  // Don't allow resetting system admin passwords from org-level
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.userId);
  if (!target) return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
  if (target.role === 'admin') {
    return res.status(403).json({ error: '시스템 관리자의 비밀번호는 변경할 수 없습니다.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.userId);
  res.json({ ok: true });
});

module.exports = router;
