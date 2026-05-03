const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth-mw');
const { requireOrg, getOrgIdFromMember, getOrgIdFromMeeting, getOrgRole, isAdmin } = require('../permissions');

const router = express.Router();
router.use(authRequired);

// 임원명단 (members) — org 단위 조회만 (회의 의원은 별도 endpoint 사용)
router.get('/', requireOrg(req => req.query.organization_id, 'read'), (req, res) => {
  const { q } = req.query;
  let rows = db.prepare('SELECT * FROM members WHERE organization_id = ? ORDER BY seq ASC, id ASC').all(req.orgId);
  if (q) {
    const qq = q.toLowerCase();
    rows = rows.filter(m =>
      (m.name || '').toLowerCase().includes(qq) ||
      (m.position || '').toLowerCase().includes(qq) ||
      (m.phone || '').includes(qq)
    );
  }
  res.json({ members: rows });
});

// 기수 내 임원의 seq 를 1부터 빈 칸 없이 재정렬
//   현재 seq 와 id 순서를 기준으로 정렬한 뒤 1, 2, 3, ... 로 재할당
//   임원 추가/삭제/수정 후 호출하여 항상 깔끔한 순번 유지
function normalizeSeqInGeneration(orgId, generation) {
  const rows = db.prepare(
    `SELECT id FROM members
     WHERE organization_id = ? AND COALESCE(generation, '') = ?
     ORDER BY (seq IS NULL) ASC, seq ASC, id ASC`
  ).all(orgId, generation || '');
  const upd = db.prepare('UPDATE members SET seq = ? WHERE id = ?');
  const tx = db.transaction(() => rows.forEach((r, i) => upd.run(i + 1, r.id)));
  tx();
}

// 모든 기수의 seq 를 한꺼번에 재정렬 (bulk 작업 후 사용)
function normalizeAllSeq(orgId) {
  const gens = db.prepare(
    `SELECT DISTINCT COALESCE(generation, '') AS gen FROM members WHERE organization_id = ?`
  ).all(orgId);
  gens.forEach(g => normalizeSeqInGeneration(orgId, g.gen));
}

// 임원명단의 전화번호 중복 검사 — 같은 기수 내에서만 비교
//   다른 기수에 같은 사람이 등재되는 경우 허용 (예: 제27대 회장 → 제28대 회장)
//   - phone 정규화 (숫자만 추출) 후 비교
//   - excludeId 가 있으면 본인은 제외 (수정 시 본인의 기존 phone 은 통과)
function normalizePhone(s) { return String(s || '').replace(/\D/g, ''); }

function findDuplicatePhone(orgId, generation, phone, excludeId) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const params = [orgId, generation || ''];
  let q = `SELECT id, name, phone FROM members WHERE organization_id = ? AND COALESCE(generation,'') = ?`;
  if (excludeId) { q += ' AND id != ?'; params.push(excludeId); }
  const rows = db.prepare(q).all(...params);
  return rows.find(r => normalizePhone(r.phone) === normalized) || null;
}

router.post('/', requireOrg(req => req.body.organization_id, 'write'), (req, res) => {
  const { seq, position, name, phone, email, major, workplace, generation, photo } = req.body || {};
  if (!name) return res.status(400).json({ error: '성명을 입력하세요.' });
  const phoneDigits = normalizePhone(phone);
  if (!phoneDigits) return res.status(400).json({ error: '전화번호는 필수입니다.' });
  const dup = findDuplicatePhone(req.orgId, generation, phoneDigits);
  if (dup) {
    return res.status(400).json({ error: `같은 기수에 이미 등록된 전화번호입니다 — ${dup.name} (${dup.phone || ''})` });
  }
  const lastSeq = db.prepare(
    `SELECT MAX(seq) AS m FROM members WHERE organization_id = ? AND COALESCE(generation,'') = ?`
  ).get(req.orgId, generation || '').m || 0;
  const newSeq = lastSeq + 1;
  const result = db.prepare(`
    INSERT INTO members (organization_id, seq, position, name, phone, email, major, workplace, generation, photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.orgId, newSeq, position || '', name, phoneDigits, email || '', major || '', workplace || '', generation || '', photo || '');
  normalizeSeqInGeneration(req.orgId, generation);
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
  res.json({ member });
});

// ====== 회의 의원 (meeting_members) 라우트는 별도 파일 (meeting-members.js) 로 분리

router.post('/bulk', requireOrg(req => req.body.organization_id, 'write'), (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ error: '필수값 누락' });
  // 검증: 이름·전화 필수, 같은 기수 내 중복 차단
  const seen = new Map();  // key = "generation|normalizedPhone"
  const errors = [];
  const validItems = [];
  for (const it of items) {
    if (!it.name) continue;
    const phone = String(it.phone || '').trim();
    const normalized = normalizePhone(phone);
    if (!normalized) {
      errors.push(`전화번호 누락: ${it.name}`);
      continue;
    }
    const gen = it.generation || '';
    const key = `${gen}|${normalized}`;
    if (seen.has(key)) {
      errors.push(`엑셀 내 중복: ${it.name} / ${phone} (기수 ${gen || '없음'}) — ${seen.get(key)} 와 중복`);
      continue;
    }
    const dbDup = findDuplicatePhone(req.orgId, gen, phone);
    if (dbDup) {
      errors.push(`기존 데이터와 중복: ${it.name} / ${phone} (기수 ${gen || '없음'}) — 이미 ${dbDup.name} 으로 등록됨`);
      continue;
    }
    seen.set(key, it.name);
    validItems.push(it);
  }
  if (errors.length && validItems.length === 0) {
    return res.status(400).json({
      error: `등록 가능한 데이터가 없습니다:\n` + errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n... 그 외 ${errors.length - 10}건` : '')
    });
  }
  if (errors.length) {
    return res.status(400).json({
      error: `다음 항목에 문제가 있습니다 (모두 수정 후 다시 시도):\n` + errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n... 그 외 ${errors.length - 10}건` : '')
    });
  }
  const ins = db.prepare(`INSERT INTO members (organization_id, seq, position, name, phone, email, major, workplace, generation, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction((arr) => arr.forEach((it, idx) => {
    if (!it.name) return;
    ins.run(req.orgId, it.seq || idx + 1, it.position || '', it.name, normalizePhone(it.phone), it.email || '', it.major || '', it.workplace || '', it.generation || '', it.photo || '');
  }));
  tx(validItems);
  normalizeAllSeq(req.orgId);
  res.json({ ok: true, count: validItems.length });
});

router.put('/:id', requireOrg(req => getOrgIdFromMember(req.params.id), 'write'), (req, res) => {
  const { seq, position, name, phone, email, major, workplace, generation, photo } = req.body || {};
  const orgId = getOrgIdFromMember(req.params.id);
  if (!name) return res.status(400).json({ error: '성명을 입력하세요.' });
  const phoneDigits = normalizePhone(phone);
  if (!phoneDigits) return res.status(400).json({ error: '전화번호는 필수입니다.' });
  const before = db.prepare('SELECT generation FROM members WHERE id = ?').get(req.params.id);
  const oldGen = before ? (before.generation || '') : '';
  const newGen = generation || '';
  // 같은 기수 내에서만 전화번호 중복 검사
  const dup = findDuplicatePhone(orgId, generation, phoneDigits, Number(req.params.id));
  if (dup) {
    return res.status(400).json({ error: `같은 기수에 이미 등록된 전화번호입니다 — ${dup.name} (${dup.phone || ''})` });
  }
  db.prepare(`UPDATE members SET seq=?, position=?, name=?, phone=?, email=?, major=?, workplace=?, generation=?, photo=? WHERE id = ?`)
    .run(seq || null, position || '', name, phoneDigits, email || '', major || '', workplace || '', generation || '', photo || '', req.params.id);
  // 기수가 바뀌었으면 양쪽 모두 정규화, 같으면 한 번만
  normalizeSeqInGeneration(orgId, newGen);
  if (oldGen !== newGen) normalizeSeqInGeneration(orgId, oldGen);
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  res.json({ member });
});

router.delete('/:id', requireOrg(req => getOrgIdFromMember(req.params.id), 'write'), (req, res) => {
  const orgId = getOrgIdFromMember(req.params.id);
  const before = db.prepare('SELECT generation FROM members WHERE id = ?').get(req.params.id);
  const gen = before ? (before.generation || '') : '';
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  // 삭제된 임원의 기수에서 seq 빈 칸 메우기
  if (orgId) normalizeSeqInGeneration(orgId, gen);
  res.json({ ok: true });
});

router.post('/reorder', authRequired, (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items 배열 필요' });
  const orgId = getOrgIdFromMember(items[0].id);
  if (!orgId) return res.status(404).json({ error: '대상이 없습니다.' });
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  const upd = db.prepare('UPDATE members SET seq = ? WHERE id = ?');
  const tx = db.transaction((arr) => arr.forEach(it => upd.run(it.seq, it.id)));
  tx(items);
  res.json({ ok: true });
});

// 여러 임원에게 한 번에 기수 부여 (기수없음 → 특정 기수 일괄 이동 등)
router.post('/bulk-set-generation', authRequired, (req, res) => {
  const { ids, generation } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids 필요' });
  const orgId = getOrgIdFromMember(ids[0]);
  if (!orgId) return res.status(404).json({ error: '대상이 없습니다.' });
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  // 새 기수 부여 후 같은 기수 + 동일 전화번호 중복 검사
  const targetMembers = db.prepare(`SELECT id, name, phone FROM members WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const seen = new Map();
  const dupErrors = [];
  for (const m of targetMembers) {
    const phone = String(m.phone || '').trim();
    if (!phone) continue;
    if (seen.has(phone)) {
      dupErrors.push(`선택 내 중복: ${m.name} (${phone})`);
    } else seen.set(phone, m.name);
    // DB 의 같은 기수에 다른 임원이 같은 전화번호를 가지고 있는지
    const dbDup = db.prepare(
      'SELECT id, name FROM members WHERE organization_id = ? AND COALESCE(generation,\'\') = ? AND COALESCE(phone,\'\') = ? AND id != ?'
    ).get(orgId, generation || '', phone, m.id);
    if (dbDup) {
      dupErrors.push(`기존 ${dbDup.name} 와 중복: ${m.name} (${phone})`);
    }
  }
  if (dupErrors.length) {
    return res.status(400).json({
      error: `같은 기수의 전화번호 중복이 발견되었습니다:\n` + dupErrors.slice(0, 10).join('\n')
    });
  }
  const upd = db.prepare('UPDATE members SET generation = ? WHERE id = ?');
  const tx = db.transaction((arr) => arr.forEach(id => upd.run(generation || '', id)));
  tx(ids);
  // 기수 변경 후 모든 기수에서 seq 정규화 (어디서 빠졌고 어디로 들어갔는지 추적이 복잡 → 전체)
  normalizeAllSeq(orgId);
  res.json({ ok: true, count: ids.length });
});

router.post('/bulk-delete', authRequired, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids 필요' });
  const orgId = getOrgIdFromMember(ids[0]);
  if (!orgId) return res.status(404).json({ error: '대상이 없습니다.' });
  if (!isAdmin(getOrgRole(req.user, orgId))) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  const del = db.prepare('DELETE FROM members WHERE id = ?');
  const tx = db.transaction((arr) => arr.forEach(id => del.run(id)));
  tx(ids);
  // 일괄 삭제 후 모든 기수에서 seq 정규화
  normalizeAllSeq(orgId);
  res.json({ ok: true });
});

// 출석 endpoint 는 meeting-members.js 로 이동됨

module.exports = router;
