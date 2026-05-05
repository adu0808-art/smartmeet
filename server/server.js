const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3030;

// Railway / proxy 뒤에서 X-Forwarded-* 헤더 신뢰 (정확한 host·protocol 인식)
app.set('trust proxy', 1);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(cookieParser());

// =====================================================
// 도메인 → 기관 자동 라우팅 미들웨어
//   - 환경변수 PLATFORM_DOMAIN (예: "smartmeet.co.kr") 의 서브도메인 매칭
//   - 또는 organizations.custom_domain 일치
//   - 매칭되면 req.orgFromDomain 에 org_id 주입
//   - 페이지 루트(/, /home) 진입 시 → /home?org=X 로 자동 리다이렉트
// =====================================================
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || '';
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'admin', 'app', 'mail', 'static', 'cdn']);

app.use((req, res, next) => {
  try {
    const host = (req.hostname || '').toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.up.railway.app') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return next();
    }

    let org = null;

    // 1) custom_domain 정확 일치
    org = db.prepare('SELECT id FROM organizations WHERE LOWER(custom_domain) = ?').get(host);

    // 2) PLATFORM_DOMAIN 의 서브도메인 매칭
    if (!org && PLATFORM_DOMAIN && host.endsWith('.' + PLATFORM_DOMAIN.toLowerCase())) {
      const sub = host.slice(0, -('.' + PLATFORM_DOMAIN).length).toLowerCase();
      if (sub && !RESERVED_SUBDOMAINS.has(sub) && !sub.includes('.')) {
        org = db.prepare('SELECT id FROM organizations WHERE LOWER(subdomain) = ?').get(sub);
      }
    }

    if (org) {
      req.orgFromDomain = org.id;
      // 페이지 루트 진입 시 자동으로 해당 기관 홈으로 이동
      if (req.method === 'GET' && (req.path === '/' || req.path === '/home') && !req.query.org) {
        const qs = new URLSearchParams(req.query);
        qs.set('org', String(org.id));
        return res.redirect('/home?' + qs.toString());
      }
    }
  } catch (e) {
    console.warn('[domain-routing] error:', e.message);
  }
  next();
});

// =====================================================
// RSVP 원클릭 응답 — 초대장 메일의 [참석] / [불참] 버튼이 직접 호출
//   GET /rsvp-action?token=XXX&action=attending|declined
//   서버에서 즉시 응답을 기록하고 미니 확인 화면을 HTML로 렌더 (별도 페이지 단계 없음)
// =====================================================
function _escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _renderRsvpResultPage({ icon, title, color, message, meeting, org, action, token }) {
  const dateStr = meeting?.meeting_date ? String(meeting.meeting_date).replace('T', ' ').slice(0, 16) : '';
  // 반대 응답으로 변경 옵션
  const otherAction = action === 'attending' ? 'declined' : 'attending';
  const otherLabel  = otherAction === 'attending' ? '✅ 참석으로 변경' : '❌ 불참으로 변경';
  const otherColor  = otherAction === 'attending' ? '#10b981' : '#ef4444';
  const otherBg     = otherAction === 'attending' ? '#ecfdf5' : '#fef2f2';
  const switchUrl = (token && action) ? `/rsvp-action?token=${encodeURIComponent(token)}&action=${otherAction}` : null;
  return `<!DOCTYPE html>
<html lang="ko"><head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${_escapeHtml(title)} · SmartMeet</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.min.css" />
  <style>
    body { font-family:'Pretendard','Malgun Gothic',sans-serif; margin:0; padding:20px; background:#f1f5f9; min-height:100vh; box-sizing:border-box; }
    .card { max-width:420px; margin:24px auto; padding:30px 24px; background:#fff; border-radius:16px; box-shadow:0 8px 32px rgba(0,0,0,0.08); border:1px solid #e2e8f0; text-align:center; }
    .ico { font-size:64px; line-height:1; margin-bottom:10px; }
    h1 { font-size:20px; font-weight:800; margin:6px 0 10px; color:${color}; }
    .msg { font-size:14px; color:#64748b; line-height:1.7; margin:0; }
    .meeting { background:#f8fafc; padding:14px; border-radius:10px; margin:18px 0 8px; font-size:13px; line-height:1.7; color:#1e293b; text-align:left; border:1px solid #e2e8f0; }
    .meeting-org { font-size:11px; color:#64748b; letter-spacing:0.5px; }
    .meeting-title { font-weight:700; font-size:14px; margin:4px 0; color:#0f172a; }
    .meeting-meta { color:#64748b; font-size:12.5px; }
    .switch { display:inline-block; padding:11px 20px; background:#fff; color:${otherColor}; border:1.5px solid ${otherColor}; border-radius:10px; text-decoration:none; font-size:13.5px; font-weight:700; margin-top:14px; }
    .switch:hover { background:${otherBg}; }
    .footer { font-size:11px; color:#94a3b8; margin-top:20px; }
  </style>
</head><body>
  <div class="card">
    <div class="ico">${icon}</div>
    <h1>${_escapeHtml(title)}</h1>
    <p class="msg">${_escapeHtml(message || '').replace(/\n/g, '<br>')}</p>
    ${meeting ? `<div class="meeting">
      ${org ? `<div class="meeting-org">${_escapeHtml(org.name || '')}</div>` : ''}
      <div class="meeting-title">${_escapeHtml(meeting.title || '')}</div>
      ${dateStr ? `<div class="meeting-meta">📅 ${_escapeHtml(dateStr)}</div>` : ''}
      ${meeting.location ? `<div class="meeting-meta">📍 ${_escapeHtml(meeting.location)}</div>` : ''}
    </div>` : ''}
    ${switchUrl ? `<a href="${switchUrl}" class="switch">${otherLabel}</a>` : ''}
    <div class="footer">SmartMeet · 회의 응답 시스템</div>
  </div>
</body></html>`;
}

app.get('/rsvp-action', (req, res) => {
  const token = req.query.token || '';
  const action = req.query.action || '';
  if (!token || !['attending', 'declined'].includes(action)) {
    return res.status(400).send(_renderRsvpResultPage({
      icon: '⚠️', title: '잘못된 링크', color: '#ef4444',
      message: '응답 링크가 올바르지 않습니다. 메일의 버튼을 다시 클릭해 주세요.'
    }));
  }
  const member = db.prepare(
    'SELECT id, meeting_id, name FROM meeting_members WHERE invitation_token = ?'
  ).get(token);
  if (!member) {
    return res.status(404).send(_renderRsvpResultPage({
      icon: '⚠️', title: '오류', color: '#ef4444',
      message: '의원 정보를 찾을 수 없습니다. 관리자에게 문의해 주세요.'
    }));
  }
  const meeting = db.prepare('SELECT id, title, organization_id, meeting_date, location FROM meetings WHERE id = ?').get(member.meeting_id);
  const org = meeting ? db.prepare('SELECT name FROM organizations WHERE id = ?').get(meeting.organization_id) : null;
  const now = new Date().toLocaleString('sv-SE');
  try {
    db.prepare('UPDATE meeting_members SET rsvp_status = ?, rsvp_at = ? WHERE id = ?').run(action, now, member.id);
  } catch (e) {
    return res.status(500).send(_renderRsvpResultPage({
      icon: '⚠️', title: '저장 실패', color: '#ef4444',
      message: '응답 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', meeting, org
    }));
  }
  const isYes = action === 'attending';
  res.send(_renderRsvpResultPage({
    icon: isYes ? '✅' : '🙏',
    title: isYes ? '참석 응답 완료' : '불참 응답 완료',
    color: isYes ? '#10b981' : '#475569',
    message: `${(member.name || '').trim()} 님의 응답이 저장되었습니다.\n응답을 변경하시려면 아래 버튼을 눌러주세요.`,
    meeting, org, action, token
  }));
});

// API routes
app.use('/api/public', require('./routes/public'));  // 비로그인 열람용 — 인증 불필요
app.use('/api/auth', require('./routes/auth'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/agendas', require('./routes/agendas'));
app.use('/api/members', require('./routes/members'));
app.use('/api/meeting-members', require('./routes/meeting-members'));
app.use('/api/proxies', require('./routes/proxies'));
app.use('/api/rsvp', require('./routes/rsvp'));
app.use('/api/public-register', require('./routes/public-register'));
app.use('/api/toc-items', require('./routes/toc'));
app.use('/api/invitations', require('./routes/invitations'));
app.use('/api/notices', require('./routes/notices'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api', require('./routes/misc'));
app.use('/api/admin', require('./routes/admin'));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// =====================================================
// 기관별 메타 태그 동적 주입 (홈 페이지 공유 시 미리보기)
//   - URL: /home?org=X 또는 서브도메인 자동 라우팅
//   - <title>, og:title, og:description, og:image 등을 기관 정보로 치환
// =====================================================
const fs = require('fs');
const HOME_HTML_PATH = path.join(__dirname, '..', 'public', 'pages/home.html');
let _cachedHomeHtml = null;
let _cachedHomeHtmlTime = 0;
function loadHomeHtml() {
  // 운영 환경에서는 캐시 (메모리). 개발 환경에서는 파일 변경 시 재읽기.
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && _cachedHomeHtml) return _cachedHomeHtml;
  try {
    const stat = fs.statSync(HOME_HTML_PATH);
    if (_cachedHomeHtml && stat.mtimeMs === _cachedHomeHtmlTime) return _cachedHomeHtml;
    _cachedHomeHtml = fs.readFileSync(HOME_HTML_PATH, 'utf8');
    _cachedHomeHtmlTime = stat.mtimeMs;
  } catch (e) { console.warn('[home] file read fail:', e.message); }
  return _cachedHomeHtml;
}
function escapeAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function stripHtml(s) {
  return String(s == null ? '' : s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/home', (req, res) => {
  let html = loadHomeHtml();
  if (!html) return res.sendFile(HOME_HTML_PATH);

  // 기관 ID 결정 — 1) 서브도메인 2) ?org= 쿼리
  let orgId = req.orgFromDomain;
  if (!orgId && req.query.org) orgId = Number(req.query.org);
  let org = null;
  if (orgId) {
    try {
      org = db.prepare('SELECT name, description, intro_html, logo_combo_url, logo_url, logo_text_url FROM organizations WHERE id = ?').get(orgId);
    } catch {}
  }

  let title, description, logo;
  if (org) {
    title = org.name;
    // 인사말(description) 보다 기관 소개(intro_html) 가 더 짧고 적합
    const sourceHtml = org.intro_html || org.description || '';
    description = stripHtml(sourceHtml).slice(0, 200);
    if (!description) description = `${org.name} 공식 홈페이지`;
    logo = org.logo_combo_url || org.logo_url || org.logo_text_url || '';
  } else {
    title = 'SmartMeet';
    description = 'SmartMeet — 기관·회의 관리 시스템';
    logo = '';
  }
  // OG 이미지는 절대 URL 이어야 함 — data URL 은 일부 SNS 에서 미리보기 안 됨
  // logo 가 data URL 인 경우 그대로 두되, 외부 URL 일 경우 origin 보정
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const url = `${protocol}://${req.get('host') || ''}${req.originalUrl}`;

  html = html
    .replace(/{{ORG_NAME}}/g, escapeAttr(title))
    .replace(/{{ORG_DESCRIPTION}}/g, escapeAttr(description))
    .replace(/{{ORG_LOGO}}/g, escapeAttr(logo))
    .replace(/{{ORG_URL}}/g, escapeAttr(url));

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');  // 기관별로 다른 응답
  res.send(html);
});

// Pages routing (그 외 정적 페이지)
const pages = {
  '/': 'index.html',
  '/login': 'pages/login.html',
  '/register': 'pages/register.html',
  '/verify-email': 'pages/verify-email.html',
  '/reset-password': 'pages/reset-password.html',
  '/admin': 'pages/admin.html',
  '/dashboard': 'pages/dashboard.html',
  '/organization': 'pages/organization.html',
  '/notices': 'pages/notices.html',
  '/notice': 'pages/notice.html',
  '/board': 'pages/board.html',
  '/post': 'pages/post.html',
  '/org-members': 'pages/org-members.html',
  '/meeting': 'pages/meeting.html',
  '/meetings': 'pages/meetings-list.html',
  '/presentation': 'pages/presentation.html',
  '/proxy': 'pages/proxy-submit.html',
  '/rsvp': 'pages/rsvp-respond.html',
  '/event-register': 'pages/event-register.html',
  '/minutes': 'pages/minutes.html',
  '/charter': 'pages/charter.html',
  '/orgchart': 'pages/orgchart.html',
  '/schedule': 'pages/schedule.html',
  '/executives': 'pages/executives.html',
  '/presidents': 'pages/presidents.html',
  '/pocketbook': 'pages/pocketbook.html',
  '/manual': 'pages/manual.html',
};

Object.entries(pages).forEach(([route, file]) => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', file));
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '서버 오류' });
});

app.listen(PORT, () => {
  console.log(`\n  ┌─────────────────────────────────────────┐`);
  console.log(`  │  SmartMeet 서버 가동 중                   │`);
  console.log(`  │  http://localhost:${PORT}                  │`);
  console.log(`  │                                         │`);
  console.log(`  │  관리자 계정:                             │`);
  console.log(`  │    admin@smartmeet.local / admin1234    │`);
  console.log(`  └─────────────────────────────────────────┘\n`);
});
