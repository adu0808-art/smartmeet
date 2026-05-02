// SMTP 이메일 발송 헬퍼
//   환경변수:
//     SMTP_HOST      — SMTP 서버 호스트 (예: smtp.gmail.com)
//     SMTP_PORT      — 포트 (기본 587)
//     SMTP_USER      — 사용자 (이메일 주소)
//     SMTP_PASS      — 비밀번호 (Gmail 의 경우 앱 비밀번호)
//     SMTP_FROM      — 발신자 표시 (예: 'SmartMeet <noreply@smartmeet.co.kr>')
//                      미설정 시 SMTP_USER 사용
//
//   사용 예 (Gmail SMTP):
//     SMTP_HOST=smtp.gmail.com
//     SMTP_PORT=587
//     SMTP_USER=youraddress@gmail.com
//     SMTP_PASS=<Google 앱 비밀번호>
//     SMTP_FROM=SmartMeet <youraddress@gmail.com>

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
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,  // 465 만 SSL, 그 외 STARTTLS
      auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      } : undefined
    });
    console.log('[email] SMTP transporter 준비 완료:', process.env.SMTP_HOST);
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
  return await t.sendMail({ from: sender, to, subject, html, text });
}

module.exports = { sendEmail, isEnabled };
