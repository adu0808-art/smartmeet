// 이메일 발송 헬퍼 — Resend SDK 사용
// 환경변수:
//   RESEND_API_KEY — Resend API 키 (https://resend.com)
//   SMTP_FROM      — 발신자 표시 (예: 'SmartMeet <onboarding@resend.dev>')
//                    미설정 시 기본값: 'SmartMeet <onboarding@resend.dev>'

let Resend = null;
try {
    Resend = require('resend').Resend;
} catch (e) {
    console.warn('[email] @resend/node 모듈 로드 실패:', e.message);
}

let _client = null;

function getClient() {
    if (_client) return _client;
    if (!Resend) return null;
    if (!process.env.RESEND_API_KEY) {
          return null; // 설정 없음
    }
    _client = new Resend(process.env.RESEND_API_KEY);
    console.log('[email] Resend 클라이언트 초기화 완료');
    return _client;
}

function isEnabled() {
    return !!process.env.RESEND_API_KEY && !!Resend;
}

async function sendEmail({ to, subject, html, text, from }) {
    const client = getClient();
    if (!client) {
          throw new Error('이메일 발송이 설정되지 않았습니다. RESEND_API_KEY 환경변수를 설정해주세요.');
    }
    if (!to) throw new Error('수신자 이메일이 비어있습니다.');

  const sender = from || process.env.SMTP_FROM || 'SmartMeet <onboarding@resend.dev>';

  try {
        const { data, error } = await client.emails.send({
                from: sender,
                to: Array.isArray(to) ? to : [to],
                subject,
                html,
                text,
        });

      if (error) {
              console.error('[email] ❌ 발송 실패:', { to, error });
              throw new Error(error.message || '이메일 발송 실패');
      }

      console.log(`[email] 발송 성공 → ${to} id=${data.id}`);
        return data;
  } catch (e) {
        console.error('[email] ❌ 발송 실패:', { to, message: e.message });
        throw e;
  }
}

module.exports = { sendEmail, isEnabled };
