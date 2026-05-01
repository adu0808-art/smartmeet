const meetingId = qs('id');
let me, meeting, organization, agendas = [], members = [], proxies = [], tocItems = [];
let activeTab = (location.hash || '#toc').replace('#', '') || 'toc';
let memberFilter = 'all';
let memberSearchQ = '';

let myRole;
(async function init() {
  me = await requireAuth();
  if (!me) return;
  document.getElementById('userArea').innerHTML = renderUserChip(me);
  if (!meetingId) { location.href = '/dashboard'; return; }
  const data = await api.get(`/api/meetings/${meetingId}`);
  meeting = data.meeting;
  organization = data.organization;
  myRole = data.my_role;
  paintHero();
  // 회의 상세 페이지는 좌측 사이드바를 숨김 (회의 정보·관리에 집중)
  bindActions();
  switchTab(activeTab);
  refreshAll();
  applyRoleGates();
  applyTypeGates();
  // periodic refresh (only meaningful for formal meetings)
  if (isFormalMeeting(meeting.meeting_type)) setInterval(refreshQuorum, 5000);
})();

function applyRoleGates() {
  const isAdmin = myRole === 'system_admin' || myRole === 'admin';
  const writeButtons = ['editMeetingBtn', 'invitationBtn', 'addAgendaBtn', 'addMemberBtn', 'excelImportBtn', 'importExecBtn', 'addTocBtn', 'addTocAgendaBtn'];
  writeButtons.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = isAdmin ? '' : 'none'; });
}

function applyTypeGates() {
  // For '일반' (regular) meetings: hide quorum panel, proxy-related buttons, and formal tabs
  const formal = isFormalMeeting(meeting.meeting_type);
  // Hide quorum + summary cards (right panel)
  const rp = document.querySelector('.rightpanel');
  if (rp) rp.style.display = formal ? '' : 'none';
  const wrap = document.querySelector('.with-rightpanel');
  if (wrap) wrap.style.gridTemplateColumns = formal ? '1fr var(--rightpanel-w)' : '1fr';
  // Hide tabs that don't apply
  const tabsToHide = ['agendas', 'members', 'proxies'];
  document.querySelectorAll('#tabs .tab').forEach(t => {
    if (tabsToHide.includes(t.dataset.tab)) t.style.display = formal ? '' : 'none';
  });
  // Hide invitation button (proxy-related) for regular type
  const invBtn = document.getElementById('invitationBtn');
  if (invBtn && !formal) invBtn.style.display = 'none';
  if (!formal) {
    // Switch to TOC tab if currently on a hidden one
    if (tabsToHide.includes(activeTab)) {
      switchTab('toc');
      location.hash = '#toc';
    }
  }
}

function paintHero() {
  // 로고가 등록되어 있으면 이미지로, 없으면 기관명 약자로 표시
  const heroLogoEl = document.getElementById('heroLogo');
  const logoSrc = (typeof pickLogo === 'function') ? pickLogo(organization, 'logo') : (organization.logo_url || '');
  if (logoSrc) {
    heroLogoEl.innerHTML = `<img src="${logoSrc}" alt="logo" style="width:100%;height:100%;object-fit:contain;background:white;border-radius:inherit;">`;
    heroLogoEl.style.padding = '0';
    heroLogoEl.style.overflow = 'hidden';
  } else {
    heroLogoEl.textContent = logoText(organization.name);
    heroLogoEl.style.padding = '';
    heroLogoEl.style.overflow = '';
  }
  document.getElementById('heroTitle').textContent = meeting.title;
  const t = document.getElementById('heroType');
  t.textContent = meetingTypeLabel[meeting.meeting_type] || '회의';
  const cls = meeting.meeting_type === 'general' ? 'tag-general'
            : meeting.meeting_type === 'regular' ? 'tag-status-prep'
            : 'tag-board';
  t.className = 'tag ' + cls;
  const s = document.getElementById('heroStatus');
  s.textContent = meetingStatusLabel[meeting.status] || meeting.status;
  s.className = 'tag ' + (meetingStatusClass[meeting.status] || '');
  document.getElementById('heroDate').innerHTML = `🗓 ${fmtDate(meeting.meeting_date)}`;
  document.getElementById('heroLocation').innerHTML = `📍 ${meeting.location || '장소 미정'}`;
}

function bindActions() {
  document.querySelectorAll('#tabs .tab').forEach(t => t.onclick = () => { switchTab(t.dataset.tab); location.hash = '#' + t.dataset.tab; });
  document.getElementById('addAgendaBtn').onclick = () => openAgendaForm();
  document.getElementById('addTocBtn').onclick = () => openTocForm();
  const tocAgendaBtn = document.getElementById('addTocAgendaBtn');
  if (tocAgendaBtn) tocAgendaBtn.onclick = () => openAgendaForm();
  document.getElementById('addMemberBtn').onclick = openMemberForm;
  document.getElementById('excelImportBtn').onclick = openExcelImport;
  const importExecBtn = document.getElementById('importExecBtn');
  if (importExecBtn) importExecBtn.onclick = openImportExecutivesPicker;
  // issueAllBtn / issueProxyBtn removed; "링크 생성" lives inside the public-link card in proxies tab
  document.getElementById('editMeetingBtn').onclick = openMeetingEdit;
  document.getElementById('invitationBtn').onclick = showInvitation;
  document.getElementById('minutesBtn').onclick = () => location.href = `/minutes?id=${meetingId}`;
  document.getElementById('presentBtn').onclick = () => window.open(`/presentation?id=${meetingId}`, '_blank');

  document.querySelectorAll('.filter-pill').forEach(p => p.onclick = () => {
    document.querySelectorAll('.filter-pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    memberFilter = p.dataset.filter;
    renderMembers();
  });

  document.getElementById('memberSearch').oninput = (e) => { memberSearchQ = e.target.value.trim(); renderMembers(); };
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== tab));
}

async function refreshAll() {
  await Promise.all([loadAgendas(), loadMembers(), loadProxies(), loadToc(), refreshQuorum()]);
}

let lastQuorum = null;
let _lastProxyCount = -1;
async function refreshQuorum() {
  try {
    const q = await api.get(`/api/meetings/${meetingId}/quorum`);
    // Detect proxy submission changes → refresh members + proxies tabs
    if (_lastProxyCount !== -1 && q.proxy !== _lastProxyCount) {
      loadProxies();
      loadMembers();
    }
    _lastProxyCount = q.proxy;
    lastQuorum = q;
    const fillPct = q.target ? Math.min(100, (q.attended / q.target) * 100) : 0;
    document.getElementById('qAttended').textContent = q.attended;
    document.getElementById('qTotal').textContent = `/ ${q.total}명`;
    document.getElementById('qTarget').textContent = q.target;
    document.getElementById('qPresent').textContent = `${q.present}명`;
    document.getElementById('qProxy').textContent = `${q.proxy}명`;
    const fill = document.getElementById('qBarFill');
    fill.style.width = fillPct + '%';
    fill.classList.toggle('not-met', !q.quorumMet);
    const badge = document.getElementById('qBadge');
    badge.textContent = q.quorumMet ? '충족' : '미달';
    badge.className = 'quorum-status-badge ' + (q.quorumMet ? 'quorum-status-met' : 'quorum-status-not');
    document.getElementById('qInfoBox').style.background = q.quorumMet ? 'var(--success-soft)' : 'var(--danger-soft)';
    document.getElementById('qInfoBox').style.color = q.quorumMet ? 'var(--success)' : 'var(--danger)';
    document.getElementById('qInfo').textContent = q.quorumMet ? '의결을 진행할 수 있습니다.' : '정족수 미달입니다.';
    document.getElementById('qMajority').innerHTML = `출석 <b>${q.attended}명</b> 중 <b>${q.majority}명</b> 이상 찬성 (과반수)`;
  } catch (e) {}
}

// ===== AGENDAS =====
async function loadAgendas() {
  const { agendas: list } = await api.get(`/api/agendas?meeting_id=${meetingId}`);
  agendas = list;
  document.getElementById('tabbadge-agendas').textContent = list.length;
  document.getElementById('agendaCount').textContent = list.length;
  renderAgendas();
  renderTOC();
  // summary
  let pass = 0, fail = 0, pending = 0;
  list.forEach(a => {
    if (!a.vote_result) pending++;
    else if (a.vote_result.includes('가결') || a.vote_result === 'pass') pass++;
    else fail++;
  });
  document.getElementById('sm-total').textContent = `${list.length}건`;
  document.getElementById('sm-pass').textContent = `${pass}건`;
  document.getElementById('sm-fail').textContent = `${fail}건`;
  document.getElementById('sm-pending').textContent = `${pending}건`;
}

function renderAgendas() {
  const root = document.getElementById('agendaList');
  if (!agendas.length) {
    root.innerHTML = `<div class="empty"><div class="empty-title">의안이 없습니다</div><div class="empty-sub">‘+ 의안 추가’ 버튼으로 의안을 등록하세요.</div></div>`;
    return;
  }
  root.innerHTML = agendas.map(a => `
    <div class="agenda-item" draggable="true" data-id="${a.id}">
      <div class="agenda-no">
        <div class="small">제</div>
        <div class="num">${a.agenda_no}호</div>
      </div>
      <div class="agenda-body">
        <div class="mb-8"><span class="tag ${agendaTypeClass[a.agenda_type]}">${agendaTypeLabel[a.agenda_type]||'일반'}</span> <b>${a.title}</b> ${a.vote_result ? `<span class="tag tag-status-done" style="margin-left:6px;">${a.vote_result}</span>` : ''}</div>
        <div class="agenda-summary">${a.summary || '요약이 없습니다.'}</div>
      </div>
      <div class="agenda-actions">
        <button class="btn btn-sm" onclick="openAgendaDetail(${a.id})">상세 관리 →</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAgenda(${a.id})">🗑</button>
      </div>
    </div>
  `).join('');
  // drag&drop reordering with indicator
  bindDndReorder(root, 'data-id', async (orderedIds) => {
    try {
      await api.post('/api/agendas/reorder', { items: orderedIds.map(id => ({ id: Number(id) })) });
      loadAgendas();
    } catch (ex) { toast(ex.message, 'error'); }
  });
}

async function loadToc() {
  const { items } = await api.get(`/api/toc-items?meeting_id=${meetingId}`);
  tocItems = items;
  renderTOC();
}

function renderTOC() {
  const root = document.getElementById('tocList');
  if (!root) return;
  const countEl = document.getElementById('tocCount');
  if (countEl) countEl.textContent = `(${tocItems.length}개 항목)`;

  if (!tocItems.length) {
    root.innerHTML = `
      <div class="empty">
        <div class="empty-title">등록된 목차 항목이 없습니다</div>
        <div class="empty-sub">‘+ 항목 추가’로 개회사·인사·보고·폐회 등을 추가하세요.</div>
      </div>`;
  } else {
    root.innerHTML = tocItems.map((it, idx) => `
      <div class="agenda-item toc-row" draggable="true" data-id="${it.id}">
        <div class="toc-num" title="드래그해 순서 변경">${idx + 1}</div>
        <div class="agenda-body" style="min-width:0;">
          <div class="agenda-title" style="font-size:14px;">${it.title}</div>
        </div>
        <div class="agenda-actions">
          <button class="btn btn-sm" data-edit="${it.id}">수정</button>
          <button class="btn btn-sm btn-danger" data-del="${it.id}">🗑</button>
        </div>
      </div>
    `).join('');
    bindTocDnd();
    root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const it = tocItems.find(x => x.id === Number(b.dataset.edit));
      openTocForm(it);
    });
    root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteToc(Number(b.dataset.del)));
  }

}

function bindTocDnd() {
  const root = document.getElementById('tocList');
  bindDndReorder(root, 'data-id', async (orderedIds) => {
    try {
      await api.post('/api/toc-items/reorder', { items: orderedIds.map(id => ({ id: Number(id) })) });
      loadToc();
    } catch (ex) { toast(ex.message, 'error'); }
  });
}

async function openTocForm(existing) {
  const it = existing || {};
  let editor = null;

  modal({
    title: existing ? '목차 항목 수정' : '목차 항목 추가',
    size: 'lg',
    body: `
      ${!existing ? `
      <div class="field">
        <label class="label">유형</label>
        <div class="flex gap-12">
          <label class="flex items-center gap-8" style="cursor:pointer;"><input type="radio" name="toc_kind" value="custom" checked> 일반 항목 (직접 작성)</label>
          <label class="flex items-center gap-8" style="cursor:pointer;"><input type="radio" name="toc_kind" value="agenda"> 등록된 의안에서 선택</label>
        </div>
      </div>` : ''}
      <div id="tc_custom">
        <div class="field"><label class="label">항목명 *</label><input class="input" id="tc_t" value="${(it.title || '').replace(/"/g,'&quot;')}" placeholder="예: 개회사, 회장 인사, 전기 회의록 검토"></div>
        <div class="field"><label class="label">내용</label><div id="tc_editor"></div></div>
      </div>
      <div id="tc_agenda" class="hidden">
        <div class="field">
          <label class="label">의안 선택 *</label>
          <select class="select" id="tc_agenda_id">
            <option value="">의안을 선택하세요</option>
            ${agendas.map(a => `<option value="${a.id}">제 ${a.agenda_no}호 · ${a.title} (${agendaTypeLabel[a.agenda_type] || '일반'})</option>`).join('')}
          </select>
          <div class="text-sm text-muted mt-8">의안의 제목과 내용을 그대로 회의 목차 항목으로 추가합니다.</div>
        </div>
      </div>
    `,
    confirmText: '저장',
    onConfirm: async () => {
      const kindEl = document.querySelector('input[name="toc_kind"]:checked');
      const kind = kindEl ? kindEl.value : 'custom';
      let title, description;
      let agendaId = null;
      if (kind === 'agenda') {
        const aid = Number(document.getElementById('tc_agenda_id').value);
        if (!aid) { toast('의안을 선택하세요.', 'error'); return false; }
        const a = agendas.find(x => x.id === aid);
        if (!a) { toast('의안을 찾을 수 없습니다.', 'error'); return false; }
        title = `[제 ${a.agenda_no}호] ${a.title}`;
        description = '';
        agendaId = aid;
      } else {
        title = document.getElementById('tc_t').value.trim();
        description = editor ? editor.getHtml() : '';
        if (!title) { toast('항목명을 입력하세요.', 'error'); return false; }
      }
      try {
        const payload = { title, description, agenda_id: agendaId };
        if (existing) await api.put(`/api/toc-items/${existing.id}`, payload);
        else await api.post('/api/toc-items', { meeting_id: Number(meetingId), ...payload });
        toast('저장되었습니다.', 'success');
        loadToc();
      } catch (e) { toast(e.message, 'error'); return false; }
    }
  });

  // Toggle between custom and agenda picker
  document.querySelectorAll('input[name="toc_kind"]').forEach(r => {
    r.onchange = () => {
      const kind = r.value;
      document.getElementById('tc_custom').classList.toggle('hidden', kind !== 'custom');
      document.getElementById('tc_agenda').classList.toggle('hidden', kind !== 'agenda');
    };
  });

  editor = await RichEditor.mount(document.getElementById('tc_editor'), {
    value: it.description || '',
    placeholder: '진행자, 시간, 안내 사항 등을 입력하세요. 표·이미지·서식 지정이 가능합니다.'
  });
}

function deleteToc(id) {
  confirmDialog('이 목차 항목을 삭제하시겠습니까?', async () => {
    try { await api.del(`/api/toc-items/${id}`); toast('삭제되었습니다.', 'success'); loadToc(); }
    catch (e) { toast(e.message, 'error'); return false; }
  });
}

async function openAgendaForm(existing) {
  if (!meetingId) { toast('회의 정보가 없습니다.', 'error'); return; }
  const a = existing || { agenda_type: 'general' };
  let agendaEditor = null;
  modal({
    title: existing ? '의안 수정' : '새 의안 추가',
    size: 'lg',
    body: `
      <div class="flex gap-12">
        <div class="field flex-1">
          <label class="label">의안 번호 (제 N 호)</label>
          <input class="input" id="a_no" type="number" min="1" value="${a.agenda_no || (agendas.length + 1)}">
        </div>
        <div class="field flex-1">
          <label class="label">의안 구분</label>
          <select class="select" id="a_type">
            <option value="general" ${a.agenda_type==='general'?'selected':''}>일반 의안</option>
            <option value="budget" ${a.agenda_type==='budget'?'selected':''}>예산·결산 의안</option>
            <option value="election" ${a.agenda_type==='election'?'selected':''}>선거</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="label">의안명 *</label>
        <input class="input" id="a_title" value="${(a.title||'').replace(/"/g,'&quot;')}" placeholder="예: 2026년 사업계획 승인">
      </div>
      <div class="field">
        <label class="label">보고자 (선택)</label>
        <input class="input" id="a_presenter" value="${(a.presenter||'').replace(/"/g,'&quot;')}" placeholder="발표자 또는 진행자">
      </div>
      <div class="field">
        <label class="label">의안 내용</label>
        <div id="a_editor_host"></div>
      </div>
    `,
    confirmText: existing ? '저장' : '추가',
    onConfirm: async () => {
      if (!meetingId) { toast('회의 정보가 없습니다.', 'error'); return false; }
      const payload = {
        meeting_id: Number(meetingId),
        agenda_type: document.getElementById('a_type').value,
        agenda_no: Number(document.getElementById('a_no').value) || null,
        title: document.getElementById('a_title').value.trim(),
        presenter: document.getElementById('a_presenter').value.trim(),
        summary: '',
        content: agendaEditor ? agendaEditor.getHtml() : ''
      };
      if (!payload.title) { toast('의안명을 입력하세요.', 'error'); return false; }
      if (!payload.meeting_id) { toast('회의 정보가 없습니다.', 'error'); return false; }
      try {
        if (existing) await api.put(`/api/agendas/${existing.id}`, payload);
        else await api.post('/api/agendas', payload);
        toast('저장되었습니다.', 'success');
        loadAgendas();
      } catch (e) { toast(e.message, 'error'); return false; }
    }
  });
  agendaEditor = await RichEditor.mount(document.getElementById('a_editor_host'), {
    placeholder: '의안 본문을 입력하세요. 표·이미지·서식 지정이 가능합니다.',
    value: a.content || ''
  });
}

async function openAgendaDetail(id) {
  const { agenda } = await api.get(`/api/agendas/${id}`);
  openAgendaUnifiedDetail(agenda);
}

// ===== 통합 의안 상세 (모든 유형에 의결 패널 적용) =====
let _budgetState = null;

function openAgendaUnifiedDetail(agenda) {
  openBudgetDetail(agenda);
}

function openBudgetDetail(agenda) {
  let parsed = { income: [], expense: [] };
  try {
    const j = JSON.parse(agenda.budget_data || '{}');
    parsed.income = Array.isArray(j.income) ? j.income : [];
    parsed.expense = Array.isArray(j.expense) ? j.expense : [];
  } catch {}

  const attendedDefault = lastQuorum?.attended || 0;
  const hasVote = agenda.vote_result || (Number(agenda.approve_count) + Number(agenda.oppose_count) + Number(agenda.abstain_count)) > 0;
  _budgetState = {
    agenda,
    income: parsed.income,
    expense: parsed.expense,
    voteResult: agenda.vote_result || '',
    approve: hasVote ? Number(agenda.approve_count) : attendedDefault,
    oppose: hasVote ? Number(agenda.oppose_count) : 0,
    abstain: hasVote ? Number(agenda.abstain_count) : 0,
    summary: agenda.vote_summary || ''
  };

  modal({
    title: `의안 상세 — 제 ${agenda.agenda_no}호`,
    size: 'xl',
    hideFoot: true,
    body: `<div id="budgetDetailRoot"></div>`
  });
  paintBudgetDetail();
}

function paintBudgetDetail() {
  const s = _budgetState;
  const a = s.agenda;
  const isBudget = a.agenda_type === 'budget';
  const typeLabel = agendaTypeLabel[a.agenda_type] || '일반';
  const typeClass = agendaTypeClass[a.agenda_type] || 'tag-general';
  const incomeTotal = s.income.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  const expenseTotal = s.expense.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  const totalMembers = meeting.total_members || 0;
  const passRatio = meeting.pass_ratio || 0.5;
  const attended = (s.approve + s.oppose + s.abstain) || totalMembers;
  const majority = Math.ceil(attended * passRatio);

  const root = document.getElementById('budgetDetailRoot');
  if (!root) return;
  root.innerHTML = `
    <div class="budget-detail-grid">
      <div style="display:flex;flex-direction:column;gap:14px;min-width:0;">
        <div class="card" style="border-left:4px solid var(--accent);">
          <div class="flex items-center justify-between mb-12">
            <div class="flex gap-8 items-center">
              <span class="tag ${typeClass}">제 ${a.agenda_no} 호</span>
              <span class="tag ${typeClass}">${typeLabel}</span>
            </div>
            <button class="btn btn-sm" onclick="editAgendaInline()">✏️ 클릭하여 수정</button>
          </div>
          <h2 style="margin:0 0 10px;font-size:22px;font-weight:800;">${escapeAtr(a.title)}</h2>
          <div class="text-sm mb-8" style="color:var(--text);">보고자: ${escapeAtr(a.presenter || '미지정')}</div>
          <div class="label">안건 내용</div>
          <div class="card html-render" style="background:var(--surface-2);box-shadow:none;border-color:var(--border);">${a.content || '<span class="text-muted">내용 없음</span>'}</div>
        </div>

        ${isBudget ? `
        <div class="card">
          <div class="card-title flex items-center gap-8">💰 수지 예산안</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${renderBudgetTable('income', '수 입', incomeTotal)}
            ${renderBudgetTable('expense', '지 출', expenseTotal)}
          </div>
        </div>` : ''}
      </div>

      <div class="card" style="align-self:start;position:sticky;top:14px;">
        <div class="card-title flex items-center gap-8">🔧 의결 결과 기록</div>
        <div class="text-sm text-muted mb-16">회의 중 결정된 사항을 기록합니다.</div>

        <div class="flex items-center justify-between mb-8">
          <label class="label" style="margin:0;">의결 결과</label>
          <span class="text-sm text-muted">투표 결과에 따라 자동 판정</span>
        </div>
        <div class="vote-grid mb-16">
          <button type="button" class="vote-btn ${s.voteResult==='원안가결'?'active':''}" onclick="selectVote('원안가결')">원안가결</button>
          <button type="button" class="vote-btn warn ${s.voteResult==='수정가결'?'active':''}" onclick="selectVote('수정가결')">수정가결</button>
          <button type="button" class="vote-btn danger ${s.voteResult==='부결'?'active':''}" onclick="selectVote('부결')">부결</button>
          <button type="button" class="vote-btn ${s.voteResult==='보류'?'active':''}" onclick="selectVote('보류')">보류</button>
        </div>

        <div class="flex items-center justify-between mb-8">
          <label class="label" style="margin:0;">투표 결과</label>
          <span class="text-sm text-muted">참여인원 ${attended}명 기준 · 가결 기준 ${majority}명 이상</span>
        </div>
        <div class="tally-grid mb-16">
          <div>
            <label class="label">찬성 (입력)</label>
            <input class="input approve" type="number" min="0" value="${s.approve}" oninput="changeTally('approve', this.value)">
          </div>
          <div>
            <label class="label">반대 (입력)</label>
            <input class="input oppose" type="number" min="0" value="${s.oppose}" oninput="changeTally('oppose', this.value)">
          </div>
          <div>
            <label class="label">기권/무효 (자동계산)</label>
            <input class="input" type="number" value="${s.abstain}" readonly style="background:var(--surface-2);text-align:center;">
          </div>
        </div>

        <div class="flex items-center justify-between mb-8">
          <label class="label" style="margin:0;">의결 요지 / 비고</label>
          <span class="text-sm text-muted">투표 결과 기반 자동 작성 · 직접 수정 가능</span>
        </div>
        <textarea class="textarea" id="bv_summary" rows="4" oninput="_budgetState.summary = this.value">${escapeAtr(s.summary)}</textarea>

        <button type="button" class="btn btn-primary btn-block mt-16" onclick="saveBudgetVote()">⊙ 의결 결과 저장</button>
      </div>
    </div>
  `;
}

function renderBudgetTable(type, label, total) {
  const items = _budgetState[type];
  const colorClass = type === 'income' ? 'income-color' : 'expense-color';
  return `
    <div class="budget-table ${type}">
      <div class="budget-head">
        <span>${label}</span>
        <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;border-color:transparent;" onclick="addBudgetItem('${type}')">+ 추가</button>
      </div>
      <table class="budget-tbl">
        <thead><tr><th style="width:18px;"></th><th>항목</th><th>내역</th><th class="amount-col">금액</th><th style="width:30px;"></th></tr></thead>
        <tbody>
          ${items.length ? items.map((it, i) => `
            <tr>
              <td class="budget-row-handle">⋮⋮</td>
              <td><input value="${escapeAtr(it.item || '')}" oninput="updateBudgetItem('${type}', ${i}, 'item', this.value)" placeholder="항목"></td>
              <td><input value="${escapeAtr(it.detail || '')}" oninput="updateBudgetItem('${type}', ${i}, 'detail', this.value)" placeholder="내역"></td>
              <td class="amount-col"><input type="number" value="${it.amount || 0}" oninput="updateBudgetItem('${type}', ${i}, 'amount', Number(this.value))" style="text-align:right;"></td>
              <td><button class="budget-row-del" onclick="removeBudgetItem('${type}', ${i})">🗑</button></td>
            </tr>
          `).join('') : `<tr><td colspan="5" class="budget-empty">항목이 없습니다</td></tr>`}
          <tr class="total-row">
            <td colspan="3">${type === 'income' ? '수입' : '지출'} 합계</td>
            <td class="amount-col ${colorClass}" colspan="2">${total.toLocaleString()}원</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function addBudgetItem(type) {
  _budgetState[type].push({ item: '', detail: '', amount: 0 });
  paintBudgetDetail();
}
function removeBudgetItem(type, idx) {
  _budgetState[type].splice(idx, 1);
  paintBudgetDetail();
}
function updateBudgetItem(type, idx, field, value) {
  _budgetState[type][idx][field] = value;
  // Update only total without full repaint to preserve focus
  const total = _budgetState[type].reduce((s, x) => s + (Number(x.amount)||0), 0);
  const totalCell = document.querySelector(`.budget-table.${type} .total-row .amount-col`);
  if (totalCell) totalCell.textContent = total.toLocaleString() + '원';
}

function selectVote(result) {
  _budgetState.voteResult = (_budgetState.voteResult === result) ? '' : result;
  _budgetState.summary = autoBudgetSummary();
  paintBudgetDetail();
}

function changeTally(kind, val) {
  const v = Math.max(0, Number(val) || 0);
  const attended = lastQuorum?.attended || (_budgetState.approve + _budgetState.oppose + _budgetState.abstain) || meeting.total_members || 0;
  if (kind === 'approve') {
    // 찬성 변경 → 나머지를 반대로, 기권은 0
    _budgetState.approve = Math.min(v, attended);
    _budgetState.oppose = Math.max(0, attended - _budgetState.approve);
    _budgetState.abstain = 0;
  } else if (kind === 'oppose') {
    // 반대 변경 → 나머지를 기권/무효로
    _budgetState.oppose = Math.min(v, Math.max(0, attended - _budgetState.approve));
    _budgetState.abstain = Math.max(0, attended - _budgetState.approve - _budgetState.oppose);
  }
  // Auto-determine result
  const passRatio = meeting.pass_ratio || 0.5;
  const need = Math.ceil(attended * passRatio);
  if (_budgetState.approve >= need) _budgetState.voteResult = '원안가결';
  else _budgetState.voteResult = '부결';
  _budgetState.summary = autoBudgetSummary();
  paintBudgetDetail();
}

function autoBudgetSummary() {
  const s = _budgetState;
  const attended = s.approve + s.oppose + s.abstain;
  const passRatio = meeting.pass_ratio || 0.5;
  const need = Math.ceil(attended * passRatio);
  const ratioLabel = passRatio === 0.5 ? '과반수' : passRatio === 0.66 ? '2/3' : passRatio === 0.75 ? '3/4' : `${Math.round(passRatio*100)}%`;
  if (!s.voteResult) return `참여인원 ${attended}명, 찬성 ${s.approve}명, 반대 ${s.oppose}명, 기권 ${s.abstain}명.`;
  const reason = s.voteResult === '원안가결' ? `${ratioLabel} 기준 충족` : s.voteResult === '부결' ? `${ratioLabel} 기준 미달 (필요 ${need}명)` : '회의에서 결정';
  return `참여인원 ${attended}명, 찬성 ${s.approve}명, 반대 ${s.oppose}명, 기권 ${s.abstain}명. ${reason}으로 ${s.voteResult}.`;
}

function escapeAtr(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function editAgendaInline() {
  const id = _budgetState.agenda.id;
  document.querySelector('.modal-backdrop')?.remove();
  const { agenda: full } = await api.get(`/api/agendas/${id}`);
  openAgendaForm(full);
}

async function saveBudgetVote() {
  const s = _budgetState;
  try {
    await api.post(`/api/agendas/${s.agenda.id}/vote`, {
      approve_count: s.approve,
      oppose_count: s.oppose,
      abstain_count: s.abstain,
      vote_result: s.voteResult,
      vote_summary: s.summary,
      budget_data: JSON.stringify({ income: s.income, expense: s.expense })
    });
    toast('의결 결과가 저장되었습니다.', 'success');
    document.querySelector('.modal-backdrop')?.remove();
    loadAgendas();
  } catch (e) { toast(e.message, 'error'); }
}

async function saveVote(id) {
  const payload = {
    approve_count: Number(document.getElementById('v_a').value) || 0,
    oppose_count: Number(document.getElementById('v_o').value) || 0,
    abstain_count: Number(document.getElementById('v_b').value) || 0,
    vote_result: document.getElementById('v_r').value
  };
  try {
    await api.post(`/api/agendas/${id}/vote`, payload);
    toast('의결 결과가 저장되었습니다.', 'success');
    document.querySelector('.modal-backdrop')?.remove();
    loadAgendas();
  } catch (e) { toast(e.message, 'error'); }
}

function deleteAgenda(id) {
  confirmDialog('의안을 삭제하시겠습니까?', async () => {
    try { await api.del(`/api/agendas/${id}`); toast('삭제되었습니다.', 'success'); loadAgendas(); }
    catch (e) { toast(e.message, 'error'); return false; }
  });
}

// ===== MEMBERS =====
async function loadMembers() {
  const { members: list } = await api.get(`/api/meeting-members?meeting_id=${meetingId}`);
  members = list;
  document.getElementById('memberCount').textContent = `(총 ${list.length}명)`;
  renderMembers();
}

let _memberSelected = new Set();

function renderMembers() {
  const root = document.getElementById('memberList');
  let list = members;
  if (memberSearchQ) {
    const q = memberSearchQ.toLowerCase();
    list = list.filter(m => (m.name||'').toLowerCase().includes(q) || (m.position||'').toLowerCase().includes(q) || (m.phone||'').includes(q));
  }
  if (memberFilter !== 'all') list = list.filter(m => m.attendance_status === memberFilter);

  // Bulk action bar
  const selN = _memberSelected.size;
  const bulkBar = `
    <div class="flex items-center gap-8 mb-12" style="flex-wrap:wrap;">
      <span class="text-sm text-muted">선택 ${selN}명</span>
      <button class="btn btn-sm btn-danger" ${selN ? '' : 'disabled'} onclick="bulkDeleteMembers()">선택 삭제</button>
      <button class="btn btn-sm" ${selN ? '' : 'disabled'} onclick="bulkMarkAttend(true)">선택 출석</button>
      <button class="btn btn-sm" ${selN ? '' : 'disabled'} onclick="bulkMarkAttend(false)">선택 불참</button>
    </div>`;

  if (!list.length) {
    root.innerHTML = bulkBar + `<div class="empty"><div class="empty-title">표시할 의원이 없습니다</div><div class="empty-sub">검색·필터를 확인하거나 의원을 추가하세요.</div></div>`;
    return;
  }
  const allSelected = list.length && list.every(m => _memberSelected.has(m.id));
  root.innerHTML = bulkBar + `
    <table class="table">
      <thead><tr>
        <th style="width:36px;text-align:center;"><input type="checkbox" class="check" id="memCheckAll" ${allSelected?'checked':''} title="선택"></th>
        <th style="width:32px;text-align:center;" title="드래그하여 순서 변경">⋮⋮</th>
        <th style="width:50px;">순번</th>
        <th>직책</th>
        <th>성명</th>
        <th>전화번호</th>
        <th style="width:110px;">상태</th>
        <th style="width:50px;text-align:center;" title="출석 체크">출석</th>
        <th style="width:120px;text-align:right;">작업</th>
      </tr></thead>
      <tbody id="memberRows">
        ${list.map(m => `
          <tr data-mid="${m.id}">
            <td style="text-align:center;"><input type="checkbox" class="check row-sel" data-mid="${m.id}" ${_memberSelected.has(m.id)?'checked':''}></td>
            <td class="member-drag-handle" style="text-align:center;color:var(--text-soft);cursor:grab;user-select:none;">⋮⋮</td>
            <td>${m.seq || ''}</td>
            <td>${m.position || ''}</td>
            <td><b>${m.name}</b></td>
            <td>${m.phone || ''}</td>
            <td>${statusChip(m.attendance_status)}</td>
            <td style="text-align:center;">
              <input type="checkbox" class="check"
                ${m.attendance_status === 'present' ? 'checked' : ''}
                ${m.attendance_status === 'proxy' ? 'disabled' : ''}
                onchange="toggleAttend(${m.id}, this.checked)"
                title="${m.attendance_status === 'proxy' ? '⚠️ 위임장 제출됨 — 위임장 탭에서 삭제 후 출석 체크 가능' : '출석 체크'}">
            </td>
            <td style="text-align:right;">
              <button class="btn btn-sm" onclick='editMember(${JSON.stringify(m)})'>수정</button>
              <button class="btn btn-sm btn-danger" onclick="deleteMember(${m.id})">🗑</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;

  // Selection checkbox handlers
  document.getElementById('memCheckAll').onchange = (e) => {
    if (e.target.checked) list.forEach(m => _memberSelected.add(m.id));
    else list.forEach(m => _memberSelected.delete(m.id));
    renderMembers();
  };
  document.querySelectorAll('.row-sel').forEach(cb => {
    cb.onchange = () => {
      const id = Number(cb.dataset.mid);
      if (cb.checked) _memberSelected.add(id); else _memberSelected.delete(id);
      renderMembers();
    };
  });

  // Drag & drop reorder (admin only)
  if (myRole === 'system_admin' || myRole === 'admin') {
    bindMembersDnd();
  }
}

function bindMembersDnd() {
  const tbody = document.getElementById('memberRows');
  if (!tbody) return;
  bindDndReorder(tbody, 'data-mid', async (orderedIds) => {
    const items = orderedIds.map((id, i) => ({ id: Number(id), seq: i + 1 }));
    try {
      await api.post('/api/meeting-members/reorder', { items });
      await loadMembers();
      toast('순서가 변경되었습니다.', 'success');
    } catch (ex) { toast(ex.message, 'error'); }
  }, { handleSelector: '.member-drag-handle' });
}

async function bulkDeleteMembers() {
  if (!_memberSelected.size) return;
  const ids = [..._memberSelected];
  confirmDialog(`선택한 ${ids.length}명을 이 회의에서 제외하시겠습니까?\n(임원명단에는 영향 없음)`, async () => {
    try {
      await api.post('/api/meeting-members/bulk-delete', {
        meeting_id: Number(meetingId),
        ids
      });
      _memberSelected.clear();
      toast('제거되었습니다.', 'success');
      loadMembers();
      refreshQuorum();
    } catch (e) { toast(e.message, 'error'); return false; }
  });
}

async function bulkMarkAttend(present) {
  if (!_memberSelected.size) return;
  const ids = [..._memberSelected];
  let success = 0, blocked = 0, lastError = '';
  for (const id of ids) {
    try {
      await api.post('/api/meeting-members/attendance', { meeting_member_id: id, status: present ? 'present' : 'absent' });
      success++;
    } catch (e) {
      blocked++;
      lastError = e.message || '';
    }
  }
  if (success > 0) {
    let msg = `${success}명 ${present ? '출석' : '불참'} 처리되었습니다.`;
    if (blocked > 0) msg += ` (${blocked}명은 위임장 제출 상태로 처리되지 않음)`;
    toast(msg, blocked > 0 ? 'warning' : 'success');
  } else if (blocked > 0) {
    toast(`처리되지 않았습니다 — 위임장 제출된 의원은 위임장을 먼저 삭제해야 합니다.`, 'error');
  }
  loadMembers();
  refreshQuorum();
}

function statusChip(s) {
  if (s === 'present') return '<span class="status-chip status-present">참석</span>';
  if (s === 'proxy') return '<span class="status-chip status-proxy">위임장</span>';
  return '<span class="status-chip status-absent">불참</span>';
}

async function toggleAttend(memberId, checked) {
  try {
    await api.post('/api/meeting-members/attendance', { meeting_member_id: memberId, status: checked ? 'present' : 'absent' });
    loadMembers();
    refreshQuorum();
  } catch (e) {
    // 위임장 제출 등으로 실패한 경우 — 사용자에게 안내하고 체크박스 원복
    toast(e.message || '출석 처리에 실패했습니다.', 'error');
    loadMembers();    // 화면을 서버 상태로 다시 동기화 → 체크박스 자동 원복
    refreshQuorum();
  }
}

function openMemberForm() { editMember(null); }
function editMember(m) {
  m = m || {};
  const isNew = !m.id;
  const nextSeq = isNew ? (members.length + 1) : (m.seq || '');
  modal({
    title: m.id ? '의원 수정' : '의원 추가',
    body: `
      <div class="flex gap-12">
        <div class="field" style="width:120px;"><label class="label">순번 ${isNew ? '<span class="text-sm text-soft">(자동)</span>' : ''}</label><input class="input" id="md_seq" type="number" value="${nextSeq}" ${isNew ? 'readonly style="background:var(--surface-2);"' : ''}></div>
        <div class="field flex-1"><label class="label">직책</label><input class="input" id="md_position" value="${m.position||''}" placeholder="회장, 이사 등"></div>
      </div>
      <div class="field"><label class="label">성명 *</label><input class="input" id="md_name" value="${m.name||''}"></div>
      <div class="flex gap-12">
        <div class="field flex-1"><label class="label">전화번호 *</label><input class="input" id="md_phone" value="${m.phone||''}" placeholder="010-1234-5678 (필수)"></div>
        <div class="field flex-1"><label class="label">이메일</label><input class="input" id="md_email" value="${m.email||''}"></div>
      </div>
      ${isNew ? '<div class="text-sm text-muted">순번은 입력 순서대로 자동 부여되며, 의원 목록에서 드래그하여 순서를 변경할 수 있습니다.</div>' : ''}
    `,
    confirmText: '저장',
    onConfirm: async () => {
      const payload = {
        meeting_id: Number(meetingId),
        seq: Number(document.getElementById('md_seq').value) || (isNew ? members.length + 1 : null),
        position: document.getElementById('md_position').value.trim(),
        name: document.getElementById('md_name').value.trim(),
        phone: document.getElementById('md_phone').value.trim(),
        email: document.getElementById('md_email').value.trim()
      };
      if (!payload.name) { toast('성명을 입력하세요.', 'error'); return false; }
      if (!payload.phone || !payload.phone.replace(/\D/g, '')) {
        toast('전화번호는 필수입니다.', 'error'); return false;
      }
      try {
        if (m.id) await api.put(`/api/meeting-members/${m.id}`, payload);
        else await api.post('/api/meeting-members', payload);
        toast('저장되었습니다.', 'success');
        loadMembers();
        refreshQuorum();
      } catch (e) { toast(e.message, 'error'); return false; }
    }
  });
}

// 회의에서 의원 제거 — 의원 row 만 삭제 (임원명단은 영향 없음)
function deleteMember(id) {
  confirmDialog('이 회의의 의원에서 제외하시겠습니까?\n(임원명단에는 영향 없음)', async () => {
    try {
      await api.del(`/api/meeting-members/${id}`);
      toast('제거되었습니다.', 'success');
      loadMembers(); refreshQuorum();
    } catch (e) { toast(e.message, 'error'); return false; }
  });
}

// ====== 임원명단에서 가져오기 — 기수 선택 → 해당 임원 전체 표시 → 선택 후 추가 ======
let _ipxAll = [];
let _ipxSelected = new Set();

function escapeHtmlAttr(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function openImportExecutivesPicker() {
  if (!meeting || !meeting.organization_id) {
    toast('회의 정보가 없습니다. 페이지를 새로고침해주세요.', 'error');
    return;
  }
  _ipxAll = [];
  _ipxSelected = new Set();

  modal({
    title: '📋 임원명단에서 가져오기',
    size: 'lg',
    body: `
      <div class="text-sm text-muted mb-16">
        기존 임원 명단에서 기수를 선택하면 해당 임원이 모두 표시됩니다.
        체크박스(또는 행 클릭)로 선택해 회의 의원으로 일괄 추가하세요.
      </div>
      <div class="flex gap-12 items-end mb-12" style="flex-wrap:wrap;">
        <div class="field" style="flex:1;min-width:200px;margin:0;">
          <label class="label">기수 선택</label>
          <select class="select" id="ipx_genSelect">
            <option value="__LOADING__">불러오는 중...</option>
          </select>
        </div>
        <div class="searchbar" style="flex:2;min-width:200px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2"/></svg>
          <input id="ipx_search" placeholder="이름·직책·전화·전공·직장 검색">
        </div>
      </div>
      <div class="flex items-center justify-between mb-8" style="background:var(--surface-2);padding:8px 12px;border-radius:6px;">
        <div class="text-sm">
          현재 화면 <b id="ipx_total">0</b>명 / 선택 <b id="ipx_count">0</b>명
        </div>
        <button type="button" class="btn btn-sm" id="ipx_clearSel">선택 해제</button>
      </div>
      <div id="ipx_list" style="max-height:520px;overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--surface);">
        <div class="text-sm text-muted" style="padding:60px;text-align:center;">기수를 선택하세요.</div>
      </div>
    `,
    confirmText: '선택한 임원 추가',
    onConfirm: async () => {
      const ids = [..._ipxSelected];
      if (!ids.length) {
        toast('가져올 임원을 선택하세요.', 'error');
        return false;
      }
      try {
        // 선택한 임원의 정보를 새 의원 row 로 복사 (임원명단과 독립)
        const r = await api.post('/api/meeting-members/import-from-members', {
          meeting_id: Number(meetingId),
          member_ids: ids
        });
        if (r.skipped > 0) {
          toast(`${r.count}명 추가 (전화번호 누락/중복 ${r.skipped}명 스킵)`, 'success');
        } else {
          toast(`${r.count}명을 회의 의원으로 추가했습니다.`, 'success');
        }
        _ipxSelected.clear();
        loadMembers();
        refreshQuorum();
      } catch (e) {
        toast(e.message, 'error');
        return false;
      }
    }
  });

  // 임원명단 전체 가져오기
  try {
    const data = await api.get(`/api/members?organization_id=${meeting.organization_id}`);
    _ipxAll = (data && data.members) || [];
  } catch (e) {
    console.error('[ipx] members load failed', e);
    const sel = document.getElementById('ipx_genSelect');
    if (sel) sel.innerHTML = '<option value="">불러오기 실패</option>';
    toast('임원명단 불러오기 실패: ' + (e.message || ''), 'error');
    return;
  }

  bindIpxControls();
}

function bindIpxControls() {
  // 기수 옵션 채우기
  const realGens = [...new Set(_ipxAll.map(m => m.generation).filter(g => g && g.trim()))].sort().reverse();
  const hasNoGen = _ipxAll.some(m => !m.generation || !m.generation.trim());
  const sel = document.getElementById('ipx_genSelect');
  if (!sel) return;
  const opts = ['<option value="__ALL__">— 전체 기수 —</option>'];
  realGens.forEach(g => opts.push(`<option value="${escapeHtmlAttr(g)}">${escapeHtmlAttr(g)} (${_ipxAll.filter(m => m.generation === g).length}명)</option>`));
  if (hasNoGen) {
    const cnt = _ipxAll.filter(m => !m.generation || !m.generation.trim()).length;
    opts.push(`<option value="__NO_GEN__">기수없음 (${cnt}명)</option>`);
  }
  sel.innerHTML = opts.join('');

  // 첫 진입: 가장 최근 기수 선택 (있으면) 또는 전체
  if (realGens.length) sel.value = realGens[0];
  else sel.value = '__ALL__';

  // 이벤트 바인딩
  sel.onchange = () => { _ipxSelected.clear(); renderIpxList(); };
  document.getElementById('ipx_search').oninput = renderIpxList;
  document.getElementById('ipx_clearSel').onclick = () => {
    _ipxSelected.clear();
    renderIpxList();
  };

  // 첫 화면 렌더
  renderIpxList();
}

function getIpxFiltered() {
  const sel = document.getElementById('ipx_genSelect');
  const searchEl = document.getElementById('ipx_search');
  if (!sel) return [];
  const gen = sel.value;
  const q = (searchEl && searchEl.value || '').trim().toLowerCase();
  let list;
  if (gen === '__ALL__') list = _ipxAll.slice();
  else if (gen === '__NO_GEN__') list = _ipxAll.filter(m => !m.generation || !m.generation.trim());
  else list = _ipxAll.filter(m => m.generation === gen);
  if (q) {
    list = list.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.position || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q) ||
      (m.major || '').toLowerCase().includes(q) ||
      (m.workplace || '').toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => (a.seq || 0) - (b.seq || 0));
}

function renderIpxList() {
  const host = document.getElementById('ipx_list');
  if (!host) return;
  const list = getIpxFiltered();
  const totalEl = document.getElementById('ipx_total');
  const cntEl = document.getElementById('ipx_count');
  if (totalEl) totalEl.textContent = list.length;
  if (cntEl) cntEl.textContent = _ipxSelected.size;
  if (!list.length) {
    if (_ipxAll.length === 0) {
      host.innerHTML = `<div class="text-sm text-muted" style="padding:40px;text-align:center;">
        가져올 수 있는 임원이 없습니다.<br>
        <span style="font-size:11px;color:var(--text-soft);">기관 홈 → 임원 명단에서 임원을 먼저 등록하거나, 이미 모든 임원이 회의 의원에 등록되어 있을 수 있습니다.</span>
        <div class="mt-12">
          <button class="btn btn-sm" onclick="reloadIpxData()">🔄 다시 시도</button>
          <a class="btn btn-sm" href="/home?org=${meeting && meeting.organization_id}#executives" target="_blank">↗ 임원 명단 페이지 열기</a>
        </div>
      </div>`;
    } else {
      host.innerHTML = `<div class="text-sm text-muted" style="padding:40px;text-align:center;">
        조건에 맞는 임원이 없습니다.<br>
        <span style="font-size:11px;">전체 ${_ipxAll.length}명 중 검색/필터됨</span>
      </div>`;
    }
    return;
  }
  host.innerHTML = `
    <table class="ipx-table">
      <thead>
        <tr>
          <th style="width:36px;"><input type="checkbox" id="ipx_selAllHead"></th>
          <th style="width:40px;"></th>
          <th style="width:42px;">순번</th>
          <th style="width:80px;">기수</th>
          <th style="width:100px;">직책</th>
          <th style="width:90px;">이름</th>
          <th style="width:120px;">전화</th>
          <th>전공/직장</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(m => {
          const checked = _ipxSelected.has(m.id) ? 'checked' : '';
          const photoCell = m.photo
            ? `<div style="width:28px;height:28px;border-radius:50%;overflow:hidden;background:#f3f4f6;"><img src="${m.photo}" style="width:100%;height:100%;object-fit:cover;"></div>`
            : `<div style="width:28px;height:28px;border-radius:50%;background:#f3f4f6;border:1px dashed #d1d5db;"></div>`;
          // 전공·직장 통합: 전공이 있으면 "전공 · 직장", 없으면 직장만, 둘 다 없으면 "-"
          const detail = [m.major, m.workplace].filter(Boolean).join(' · ') || '-';
          return `
            <tr data-ipx-id="${m.id}">
              <td><input type="checkbox" class="ipx-row-check" data-id="${m.id}" ${checked}></td>
              <td>${photoCell}</td>
              <td class="text-muted">${m.seq || ''}</td>
              <td class="text-muted">${escapeHtmlAttr(m.generation || '-')}</td>
              <td>${escapeHtmlAttr(m.position || '-')}</td>
              <td><b>${escapeHtmlAttr(m.name)}</b></td>
              <td class="text-muted">${escapeHtmlAttr(m.phone || '-')}</td>
              <td class="text-muted" title="${escapeHtmlAttr(detail)}">${escapeHtmlAttr(detail)}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  // 행 클릭으로 체크 토글
  host.querySelectorAll('tr[data-ipx-id]').forEach(tr => {
    tr.onclick = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const id = Number(tr.dataset.ipxId);
      if (_ipxSelected.has(id)) _ipxSelected.delete(id);
      else _ipxSelected.add(id);
      renderIpxList();
    };
  });
  host.querySelectorAll('.ipx-row-check').forEach(cb => {
    cb.onchange = () => {
      const id = Number(cb.dataset.id);
      if (cb.checked) _ipxSelected.add(id);
      else _ipxSelected.delete(id);
      if (cntEl) cntEl.textContent = _ipxSelected.size;
      updateIpxSelAllState(list);
    };
  });
  const selAllHead = document.getElementById('ipx_selAllHead');
  if (selAllHead) {
    selAllHead.onchange = () => {
      if (selAllHead.checked) list.forEach(m => _ipxSelected.add(m.id));
      else list.forEach(m => _ipxSelected.delete(m.id));
      renderIpxList();
    };
    updateIpxSelAllState(list);
  }
}

function updateIpxSelAllState(list) {
  const head = document.getElementById('ipx_selAllHead');
  if (!head) return;
  const allChecked = list.length > 0 && list.every(m => _ipxSelected.has(m.id));
  const someChecked = list.some(m => _ipxSelected.has(m.id));
  head.checked = allChecked;
  head.indeterminate = !allChecked && someChecked;
}

// 다시 시도 — fetch 만 재시도 (모달은 그대로)
async function reloadIpxData() {
  const list = document.getElementById('ipx_list');
  if (list) list.innerHTML = '<div class="text-sm text-muted" style="padding:40px;text-align:center;">불러오는 중...</div>';
  try {
    const data = await api.get(`/api/members?organization_id=${meeting.organization_id}`);
    _ipxAll = (data && data.members) || [];
  } catch (e) {
    toast('재시도 실패: ' + e.message, 'error');
    return;
  }
  bindIpxControls();
  toast(`${_ipxAll.length}명 임원 정보를 불러왔습니다.`, _ipxAll.length ? 'success' : 'info');
}

function openExcelImport() {
  modal({
    title: '엑셀 일괄 등록',
    size: 'lg',
    body: `
      <div class="text-sm text-muted mb-12">
        CSV 또는 탭으로 구분된 데이터를 붙여넣으세요.<br>
        <b>열 순서:</b> 순번, 직책, 성명, 전화번호, 이메일
      </div>
      <textarea class="textarea" id="bulkText" rows="10" placeholder="1, 회장, 홍길동, 010-1234-5678, hong@test.com&#10;2, 이사, 김철수, 010-2222-3333, kim@test.com"></textarea>
    `,
    confirmText: '일괄 등록',
    onConfirm: async () => {
      const text = document.getElementById('bulkText').value.trim();
      if (!text) { toast('데이터를 입력하세요.', 'error'); return false; }
      const lines = text.split('\n').filter(l => l.trim());
      const items = lines.map(l => {
        const cols = l.split(/[,\t]/).map(s => s.trim());
        return { seq: cols[0], position: cols[1], name: cols[2], phone: cols[3], email: cols[4] };
      }).filter(x => x.name);
      try {
        await api.post('/api/members/bulk', { organization_id: meeting.organization_id, items });
        toast(`${items.length}명이 등록되었습니다.`, 'success');
        loadMembers();
      } catch (e) { toast(e.message, 'error'); return false; }
    }
  });
}

// ===== PROXIES =====
async function loadProxies() {
  const { proxies: list } = await api.get(`/api/proxies?meeting_id=${meetingId}`);
  proxies = list;
  const submitted = list.filter(p => p.status === 'submitted').length;
  document.getElementById('tabbadge-proxies').textContent = submitted;
  document.getElementById('proxyCount').textContent = `(${submitted}/${list.length}건 접수)`;
  renderProxies();
}

function renderProxies() {
  const root = document.getElementById('proxyList');
  const base = location.origin;
  // Public link banner (always visible if a public proxy exists)
  const publicProxy = proxies.find(p => !p.member_id && p.status === 'pending');
  let banner = '';
  if (publicProxy) {
    const url = `${base}/proxy?token=${publicProxy.token}`;
    const isAdmin = myRole === 'system_admin' || myRole === 'admin';
    banner = `
      <div class="card mb-16" style="background:var(--info-soft);border-color:var(--info);">
        <div class="flex items-center justify-between mb-8" style="flex-wrap:wrap;gap:8px;">
          <div>
            <div class="fw-700" style="color:var(--info);">🔗 공통 위임장 링크</div>
            <div class="text-sm text-muted">모든 의원이 이 링크로 위임장을 제출할 수 있습니다. 초대장 메시지에도 자동 포함됩니다.</div>
          </div>
          <div class="flex gap-8">
            <button class="btn btn-sm btn-primary" onclick="copyText('${url}', '링크가 복사되었습니다.')">📋 복사</button>
            <a class="btn btn-sm" href="${url}" target="_blank">🔗 미리보기</a>
            ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deletePublicLink(${publicProxy.id})">🗑 링크 삭제</button>` : ''}
          </div>
        </div>
        <input class="input" readonly value="${url}" onclick="this.select()" style="font-family:Menlo,Consolas,monospace;font-size:12px;">
      </div>`;
  } else {
    const isAdmin = myRole === 'system_admin' || myRole === 'admin';
    banner = `
      <div class="card mb-16" style="background:var(--info-soft);border-color:var(--info);text-align:center;">
        <div class="fw-700" style="color:var(--info);font-size:15px;margin-bottom:6px;">🔗 공통 위임장 링크</div>
        <div class="text-sm text-muted mb-12">의원이 위임장을 제출할 수 있는 회의 전용 링크를 생성합니다.</div>
        ${isAdmin
          ? '<button class="btn btn-primary" onclick="issuePublicLink()">+ 링크 생성</button>'
          : '<div class="text-sm text-muted">관리자가 링크를 생성하면 여기에 표시됩니다.</div>'}
      </div>`;
  }

  // Submitted proxies only (member_id != null OR status == 'submitted')
  const submitted = proxies.filter(p => p.status === 'submitted' || p.member_id);
  if (!submitted.length) {
    root.innerHTML = banner + `<div class="empty"><div class="empty-title">제출된 위임장이 없습니다</div><div class="empty-sub">의원이 위 공통 링크로 제출하면 여기에 표시됩니다.</div></div>`;
    return;
  }
  root.innerHTML = banner + `
    <table class="table">
      <thead><tr>
        <th>대상 의원</th>
        <th>제출자</th>
        <th>전화번호</th>
        <th>제출 시각</th>
        <th>상태</th>
        <th style="width:160px;text-align:right;">작업</th>
      </tr></thead>
      <tbody>
        ${submitted.map(p => `
          <tr>
            <td><b>${p.member_name || '-'}</b> ${p.member_position ? `<span class="text-sm text-muted">(${p.member_position})</span>` : ''}</td>
            <td>${p.submitter_name || '-'}</td>
            <td class="text-sm text-muted">${p.submitter_phone || p.member_phone || '-'}</td>
            <td class="text-sm text-muted">${p.submitted_at ? fmtDate(p.submitted_at) : '-'}</td>
            <td>${p.status === 'submitted' ? '<span class="status-chip status-present">제출완료</span>' : '<span class="status-chip status-absent">대기중</span>'}</td>
            <td style="text-align:right;">
              ${p.signature_data ? `<button class="btn btn-sm" onclick="showSignature('${p.signature_data}')">서명 보기</button>` : ''}
              <button class="btn btn-sm btn-danger" onclick="deleteProxy(${p.id})">🗑</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

// copyText is now provided by common.js with fallback
function copyProxy(s) { copyText(s, '링크가 복사되었습니다.'); }

function showSignature(data) {
  modal({ title: '서명', body: `<img src="${data}" style="max-width:100%;border:1px solid var(--border);border-radius:8px;">`, hideFoot: true });
}

function deleteProxy(id) {
  confirmDialog('위임장을 삭제하시겠습니까?', async () => {
    try { await api.del(`/api/proxies/${id}`); toast('삭제되었습니다.', 'success'); loadProxies(); loadMembers(); refreshQuorum(); }
    catch (e) { toast(e.message, 'error'); return false; }
  });
}

function deletePublicLink(id) {
  confirmDialog('공통 위임장 링크를 삭제하시겠습니까? 이미 제출된 위임장은 유지됩니다.', async () => {
    try { await api.del(`/api/proxies/${id}`); toast('링크가 삭제되었습니다.', 'success'); loadProxies(); }
    catch (e) { toast(e.message, 'error'); return false; }
  });
}

function openIssueProxy() {
  modal({
    title: '위임장 발급',
    body: `
      <div class="field"><label class="label">대상 의원 (선택)</label>
        <select class="select" id="ip_member">
          <option value="">의원 미지정 (공용 링크)</option>
          ${members.map(m => `<option value="${m.id}">${m.position || ''} ${m.name}</option>`).join('')}
        </select>
      </div>
      <div class="text-sm text-muted">의원을 선택하지 않으면 누구나 사용할 수 있는 공용 위임장 링크가 생성됩니다.</div>
    `,
    confirmText: '발급',
    onConfirm: async () => {
      const member_id = document.getElementById('ip_member').value || null;
      try { await api.post('/api/proxies/issue', { meeting_id: Number(meetingId), member_id }); toast('발급되었습니다.', 'success'); loadProxies(); }
      catch (e) { toast(e.message, 'error'); return false; }
    }
  });
}

async function issuePublicLink() {
  try {
    await api.post('/api/proxies/issue', { meeting_id: Number(meetingId), member_id: null });
    // Switch to proxies tab and refresh — banner will show URL
    switchTab('proxies');
    location.hash = '#proxies';
    await loadProxies();
    toast('공통 위임장 링크가 준비되었습니다.', 'success');
    // Highlight the URL input
    setTimeout(() => {
      const input = document.querySelector('[data-panel="proxies"] input[readonly]');
      if (input) { input.select(); input.focus(); }
    }, 300);
  } catch (e) { toast(e.message, 'error'); }
}

// Legacy: kept for backward compat (not bound to UI anymore)
async function issueAllProxies() {
  confirmDialog('전 의원에게 개별 위임장 링크를 발급합니다. 이미 발급된 의원은 제외됩니다.', async () => {
    try { await api.post('/api/proxies/issue-all', { meeting_id: Number(meetingId) }); toast('처리되었습니다.', 'success'); loadProxies(); }
    catch (e) { toast(e.message, 'error'); return false; }
  });
}

async function showInvitation() {
  // Don't create the link automatically — only use the existing public token if any
  let publicLink = '';
  try {
    const data = await api.get(`/api/proxies?meeting_id=${meetingId}`);
    const pub = (data.proxies || []).find(p => !p.member_id && p.status === 'pending');
    if (pub) publicLink = `${location.origin}/proxy?token=${pub.token}`;
  } catch (e) {}

  const defaultMessage = buildDefaultInvitation(publicLink);
  const initialMessage = meeting.invitation_message || defaultMessage;

  modal({
    title: `초대장 메시지 <span class="text-sm text-muted" style="font-weight:400;margin-left:8px;">— 행사 안내 및 위임장 요청</span>`,
    size: 'lg',
    hideFoot: true,
    body: `
      <div class="invite-grid">
        <div>
          <div class="flex items-center justify-between mb-12">
            <div class="text-sm text-muted">문자 메시지 내용을 직접 수정할 수 있습니다.</div>
            <button class="btn btn-sm" id="invResetBtn">↺ 기본값으로 초기화</button>
          </div>
          <textarea class="invite-textarea" id="invMessage">${initialMessage.replace(/</g, '&lt;')}</textarea>
        </div>
        <div>
          <div class="text-sm text-muted mb-12 text-center">📱 핸드폰 미리보기</div>
          <div class="phone-frame">
            <div class="phone-screen">
              <div class="phone-statusbar">
                <span>메시지</span>
                <span>9:41</span>
              </div>
              <div class="phone-bubble">
                <div class="phone-bubble-head">
                  <div class="phone-bubble-icon">${(organization.name||'?').slice(0,1)}</div>
                  <div class="phone-bubble-name">${organization.name}</div>
                </div>
                <div class="phone-bubble-body" id="invPreview"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between mt-16" style="padding-top:14px;border-top:1px solid var(--border);">
        <div class="text-sm text-muted" id="invCharCount">0자</div>
        <div class="flex gap-8">
          <button class="btn" id="invCopyBtn">📋 메시지 복사</button>
          <button class="btn" id="invCloseBtn">닫기</button>
          <button class="btn btn-primary" id="invSaveBtn">💾 저장</button>
        </div>
      </div>
    `
  });

  const ta = document.getElementById('invMessage');
  const preview = document.getElementById('invPreview');
  const counter = document.getElementById('invCharCount');
  const updatePreview = () => {
    preview.textContent = ta.value;
    counter.textContent = `${ta.value.length}자`;
  };
  ta.addEventListener('input', updatePreview);
  updatePreview();

  document.getElementById('invResetBtn').onclick = () => {
    ta.value = defaultMessage;
    updatePreview();
    toast('기본 메시지로 초기화되었습니다.', 'success');
  };
  document.getElementById('invCloseBtn').onclick = () => document.querySelector('.modal-backdrop')?.remove();
  document.getElementById('invSaveBtn').onclick = async () => {
    try {
      await api.put(`/api/meetings/${meetingId}`, { invitation_message: ta.value });
      meeting.invitation_message = ta.value;
      toast('저장되었습니다.', 'success');
      document.querySelector('.modal-backdrop')?.remove();
    } catch (e) { toast(e.message, 'error'); }
  };
  document.getElementById('invCopyBtn').onclick = () => copyText(ta.value, '메시지가 복사되었습니다.');
}

function buildDefaultInvitation(proxyLink) {
  const org = organization.name || '';
  const title = meeting.title || '';
  const dow = ['일','월','화','수','목','금','토'];
  const dowEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let dateStr = '미정';
  if (meeting.meeting_date) {
    const d = new Date(meeting.meeting_date);
    if (!isNaN(d)) {
      const pad = n => String(n).padStart(2,'0');
      dateStr = `${d.getFullYear()}년 ${pad(d.getMonth()+1)}월 ${pad(d.getDate())}일(${dowEn[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  const loc = meeting.location || '미정';

  const formal = isFormalMeeting(meeting.meeting_type);
  let tail;
  if (formal && proxyLink) {
    tail = `\n부득이 참석하지 못하시는 경우,\n아래 링크를 통해 위임장을 제출해 주시기 바랍니다.\n\n▶ 위임장 제출 :\n${proxyLink}\n\n감사합니다.`;
  } else if (formal) {
    tail = `\n부득이 참석하지 못하시는 경우,\n별도 안내해드리는 위임장 링크로 제출해 주시기 바랍니다.\n\n감사합니다.`;
  } else {
    tail = `\n바쁘시더라도 많은 참석 부탁드립니다.\n\n감사합니다.`;
  }

  return `[${org}]\n${title} 안내\n\n안녕하세요, ${org}입니다.\n\n아래와 같이 ${title}을(를) 개최하오니,\n많은 참석 부탁드립니다.\n\n■ 일    시 : ${dateStr}\n■ 장    소 : ${loc}\n${tail}`;
}

// ===== MEETING EDIT =====
async function openMeetingEdit() {
  // Fetch live attendance count
  let presentCount = 0;
  try {
    const q = await api.get(`/api/meetings/${meetingId}/quorum`);
    presentCount = q.attended;
  } catch (e) {}
  const attendedCount = presentCount;
  modal({
    title: '회의 정보 수정',
    size: 'lg',
    body: meetingFormHtml({ ...meeting, present_count: attendedCount }),
    confirmText: '저장',
    onConfirm: async () => {
      try {
        await api.put(`/api/meetings/${meetingId}`, readMeetingFormPayload());
        toast('저장되었습니다.', 'success');
        location.reload();
      } catch (e) { toast(e.message, 'error'); return false; }
    }
  });
  // Bind after DOM ready
  bindMeetingForm();
}
