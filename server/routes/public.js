// 공개 (인증 불필요) API — 기관 홈 페이지의 비로그인 열람 지원
// 게시/수정/삭제는 모두 인증 필요한 기존 라우트 사용; 여기서는 GET 만 허용
const express = require('express');
const db = require('../db');

const router = express.Router();

// 기관 홈 페이지 일괄 데이터 (org + 공지/게시글/일정/임원/정관/조직도)
router.get('/home/:orgId', (req, res) => {
  const orgId = Number(req.params.orgId);
  if (!orgId) return res.status(400).json({ error: '잘못된 요청' });
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  if (!org) return res.status(404).json({ error: '기관을 찾을 수 없습니다.' });

  const notices = db.prepare(`
    SELECT * FROM notices
    WHERE organization_id = ?
    ORDER BY is_pinned DESC, created_at DESC
    LIMIT 50
  `).all(orgId);

  const posts = db.prepare(`
    SELECT p.*, u.name AS author_name,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
    FROM posts p
    LEFT JOIN users u ON u.id = p.author_id
    WHERE p.organization_id = ?
    ORDER BY p.created_at DESC
    LIMIT 100
  `).all(orgId);

  const schedules = db.prepare(`
    SELECT * FROM schedules WHERE organization_id = ? ORDER BY schedule_date ASC
  `).all(orgId);

  // 임원/회장: 공개해도 무방한 컬럼만 선택 (전화·이메일 제외)
  const members = db.prepare(`
    SELECT id, seq, position, name, major, workplace, generation, photo
    FROM members WHERE organization_id = ?
    ORDER BY generation DESC, seq ASC
  `).all(orgId);

  const charter = db.prepare(
    'SELECT content FROM charters WHERE organization_id = ?'
  ).get(orgId) || { content: '' };

  // 다중 조직도 중 가장 최근 수정된 것 (홈페이지 미리보기용)
  const orgchart = db.prepare(
    'SELECT data FROM org_charts WHERE organization_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1'
  ).get(orgId) || { data: '' };

  res.json({ organization: org, notices, posts, schedules, members, charter, orgchart });
});

// 공지 단건 (비로그인 열람)
router.get('/notices/:id', (req, res) => {
  const notice = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);
  if (!notice) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
  res.json({ notice });
});

// 게시글 단건 + 댓글 (비로그인 열람)
router.get('/posts/:id', (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.name AS author_name
    FROM posts p LEFT JOIN users u ON u.id = p.author_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!post) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });
  // view_count 증가는 익명 열람에서도 적용
  db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(req.params.id);
  const comments = db.prepare(`
    SELECT c.*, u.name AS author_name
    FROM comments c LEFT JOIN users u ON u.id = c.author_id
    WHERE c.post_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json({ post, comments });
});

module.exports = router;
