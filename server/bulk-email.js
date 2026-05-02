// 다수 수신자 이메일 일괄 발송 헬퍼
//   - Rate limit 회피: 발송 간 간격(throttle), 429 응답 시 지수 backoff 재시도
//   - SSE 스타일 스트리밍 응답 (실시간 진행률 표시용)
//   - 또는 일반 JSON 응답 (스트리밍 미요청 시)

const emailModule = require('./email');

const RATE_LIMIT_DELAY_MS = 700;   // 발송 사이 간격 — Resend 무료 2 req/sec 안전 마진
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1500, 3000, 6000];  // 재시도 간격

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 한 통 발송 + 429 재시도
async function sendOneWithRetry(payload) {
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await emailModule.sendEmail(payload);
    } catch (e) {
      lastErr = e;
      // Rate limit (429) 또는 일시적 오류 → 재시도
      const msg = String(e.message || '').toLowerCase();
      const isRateLimit = msg.includes('rate') || msg.includes('429') || msg.includes('too many');
      if (!isRateLimit || attempt === MAX_RETRIES) break;
      const wait = RETRY_BACKOFF_MS[attempt] || 6000;
      console.warn(`[bulk-email] rate limit — ${attempt+1}회 재시도 (${wait}ms 대기)`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// 일괄 발송 + 진행률 스트리밍
//   targets: [{ id, name, email, ...customData }]
//   makeMessage: (target) => { subject, html, text } 또는 비동기 함수
//   onSent: (target, info) => void  — 각 발송 성공 후 호출 (이력 갱신용)
//   res: Express 응답 객체
//   stream: true 면 SSE 스타일로 스트리밍, false 면 마지막에 JSON 응답
async function sendBulk({ targets, makeMessage, onSent, res, stream = false }) {
  const total = targets.length;
  const results = { sent: 0, skipped: 0, failed: 0, errors: [] };

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');  // nginx 버퍼링 차단
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
  }

  const sendEvent = (data) => {
    if (stream) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    }
  };

  // 시작 이벤트
  sendEvent({ type: 'start', total });

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    sendEvent({
      type: 'progress',
      current: i,
      total,
      sent: results.sent,
      failed: results.failed,
      skipped: results.skipped,
      currentName: t.name || ''
    });

    if (!t.email || !/.+@.+\..+/.test(t.email)) {
      results.skipped++;
      results.errors.push(`${t.name}: 이메일 없음`);
      continue;
    }

    try {
      const msg = await Promise.resolve(makeMessage(t));
      const info = await sendOneWithRetry({ to: t.email, ...msg });
      results.sent++;
      if (typeof onSent === 'function') {
        try { await Promise.resolve(onSent(t, info)); } catch {}
      }
      sendEvent({
        type: 'item-success',
        current: i + 1,
        total,
        target: { id: t.id, name: t.name, email: t.email }
      });
    } catch (e) {
      results.failed++;
      results.errors.push(`${t.name} (${t.email}): ${e.message}`);
      console.warn('[bulk-email] 발송 실패:', t.email, e.message);
      sendEvent({
        type: 'item-failed',
        current: i + 1,
        total,
        target: { id: t.id, name: t.name, email: t.email },
        error: e.message
      });
    }

    // Rate limit 회피 — 마지막 발송 후엔 sleep 안 함
    if (i < targets.length - 1) await sleep(RATE_LIMIT_DELAY_MS);
  }

  // 완료 이벤트
  sendEvent({ type: 'done', ...results });

  if (stream) {
    res.end();
  } else {
    res.json(results);
  }
}

module.exports = { sendBulk };
