/**
 * 한국산업기술경영학회 기관소개 디자인 업데이트
 *   organization_id=1 의 intro_html 필드(기관소개)에 간략하고 깔끔한 HTML 삽입
 *   실행: node server/scripts/update-intro.js
 */
const db = require('../db');

const orgId = Number(process.argv[2]) || 1;
const org = db.prepare('SELECT id, name FROM organizations WHERE id = ?').get(orgId);
if (!org) { console.error('organization not found'); process.exit(1); }

// 기관 소개 HTML — 간략하고 임팩트 있게 (인사말과 차별화 — 여기는 사실/데이터 중심)
const introHtml = `<div style="font-family:'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif;color:#1a202c;line-height:1.75;">

<div style="background:#f8fafc;border-left:5px solid #1e40af;padding:24px 28px;border-radius:8px;margin-bottom:32px;">
<div style="font-size:11px;font-weight:700;color:#1e40af;letter-spacing:2px;margin-bottom:8px;">ABOUT US</div>
<p style="font-size:18px;font-weight:600;color:#0f2c5c;margin:0;line-height:1.55;">
산업기술과 경영의 융합을 통해<br>
<span style="color:#1e40af;">새로운 가치를 창출</span>합니다
</p>
</div>

<p style="font-size:15px;color:#374151;margin:0 0 28px 0;">
<strong style="color:#0f2c5c;">한국산업기술경영학회(KSITM)</strong>는
산업기술과 경영의 융합 연구를 선도하는 전문 학술 단체로, 학문적 깊이와 실무적 실용성을 모두 갖춘
지식 공동체를 지향합니다. 학술 연구·산학 협력·인재 양성을 3대 축으로
국가 산업 경쟁력 강화와 지속가능한 미래 가치 창출에 기여하고 있습니다.
</p>

<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:28px 0;">

<div style="text-align:center;padding:20px 12px;background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%);border:1px solid #e2e8f0;border-radius:10px;">
<div style="font-size:28px;font-weight:800;color:#1e40af;line-height:1;">1998</div>
<div style="font-size:11px;color:#64748b;margin-top:6px;letter-spacing:0.5px;">FOUNDED</div>
</div>

<div style="text-align:center;padding:20px 12px;background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%);border:1px solid #e2e8f0;border-radius:10px;">
<div style="font-size:28px;font-weight:800;color:#1e40af;line-height:1;">800<span style="font-size:16px;">+</span></div>
<div style="font-size:11px;color:#64748b;margin-top:6px;letter-spacing:0.5px;">MEMBERS</div>
</div>

<div style="text-align:center;padding:20px 12px;background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%);border:1px solid #e2e8f0;border-radius:10px;">
<div style="font-size:28px;font-weight:800;color:#1e40af;line-height:1;">25<span style="font-size:16px;">회</span></div>
<div style="font-size:11px;color:#64748b;margin-top:6px;letter-spacing:0.5px;">ANNUAL EVENTS</div>
</div>

<div style="text-align:center;padding:20px 12px;background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%);border:1px solid #e2e8f0;border-radius:10px;">
<div style="font-size:28px;font-weight:800;color:#1e40af;line-height:1;">42<span style="font-size:16px;">권</span></div>
<div style="font-size:11px;color:#64748b;margin-top:6px;letter-spacing:0.5px;">JOURNAL</div>
</div>

</div>

<div style="background:#0f2c5c;color:#ffffff;padding:28px 32px;border-radius:12px;margin:32px 0;">
<div style="font-size:11px;font-weight:700;color:#fbbf24;letter-spacing:2px;margin-bottom:12px;">MISSION</div>
<p style="font-size:16px;font-weight:500;margin:0;line-height:1.7;color:#ffffff;">
산업기술과 경영을 잇는 <strong style="color:#fbbf24;">학문적 가교</strong> 로서,
연구와 산업 현장을 연결하고 미래 산업의 방향을 제시합니다.
</p>
</div>

<h3 style="font-size:16px;font-weight:700;color:#0f2c5c;margin:32px 0 16px 0;padding-left:12px;border-left:3px solid #fbbf24;">
주요 활동
</h3>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">

<div style="display:flex;align-items:flex-start;gap:14px;padding:16px 18px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;">
<div style="flex-shrink:0;width:40px;height:40px;background:#dbeafe;color:#1e40af;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">📚</div>
<div>
<div style="font-size:14px;font-weight:700;color:#0f2c5c;margin-bottom:2px;">학술 연구</div>
<div style="font-size:12.5px;color:#64748b;line-height:1.55;">정기 학술대회·전문 학술지 발간</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:14px;padding:16px 18px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;">
<div style="flex-shrink:0;width:40px;height:40px;background:#fef3c7;color:#b45309;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">🏭</div>
<div>
<div style="font-size:14px;font-weight:700;color:#0f2c5c;margin-bottom:2px;">산학 협력</div>
<div style="font-size:12.5px;color:#64748b;line-height:1.55;">기업·연구기관 공동 연구 및 자문</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:14px;padding:16px 18px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;">
<div style="flex-shrink:0;width:40px;height:40px;background:#dcfce7;color:#15803d;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">🌐</div>
<div>
<div style="font-size:14px;font-weight:700;color:#0f2c5c;margin-bottom:2px;">국제 교류</div>
<div style="font-size:12.5px;color:#64748b;line-height:1.55;">글로벌 학회·연구기관과 MOU</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:14px;padding:16px 18px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;">
<div style="flex-shrink:0;width:40px;height:40px;background:#ede9fe;color:#6d28d9;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">🎯</div>
<div>
<div style="font-size:14px;font-weight:700;color:#0f2c5c;margin-bottom:2px;">인재 양성</div>
<div style="font-size:12.5px;color:#64748b;line-height:1.55;">차세대 기술경영 리더 교육</div>
</div>
</div>

</div>

</div>`;

db.prepare('UPDATE organizations SET intro_html = ? WHERE id = ?').run(introHtml, orgId);
console.log(`✅ ${org.name} 기관소개 업데이트 완료 (${introHtml.length} bytes)`);
