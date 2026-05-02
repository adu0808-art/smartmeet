// 비밀번호 정책 — 모든 서버 라우트에서 공통으로 사용
//   요구사항: 영문 대문자·소문자·숫자·특수문자 각 1자 이상 + 8자 이상

const MIN_LEN = 8;

const RULES = [
  { test: (p) => p.length >= MIN_LEN, msg: `${MIN_LEN}자 이상이어야 합니다.` },
  { test: (p) => /[A-Z]/.test(p),     msg: '영문 대문자가 1자 이상 포함되어야 합니다.' },
  { test: (p) => /[a-z]/.test(p),     msg: '영문 소문자가 1자 이상 포함되어야 합니다.' },
  { test: (p) => /[0-9]/.test(p),     msg: '숫자가 1자 이상 포함되어야 합니다.' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), msg: '특수문자가 1자 이상 포함되어야 합니다.' }
];

// 실패 시 첫 번째 미충족 규칙의 메시지 반환, 통과 시 null
function validate(password) {
  if (typeof password !== 'string' || !password) return '비밀번호를 입력하세요.';
  for (const r of RULES) {
    if (!r.test(password)) return `비밀번호는 ${r.msg}`;
  }
  return null;
}

// 정책 안내 문자열 (UI 노출용)
const REQUIREMENTS_TEXT = `8자 이상, 영문 대/소문자·숫자·특수문자 각 1자 이상 포함`;

module.exports = { validate, MIN_LEN, REQUIREMENTS_TEXT };
