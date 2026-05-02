// SMTP 이메일 발송 헬퍼
//   환경변수:
//     SMTP_HOST      — SMTP 서버 호스트 (예: smtp.gmail.com)
//     SMTP_PORT      — 포트 (기본 587)
//     SMTP_SECURE    — 명시적 SSL/TLS 모드 (선택)
//                      'true' / '1' / 'yes' → SSL 직접 사용 (포트 무관)
//                      'false' / '0' / 'no' → STARTTLS (포트 무관)
//                      미설정 시 → 자동: 포트 465 만 SSL, 그 외 STARTTLS
//     SMTP_USER      — 사용자 (이메일 주소)
//     SMTP_PASS      — 비밀번호 (Gmail 의 경우 앱 비밀번호)
//     SMTP_FROM      — 발신자 표시 (예: 'SmartMeet <noreply@smartmeet.co.kr>')
//                      미설정 시 SMTP_USER 사용
//
//   사용 예 (Gmail SMTP - STARTTLS):
//     SMTP_HOST=smtp.gmail.com
//     SMTP_PORT=587
//     SMTP_USER=youraddress@gmail.com
//     SMTP_PASS=<Google 앱 비밀번호>
//     SMTP_FROM=SmartMeet <youraddress@gmail.com>
//
//   사용 예 (SSL/TLS 직접):
//     SMTP_HOST=smtp.gmail.com
//     SMTP_PORT=465
//     SMTP_SECURE=true
//     SMTP_USER=...
//     SMTP_PASS=...

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) {
  console.warn('[email] nodemailer 모듈 로드 실패:', e.message);
}

let _transporter = null;
let _initFailed = false;

function getTransporter() {
  if (_initFailed) return null;
  if (_transporter) return _transporter;
  if (!nodemailer) { _initFailed = true; return null; }
  if (!process.env.SMTP_HOST) {
    return null;  // 설정 없음 (silent — 매번 호출돼도 한 번만 경고)
  }
  try {
    const port = Number(process.env.SMTP_PORT) || 587;
    // secure 결정 우선순위:
    //   1) SMTP_SECURE 명시 → 그 값 사용
    //   2) 미설정 → 포트 465 만 true (SSL), 그 외 false (STARTTLS)
    let secure;
    const secureEnv = process.env.SMTP_SECURE;
    if (secureEnv !== undefined && secureEnv !== '') {
      const v = String(secureEnv).trim().toLowerCase();
      secure = ['true', '1', 'yes', 'on'].includes(v);
    } else {
      secure = port === 465;
    }
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      } : undefined
    });
    console.log(`[email] SMTP transporter 준비 완료: ${process.env.SMTP_HOST}:${port} (secure=${secure})`);
    return _transporter;
  } catch (e) {
    console.error('[email] SMTP 초기화 실패:', e.message);
    _initFailed = true;
    return null;
  }
}

function isEnabled() {
  return !!process.env.SMTP_HOST && !!nodemailer;
}

async function sendEmail({ to, subject, html, text, from }) {
  const t = getTransporter();
  if (!t) {
    throw new Error('이메일 발송이 설정되지 않았습니다. 관리자에게 문의해주세요. (SMTP 환경변수 미설정)');
  }
  if (!to) throw new Error('수신자 이메일이 비어있습니다.');
  const sender = from || process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    const info = await t.sendMail({ from: sender, to, subject, html, text });
    console.log(`[email] 발송 성공 → ${to}  messageId=${info.messageId}  response=${info.response}`);
    return info;
  } catch (e) {
    // 자세한 에러 로그 (디버깅용)
    console.error('[email] ❌ 발송 실패:', {
      to, code: e.code, command: e.command, response: e.response, message: e.message
    });
    throw e;
  }
}

module.exports = { sendEmail, isEnabled };
