// 회의 의원 (meeting_members) — 임원명단(members)과 독립된 테이블
//   각 회의별로 별도의 의원 명단을 유지. 임원 정보 변경/삭제와 무관하게 독립적으로 보존.
const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth-mw');
const { requireOrg, getOrgIdFromMeeting, getOrgRole, isAdmin } = require('../permissions');

const router = express.Router();
router.use(authRequired);

function normalizePhone(s) { return String(s || '').replace(/\D/g, ''); }

// 같은 회의 내 전화번호 중복 검사
function findDupPhoneInMeeting(meetingId, phone, excludeId) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const params = [meetingId];
  let q = 'SELECT id, name, phone FROM meeting_members WHERE meeting_id = ?';
  if (excludeId) { q += ' AND id != ?'; params.push(excludeId); }
  const rows = db.prepare(q).all(...params);
  return rows.find(r => normalizePhone(r.phone) === normalized) || null;
}

// 같은 회의 내 seq 정규화 (1..N)
function normalizeSeqInMeeting(meetingId) {
  const rows = db.prepare(
    'SELECT id FROM meeting_members WHERE meeting_id = ? ORDER BY (seq IS NULL) ASC, seq ASC, id ASC'
  ).all(meetingId);
  const upd = db.prepare('UPDATE meeting_members SET seq = ? WHERE id = ?');
  const tx = db.transaction(() => rows.forEach((r, i) => upd.run(i + 1, r.id)));
  tx();
}

// === GET: 회의 의원 목록 (출석 status 포함) ===
router.get('/', authRequired, (req, res) => {
  const { meeting_id, q, status } = req.query;
  if (!meeting_id) return res.status(400).json({ error: 'meeting_id 필요' });
  const orgId = getOrgIdFromMeeting(meeting_id);
  if (!orgId) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });
  if (!getOrgRole(req.user, orgId)) return res.status(403).json({ error: '접근 권한이 없습니다.' });

  let rows = db.prepare(
    'SELECT * FROM meeting_members WHERE meeting_id = ? ORDER BY seq ASC, id ASC'
  ).all(meeting_id);
  if (q) {
    const qq = q.toLowerCase();
    rows = rows.filter(m =>
      (m.name || '').toLowerCase().includes(qq) ||
      (m.position || '').toLowerCase().includes(qq) ||
      (m.phone || '').includes(qq)
    );
  }

  // 출석 status 와 위임장(proxies) 매칭
  const att = db.prepare('SELECT meeting_member_id, status FROM attendances').all();
  const attMap = new Map(att.map(a => [a.meeting_member_id, a.status]));
  const submittedProxies = db.prepare(
    `SELECT id, member_id, submitter_name, submitter_phone FROM proxies WHERE meeting_id = ? AND status = 'submitted'`
  ).all(meeting_id);
  const proxyByPhone = new Map();
  submittedProxies.forEach(p => {
    const ph = normalizePhone(p.submitter_phone);
    if (ph) proxyByPhone.set(`${(p.submitter_name || '').trim()}|${ph}`, p.id);
  });

  rows = rows.map(m => {
    let s = 'absent';
    if (attMap.get(m.id) === 'present') s = 'present';
    else {
      // 위임장 매칭 (이름 + 전화)
      const k = `${(m.name || '').trim()}|${normalizePhone(m.phone)}`;
      if (proxyByPhone.has(k)) s = 'proxy';
    }
    return { ...m, attendance_status: s };
  });

  if (status && status !== 'all') {
    rows = rows.filter(m => m.attendance_status === status);
  }
  res.json({ members: rows });
});

// === POST: 회의 의원 추가 ===
router.post('/', authRequired, (req, res) => {
  const { meeting_id, name, position, phone, email, major, workplace, photo, source_member_id } = req.body || {};
  if (!meeting_id) return res.status(400).json({ error: 'meeting_id 필요' });
  const orgId = getOrgIdFromMeeting(meeting_id);
  if (!orgId) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  if (!name) return res.status(400).json({ error: '성명을 입력하세요.' });
  if (!phone || !normalizePhone(phone)) return res.status(400).json({ error: '전화번호는 필수입니다.' });
  // 같은 회의 내 전화번호 중복 차단
  const dup = findDupPhoneInMeeting(meeting_id, phone);
  if (dup) {
    return res.status(400).json({ error: `이 회의에 이미 등록된 전화번호입니다 — ${dup.name} (${dup.phone || ''})` });
  }
  const lastSeq = db.prepare('SELECT MAX(seq) AS m FROM meeting_members WHERE meeting_id = ?').get(meeting_id).m || 0;
  const result = db.prepare(`
    INSERT INTO meeting_members (meeting_id, seq, position, name, phone, email, major, workplace, photo, source_member_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(meeting_id, lastSeq + 1, position || '', name, phone || '', email || '', major || '', workplace || '', photo || '', source_member_id || null);
  normalizeSeqInMeeting(meeting_id);
  const row = db.prepare('SELECT * FROM meeting_members WHERE id = ?').get(result.lastInsertRowid);
  res.json({ member: row });
});

// === PUT: 의원 수정 ===
router.put('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM meeting_members WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '의원을 찾을 수 없습니다.' });
  const orgId = getOrgIdFromMeeting(existing.meeting_id);
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  const { seq, position, name, phone, email, major, workplace, photo } = req.body || {};
  if (!name) return res.status(400).json({ error: '성명을 입력하세요.' });
  if (!phone || !normalizePhone(phone)) return res.status(400).json({ error: '전화번호는 필수입니다.' });
  const dup = findDupPhoneInMeeting(existing.meeting_id, phone, id);
  if (dup) {
    return res.status(400).json({ error: `이 회의에 이미 등록된 전화번호입니다 — ${dup.name} (${dup.phone || ''})` });
  }
  db.prepare(`
    UPDATE meeting_members
    SET seq = ?, position = ?, name = ?, phone = ?, email = ?, major = ?, workplace = ?, photo = ?
    WHERE id = ?
  `).run(seq || null, position || '', name, phone || '', email || '', major || '', workplace || '', photo || '', id);
  normalizeSeqInMeeting(existing.meeting_id);
  const row = db.prepare('SELECT * FROM meeting_members WHERE id = ?').get(id);
  res.json({ member: row });
});

// === DELETE: 의원 단건 제거 ===
router.delete('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT meeting_id FROM meeting_members WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '의원을 찾을 수 없습니다.' });
  const orgId = getOrgIdFromMeeting(existing.meeting_id);
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  db.prepare('DELETE FROM meeting_members WHERE id = ?').run(id);
  normalizeSeqInMeeting(existing.meeting_id);
  res.json({ ok: true });
});

// === POST: 일괄 삭제 ===
router.post('/bulk-delete', authRequired, (req, res) => {
  const { ids, meeting_id } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids 필요' });
  if (!meeting_id) return res.status(400).json({ error: 'meeting_id 필요' });
  const orgId = getOrgIdFromMeeting(meeting_id);
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM meeting_members WHERE meeting_id = ? AND id IN (${placeholders})`)
    .run(meeting_id, ...ids);
  normalizeSeqInMeeting(meeting_id);
  res.json({ ok: true });
});

// === POST: 임원명단에서 일괄 가져오기 (선택한 임원 데이터를 새 의원 row 로 복사) ===
router.post('/import-from-members', authRequired, (req, res) => {
  const { meeting_id, member_ids } = req.body || {};
  if (!meeting_id || !Array.isArray(member_ids)) return res.status(400).json({ error: '필수값 누락' });
  const orgId = getOrgIdFromMeeting(meeting_id);
  if (!orgId) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  if (member_ids.length === 0) return res.json({ ok: true, count: 0, skipped: 0 });

  // 선택한 임원 데이터 조회 (org 검증)
  const placeholders = member_ids.map(() => '?').join(',');
  const sources = db.prepare(
    `SELECT * FROM members WHERE organization_id = ? AND id IN (${placeholders})`
  ).all(orgId, ...member_ids);

  // 현재 회의에 있는 전화번호 수집 (중복 검사용)
  const existingPhones = new Set(
    db.prepare('SELECT phone FROM meeting_members WHERE meeting_id = ?').all(meeting_id)
      .map(r => normalizePhone(r.phone))
      .filter(Boolean)
  );

  let added = 0, skipped = 0;
  const lastSeqRow = db.prepare('SELECT MAX(seq) AS m FROM meeting_members WHERE meeting_id = ?').get(meeting_id);
  let nextSeq = (lastSeqRow.m || 0) + 1;

  const ins = db.prepare(`
    INSERT INTO meeting_members (meeting_id, seq, position, name, phone, email, major, workplace, photo, source_member_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    sources.forEach(m => {
      const np = normalizePhone(m.phone);
      // 중복 전화번호 스킵 + 빈 전화번호 스킵
      if (!np || existingPhones.has(np)) { skipped++; return; }
      ins.run(meeting_id, nextSeq++, m.position || '', m.name, m.phone || '', m.email || '', m.major || '', m.workplace || '', m.photo || '', m.id);
      existingPhones.add(np);
      added++;
    });
  });
  tx();
  normalizeSeqInMeeting(meeting_id);
  res.json({ ok: true, count: added, skipped, requested: member_ids.length });
});

// === POST: 출석 체크 ===
router.post('/attendance', authRequired, (req, res) => {
  const { meeting_member_id, status } = req.body || {};
  if (!meeting_member_id) return res.status(400).json({ error: 'meeting_member_id 필요' });
  const mm = db.prepare('SELECT meeting_id, name, phone FROM meeting_members WHERE id = ?').get(meeting_member_id);
  if (!mm) return res.status(404).json({ error: '의원을 찾을 수 없습니다.' });
  const orgId = getOrgIdFromMeeting(mm.meeting_id);
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });

  // ★ 출석으로 체크하려는 경우, 이 의원이 이미 위임장을 제출했는지 확인
  //    이름 + 전화(숫자만) 매칭으로 위임장 검색 → 매칭 시 출석 처리 거부
  if (status === 'present') {
    const memberPhoneNorm = normalizePhone(mm.phone);
    const memberName = (mm.name || '').trim();
    const proxies = db.prepare(
      `SELECT id, submitter_name, submitter_phone FROM proxies
       WHERE meeting_id = ? AND status = 'submitted'`
    ).all(mm.meeting_id);
    const matched = proxies.find(p =>
      (p.submitter_name || '').trim() === memberName &&
      normalizePhone(p.submitter_phone) === memberPhoneNorm
    );
    if (matched) {
      return res.status(400).json({
        error: `이 의원은 이미 위임장을 제출했습니다.\n출석 처리하려면 위임장 탭에서 해당 위임장을 먼저 삭제하세요.`,
        proxyId: matched.id
      });
    }
  }

  const existing = db.prepare('SELECT id FROM attendances WHERE meeting_member_id = ?').get(meeting_member_id);
  const checkedAt = new Date().toLocaleString('sv-SE');
  if (existing) {
    db.prepare('UPDATE attendances SET status = ?, checked_at = ? WHERE id = ?').run(status, checkedAt, existing.id);
  } else {
    db.prepare('INSERT INTO attendances (meeting_member_id, status, checked_at) VALUES (?, ?, ?)')
      .run(meeting_member_id, status, checkedAt);
  }
  res.json({ ok: true });
});

// === POST: 순번 일괄 변경 (드래그 reorder) ===
router.post('/reorder', authRequired, (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items 필요' });
  // 첫 row 의 meeting_id 로 권한 검증
  const first = db.prepare('SELECT meeting_id FROM meeting_members WHERE id = ?').get(items[0].id);
  if (!first) return res.status(404).json({ error: '의원을 찾을 수 없습니다.' });
  const orgId = getOrgIdFromMeeting(first.meeting_id);
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  const upd = db.prepare('UPDATE meeting_members SET seq = ? WHERE id = ?');
  const tx = db.transaction(() => items.forEach(it => upd.run(it.seq, it.id)));
  tx();
  res.json({ ok: true });
});

// === 의원 초대장 이메일 발송 (선택 / 일괄) ===
//   body: { meeting_id, meeting_member_ids?: [id,...] }
//     meeting_member_ids 미지정 시 → 전체 의원
router.post('/send-invitations', authRequired, async (req, res) => {
  const { meeting_id, meeting_member_ids } = req.body || {};
  if (!meeting_id) return res.status(400).json({ error: 'meeting_id 필요' });
  const orgId = getOrgIdFromMeeting(meeting_id);
  if (!orgId || !isAdmin(getOrgRole(req.user, orgId))) {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }

  const emailModule = require('../email');
  if (!emailModule.isEnabled()) {
    return res.status(400).json({ error: '이메일 발송이 설정되지 않았습니다.\n시스템 관리자에게 문의해주세요.' });
  }

  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meeting_id);
  if (!meeting) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(meeting.organization_id);

  // 대상 의원
  let members;
  if (Array.isArray(meeting_member_ids) && meeting_member_ids.length) {
    const placeholders = meeting_member_ids.map(() => '?').join(',');
    members = db.prepare(
      `SELECT id, name, email FROM meeting_members WHERE meeting_id = ? AND id IN (${placeholders})`
    ).all(meeting_id, ...meeting_member_ids);
  } else {
    members = db.prepare(
      'SELECT id, name, email FROM meeting_members WHERE meeting_id = ?'
    ).all(meeting_id);
  }
  if (!members.length) return res.status(400).json({ error: '대상 의원이 없습니다.' });

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host') || 'localhost';
  const baseUrl = `${protocol}://${host}`;

  const dateStr = meeting.meeting_date ? String(meeting.meeting_date).replace('T', ' ').slice(0, 16) : '';
  const customMessage = (meeting.invitation_message || '').replace(/</g,'&lt;').replace(/\n/g, '<br>');
  const escape = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const results = { sent: 0, skipped: 0, failed: 0, errors: [] };
  for (const m of members) {
    if (!m.email || !/.+@.+\..+/.test(m.email)) {
      results.skipped++;
      results.errors.push(`${m.name}: 이메일 없음`);
      continue;
    }
    const subject = `[${org?.name || 'SmartMeet'}] ${meeting.title} 초대 안내`;
    const html = `
      <div style="font-family:'Pretendard','Malgun Gothic',sans-serif;max-width:560px;margin:auto;padding:24px;color:#1a202c;">
        <div style="background:linear-gradient(135deg,#0f2c5c,#1e40af);color:#fff;padding:28px;border-radius:12px;text-align:center;">
          <div style="font-size:13px;color:#fbbf24;letter-spacing:2px;margin-bottom:8px;">📩 MEETING INVITATION</div>
          <h1 style="font-size:22px;font-weight:800;margin:8px 0;color:#fff;">${escape(org?.name || '')}</h1>
          <h2 style="font-size:16px;font-weight:600;margin:0;color:#dbeafe;">${escape(meeting.title || '')}</h2>
        </div>
        <div style="margin:24px 0;">
          <p style="font-size:15px;color:#374151;">안녕하세요, <strong>${escape(m.name || '')}</strong> 님.</p>
          ${customMessage ? `<div style="background:#f9fafb;padding:14px 18px;border-radius:8px;margin:14px 0;border-left:4px solid #fbbf24;font-size:14px;line-height:1.7;">${customMessage}</div>` : ''}
          <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:13px;">
            ${dateStr ? `<tr><td style="padding:6px 10px;color:#64748b;">일시</td><td style="padding:6px 10px;font-weight:600;">${dateStr}</td></tr>` : ''}
            ${meeting.location ? `<tr><td style="padding:6px 10px;color:#64748b;">장소</td><td style="padding:6px 10px;font-weight:600;">${escape(meeting.location || '')}</td></tr>` : ''}
          </table>
          <p style="font-size:14px;color:#374151;line-height:1.7;">
            많은 참석 부탁드립니다.
          </p>
        </div>
        <div style="border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;font-size:11px;color:#94a3b8;">
          본 메일은 ${escape(org?.name || 'SmartMeet')} 의 시스템에서 자동 발송되었습니다.
        </div>
      </div>
    `;
    const text = `[${org?.name || ''}] ${meeting.title}\n\n${m.name} 님,\n\n일시: ${dateStr}\n장소: ${meeting.location || ''}\n\n많은 참석 부탁드립니다.`;
    try {
      await emailModule.sendEmail({ to: m.email, subject, html, text });
      results.sent++;
      // 발송 이력 갱신
      try {
        const now = new Date().toLocaleString('sv-SE');
        db.prepare('UPDATE meeting_members SET invitation_sent_at = ? WHERE id = ?').run(now, m.id);
      } catch {}
    } catch (e) {
      results.failed++;
      results.errors.push(`${m.name} (${m.email}): ${e.message}`);
      console.warn('[invitation email] 발송 실패:', m.email, e.message);
    }
  }

  res.json(results);
});

module.exports = router;
