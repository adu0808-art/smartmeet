const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth-mw');
const { requireOrg, getOrgIdFromPost, getOrgIdFromComment, getOrgRole, isAdmin } = require('../permissions');

const router = express.Router();
router.use(authRequired);

// List posts for an org — supports ?category=free|news filter
router.get('/', requireOrg(req => req.query.organization_id, 'read'), (req, res) => {
  const cat = req.query.category;
  let query = `
    SELECT p.*, u.name AS author_name,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
    FROM posts p
    LEFT JOIN users u ON u.id = p.author_id
    WHERE p.organization_id = ?`;
  const params = [req.orgId];
  if (cat) {
    query += ` AND COALESCE(p.category, 'free') = ?`;
    params.push(cat);
  }
  query += ` ORDER BY p.created_at DESC`;
  const rows = db.prepare(query).all(...params);
  res.json({ posts: rows });
});

// Create post — any authenticated member of the org
router.post('/', requireOrg(req => req.body.organization_id, 'read'), (req, res) => {
  const { title, content, category } = req.body || {};
  if (!title) return res.status(400).json({ error: '제목을 입력하세요.' });
  const cat = (category === 'news' || category === 'free') ? category : 'free';
  const result = db.prepare('INSERT INTO posts (organization_id, title, content, category, author_id) VALUES (?, ?, ?, ?, ?)')
    .run(req.orgId, title, content || '', cat, req.user.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(result.lastInsertRowid);
  res.json({ post });
});

router.get('/:id', authRequired, (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.name AS author_name
    FROM posts p LEFT JOIN users u ON u.id = p.author_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!post) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });
  if (!getOrgRole(req.user, post.organization_id)) return res.status(403).json({ error: '접근 권한이 없습니다.' });
  db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(req.params.id);
  const comments = db.prepare(`
    SELECT c.*, u.name AS author_name
    FROM comments c LEFT JOIN users u ON u.id = c.author_id
    WHERE c.post_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json({ post, comments });
});

router.put('/:id', authRequired, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });
  const role = getOrgRole(req.user, post.organization_id);
  if (!role) return res.status(403).json({ error: '접근 권한이 없습니다.' });
  // Author or org admin can edit
  if (post.author_id !== req.user.id && !isAdmin(role)) return res.status(403).json({ error: '본인 또는 관리자만 수정할 수 있습니다.' });
  const { title, content } = req.body || {};
  const now = new Date().toLocaleString('sv-SE');
  db.prepare('UPDATE posts SET title = COALESCE(?, title), content = COALESCE(?, content), updated_at = ? WHERE id = ?')
    .run(title, content, now, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', authRequired, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });
  const role = getOrgRole(req.user, post.organization_id);
  if (!role) return res.status(403).json({ error: '접근 권한이 없습니다.' });
  if (post.author_id !== req.user.id && !isAdmin(role)) return res.status(403).json({ error: '본인 또는 관리자만 삭제할 수 있습니다.' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Comments =====
router.post('/:id/comments', authRequired, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });
  if (!getOrgRole(req.user, post.organization_id)) return res.status(403).json({ error: '접근 권한이 없습니다.' });
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: '내용을 입력하세요.' });
  const result = db.prepare('INSERT INTO comments (post_id, content, author_id) VALUES (?, ?, ?)')
    .run(req.params.id, content.trim(), req.user.id);
  const comment = db.prepare(`
    SELECT c.*, u.name AS author_name
    FROM comments c LEFT JOIN users u ON u.id = c.author_id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  res.json({ comment });
});

router.delete('/comments/:cid', authRequired, (req, res) => {
  const cmt = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.cid);
  if (!cmt) return res.status(404).json({ error: '댓글이 없습니다.' });
  const orgId = getOrgIdFromComment(req.params.cid);
  if (cmt.author_id !== req.user.id && !isAdmin(getOrgRole(req.user, orgId))) {
    return res.status(403).json({ error: '본인 또는 관리자만 삭제할 수 있습니다.' });
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.cid);
  res.json({ ok: true });
});

module.exports = router;
