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

// API routes
app.use('/api/public', require('./routes/public'));  // 비로그인 열람용 — 인증 불필요
app.use('/api/auth', require('./routes/auth'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/agendas', require('./routes/agendas'));
app.use('/api/members', require('./routes/members'));
app.use('/api/meeting-members', require('./routes/meeting-members'));
app.use('/api/proxies', require('./routes/proxies'));
app.use('/api/toc-items', require('./routes/toc'));
app.use('/api/invitations', require('./routes/invitations'));
app.use('/api/notices', require('./routes/notices'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api', require('./routes/misc'));
app.use('/api/admin', require('./routes/admin'));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Pages routing
const pages = {
  '/': 'index.html',
  '/login': 'pages/login.html',
  '/register': 'pages/register.html',
  '/admin': 'pages/admin.html',
  '/dashboard': 'pages/dashboard.html',
  '/organization': 'pages/organization.html',
  '/home': 'pages/home.html',
  '/notices': 'pages/notices.html',
  '/notice': 'pages/notice.html',
  '/board': 'pages/board.html',
  '/post': 'pages/post.html',
  '/org-members': 'pages/org-members.html',
  '/meeting': 'pages/meeting.html',
  '/meetings': 'pages/meetings-list.html',
  '/presentation': 'pages/presentation.html',
  '/proxy': 'pages/proxy-submit.html',
  '/minutes': 'pages/minutes.html',
  '/charter': 'pages/charter.html',
  '/orgchart': 'pages/orgchart.html',
  '/schedule': 'pages/schedule.html',
  '/executives': 'pages/executives.html',
  '/presidents': 'pages/presidents.html',
  '/pocketbook': 'pages/pocketbook.html',
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
