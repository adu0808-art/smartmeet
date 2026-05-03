// 전화번호 처리 — DB 저장은 숫자만, 표시는 '-' 포함 형식
//   서버 측에서 모든 phone 입력에 normalizePhone() 호출 → DB 일관성 유지

function normalizePhone(s) {
  return String(s == null ? '' : s).replace(/\D/g, '');
}

// 표시용 (서버 측에선 거의 안 씀, 프론트에서 동일한 로직 사용)
function formatPhone(s) {
  const d = normalizePhone(s);
  if (!d) return '';
  // 11자리 휴대폰: 010-1234-5678
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  // 10자리 — 02 지역번호 / 010 옛 번호
  if (d.length === 10) {
    if (d.startsWith('02')) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  // 9자리 — 02 지역번호 옛 형식
  if (d.length === 9 && d.startsWith('02')) {
    return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  }
  // 8자리 — 1588-1234 등 대표번호
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return d;
}

module.exports = { normalizePhone, formatPhone };
