const db = require('./db');

// Roles (per-org):
//   'system_admin' — global admin (users.role = 'admin')
//   'admin'        — org owner OR organization_members.member_role IN ('admin')
//   'member'       — organization_members.member_role IN ('member', 'staff')
//   null           — no access

function getOrgRole(user, organizationId) {
  if (!user) return null;
  if (user.role === 'admin') return 'system_admin';
  const orgIdNum = Number(organizationId);
  if (!orgIdNum) return null;
  const org = db.prepare('SELECT owner_id FROM organizations WHERE id = ?').get(orgIdNum);
  if (!org) return null;
  if (org.owner_id === user.id) return 'admin';
  const m = db.prepare('SELECT member_role FROM organization_members WHERE organization_id = ? AND user_id = ?').get(orgIdNum, user.id);
  if (!m) return null;
  if (m.member_role === 'admin') return 'admin';
  return 'member';
}

const isAdmin = (role) => role === 'system_admin' || role === 'admin';

function getOrgIdFromMeeting(meetingId) {
  const r = db.prepare('SELECT organization_id FROM meetings WHERE id = ?').get(meetingId);
  return r ? r.organization_id : null;
}
function getOrgIdFromAgenda(agendaId) {
  const r = db.prepare('SELECT meeting_id FROM agendas WHERE id = ?').get(agendaId);
  return r ? getOrgIdFromMeeting(r.meeting_id) : null;
}
function getOrgIdFromTocItem(id) {
  const r = db.prepare('SELECT meeting_id FROM toc_items WHERE id = ?').get(id);
  return r ? getOrgIdFromMeeting(r.meeting_id) : null;
}
function getOrgIdFromMember(id) {
  const r = db.prepare('SELECT organization_id FROM members WHERE id = ?').get(id);
  return r ? r.organization_id : null;
}
function getOrgIdFromSchedule(id) {
  const r = db.prepare('SELECT organization_id FROM schedules WHERE id = ?').get(id);
  return r ? r.organization_id : null;
}
function getOrgIdFromCharterVersion(id) {
  const r = db.prepare('SELECT organization_id FROM charter_versions WHERE id = ?').get(id);
  return r ? r.organization_id : null;
}
function getOrgIdFromOrgChartVersion(id) {
  const r = db.prepare('SELECT organization_id FROM org_chart_versions WHERE id = ?').get(id);
  return r ? r.organization_id : null;
}
function getOrgIdFromProxy(id) {
  const r = db.prepare('SELECT meeting_id FROM proxies WHERE id = ?').get(id);
  return r ? getOrgIdFromMeeting(r.meeting_id) : null;
}
function getOrgIdFromNotice(id) {
  const r = db.prepare('SELECT organization_id FROM notices WHERE id = ?').get(id);
  return r ? r.organization_id : null;
}
function getOrgIdFromPost(id) {
  const r = db.prepare('SELECT organization_id FROM posts WHERE id = ?').get(id);
  return r ? r.organization_id : null;
}
function getOrgIdFromComment(id) {
  const r = db.prepare('SELECT post_id FROM comments WHERE id = ?').get(id);
  return r ? getOrgIdFromPost(r.post_id) : null;
}
function getOrgIdFromInvitation(id) {
  const r = db.prepare('SELECT organization_id FROM invitations WHERE id = ?').get(id);
  return r ? r.organization_id : null;
}

// Express middleware: requires user is logged-in (use with authRequired before this)
// orgIdGetter: number, string, or function(req)->number
// level: 'read' (any role) or 'write' (admin/system_admin)
function requireOrg(orgIdGetter, level = 'read') {
  return (req, res, next) => {
    let id = typeof orgIdGetter === 'function' ? orgIdGetter(req) : orgIdGetter;
    id = Number(id);
    if (!id) return res.status(400).json({ error: '기관 정보가 누락되었습니다.' });
    const role = getOrgRole(req.user, id);
    if (!role) return res.status(403).json({ error: '해당 기관에 접근 권한이 없습니다.' });
    if (level === 'write' && !isAdmin(role)) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    req.orgRole = role;
    req.orgId = id;
    next();
  };
}

module.exports = {
  getOrgRole, isAdmin, requireOrg,
  getOrgIdFromMeeting, getOrgIdFromAgenda, getOrgIdFromTocItem,
  getOrgIdFromMember, getOrgIdFromSchedule, getOrgIdFromCharterVersion,
  getOrgIdFromOrgChartVersion,
  getOrgIdFromProxy, getOrgIdFromNotice, getOrgIdFromPost,
  getOrgIdFromComment, getOrgIdFromInvitation
};
