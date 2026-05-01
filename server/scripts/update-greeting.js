/**
 * 한국산업기술경영학회 인사말 디자인 업데이트
 *   organization_id=1 의 description 필드(인사말)에 깔끔한 디자인의 HTML 삽입
 *   실행: node server/scripts/update-greeting.js
 */
const db = require('../db');

const orgId = Number(process.argv[2]) || 1;
const org = db.prepare('SELECT id, name FROM organizations WHERE id = ?').get(orgId);
if (!org) { console.error('organization not found'); process.exit(1); }

// 인사말 HTML — 인라인 스타일만 사용 (외부 CSS 의존 없음)
// 학회장 김성한 회장 명의로 작성
const greetingHtml = `<div style="font-family:'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif;color:#1a202c;line-height:1.8;">

<div style="background:linear-gradient(135deg,#0f2c5c 0%,#1e40af 50%,#3b82f6 100%);color:#ffffff;padding:56px 48px;border-radius:14px;position:relative;overflow:hidden;margin-bottom:36px;">
  <div style="position:absolute;top:-30px;right:-30px;width:240px;height:240px;border-radius:50%;background:rgba(251,191,36,0.08);"></div>
  <div style="position:absolute;bottom:-50px;left:-30px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,0.04);"></div>
  <div style="position:relative;z-index:1;">
    <div style="font-size:13px;font-weight:600;letter-spacing:3px;color:#fbbf24;text-transform:uppercase;margin-bottom:14px;">President's Greetings</div>
    <h1 style="font-size:36px;font-weight:800;margin:0 0 18px 0;color:#ffffff;letter-spacing:-0.5px;line-height:1.25;">
      한국산업기술경영학회<br>
      <span style="font-size:24px;font-weight:500;color:#dbeafe;">방문을 진심으로 환영합니다</span>
    </h1>
    <div style="width:64px;height:4px;background:#fbbf24;margin:18px 0 0 0;border-radius:2px;"></div>
  </div>
</div>

<div style="font-size:15.5px;color:#374151;margin-bottom:32px;">

<p style="font-size:17px;font-weight:600;color:#1e3a8a;margin:0 0 24px 0;line-height:1.6;">
존경하는 회원 여러분, 그리고 본 학회 홈페이지를 찾아주신 모든 분들께 깊은 감사의 인사를 드립니다.
</p>

<p style="margin:0 0 18px 0;">
<strong style="color:#0f2c5c;">한국산업기술경영학회(KSITM)</strong>는 산업기술과 경영의 융합을 통해
새로운 가치를 창출하고, 학문적 발전과 실무적 혁신을 동시에 추구하는 전문 학술 단체입니다.
1990년대 후반 우리나라 산업기술경영의 학문적 토대 마련이라는 시대적 사명에서 출발하여,
오늘날에는 국내외 산학연을 잇는 가장 활발한 교류의 장으로 자리매김하였습니다.
</p>

<p style="margin:0 0 18px 0;">
4차 산업혁명과 인공지능이 산업 전반의 패러다임을 재편하는 지금, 기술과 경영의 경계는 점차
허물어지고 있으며, <em style="color:#1e40af;">"어떻게 기술을 사업화하고 가치로 연결할 것인가"</em>
라는 질문은 그 어느 때보다 중요해졌습니다. 우리 학회는 이러한 시대적 요구에 부응하여,
회원 여러분의 연구와 실무가 산업 현장에서 실질적인 성과로 이어질 수 있도록 든든한 동반자가 되겠습니다.
</p>

</div>

<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:36px 0 40px 0;">

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:4px solid #1e40af;border-radius:12px;padding:24px 22px;">
<div style="font-size:28px;margin-bottom:12px;">🎓</div>
<h3 style="font-size:15px;font-weight:700;color:#0f2c5c;margin:0 0 8px 0;">학술 연구</h3>
<p style="font-size:13px;color:#64748b;margin:0;line-height:1.65;">
정기 학술대회·학술지 발간을 통해 산업기술경영의 학문적 지평을 넓히고
연구 성과를 공유합니다.
</p>
</div>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:4px solid #fbbf24;border-radius:12px;padding:24px 22px;">
<div style="font-size:28px;margin-bottom:12px;">🤝</div>
<h3 style="font-size:15px;font-weight:700;color:#0f2c5c;margin:0 0 8px 0;">산학 협력</h3>
<p style="font-size:13px;color:#64748b;margin:0;line-height:1.65;">
대학·연구기관·산업체를 연결하는 네트워크 허브로서
실질적 협력과 기술이전을 촉진합니다.
</p>
</div>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:4px solid #10b981;border-radius:12px;padding:24px 22px;">
<div style="font-size:28px;margin-bottom:12px;">🚀</div>
<h3 style="font-size:15px;font-weight:700;color:#0f2c5c;margin:0 0 8px 0;">미래 인재</h3>
<p style="font-size:13px;color:#64748b;margin:0;line-height:1.65;">
워크숍·교육 프로그램을 통해 차세대 기술경영
리더 양성에 적극 기여하고 있습니다.
</p>
</div>

</div>

<div style="background:linear-gradient(135deg,#fff8e1 0%,#fef3c7 100%);border-left:4px solid #fbbf24;padding:24px 28px;border-radius:8px;margin:32px 0;">
<p style="font-size:15px;color:#78350f;margin:0;line-height:1.75;font-weight:500;">
<span style="font-size:24px;color:#f59e0b;line-height:1;">"</span>
앞으로도 한국산업기술경영학회는 <strong>학문적 깊이와 실무적 실용성</strong>을 모두 갖춘
학술 공동체로서, 우리나라 산업기술경영 분야의 발전과 국가 경쟁력 강화에
앞장서 나가겠습니다.
</p>
</div>

<div style="font-size:15.5px;color:#374151;margin-bottom:40px;">

<p style="margin:0 0 18px 0;">
회원 여러분의 깊은 성원과 적극적인 참여를 부탁드리며, 본 학회가 추구하는 가치에 함께해 주시는
모든 분들께 다시 한 번 감사의 마음을 전합니다.
</p>

<p style="margin:0 0 18px 0;color:#1e40af;font-weight:600;">
여러분 모두의 건승과 가정의 평안을 진심으로 기원합니다. 감사합니다.
</p>

</div>

<div style="text-align:right;padding:28px 0 8px 0;border-top:2px solid #e2e8f0;margin-top:32px;">
<div style="font-size:13px;color:#64748b;margin-bottom:8px;letter-spacing:1px;">2026년</div>
<div style="font-size:14px;color:#475569;margin-bottom:14px;">한국산업기술경영학회 제 10대 회장</div>
<div style="font-size:28px;font-weight:800;color:#0f2c5c;letter-spacing:6px;">김 성 한</div>
<div style="display:inline-block;width:50px;height:3px;background:#fbbf24;margin-top:12px;border-radius:2px;"></div>
</div>

</div>`;

// 업데이트
db.prepare('UPDATE organizations SET description = ? WHERE id = ?').run(greetingHtml, orgId);
console.log(`✅ ${org.name} 인사말 업데이트 완료 (${greetingHtml.length} bytes)`);
