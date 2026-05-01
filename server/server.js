const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3030;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(cookieParser());

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
