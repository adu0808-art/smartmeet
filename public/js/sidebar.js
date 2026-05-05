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

  // Admin-only items — 관리 대시보드는 제거 (기관관리에서 ⚙️ 관리 버튼 사용)
  const adminItems = isAdmin ? [
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

  // SPA shell 모드 안에서 (iframe 내부) 인 경우 사이드바를 숨기고 끝냄 — 부모 창의 사이드바만 보이게
  const isInsideShell = (function() {
    try { return window.parent !== window && window.parent.location.pathname; }
    catch { return false; }
  })();

  sb.innerHTML = `
    <div class="brand">
      <div class="brand-mark">${logoText(org.name)}</div>
      <div>
        <div class="brand-name">${org.name}</div>
        <div class="brand-sub">${roleBadge}</div>
      </div>
    </div>
    <a href="/dashboard" class="nav-item" data-shell-skip="1" style="font-size:12px;color:var(--text-muted);">← 기관 목록</a>
    ${orgItems.map(it => `<a href="${it.href}" data-shell-key="${it.key}" class="nav-item ${currentKey === it.key ? 'active' : ''}"><span class="icon">${it.icon}</span> ${it.label}</a>`).join('')}
    ${adminItems.length ? `
      ${adminItems.map(it => `<a href="${it.href}" data-shell-key="${it.key}" class="nav-item ${currentKey === it.key ? 'active' : ''}"><span class="icon">${it.icon}</span> ${it.label}</a>`).join('')}
    ` : ''}
    ${meetingItems.length ? `
      <div class="nav-section-title">현재 이벤트</div>
      ${meetingItems.map(it => `<a href="${it.href}" data-shell-key="${it.key}" class="nav-item ${currentKey === it.key ? 'active' : ''}"><span class="icon">${it.icon}</span> ${it.label}</a>`).join('')}
    ` : ''}
  `;

  // SPA shell 네비게이션 — 사이드바 클릭 시 iframe 으로 우측 영역만 교체
  //   현재 페이지가 embed 모드(부모 shell 안의 iframe)인 경우엔 동작 안 함
  if (!document.body.classList.contains('embed')) {
    bindShellNav(sb);
  }
  // 모바일 햄버거 드로어 활성화
  enableMobileSidebar();
}

// ====== 모바일 사이드바 (햄버거 드로어) ======
//   - 토픽바 좌측에 햄버거 버튼 자동 삽입
//   - 사이드바를 화면 밖에 위치시키고 드로어로 슬라이드 인/아웃
//   - 백드롭 클릭 또는 nav-item 클릭 시 자동 닫힘
function enableMobileSidebar() {
  // embed 모드(부모 shell 안의 iframe)는 자체 사이드바 없음
  if (document.body && document.body.classList.contains('embed')) return;
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  // 비어있는 사이드바 (일반 회원·아직 미렌더 등) → 일단 건너뜀, 다음 호출 때 다시 시도
  const hasContent = sb.children.length > 0 && sb.style.display !== 'none';
  if (!hasContent) return;

  document.body.classList.add('has-sidebar');

  // 햄버거 버튼이 이미 삽입돼 있으면 skip
  if (document.querySelector('.topbar-burger')) return;

  const topbar = document.querySelector('.topbar');
  if (!topbar) return;

  const burger = document.createElement('button');
  burger.type = 'button';
  burger.className = 'topbar-burger';
  burger.setAttribute('aria-label', '메뉴 열기');
  burger.innerHTML = '☰';
  topbar.insertBefore(burger, topbar.firstChild);

  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  const open = () => {
    sb.classList.add('open');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    sb.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  };

  burger.addEventListener('click', () => {
    sb.classList.contains('open') ? close() : open();
  });
  backdrop.addEventListener('click', close);

  // 사이드바 안의 nav-item 클릭 시 자동 닫힘
  sb.addEventListener('click', (e) => {
    const a = e.target.closest('a.nav-item');
    if (a) close();
  });

  // 화면 크기 변경 시 (모바일 → 데스크톱 전환) 드로어 닫기
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && sb.classList.contains('open')) close();
  });
}

// admin/dashboard 등 hardcoded 사이드바 페이지를 위한 자동 초기화
(function _autoInitMobileSidebar() {
  const tryInit = () => {
    try { enableMobileSidebar(); } catch {}
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit, { once: true });
  } else {
    setTimeout(tryInit, 0);
  }
})();

// 사이드바 클릭 → iframe 기반으로 우측 콘텐츠만 교체 (전체 페이지 새로고침 없음)
function bindShellNav(sb) {
  sb.querySelectorAll('a.nav-item[data-shell-key]').forEach(a => {
    a.addEventListener('click', (e) => {
      // Cmd/Ctrl/Shift + click 은 새 탭이므로 통과
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('/')) return;
      e.preventDefault();
      shellLoad(href, a);
    });
  });
}

function shellLoad(href, navEl) {
  const main = document.querySelector('.main');
  if (!main) { location.href = href; return; }
  // 한 번만 만드는 iframe — 이후엔 src 교체만
  let frame = document.getElementById('shellFrame');
  if (!frame) {
    // 기존 .content 숨김 + iframe 삽입
    const existing = main.querySelectorAll('.content, .container');
    existing.forEach(el => el.style.display = 'none');
    frame = document.createElement('iframe');
    frame.id = 'shellFrame';
    frame.className = 'shell-frame';
    frame.title = '본문';
    main.appendChild(frame);
    // popstate 처리 (뒤로가기/앞으로가기)
    if (!window._shellPopBound) {
      window._shellPopBound = true;
      window.addEventListener('popstate', (e) => {
        if (e.state && e.state.shell) {
          frame.src = _withEmbed(e.state.shell);
          _highlightNavByHref(e.state.shell);
        } else {
          // 비-shell 상태로 복귀 → 그냥 리로드
          location.reload();
        }
      });
    }
  }
  frame.src = _withEmbed(href);
  history.pushState({ shell: href }, '', href);
  _highlightNavByHref(href);
}

function _withEmbed(href) {
  try {
    const u = new URL(href, location.origin);
    u.searchParams.set('embed', '1');
    return u.pathname + (u.search ? u.search : '') + (u.hash || '');
  } catch { return href; }
}

function _highlightNavByHref(href) {
  document.querySelectorAll('.sidebar .nav-item').forEach(n => n.classList.remove('active'));
  const target = document.querySelector(`.sidebar a.nav-item[href="${CSS.escape(href)}"]`);
  if (target) target.classList.add('active');
}
