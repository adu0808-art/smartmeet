const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth-mw');
const { requireOrg, getOrgIdFromMeeting } = require('../permissions');

const router = express.Router();
router.use(authRequired);

router.get('/', requireOrg(req => req.query.organization_id, 'read'), (req, res) => {
  const rows = db.prepare('SELECT * FROM meetings WHERE organization_id = ? ORDER BY meeting_date DESC').all(req.orgId);
  res.json({ meetings: rows });
});

// 이벤트 정보를 일정 항목으로 변환 (제목·시작/종료 일자·시각·설명)
//   meeting_type 별 아이콘 + 시작/종료 시각 + 장소 포함
//   여러 날 걸친 이벤트는 endDate 도 반환되어 일정 캘린더에 day 범위로 표시됨
function meetingToScheduleFields(meeting) {
  const escape = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const date = String(meeting.meeting_date || '').slice(0, 10);  // YYYY-MM-DD
  const endDate = meeting.end_date ? String(meeting.end_date).slice(0, 10) : '';
  // end_date 가 시작일과 같거나 비어있으면 단일 일정 (endDate 비움)
  const finalEndDate = (endDate && endDate !== date) ? endDate : '';
  // 시각 추출 (datetime-local 'YYYY-MM-DDTHH:MM' 에서 HH:MM)
  const startMatch = String(meeting.meeting_date || '').match(/T(\d{2}:\d{2})/);
  const endMatch   = String(meeting.end_date     || '').match(/T(\d{2}:\d{2})/);
  const startTime = startMatch ? startMatch[1] : '';
  const endTime   = endMatch   ? endMatch[1]   : '';
  const typeIcon = { board: '📋', general: '📋', regular: '📋', event: '🎉' };
  const typeLabel = { board: '이사회', general: '총회', regular: '일반', event: '행사' };
  const icon = typeIcon[meeting.meeting_type] || '📋';
  const tlabel = typeLabel[meeting.meeting_type] || '';
  const title = `${icon} ${meeting.title}`;
  const parts = [];
  if (tlabel) parts.push(`<p><strong>구분:</strong> ${tlabel}</p>`);
  if (startTime) parts.push(`<p><strong>시작:</strong> ${startTime}</p>`);
  if (meeting.end_date) {
    if (endDate === date) {
      if (endTime) parts.push(`<p><strong>종료:</strong> ${endTime}</p>`);
    } else {
      parts.push(`<p><strong>종료:</strong> ${endDate}${endTime ? ' ' + endTime : ''}</p>`);
    }
  }
  if (meeting.location) parts.push(`<p><strong>장소:</strong> ${escape(meeting.location)}</p>`);
  parts.push(`<p style="color:#64748b;font-size:13px;margin-top:8px;">※ 이 일정은 이벤트 등록 시 자동 생성되었습니다. 수정·삭제는 이벤트 관리에서 진행해주세요.</p>`);
  return { title, date, endDate: finalEndDate, startTime, endTime, description: parts.join('') };
}

router.post('/', requireOrg(req => req.body.organization_id, 'write'), (req, res) => {
  const { title, meeting_type, meeting_date, end_date, location, total_members, quorum_ratio, pass_ratio } = req.body || {};
  if (!title) return res.status(400).json({ error: '제목 누락' });
  const memberCount = db.prepare('SELECT COUNT(*) AS c FROM members WHERE organization_id = ?').get(req.orgId).c;
  const total = total_members || memberCount;
  const result = db.prepare(`
    INSERT INTO meetings (organization_id, title, meeting_type, meeting_date, end_date, location, total_members, quorum_ratio, pass_ratio, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'preparing')
  `).run(req.orgId, title, meeting_type || 'board', meeting_date || '', end_date || '', location || '', total, quorum_ratio || 0.5, pass_ratio || 0.5);
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(result.lastInsertRowid);

  // 행사(event) 타입이면 자유신청용 공개 토큰 자동 발급
  if (meeting.meeting_type === 'event' && !meeting.public_register_token) {
    const { v4: uuidv4 } = require('uuid');
    const token = uuidv4();
    db.prepare('UPDATE meetings SET public_register_token = ? WHERE id = ?').run(token, meeting.id);
    meeting.public_register_token = token;
  }

  // ★ 이벤트 등록 → 일정 자동 등록 (날짜가 있을 때만)
  if (meeting.meeting_date) {
    try {
      const sf = meetingToScheduleFields(meeting);
      if (sf.date) {
        db.prepare('INSERT INTO schedules (organization_id, title, schedule_date, end_date, start_time, end_time, description, meeting_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(req.orgId, sf.title, sf.date, sf.endDate || null, sf.startTime || null, sf.endTime || null, sf.description, meeting.id);
      }
    } catch (e) { console.warn('[meetings] auto schedule insert failed:', e.message); }
  }

  res.json({ meeting });
});

router.get('/:id', requireOrg(req => getOrgIdFromMeeting(req.params.id), 'read'), (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  if (!meeting) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });
  // total_members = 이 회의에 등록된 의원 수 (meeting_members 기준)
  meeting.total_members = db.prepare(
    'SELECT COUNT(*) AS c FROM meeting_members WHERE meeting_id = ?'
  ).get(req.params.id).c;
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(meeting.organization_id);
  res.json({ meeting, organization: org, my_role: req.orgRole });
});

router.put('/:id', requireOrg(req => getOrgIdFromMeeting(req.params.id), 'write'), (req, res) => {
  const { title, meeting_type, meeting_date, end_date, location, total_members, quorum_ratio, pass_ratio, status, invitation_message } = req.body || {};
  db.prepare(`
    UPDATE meetings SET
      title = COALESCE(?, title),
      meeting_type = COALESCE(?, meeting_type),
      meeting_date = COALESCE(?, meeting_date),
      end_date = COALESCE(?, end_date),
      location = COALESCE(?, location),
      total_members = COALESCE(?, total_members),
      quorum_ratio = COALESCE(?, quorum_ratio),
      pass_ratio = COALESCE(?, pass_ratio),
      status = COALESCE(?, status),
      invitation_message = COALESCE(?, invitation_message)
    WHERE id = ?
  `).run(title, meeting_type, meeting_date, end_date, location, total_members, quorum_ratio, pass_ratio, status, invitation_message, req.params.id);
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);

  // 행사 타입으로 변경되면 공개 토큰 발급 (없으면)
  if (meeting.meeting_type === 'event' && !meeting.public_register_token) {
    const { v4: uuidv4 } = require('uuid');
    const token = uuidv4();
    db.prepare('UPDATE meetings SET public_register_token = ? WHERE id = ?').run(token, meeting.id);
    meeting.public_register_token = token;
  }

  // ★ 연결된 일정 동기화 (제목·시작/종료 일자·시각·장소 변경 시 일정도 갱신)
  try {
    const sf = meetingToScheduleFields(meeting);
    const linked = db.prepare('SELECT id FROM schedules WHERE meeting_id = ?').get(req.params.id);
    if (linked && sf.date) {
      db.prepare('UPDATE schedules SET title = ?, schedule_date = ?, end_date = ?, start_time = ?, end_time = ?, description = ? WHERE id = ?')
        .run(sf.title, sf.date, sf.endDate || null, sf.startTime || null, sf.endTime || null, sf.description, linked.id);
    } else if (linked && !sf.date) {
      db.prepare('DELETE FROM schedules WHERE id = ?').run(linked.id);
    } else if (!linked && sf.date) {
      db.prepare('INSERT INTO schedules (organization_id, title, schedule_date, end_date, start_time, end_time, description, meeting_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(meeting.organization_id, sf.title, sf.date, sf.endDate || null, sf.startTime || null, sf.endTime || null, sf.description, meeting.id);
    }
  } catch (e) { console.warn('[meetings] auto schedule sync failed:', e.message); }

  res.json({ meeting });
});

router.delete('/:id', requireOrg(req => getOrgIdFromMeeting(req.params.id), 'write'), (req, res) => {
  try {
    const exists = db.prepare('SELECT id FROM meetings WHERE id = ?').get(req.params.id);
    if (!exists) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });
    // 트랜잭션으로 안전하게 삭제 (FK CASCADE 가 안건·출결·proxies·toc_items 모두 정리)
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM meetings WHERE id = ?').run(req.params.id);
    });
    tx();
    res.json({ ok: true });
  } catch (e) {
    console.error('[meetings DELETE] failed:', e);
    res.status(500).json({ error: '삭제 실패: ' + (e.message || '알 수 없는 오류') });
  }
});

router.get('/:id/quorum', requireOrg(req => getOrgIdFromMeeting(req.params.id), 'read'), (req, res) => {
  const meetingId = req.params.id;
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId);
  if (!meeting) return res.status(404).json({ error: '회의 없음' });

  // 현장 출석 의원 (name + phone 정규화)
  const presentMembers = db.prepare(`
    SELECT mm.name, mm.phone FROM attendances a
    INNER JOIN meeting_members mm ON mm.id = a.meeting_member_id
    WHERE mm.meeting_id = ? AND a.status = 'present'
  `).all(meetingId);
  const present = presentMembers.length;
  const normalizePhone = (s) => String(s || '').replace(/\D/g, '');
  const presentKeys = new Set(presentMembers.map(m => `${(m.name || '').trim()}|${normalizePhone(m.phone)}`));

  // 위임장 제출 — 단, 같은 인물이 출석 체크된 경우는 제외 (이중 카운트 방지)
  const submittedProxies = db.prepare(
    `SELECT submitter_name, submitter_phone FROM proxies WHERE meeting_id = ? AND status = 'submitted'`
  ).all(meetingId);
  const proxyCount = submittedProxies.filter(p => {
    const k = `${(p.submitter_name || '').trim()}|${normalizePhone(p.submitter_phone)}`;
    return !presentKeys.has(k);
  }).length;

  // total = 이 회의에 등록된 의원 수
  const total = db.prepare('SELECT COUNT(*) AS c FROM meeting_members WHERE meeting_id = ?').get(meetingId).c;
  const target = Math.ceil(total * (meeting.quorum_ratio || 0.5));
  const attended = present + proxyCount;
  const majority = Math.floor(attended / 2) + 1;
  res.json({ total, present, proxy: proxyCount, attended, target, quorumMet: attended >= target, majority });
});

module.exports = router;
