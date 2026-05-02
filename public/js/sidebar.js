// Renders sidebar for org/meeting pages.
// opts: { meetingId, meeting, role }
// 일반회원에게는 사이드바를 표시하지 않음 (관리자 전용).
function renderOrgSidebar(org, currentKey, opts = {}) {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  const orgId = org.id;
  const meetingId = opts.meetingId || null;
  const role = opts.role || (org.my_role) || 'member';
  const isAdmin = role === 'system_admin' || role === 'admin';

  // 일반회원: 사이드바 숨기고 메인을 풀너비로
  if (!isAdmin) {
    const app = document.querySelector('.app');
    if (app) {
      app.style.gridTemplateColumns = '1fr';
      sb.style.display = 'none';
    }
    return;
  }

  // Items everyone can see
  const orgItems = [
    { key: 'home', label: '기관 홈', icon: '🏠', href: `/home?org=${orgId}` },
    { key: 'notices', label: '공지사항', icon: '📣', href: `/notices?org=${orgId}` },
    { key: 'board', label: '게시판', icon: '💬', href: `/board?org=${orgId}` },
    { key: 'meetings-list', label: '이벤트 리스트', icon: '📋', href: `/meetings?org=${orgId}` },
    { key: 'schedule', label: '주요 일정', icon: '🗓️', href: `/schedule?org=${orgId}` },
    { key: 'executives', label: '임원 명단', icon: '👥', href: `/executives?org=${orgId}` },
    { key: 'presidents', label: '역대 회장', icon: '👑', href: `/presidents?org=${orgId}` },
    { key: 'pocketbook', label: '회원 전자수첩', icon: '📒', href: `/pocketbook?org=${orgId}` },
    { key: 'charter', label: '정관', icon: '📜', href: `/charter?org=${orgId}` },
    { key: 'orgchart', label: '조직도', icon: '🏛️', href: `/orgchart?org=${orgId}` },
  ];

  // Admin-only items
  const adminItems = isAdmin ? [
    { key: 'dashboard', label: '관리 대시보드', icon: '📊', href: `/organization?id=${orgId}` },
    { key: 'org-members', label: '구성원·초대', icon: '🔑', href: `/org-members?org=${orgId}` },
  ] : [];

  const meetingItems = meetingId ? [
    { key: 'meeting', label: '이벤트 메인', icon: '📋', href: `/meeting?id=${meetingId}` },
    { key: 'minutes', label: '회의록 출력', icon: '🖨️', href: `/minutes?id=${meetingId}` },
    { key: 'presentation', label: '프레젠테이션', icon: '📺', href: `/presentation?id=${meetingId}` },
  ] : [];

  const roleBadge = role === 'system_admin'
    ? '<span class="tag tag-status-progress" style="font-size:10px;padding:2px 6px;">시스템</span>'
    : role === 'admin'
    ? '<span class="tag tag-status-progress" style="font-size:10px;padding:2px 6px;">관리자</span>'
    : '<span class="tag tag-status-prep" style="font-size:10px;padding:2px 6px;">회원</span>';

  sb.innerHTML = `
    <div class="brand">
      <div class="brand-mark">${logoText(org.name)}</div>
      <div>
        <div class="brand-name">${org.name}</div>
        <div class="brand-sub">${roleBadge}</div>
      </div>
    </div>
    <a href="/dashboard" class="nav-item" style="font-size:12px;color:var(--text-muted);">← 기관 목록</a>
    <div class="nav-section-title">기관</div>
    ${orgItems.map(it => `<a href="${it.href}" class="nav-item ${currentKey === it.key ? 'active' : ''}"><span class="icon">${it.icon}</span> ${it.label}</a>`).join('')}
    ${adminItems.length ? `
      <div class="nav-section-title">관리자</div>
      ${adminItems.map(it => `<a href="${it.href}" class="nav-item ${currentKey === it.key ? 'active' : ''}"><span class="icon">${it.icon}</span> ${it.label}</a>`).join('')}
    ` : ''}
    ${meetingItems.length ? `
      <div class="nav-section-title">현재 이벤트</div>
      ${meetingItems.map(it => `<a href="${it.href}" class="nav-item ${currentKey === it.key ? 'active' : ''}"><span class="icon">${it.icon}</span> ${it.label}</a>`).join('')}
    ` : ''}
  `;
}
