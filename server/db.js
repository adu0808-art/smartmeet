const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB 경로: 환경변수 DB_DIR 우선 (Railway 등 PaaS의 영속 Volume 경로용)
//   배포 환경 예: DB_DIR=/data
//   로컬 개발: 기본값 ../DB
const DB_DIR = process.env.DB_DIR || path.resolve(__dirname, '..', 'DB');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const dbPath = path.join(DB_DIR, 'smartmeet.db');
console.log('[db] using SQLite path:', dbPath);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS organization_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role TEXT DEFAULT 'staff',
  UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_type TEXT DEFAULT 'board',
  meeting_date TEXT,
  location TEXT,
  total_members INTEGER DEFAULT 0,
  quorum_ratio REAL DEFAULT 0.5,
  status TEXT DEFAULT 'preparing',
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS agendas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  agenda_no INTEGER,
  agenda_type TEXT DEFAULT 'general',
  title TEXT NOT NULL,
  presenter TEXT,
  summary TEXT,
  content TEXT,
  budget_data TEXT,
  approve_count INTEGER DEFAULT 0,
  oppose_count INTEGER DEFAULT 0,
  abstain_count INTEGER DEFAULT 0,
  vote_result TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  seq INTEGER,
  position TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  major TEXT,
  workplace TEXT,
  generation TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS attendances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'absent',
  checked_at TEXT,
  UNIQUE(meeting_id, member_id)
);

CREATE TABLE IF NOT EXISTS proxies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  submitter_name TEXT,
  submitter_phone TEXT,
  signature_data TEXT,
  status TEXT DEFAULT 'pending',
  submitted_at TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS charters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content TEXT,
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS charter_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version_name TEXT NOT NULL,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS org_charts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  data TEXT,
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  schedule_date TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS toc_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  default_role TEXT DEFAULT 'member',
  max_uses INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  expires_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  is_pinned INTEGER DEFAULT 0,
  author_id INTEGER REFERENCES users(id),
  view_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  author_id INTEGER REFERENCES users(id),
  view_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_id INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS org_chart_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version_name TEXT NOT NULL,
  data TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
`);

// Migration: add pass_ratio column to meetings if missing
try { db.exec("ALTER TABLE meetings ADD COLUMN pass_ratio REAL DEFAULT 0.5"); } catch (e) {}
try { db.exec("ALTER TABLE meetings ADD COLUMN invitation_message TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE agendas ADD COLUMN vote_summary TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE toc_items ADD COLUMN agenda_id INTEGER REFERENCES agendas(id) ON DELETE SET NULL"); } catch (e) {}

// Organization: 3 logo variants — symbol(logo), text-only, logo+text combined
try { db.exec("ALTER TABLE organizations ADD COLUMN logo_text_url TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE organizations ADD COLUMN logo_combo_url TEXT"); } catch (e) {}
// Organization: hero image (separate from logo) for home page main banner
try { db.exec("ALTER TABLE organizations ADD COLUMN hero_image_url TEXT"); } catch (e) {}
// Organization: footer HTML (admin-editable, shown at bottom of home page)
try { db.exec("ALTER TABLE organizations ADD COLUMN footer_html TEXT"); } catch (e) {}
// Organization: 기관 소개 (intro), separate from 인사말 (description/greeting)
try { db.exec("ALTER TABLE organizations ADD COLUMN intro_html TEXT"); } catch (e) {}
// Organization: hero sub-title (under org name) and slogan bar text — admin editable on home
try { db.exec("ALTER TABLE organizations ADD COLUMN hero_sub TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE organizations ADD COLUMN slogan TEXT"); } catch (e) {}

// Posts: category — 'free' (자유게시판) | 'news' (회원소식)
try { db.exec("ALTER TABLE posts ADD COLUMN category TEXT DEFAULT 'free'"); } catch (e) {}

// meeting_members: 이메일 발송 이력 — 위임장 / 초대장
try { db.exec("ALTER TABLE meeting_members ADD COLUMN invitation_sent_at TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE meeting_members ADD COLUMN proxy_sent_at TEXT"); } catch (e) {}
// meeting_members: 초대장 RSVP — 의원이 참석/불참 응답 시 토큰 기반 공개 페이지에서 기록
//   invitation_token: 메일에 포함되는 고유 링크 토큰 (uuidv4)
//   rsvp_status: 'attending' | 'declined' | NULL (미응답)
//   rsvp_at: 응답 시각
try { db.exec("ALTER TABLE meeting_members ADD COLUMN invitation_token TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE meeting_members ADD COLUMN rsvp_status TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE meeting_members ADD COLUMN rsvp_at TEXT"); } catch (e) {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_mm_invitation_token ON meeting_members(invitation_token) WHERE invitation_token IS NOT NULL"); } catch (e) {
  console.warn('[DB] invitation_token unique index:', e.message);
}

// Password reset tokens — 이메일로 비밀번호 재설정 링크 발송용
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
} catch (e) {}

// Organizations: 도메인 라우팅 — 서브도메인 / 커스텀 도메인
//   subdomain: 'ksitm' → ksitm.smartmeet.co.kr 로 접근 시 자동으로 이 기관 홈으로
//   custom_domain: 'kistem.or.kr' 같은 자체 도메인
//   ※ SQLite 는 ALTER TABLE ... ADD COLUMN ... UNIQUE 를 지원하지 않으므로
//     컬럼은 일반 TEXT 로 추가하고 UNIQUE INDEX 로 별도 처리 (NULL 은 중복 허용)
try { db.exec("ALTER TABLE organizations ADD COLUMN subdomain TEXT"); } catch (e) {
  if (!/duplicate column/i.test(e.message)) console.warn('[DB] subdomain column add:', e.message);
}
try { db.exec("ALTER TABLE organizations ADD COLUMN custom_domain TEXT"); } catch (e) {
  if (!/duplicate column/i.test(e.message)) console.warn('[DB] custom_domain column add:', e.message);
}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_org_subdomain ON organizations(subdomain) WHERE subdomain IS NOT NULL"); } catch (e) {
  console.warn('[DB] subdomain unique index:', e.message);
}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_org_custom_domain ON organizations(custom_domain) WHERE custom_domain IS NOT NULL"); } catch (e) {
  console.warn('[DB] custom_domain unique index:', e.message);
}

// Schedules: 회의 연동 — 회의 생성 시 자동 일정 추가, 회의 삭제 시 CASCADE 로 자동 제거
//   meeting_id 가 설정된 일정은 회의에서 자동 생성된 것 → 직접 수정·삭제 불가 (회의 자체를 수정·삭제해야 함)
try { db.exec("ALTER TABLE schedules ADD COLUMN meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE"); } catch (e) {}

// 마이그레이션: 기존 회의(meeting_id 가 일정에 없는) → 일정에 자동 등록 (한 번만)
try {
  const orphanMeetings = db.prepare(`
    SELECT m.id, m.organization_id, m.title, m.meeting_date, m.location
    FROM meetings m
    LEFT JOIN schedules s ON s.meeting_id = m.id
    WHERE m.meeting_date IS NOT NULL AND m.meeting_date != ''
      AND s.id IS NULL
  `).all();
  if (orphanMeetings.length) {
    const ins = db.prepare('INSERT INTO schedules (organization_id, title, schedule_date, description, meeting_id) VALUES (?, ?, ?, ?, ?)');
    orphanMeetings.forEach(m => {
      const date = String(m.meeting_date || '').slice(0, 10);
      if (!date) return;
      const desc = m.location ? `<p><strong>장소:</strong> ${String(m.location).replace(/</g,'&lt;')}</p>` : '';
      ins.run(m.organization_id, `📋 ${m.title}`, date, desc, m.id);
    });
    console.log(`[DB] 기존 회의 ${orphanMeetings.length}건 → 일정 자동 등록`);
  }
} catch (e) { console.warn('[DB] meeting→schedule 마이그레이션 경고:', e.message); }

// Members: 사진 (data URL or external URL)
try { db.exec("ALTER TABLE members ADD COLUMN photo TEXT"); } catch (e) {}

// 회의 의원 (meeting_members) — 임원명단(members)과 완전히 독립된 테이블
//   각 row 는 특정 회의의 의원 정보를 모두 포함 (members 와 무관)
//   임원이 삭제돼도 의원 데이터는 그대로 유지됨
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meeting_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      seq INTEGER,
      position TEXT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      major TEXT,
      workplace TEXT,
      photo TEXT,
      source_member_id INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);
} catch (e) { console.warn('[DB] meeting_members table:', e.message); }

// 마이그레이션: 옛 junction 구조 → 독립 테이블 구조로 변환
//   옛 구조: (meeting_id, member_id) FK 만 갖는 정션
//   새 구조: 각 row 가 의원 정보 자체를 포함 (members 와 분리)
try {
  const tableInfo = db.prepare("PRAGMA table_info(meeting_members)").all();
  const hasMemberId = tableInfo.some(c => c.name === 'member_id');
  const hasName = tableInfo.some(c => c.name === 'name');
  // junction 구조이면서 새 컬럼이 없는 경우 → v2 로 마이그레이션
  if (hasMemberId && !hasName) {
    db.exec(`
      CREATE TABLE meeting_members_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        seq INTEGER,
        position TEXT,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        major TEXT,
        workplace TEXT,
        photo TEXT,
        source_member_id INTEGER,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
    `);
    db.exec(`
      INSERT INTO meeting_members_v2 (meeting_id, seq, position, name, phone, email, major, workplace, photo, source_member_id)
      SELECT mm.meeting_id, m.seq, m.position, m.name, m.phone, m.email, m.major, m.workplace, m.photo, m.id
      FROM meeting_members mm
      INNER JOIN members m ON m.id = mm.member_id;
    `);
    db.exec('DROP TABLE meeting_members');
    db.exec('ALTER TABLE meeting_members_v2 RENAME TO meeting_members');
    console.log('[DB] meeting_members migrated: junction → standalone table');
  }
} catch (e) { console.warn('[DB] meeting_members migration:', e.message); }

// proxies 마이그레이션: member_id 가 옛 members(id) 를 참조했지만 이제는 meeting_members(id) 사용
//   members(id) FK 가 남아있으면 INSERT 시 FK 위반 발생 → 테이블 재생성으로 FK 제거 + 데이터 remap
try {
  const proxyForeignKeys = db.prepare("PRAGMA foreign_key_list(proxies)").all();
  const fkToMembers = proxyForeignKeys.find(fk => fk.table === 'members');
  if (fkToMembers) {
    db.exec(`
      CREATE TABLE proxies_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        member_id INTEGER,
        token TEXT UNIQUE NOT NULL,
        submitter_name TEXT,
        submitter_phone TEXT,
        signature_data TEXT,
        status TEXT DEFAULT 'pending',
        submitted_at TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
    `);
    // 기존 proxies.member_id (members.id) → meeting_members.id 로 remap (source_member_id 매칭)
    db.exec(`
      INSERT INTO proxies_v2 (id, meeting_id, member_id, token, submitter_name, submitter_phone, signature_data, status, submitted_at, created_at)
      SELECT
        p.id, p.meeting_id,
        (SELECT mm.id FROM meeting_members mm WHERE mm.meeting_id = p.meeting_id AND mm.source_member_id = p.member_id LIMIT 1),
        p.token, p.submitter_name, p.submitter_phone, p.signature_data, p.status, p.submitted_at, p.created_at
      FROM proxies p;
    `);
    db.exec('DROP TABLE proxies');
    db.exec('ALTER TABLE proxies_v2 RENAME TO proxies');
    console.log('[DB] proxies migrated: member_id FK to members removed → now stores meeting_members.id');
  }
} catch (e) { console.warn('[DB] proxies migration:', e.message); }

// attendances 마이그레이션: member_id (members.id) → meeting_member_id (meeting_members.id)
//   회의 의원이 독립 테이블이 되었으므로 출석 체크도 meeting_member 단위로 변경
try {
  const attInfo = db.prepare("PRAGMA table_info(attendances)").all();
  const hasMeetingMemberId = attInfo.some(c => c.name === 'meeting_member_id');
  if (attInfo.length > 0 && !hasMeetingMemberId) {
    db.exec(`
      CREATE TABLE attendances_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_member_id INTEGER NOT NULL REFERENCES meeting_members(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'absent',
        checked_at TEXT,
        UNIQUE(meeting_member_id)
      );
    `);
    // 기존 attendances.member_id 가 members.id 였으나, 마이그레이션된 meeting_members 의 source_member_id 로 매핑 시도
    db.exec(`
      INSERT OR IGNORE INTO attendances_v2 (meeting_member_id, status, checked_at)
      SELECT mm.id, a.status, a.checked_at
      FROM attendances a
      JOIN meeting_members mm ON mm.meeting_id = a.meeting_id AND mm.source_member_id = a.member_id
    `);
    db.exec('DROP TABLE attendances');
    db.exec('ALTER TABLE attendances_v2 RENAME TO attendances');
    console.log('[DB] attendances migrated: member_id → meeting_member_id');
  }
} catch (e) { console.warn('[DB] attendances migration:', e.message); }

// User profile fields
try { db.exec("ALTER TABLE users ADD COLUMN phone TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN major TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN workplace TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN profile_image TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT"); } catch (e) {}

// Migration: ensure org owners have an organization_members row with admin role
try {
  const orgs = db.prepare('SELECT id, owner_id FROM organizations WHERE owner_id IS NOT NULL').all();
  const ins = db.prepare('INSERT OR IGNORE INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, ?)');
  const update = db.prepare(`UPDATE organization_members SET member_role = 'admin' WHERE organization_id = ? AND user_id = ?`);
  const tx = db.transaction(() => {
    orgs.forEach(o => { ins.run(o.id, o.owner_id, 'admin'); update.run(o.id, o.owner_id); });
  });
  tx();
} catch (e) { console.warn('[DB] owner-membership migration warning:', e.message); }

// ======================================================================
// 시스템 관리자 admin@smartmeet.co.kr 보장 (Targeted Ensure)
//   1단계: 옛 이메일(admin@smartmeet.local) 이 있으면 → 새 이메일로 rename
//   2단계: 그래도 없고 SEED_ADMIN_PASSWORD 환경변수가 있으면 → 신규 생성
//   3단계: 둘 다 안 되면 경고 로그 (수동 조치 필요)
// ======================================================================
const ADMIN_EMAIL = 'admin@smartmeet.co.kr';
try {
  const targetUser = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
  if (!targetUser) {
    // 1단계 — 옛 이메일에서 rename 시도
    const oldUser = db.prepare("SELECT id FROM users WHERE email = 'admin@smartmeet.local'").get();
    if (oldUser) {
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(ADMIN_EMAIL, oldUser.id);
      console.log(`[DB] ✅ 시스템 관리자 이메일 변경: admin@smartmeet.local → ${ADMIN_EMAIL}`);
    } else {
      // 2단계 — SEED_ADMIN_PASSWORD 가 있으면 신규 생성
      const seedPwd = process.env.SEED_ADMIN_PASSWORD;
      if (seedPwd) {
        const bcrypt = require('bcryptjs');
        const seedName = process.env.SEED_ADMIN_NAME || '시스템 관리자';
        const hash = bcrypt.hashSync(seedPwd, 10);
        db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
          .run(ADMIN_EMAIL, hash, seedName, 'admin');
        console.log(`[DB] ✅ 시스템 관리자 신규 생성: ${ADMIN_EMAIL}`);
      } else {
        console.warn('[DB] ⚠️ admin@smartmeet.co.kr 계정이 없고 SEED_ADMIN_PASSWORD 도 설정되지 않음');
        console.warn('[DB]    Railway Variables 에 SEED_ADMIN_PASSWORD 임시 추가 후 재배포하세요');
      }
    }
  } else {
    console.log(`[DB] 시스템 관리자 확인 완료: ${ADMIN_EMAIL} (id=${targetUser.id})`);
  }
} catch (e) { console.warn('[DB] admin ensure warning:', e.message); }

// 시스템 관리자 현황 출력 (startup 검증용)
try {
  const admins = db.prepare("SELECT id, email, name FROM users WHERE role = 'admin' ORDER BY id").all();
  if (admins.length) {
    console.log(`[DB] ━━━ 시스템 관리자 ${admins.length}명 ━━━`);
    admins.forEach(a => console.log(`[DB]   id=${a.id}  ${a.email}  (${a.name})`));
    console.log('[DB] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } else {
    console.log('[DB] ⚠️ 시스템 관리자가 한 명도 없습니다!');
  }
} catch (e) {}

// ======================================================================
// 시스템 관리자(system_admin) 자동 생성
//   - 운영(배포) 환경: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME 환경변수로 지정
//   - 로컬 개발: 환경변수 없으면 기본값(admin@smartmeet.local / admin1234) 사용
//   - ★ 이미 다른 시스템 관리자가 있으면 자동 생성 건너뜀 (이메일 변경 등으로 인한 중복 방지)
// ======================================================================
const ensureAdmin = () => {
  const bcrypt = require('bcryptjs');
  const seedEmail = process.env.SEED_ADMIN_EMAIL;
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  const seedName = process.env.SEED_ADMIN_NAME || '시스템 관리자';
  const isProd = process.env.NODE_ENV === 'production';

  // ★ 핵심 안전장치: 이미 시스템 관리자가 있으면 어떤 환경이든 자동 생성 건너뜀
  //   (이메일이 변경됐거나 수동으로 관리자가 추가된 경우 중복 생성 방지)
  const anyAdmin = db.prepare("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1").get();
  if (anyAdmin) {
    return;
  }

  // 이하: 시스템 관리자가 전혀 없는 경우에만 실행 (최초 배포 / 신규 환경)

  // 운영 환경에서 기본 관리자 자동생성 비활성화 (보안) — 환경변수 필수
  if (isProd && (!seedEmail || !seedPassword)) {
    console.warn('[DB] ⚠️ 운영 환경인데 시스템 관리자가 없습니다.');
    console.warn('[DB]    환경변수 SEED_ADMIN_EMAIL 와 SEED_ADMIN_PASSWORD 를 설정하면 자동 생성됩니다.');
    return;
  }

  // 환경변수가 지정된 경우: 해당 계정으로 시드
  if (seedEmail && seedPassword) {
    const hash = bcrypt.hashSync(seedPassword, 10);
    db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
      .run(seedEmail, hash, seedName, 'admin');
    console.log('[DB] ✅ 시스템 관리자 시드 생성:', seedEmail);
    console.log('[DB]    로그인 후 환경변수 SEED_ADMIN_PASSWORD 를 즉시 삭제하세요!');
    return;
  }

  // 로컬 개발 환경: 기본 admin 생성
  const hash = bcrypt.hashSync('admin1234', 10);
  db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
    .run('admin@smartmeet.co.kr', hash, '시스템 관리자', 'admin');
  console.log('[DB] 로컬 개발용 기본 관리자 생성: admin@smartmeet.co.kr / admin1234');
};
ensureAdmin();

module.exports = db;
