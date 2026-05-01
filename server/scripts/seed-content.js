/**
 * 샘플 데이터 시드 스크립트
 *   공지사항 / 자유게시판 / 회원소식 / 기관일정 각 10건씩 organization_id=1 에 추가
 *   실행: node server/scripts/seed-content.js [orgId]
 */
const db = require('../db');

const orgId = Number(process.argv[2]) || 1;
const org = db.prepare('SELECT id, name FROM organizations WHERE id = ?').get(orgId);
if (!org) {
  console.error(`organization_id=${orgId} 없음. 사용 가능 ID:`, db.prepare('SELECT id, name FROM organizations').all());
  process.exit(1);
}
console.log(`▶ ${org.name} (id=${orgId}) 에 샘플 데이터 추가`);

// 작성자: admin (id=1) — 없으면 첫 사용자
const author = db.prepare('SELECT id, name FROM users WHERE id = 1').get()
  || db.prepare('SELECT id, name FROM users ORDER BY id ASC LIMIT 1').get();
if (!author) { console.error('사용자 없음'); process.exit(1); }
console.log(`  작성자: ${author.name} (id=${author.id})`);

// 날짜 헬퍼: 오늘 기준 ±N일
const dateOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const datetimeOffset = (days, hours = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hours, 0, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// ============ 공지사항 (notices) ============
const notices = [
  { title: '2026년도 정기총회 개최 안내', pinned: 1,
    content: `<p>회원 여러분께,</p><p>2026년도 정기총회를 아래와 같이 개최하오니 많은 참석 부탁드립니다.</p><ul><li>일시: 2026년 5월 30일(토) 14:00</li><li>장소: 서울대학교 호암교수회관 컨벤션센터</li><li>안건: 회무·결산 보고, 임원 선출, 회칙 개정안 심의</li></ul><p>참석이 어려우신 회원께서는 위임장을 제출해 주시기 바랍니다.</p>` },
  { title: '제25회 춘계학술대회 논문 모집', pinned: 1,
    content: `<p>2026년도 춘계학술대회에 발표하실 논문을 모집합니다.</p><p><strong>주요 일정</strong></p><ul><li>초록 제출 마감: 2026년 6월 15일</li><li>심사 결과 발표: 2026년 7월 1일</li><li>전문 제출 마감: 2026년 7월 30일</li><li>학술대회: 2026년 8월 21~22일 (제주 ICC)</li></ul><p>제출은 학회 홈페이지 논문관리 시스템을 통해 진행해 주시기 바랍니다.</p>` },
  { title: '2026년 상반기 회비 납부 안내', pinned: 0,
    content: `<p>2026년 상반기 회비 납부 기간이 도래하였습니다.</p><p><strong>납부 안내</strong></p><ul><li>정회원: 100,000원</li><li>학생회원: 30,000원</li><li>평생회원: (해당사항 없음)</li></ul><p>입금 계좌는 회원 메일로 별도 안내드립니다. 감사합니다.</p>` },
  { title: '학회지(KISTEM Journal) 제42권 발행', pinned: 0,
    content: `<p>학회지 제42권 1호가 발행되었습니다.</p><p>회원 페이지에서 PDF 로 열람하실 수 있으며, 인쇄본은 5월 중 우편 발송 예정입니다.</p>` },
  { title: '신임 임원 위촉 결과 공지', pinned: 0,
    content: `<p>지난 이사회에서 의결된 신임 임원 위촉 결과를 알려드립니다.</p><ul><li>학술이사: 김영수 교수</li><li>편집이사: 박정민 교수</li><li>홍보이사: 이상혁 교수</li><li>국제협력이사: 최은영 교수</li></ul><p>임기는 2026년 4월 1일부터 2년간입니다.</p>` },
  { title: '하계 워크숍 참가 신청 (선착순 80명)', pinned: 0,
    content: `<p>2026년 하계 워크숍을 다음과 같이 개최합니다.</p><ul><li>주제: 인공지능 시대의 산업기술경영</li><li>일시: 2026년 7월 18일~19일 (1박 2일)</li><li>장소: 한화리조트 평창</li><li>참가비: 정회원 200,000원 / 학생 100,000원</li></ul><p>홈페이지 참가신청 메뉴에서 등록 가능합니다. 선착순 80명 마감.</p>` },
  { title: '회칙 개정안 검토 의견 수렴', pinned: 0,
    content: `<p>차기 정기총회에 상정될 회칙 개정안에 대하여 회원 여러분의 의견을 수렴합니다.</p><p>개정안 전문은 첨부 파일을 참고해 주시고, 의견은 5월 20일까지 사무국 메일로 보내주시면 감사하겠습니다.</p>` },
  { title: '2026 우수논문상 후보 추천 공모', pinned: 0,
    content: `<p>2026년도 우수논문상 후보를 추천 받습니다.</p><ul><li>대상: 최근 2년간 본 학회지에 게재된 논문</li><li>추천 마감: 2026년 6월 30일</li><li>시상: 추계학술대회 (2026년 11월)</li></ul><p>자기 추천도 가능합니다.</p>` },
  { title: '국제 협력 MOU 체결 — IEEE TEMS', pinned: 0,
    content: `<p>본 학회는 IEEE Technology and Engineering Management Society 와 학술 교류 MOU 를 체결하였습니다.</p><p>회원께서는 IEEE TEMS 학술대회 참가비 할인 혜택을 받으실 수 있습니다.</p>` },
  { title: '회원 정보 갱신 요청 (2026년 5월 31일까지)', pinned: 0,
    content: `<p>회원 명부 정확성 유지를 위해 회원 정보 갱신을 요청드립니다.</p><p>홈페이지 마이페이지에서 직접 수정 가능하며, 5월 31일까지 갱신해 주시기 바랍니다.</p>` }
];

// ============ 자유게시판 (posts category=free) ============
const freePosts = [
  { title: '신입 회원 자기소개 게시판 활성화 제안',
    content: `<p>안녕하세요. 신입 회원입니다.</p><p>다른 학회처럼 신입 회원 자기소개 게시판이 따로 있으면 회원 간 친목 도모에 좋을 것 같습니다. 의견 부탁드립니다.</p>` },
  { title: '논문 작성에 추천하는 도구는?',
    content: `<p>학위 논문을 준비 중인데, 다른 분들은 어떤 도구를 사용하시나요? LaTeX, Word, Google Docs 중 추천 부탁드립니다.</p>` },
  { title: '경기 북부 지역 회원 모임 제안',
    content: `<p>경기 북부 지역에 거주하시는 회원분들과 분기별 모임을 가져보면 어떨까요? 관심 있으신 분들 댓글 부탁드립니다.</p>` },
  { title: '학회 홈페이지가 정말 깔끔해졌네요',
    content: `<p>새로 개편된 홈페이지 디자인이 정말 마음에 듭니다. 모바일에서도 사용성이 크게 좋아졌어요. 운영진 수고하셨습니다!</p>` },
  { title: '도서 추천 — "혁신의 함정"',
    content: `<p>최근 읽은 책 중에 좋은 책이 있어 공유합니다. 클레이튼 크리스텐슨의 후속 연구를 정리한 책으로, 산업기술경영을 공부하시는 분께 추천드립니다.</p>` },
  { title: '학술대회 발표 후기 — 처음 발표한 소감',
    content: `<p>지난 춘계학술대회에서 처음으로 발표를 했습니다. 떨렸지만 좋은 피드백을 많이 받아 큰 도움이 되었어요. 많은 분들과 인사할 수 있어 기뻤습니다.</p>` },
  { title: '연구 데이터 분석 — Python vs R',
    content: `<p>경영학 연구에서 통계 분석에 Python 과 R 중 어떤 것을 더 선호하시나요? 각각의 장단점에 대한 의견 부탁드립니다.</p>` },
  { title: '학회비 카드 결제 가능 시점',
    content: `<p>학회비를 카드로도 결제할 수 있게 되면 좋겠습니다. 다른 학회는 대부분 카드 결제가 가능하더라구요. 운영진의 검토 부탁드립니다.</p>` },
  { title: '논문 심사 기간 단축 의견',
    content: `<p>요즘 다른 저널들은 첫 심사 결과를 평균 6~8주에 회신해 주는데, 우리 학회지는 다소 길게 느껴집니다. 심사 기간 단축에 대한 의견을 나누고 싶습니다.</p>` },
  { title: '온라인 세미나 시리즈 운영 어떨까요?',
    content: `<p>월 1회 정도 온라인으로 회원이 참여할 수 있는 세미나를 운영하면 좋을 것 같습니다. 줌이나 유튜브 라이브로 진행하면 지방 회원분들도 편하게 참여할 수 있을 것 같아요.</p>` }
];

// ============ 회원소식 (posts category=news) ============
const newsPosts = [
  { title: '[수상] 김철수 회원, 한국공학한림원 신입회원 선정',
    content: `<p>본 학회 김철수 정회원(서울대 공과대학 교수) 께서 2026년도 한국공학한림원 신입회원으로 선정되셨습니다.</p><p>회원분들의 많은 축하 부탁드립니다.</p>` },
  { title: '[승진] 박영희 회원, 부산대학교 경영대학장 취임',
    content: `<p>본 학회 박영희 부회장께서 부산대학교 경영대학장으로 취임하셨습니다.</p><p>학교의 발전과 학문 후속 세대 양성에 큰 기여를 해주실 것으로 기대합니다.</p>` },
  { title: '[저서] 이상민 회원, "디지털 전환과 산업 혁신" 출간',
    content: `<p>본 학회 이상민 회원의 신간 "디지털 전환과 산업 혁신"이 출간되었습니다.</p><p>4차 산업혁명 시대의 기업 경영 전략에 대해 다룬 책으로, 학회 회원에게는 출판사를 통해 20% 할인 혜택을 제공한다고 합니다.</p>` },
  { title: '[연구] 최영수 교수팀, NSF 국제공동연구 과제 선정',
    content: `<p>최영수 회원이 이끄는 연구팀이 미국 NSF 국제공동연구 과제에 선정되었습니다.</p><p>연구 기간은 3년이며, 총 연구비는 약 200만 달러 규모입니다.</p>` },
  { title: '[수상] 홍길동 회원, 산업혁신상 대통령상 수상',
    content: `<p>본 학회 홍길동 이사께서 2026년 산업혁신상 대통령상을 수상하셨습니다.</p><p>이번 수상은 중소기업 디지털화 컨설팅 분야의 공로를 인정받은 것입니다.</p>` },
  { title: '[부고] 정원로 명예회원 영면',
    content: `<p>본 학회 창립 멤버이신 정원로 명예회원께서 5월 1일 영면하셨습니다.</p><p>고인의 학회 발전에 대한 헌신을 추모하며, 빈소 안내는 사무국으로 문의 바랍니다.</p>` },
  { title: '[임용] 김지영 회원, KAIST 경영대학 조교수 임용',
    content: `<p>본 학회 김지영 회원께서 2026년 3월 1일자로 KAIST 경영대학 조교수로 임용되셨습니다.</p><p>축하드리며 학문적 성장을 응원합니다.</p>` },
  { title: '[수상] 학회지 우수논문상 — 윤정호 회원',
    content: `<p>2025년도 학회지 우수논문상에 윤정호 회원의 논문 "기술혁신 생태계의 동적 분석"이 선정되었습니다.</p><p>시상식은 추계학술대회에서 진행됩니다.</p>` },
  { title: '[안내] 신임 편집위원장 — 강영주 교수',
    content: `<p>학회지 신임 편집위원장으로 강영주 교수(연세대) 께서 위촉되셨습니다.</p><p>임기는 2026년 5월부터 2년간이며, 학회지 발전에 큰 기여를 해주실 것으로 기대합니다.</p>` },
  { title: '[축하] 이미경 회원, 정부 산학협력 우수상 수상',
    content: `<p>이미경 회원께서 2026년 정부 산학협력 우수상을 수상하셨습니다. 회원 여러분의 많은 축하 부탁드립니다.</p>` }
];

// ============ 기관일정 (schedules) ============
const schedules = [
  { offset: 7,   title: '월간 정기 운영위원회',     desc: '<p><strong>장소:</strong> 학회 사무국 회의실</p><p>월별 안건 검토 및 사업 진행 점검</p>' },
  { offset: 14,  title: '편집위원회 회의',          desc: '<p><strong>장소:</strong> 온라인 (Zoom)</p><p>학회지 제42권 2호 게재 논문 심사 결과 검토</p>' },
  { offset: 21,  title: '신입 회원 환영 모임',      desc: '<p><strong>장소:</strong> 광화문 D 카페</p><p>2026년 상반기 신입 회원과의 친목 만남</p>' },
  { offset: 30,  title: '제25회 춘계학술대회',      desc: '<p><strong>일시:</strong> 5월 30일 ~ 31일</p><p><strong>장소:</strong> 서울대학교 호암교수회관</p><p>주제 발표, 세션 토론, 우수논문 시상</p>' },
  { offset: 45,  title: '국제 학술 세미나 (IEEE TEMS 공동)', desc: '<p><strong>장소:</strong> COEX 컨퍼런스홀</p><p>주제: AI 시대의 기술경영 전략</p>' },
  { offset: 60,  title: '2026년 하계 워크숍',       desc: '<p><strong>일시:</strong> 7월 18일 ~ 19일 (1박 2일)</p><p><strong>장소:</strong> 한화리조트 평창</p><p>주제 강연, 그룹 토론, 친목 행사</p>' },
  { offset: 80,  title: '추계학술대회 운영위원회',  desc: '<p><strong>장소:</strong> 학회 사무국</p><p>11월 추계학술대회 프로그램 확정</p>' },
  { offset: 100, title: '회원사 산학협력 포럼',     desc: '<p><strong>장소:</strong> 강남 모비스 컨퍼런스센터</p><p>산업체 회원사와 학계 회원의 협력 사례 공유</p>' },
  { offset: 130, title: '제18회 추계학술대회',      desc: '<p><strong>일시:</strong> 11월 13일 ~ 14일</p><p><strong>장소:</strong> 부산 BEXCO</p><p>우수논문상 시상식 병행</p>' },
  { offset: 200, title: '2027년도 정기총회',        desc: '<p><strong>장소:</strong> 미정</p><p>차년도 사업계획 의결, 임원 개선</p>' }
];

// ============ INSERT ============
const tx = db.transaction(() => {
  // 공지사항
  const insNotice = db.prepare(`
    INSERT INTO notices (organization_id, title, content, is_pinned, author_id, view_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  notices.forEach((n, i) => {
    const ts = datetimeOffset(notices.length - i, 9);
    insNotice.run(orgId, n.title, n.content, n.pinned, author.id, Math.floor(Math.random() * 80) + 5, ts, ts);
  });
  console.log(`  ✓ 공지사항 ${notices.length}건`);

  // 자유게시판
  const insPost = db.prepare(`
    INSERT INTO posts (organization_id, title, content, author_id, view_count, category, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  freePosts.forEach((p, i) => {
    const ts = datetimeOffset(freePosts.length - i + 2, 11);
    insPost.run(orgId, p.title, p.content, author.id, Math.floor(Math.random() * 60) + 3, 'free', ts, ts);
  });
  console.log(`  ✓ 자유게시판 ${freePosts.length}건`);

  // 회원소식
  newsPosts.forEach((p, i) => {
    const ts = datetimeOffset(newsPosts.length - i + 5, 14);
    insPost.run(orgId, p.title, p.content, author.id, Math.floor(Math.random() * 100) + 10, 'news', ts, ts);
  });
  console.log(`  ✓ 회원소식 ${newsPosts.length}건`);

  // 기관일정
  const insSched = db.prepare(`
    INSERT INTO schedules (organization_id, title, schedule_date, description)
    VALUES (?, ?, ?, ?)
  `);
  schedules.forEach(s => {
    insSched.run(orgId, s.title, dateOffset(s.offset), s.desc);
  });
  console.log(`  ✓ 기관일정 ${schedules.length}건`);
});

try {
  tx();
  console.log(`\n✅ ${org.name} 에 샘플 데이터 추가 완료`);
} catch (e) {
  console.error('❌ 시드 실패:', e);
  process.exit(1);
}
