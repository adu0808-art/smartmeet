// ========== 비밀번호 정책 (서버와 동기화) ==========
//   8자 이상 + 영문 대/소문자·숫자·특수문자 각 1자 이상
const PASSWORD_POLICY = {
  MIN_LEN: 8,
  REQUIREMENTS_TEXT: '8자 이상, 영문 대/소문자·숫자·특수문자 각 1자 이상 포함',
  validate(password) {
    if (typeof password !== 'string' || !password) return '비밀번호를 입력하세요.';
    if (password.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
    if (!/[A-Z]/.test(password)) return '비밀번호는 영문 대문자가 1자 이상 포함되어야 합니다.';
    if (!/[a-z]/.test(password)) return '비밀번호는 영문 소문자가 1자 이상 포함되어야 합니다.';
    if (!/[0-9]/.test(password)) return '비밀번호는 숫자가 1자 이상 포함되어야 합니다.';
    if (!/[^A-Za-z0-9]/.test(password)) return '비밀번호는 특수문자가 1자 이상 포함되어야 합니다.';
    return null;  // 통과
  },
  // 각 규칙별 충족 여부 체크 (실시간 표시용)
  check(password) {
    const p = String(password || '');
    return {
      length:  p.length >= 8,
      upper:   /[A-Z]/.test(p),
      lower:   /[a-z]/.test(p),
      digit:   /[0-9]/.test(p),
      special: /[^A-Za-z0-9]/.test(p)
    };
  }
};

// 비밀번호 입력 필드에 실시간 검증 UI 자동 부착
//   사용: attachPasswordPolicy(inputEl)
//   inputEl 의 부모에 체크리스트가 자동 삽입됨
function attachPasswordPolicy(inputEl) {
  if (!inputEl || inputEl._policyAttached) return;
  inputEl._policyAttached = true;
  const list = document.createElement('div');
  list.className = 'password-policy-hint';
  list.innerHTML = `
    <div class="pp-row" data-rule="length">  <span class="pp-icon">✗</span> 8자 이상</div>
    <div class="pp-row" data-rule="upper">   <span class="pp-icon">✗</span> 영문 대문자 1자 이상</div>
    <div class="pp-row" data-rule="lower">   <span class="pp-icon">✗</span> 영문 소문자 1자 이상</div>
    <div class="pp-row" data-rule="digit">   <span class="pp-icon">✗</span> 숫자 1자 이상</div>
    <div class="pp-row" data-rule="special"> <span class="pp-icon">✗</span> 특수문자 1자 이상 (! @ # $ % 등)</div>
  `;
  inputEl.parentNode.insertBefore(list, inputEl.nextSibling);
  const update = () => {
    const r = PASSWORD_POLICY.check(inputEl.value);
    list.querySelectorAll('.pp-row').forEach(row => {
      const rule = row.dataset.rule;
      const ok = !!r[rule];
      row.classList.toggle('ok', ok);
      row.querySelector('.pp-icon').textContent = ok ? '✓' : '✗';
    });
  };
  inputEl.addEventListener('input', update);
  update();
}

// ========== API helper ==========
const api = {
  async req(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    let data; try { data = await r.json(); } catch (e) { data = {}; }
    if (!r.ok) throw new Error(data.error || `요청 실패 (${r.status})`);
    return data;
  },
  get: (url) => api.req('GET', url),
  post: (url, body) => api.req('POST', url, body),
  put: (url, body) => api.req('PUT', url, body),
  del: (url) => api.req('DELETE', url),
};

// ========== Auth ==========
async function getMe() {
  try { const { user } = await api.get('/api/auth/me'); return user; } catch (e) { return null; }
}

async function requireAuth(redirectTo = '/login') {
  const u = await getMe();
  if (!u) { location.href = redirectTo; return null; }
  return u;
}

async function logout() {
  await api.post('/api/auth/logout');
  location.href = '/';
}

// ========== Toast ==========
function toast(msg, type = '') {
  let host = document.querySelector('.toast-host');
  if (!host) { host = document.createElement('div'); host.className = 'toast-host'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 2400);
}

// ========== Modal ==========
function modal(opts) {
  const { title = '', body = '', size = '', confirmText = '확인', cancelText = '취소', onConfirm, hideFoot = false } = opts;
  const root = document.createElement('div');
  root.className = 'modal-backdrop active';
  root.innerHTML = `
    <div class="modal ${size === 'lg' ? 'modal-lg' : size === 'ed' ? 'modal-ed' : size === 'xl' ? 'modal-xl' : ''}">
      <div class="modal-head">
        <div class="modal-title">${title}</div>
        <div class="modal-close" data-close>✕</div>
      </div>
      <div class="modal-body"></div>
      ${hideFoot ? '' : `<div class="modal-foot">
        <button class="btn" data-close>${cancelText}</button>
        <button class="btn btn-primary" data-confirm>${confirmText}</button>
      </div>`}
    </div>`;
  const bodyEl = root.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.appendChild(body);
  document.body.appendChild(root);
  const close = () => root.remove();
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  // Note: backdrop click no longer closes modal — must use X or 취소 buttons
  const confirmBtn = root.querySelector('[data-confirm]');
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      const result = onConfirm ? await onConfirm(root) : true;
      if (result !== false) close();
    };
  }
  return { root, close, bodyEl };
}

function confirmDialog(message, onConfirm) {
  modal({
    title: '확인',
    body: `<div style="font-size:14px;line-height:1.6;">${message}</div>`,
    confirmText: '확인',
    onConfirm
  });
}

// ========== Embed mode auto-detect ==========
//   ?embed=1 쿼리가 있으면 body 에 .embed 클래스 추가 → CSS 가 사이드바/토픽바 숨김
//   SPA shell 모드에서 iframe 내부 페이지가 자체 사이드바를 숨기도록 사용
(function _autoDetectEmbed() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('embed') === '1') {
      const apply = () => document.body && document.body.classList.add('embed');
      if (document.body) apply();
      else document.addEventListener('DOMContentLoaded', apply, { once: true });
    }
  } catch {}
})();

// ========== Phone format ==========
//   서버는 숫자만 저장 → 표시는 한국식 하이픈 형식 (010-1234-5678 등)
function normalizePhone(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
function formatPhone(s) {
  const d = normalizePhone(s);
  if (!d) return '';
  if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  if (d.length === 10) {
    if (d.startsWith('02')) return `${d.slice(0,2)}-${d.slice(2,6)}-${d.slice(6)}`;
    return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  }
  if (d.length === 9 && d.startsWith('02')) return `${d.slice(0,2)}-${d.slice(2,5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0,4)}-${d.slice(4)}`;
  return d;
}

// ========== Date format ==========
function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}년 ${pad(d.getMonth()+1)}월 ${pad(d.getDate())}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDateOnly(s) {
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// ========== Status helpers ==========
const meetingTypeLabel = { board: '이사회', general: '총회', regular: '일반', event: '행사' };
const isFormalMeeting = (t) => t === 'board' || t === 'general';
const isPublicEvent = (t) => t === 'event';   // 자유 신청 가능한 행사

// Shared event(meeting) create/edit form
function meetingFormHtml(m = {}) {
  const isEdit = !!m.id;
  let dateValue = (m.meeting_date || '').slice(0, 16);
  if (!dateValue) {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    dateValue = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T17:00`;
  }
  let endValue = (m.end_date || '').slice(0, 16);
  const ratio = m.quorum_ratio != null ? m.quorum_ratio : 0.5;
  const passRatio = m.pass_ratio != null ? m.pass_ratio : 0.5;
  const total = m.total_members || 0;
  const present = m.present_count || 0;
  const type = m.meeting_type || 'board';
  return `
    <div class="text-sm text-muted mb-16">이사회·총회는 정족수 설정이 필요하며, ‘일반/행사’는 자유 형식으로 운영됩니다.<br>‘행사’는 공개 신청 링크를 통해 외부 참가자가 출석부에 자동 등록됩니다.</div>
    <div class="field"><label class="label">이벤트명 *</label><input class="input" id="mf_title" value="${(m.title||'').replace(/"/g,'&quot;')}" placeholder="예: 2026년 정기 이사회 및 총회"></div>
    <div class="flex gap-12">
      <div class="field flex-1"><label class="label">이벤트 구분</label>
        <select class="select" id="mf_type">
          <option value="board" ${type==='board'?'selected':''}>이사회</option>
          <option value="general" ${type==='general'?'selected':''}>총회</option>
          <option value="regular" ${type==='regular'?'selected':''}>일반</option>
          <option value="event" ${type==='event'?'selected':''}>행사</option>
        </select>
      </div>
      <div class="field flex-1"${isEdit?'':' style="display:none"'}><label class="label">진행 상태</label>
        <select class="select" id="mf_status">
          <option value="preparing" ${m.status==='preparing'?'selected':''}>준비중</option>
          <option value="progress" ${m.status==='progress'?'selected':''}>진행중</option>
          <option value="done" ${m.status==='done'?'selected':''}>완료</option>
        </select>
      </div>
    </div>
    <div class="flex gap-12">
      <div class="field flex-1"><label class="label">시작 일시</label><input class="input" id="mf_date" type="datetime-local" value="${dateValue}" step="600"></div>
      <div class="field flex-1"><label class="label">종료 일시 <span class="text-sm text-muted">(선택)</span></label><input class="input" id="mf_end" type="datetime-local" value="${endValue}" step="600"></div>
    </div>
    <div class="field"><label class="label">장소</label><input class="input" id="mf_loc" value="${(m.location||'').replace(/"/g,'&quot;')}" placeholder="개최 장소"></div>

    <div id="mf_quorumBox" class="card mt-12" style="background:var(--surface-2);">
      <div class="card-title mb-12" style="margin:0;font-size:14px;">정족수 설정</div>
      <div class="flex gap-12">
        <div class="field flex-1"><label class="label">의결정족수 비율</label>
          <select class="select" id="mf_quorum">
            <option value="0.5" ${ratio==0.5?'selected':''}>과반수 (1/2 초과)</option>
            <option value="0.6" ${ratio==0.6?'selected':''}>60%</option>
            <option value="0.66" ${ratio==0.66?'selected':''}>2/3 (66.6%)</option>
            <option value="0.75" ${ratio==0.75?'selected':''}>3/4 (75%)</option>
          </select>
          <div class="text-sm text-muted mt-8">회의 성립에 필요한 재적 의원 출석 기준</div>
        </div>
        <div class="field flex-1"><label class="label">찬성 의결 비율</label>
          <select class="select" id="mf_pass">
            <option value="0.5" ${passRatio==0.5?'selected':''}>과반수 (1/2 초과)</option>
            <option value="0.66" ${passRatio==0.66?'selected':''}>2/3 이상</option>
            <option value="0.75" ${passRatio==0.75?'selected':''}>3/4 이상</option>
          </select>
          <div class="text-sm text-muted mt-8">안건 통과에 필요한 출석 의원 찬성 기준</div>
        </div>
      </div>
      <div class="text-sm text-muted mt-8">
        💡 재적 의원 수와 정족수는 등록된 의원·출석 정보에서 자동으로 계산됩니다.
      </div>
    </div>
  `;
}

function bindMeetingForm() {
  // Hide quorum box for regular type (이사회·총회만 정족수 설정 노출)
  const typeSel = document.getElementById('mf_type');
  const apply = () => {
    const formal = isFormalMeeting(typeSel.value);
    const qb = document.getElementById('mf_quorumBox');
    if (qb) qb.style.display = formal ? '' : 'none';
  };
  typeSel.addEventListener('change', apply);
  apply();
}

function readMeetingFormPayload() {
  // 재적·정족수·출석은 별도로 자동 계산되므로 폼에서 받지 않음
  return {
    title: document.getElementById('mf_title').value.trim(),
    meeting_type: document.getElementById('mf_type').value,
    status: document.getElementById('mf_status')?.value,
    meeting_date: document.getElementById('mf_date').value,
    end_date: document.getElementById('mf_end')?.value || '',
    location: document.getElementById('mf_loc').value.trim(),
    quorum_ratio: Number(document.getElementById('mf_quorum').value) || 0.5,
    pass_ratio: Number(document.getElementById('mf_pass').value) || 0.5
  };
}
const meetingStatusLabel = { preparing: '준비중', progress: '진행중', done: '완료' };
const meetingStatusClass = { preparing: 'tag-status-prep', progress: 'tag-status-progress', done: 'tag-status-done' };
const agendaTypeLabel = { general: '일반', budget: '예산', election: '선거' };
const agendaTypeClass = { general: 'tag-general', budget: 'tag-budget', election: 'tag-election' };

function logoText(name) {
  if (!name) return '?';
  return name.trim().slice(0, 2);
}

// ========== Sidebar shared render ==========
function renderUserChip(user) {
  if (!user) return '';
  return `
    <div class="user-chip" onclick="userMenu(this)">
      <div class="user-avatar">${(user.name||'?').slice(0,1)}</div>
      <span>${user.name}</span>
      ${user.role === 'admin' ? '<span class="tag tag-board" style="font-size:10px;padding:2px 6px;">관리자</span>' : ''}
    </div>
  `;
}

function userMenu(anchor) {
  const existing = document.getElementById('user-menu');
  if (existing) { existing.remove(); return; }
  const menu = document.createElement('div');
  menu.id = 'user-menu';
  menu.style.cssText = 'position:absolute;background:white;border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-lg);z-index:50;min-width:180px;padding:6px;';
  const r = anchor.getBoundingClientRect();
  menu.style.top = (r.bottom + window.scrollY + 8) + 'px';
  menu.style.right = (window.innerWidth - r.right) + 'px';
  menu.innerHTML = `
    <div style="padding:8px 12px;font-size:11px;color:var(--text-muted);">계정</div>
    <div id="profileMenu" style="padding:8px 12px;border-radius:6px;font-size:13px;cursor:pointer;">✏️ 내 프로필 수정</div>
    <a href="/dashboard" style="display:block;padding:8px 12px;border-radius:6px;font-size:13px;">📋 기관 목록</a>
    <a href="/admin" id="adminMenu" style="display:none;padding:8px 12px;border-radius:6px;font-size:13px;">⚙️ 관리자 페이지</a>
    <div id="logoutBtn" style="padding:8px 12px;border-radius:6px;font-size:13px;color:var(--danger);cursor:pointer;">🚪 로그아웃</div>
  `;
  document.body.appendChild(menu);
  document.getElementById('profileMenu').onclick = () => { menu.remove(); openMyProfile(); };
  document.getElementById('logoutBtn').onclick = logout;
  getMe().then(u => { if (u && u.role === 'admin') document.getElementById('adminMenu').style.display = 'block'; });
  setTimeout(() => {
    const off = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', off); } };
    document.addEventListener('click', off);
  }, 0);
}

// ========== Query string ==========
function qs(name) { return new URLSearchParams(location.search).get(name); }

// ========== My profile editor (used from user menu) ==========
async function openMyProfile() {
  const u = await getMe();
  if (!u) return;
  let photoData = u.profile_image || '';
  modal({
    title: '내 프로필 수정',
    size: 'lg',
    body: `
      <!-- 탭 -->
      <div class="profile-tabs flex gap-4 mb-16" style="border-bottom:2px solid var(--border);">
        <button type="button" class="profile-tab active" data-ptab="info" style="padding:8px 16px;border:none;background:transparent;font-weight:700;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;">기본 정보</button>
        <button type="button" class="profile-tab" data-ptab="password" style="padding:8px 16px;border:none;background:transparent;font-weight:600;cursor:pointer;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px;">🔑 비밀번호 변경</button>
      </div>

      <!-- 기본 정보 탭 -->
      <div data-ptab-panel="info">
        <div class="flex items-center gap-16 mb-16" style="padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div id="pfg_preview" style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#cbd5e0,#a0aec0);color:white;display:grid;place-items:center;font-weight:800;font-size:26px;flex-shrink:0;overflow:hidden;">
            ${u.profile_image ? `<img src="${u.profile_image}" style="width:100%;height:100%;object-fit:cover;">` : (u.name||'?').slice(0,1)}
          </div>
          <div>
            <input type="file" id="pfg_photo" accept="image/*" style="display:none;">
            <div class="flex gap-8">
              <button type="button" class="btn btn-sm" id="pfg_pickBtn">📷 사진 변경</button>
              <button type="button" class="btn btn-sm btn-danger" id="pfg_clearBtn" ${!u.profile_image?'style="display:none;"':''}>사진 삭제</button>
            </div>
            <div class="text-sm text-muted mt-8">JPG / PNG, 최대 4MB</div>
          </div>
        </div>
        <div class="flex gap-12">
          <div class="field flex-1"><label class="label">이름 *</label><input class="input" id="pfg_name" value="${(u.name||'').replace(/"/g,'&quot;')}"></div>
          <div class="field flex-1"><label class="label">이메일</label><input class="input" value="${u.email||''}" disabled style="background:var(--surface-2);"></div>
        </div>
        <div class="flex gap-12">
          <div class="field flex-1"><label class="label">전화번호</label><input class="input" id="pfg_phone" value="${(u.phone||'').replace(/"/g,'&quot;')}" placeholder="010-1234-5678"></div>
          <div class="field flex-1"><label class="label">전공</label><input class="input" id="pfg_major" value="${(u.major||'').replace(/"/g,'&quot;')}" placeholder="예: 경영학"></div>
        </div>
        <div class="field"><label class="label">직장 / 소속</label><input class="input" id="pfg_work" value="${(u.workplace||'').replace(/"/g,'&quot;')}" placeholder="회사명·소속"></div>
        <div class="field"><label class="label">소개</label><textarea class="textarea" id="pfg_bio" rows="3" placeholder="간단한 자기소개">${u.bio||''}</textarea></div>
      </div>

      <!-- 비밀번호 변경 탭 -->
      <div data-ptab-panel="password" style="display:none;">
        <div class="text-sm text-muted mb-16">현재 비밀번호 확인 후 새 비밀번호로 변경합니다.</div>
        <div class="field"><label class="label">현재 비밀번호 *</label>
          <input class="input" type="password" id="pfg_curr_pw" autocomplete="current-password" placeholder="현재 비밀번호 입력">
        </div>
        <div class="field"><label class="label">새 비밀번호 *</label>
          <input class="input" type="password" id="pfg_new_pw" autocomplete="new-password" placeholder="${PASSWORD_POLICY.REQUIREMENTS_TEXT}">
        </div>
        <div class="field"><label class="label">새 비밀번호 확인 *</label>
          <input class="input" type="password" id="pfg_new_pw2" autocomplete="new-password" placeholder="다시 입력">
        </div>
        <button type="button" class="btn btn-primary btn-block" id="pfg_change_pw_btn" style="margin-top:8px;">🔑 비밀번호 변경</button>
      </div>
    `,
    confirmText: '저장',
    onConfirm: async () => {
      // 현재 활성 탭이 비밀번호 탭이면 저장 액션 비활성 (별도 버튼 사용)
      const isPwTab = document.querySelector('.profile-tab.active')?.dataset.ptab === 'password';
      if (isPwTab) return;
      const name = document.getElementById('pfg_name').value.trim();
      if (!name) { toast('이름을 입력하세요.', 'error'); return false; }
      try {
        await api.put('/api/auth/profile', {
          name,
          phone: document.getElementById('pfg_phone').value.trim(),
          major: document.getElementById('pfg_major').value.trim(),
          workplace: document.getElementById('pfg_work').value.trim(),
          bio: document.getElementById('pfg_bio').value.trim(),
          profile_image: photoData
        });
        toast('프로필이 저장되었습니다.', 'success');
        const me2 = await getMe();
        const userArea = document.getElementById('userArea');
        if (userArea) userArea.innerHTML = renderUserChip(me2);
      } catch (e) { toast(e.message, 'error'); return false; }
    }
  });
  setTimeout(() => {
    document.getElementById('pfg_pickBtn').onclick = () => document.getElementById('pfg_photo').click();
    document.getElementById('pfg_photo').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 4 * 1024 * 1024) { toast('이미지는 4MB 이하만 가능합니다.', 'error'); return; }
      const r = new FileReader();
      r.onload = (ev) => {
        photoData = ev.target.result;
        document.getElementById('pfg_preview').innerHTML = `<img src="${photoData}" style="width:100%;height:100%;object-fit:cover;">`;
        const cb = document.getElementById('pfg_clearBtn'); if (cb) cb.style.display = '';
      };
      r.readAsDataURL(f);
    };
    document.getElementById('pfg_clearBtn').onclick = () => {
      photoData = '';
      document.getElementById('pfg_preview').innerHTML = (u.name||'?').slice(0,1);
      document.getElementById('pfg_clearBtn').style.display = 'none';
    };

    // 탭 전환
    document.querySelectorAll('.profile-tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.profile-tab').forEach(x => {
          x.classList.toggle('active', x === t);
          x.style.color = x === t ? 'var(--text)' : 'var(--text-muted)';
          x.style.borderBottomColor = x === t ? 'var(--accent, #1e40af)' : 'transparent';
          x.style.fontWeight = x === t ? '700' : '600';
        });
        const target = t.dataset.ptab;
        document.querySelectorAll('[data-ptab-panel]').forEach(p => {
          p.style.display = p.dataset.ptabPanel === target ? '' : 'none';
        });
      };
    });
    // 첫 활성 탭 색상 적용
    const firstActive = document.querySelector('.profile-tab.active');
    if (firstActive) {
      firstActive.style.color = 'var(--text)';
      firstActive.style.borderBottomColor = 'var(--accent, #1e40af)';
    }

    // 비밀번호 정책 실시간 표시
    attachPasswordPolicy(document.getElementById('pfg_new_pw'));

    // 비밀번호 변경 버튼
    document.getElementById('pfg_change_pw_btn').onclick = async () => {
      const cur = document.getElementById('pfg_curr_pw').value;
      const nw  = document.getElementById('pfg_new_pw').value;
      const nw2 = document.getElementById('pfg_new_pw2').value;
      if (!cur) { toast('현재 비밀번호를 입력하세요.', 'error'); return; }
      const pwErr = PASSWORD_POLICY.validate(nw);
      if (pwErr) { toast(pwErr, 'error'); return; }
      if (nw !== nw2) { toast('새 비밀번호가 일치하지 않습니다.', 'error'); return; }
      if (cur === nw) { toast('새 비밀번호는 현재 비밀번호와 달라야 합니다.', 'error'); return; }
      try {
        await api.post('/api/auth/change-password', { current_password: cur, new_password: nw });
        toast('비밀번호가 변경되었습니다. 다음 로그인부터 적용됩니다.', 'success');
        document.getElementById('pfg_curr_pw').value = '';
        document.getElementById('pfg_new_pw').value = '';
        document.getElementById('pfg_new_pw2').value = '';
        document.getElementById('pfg_new_pw').dispatchEvent(new Event('input'));
      } catch (e) { toast(e.message || '비밀번호 변경 실패', 'error'); }
    };
  }, 50);
}

// ========== Drag-and-drop reorder helper ==========
// Binds DnD on items of `container` identified by `idAttr` (e.g. "data-id").
// onReorder(orderedIds) is called after a successful drop.
// options.handleSelector — if provided, drag is only enabled when grabbed via that selector.
function bindDndReorder(container, idAttr, onReorder, options = {}) {
  if (!container) return;
  const handleSelector = options && options.handleSelector;
  let dragId = null;
  let dropPosition = null; // 'before' | 'after'
  const items = container.querySelectorAll(`[${idAttr}]`);
  const cleanup = () => {
    container.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  };
  items.forEach(el => {
    // Handle-based drag enabling: row is not draggable until user clicks the handle
    if (handleSelector) {
      el.draggable = false;
      const handle = el.querySelector(handleSelector);
      if (handle) {
        handle.addEventListener('mousedown', () => { el.draggable = true; });
        const reset = () => {
          // Defer to allow dragend (if any) to fire first
          setTimeout(() => {
            if (!el.classList.contains('dragging-source')) el.draggable = false;
          }, 50);
        };
        el.addEventListener('dragend', () => { el.draggable = false; });
        document.addEventListener('mouseup', reset);
      }
    } else {
      el.draggable = true;
    }

    el.addEventListener('dragstart', (e) => {
      dragId = el.getAttribute(idAttr);
      el.classList.add('dragging-source');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch {}
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging-source');
      cleanup();
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      cleanup();
      el.classList.add(after ? 'drag-over-bottom' : 'drag-over-top');
      dropPosition = after ? 'after' : 'before';
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      cleanup();
      const targetId = el.getAttribute(idAttr);
      if (!dragId || dragId === targetId) return;
      const ids = [...container.querySelectorAll(`[${idAttr}]`)].map(x => x.getAttribute(idAttr));
      const fromIdx = ids.indexOf(dragId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = ids.splice(fromIdx, 1);
      const finalToIdx = (() => {
        const tIdx = ids.indexOf(targetId);
        return dropPosition === 'after' ? tIdx + 1 : tIdx;
      })();
      ids.splice(finalToIdx, 0, moved);
      onReorder(ids);
    });
  });
}

// ========== Clipboard copy with fallback ==========
async function copyText(text, successMsg = '복사되었습니다.') {
  const value = String(text == null ? '' : text);
  // Strategy 1: execCommand via temporary textarea (works in most contexts including iframes
  //              when called within a user-initiated event handler)
  const tryExecCommand = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      // Make it visible enough to be focusable but visually hidden
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;margin:0;outline:none;background:transparent;opacity:0.01;pointer-events:none;z-index:-9999;';
      document.body.appendChild(ta);
      // iOS Safari requires contentEditable + readonly
      const isIOS = /iP(ad|hone|od)/i.test(navigator.userAgent);
      if (isIOS) {
        ta.contentEditable = 'true';
        const range = document.createRange();
        range.selectNodeContents(ta);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        ta.setSelectionRange(0, value.length);
      } else {
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, value.length);
      }
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  };

  // Strategy 2: Async Clipboard API
  const tryClipboardAPI = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (e) {}
    return false;
  };

  // Try execCommand FIRST (most reliable in iframes/sandboxed contexts where
  //   clipboard API throws "Document is not focused"). Then fallback to Clipboard API.
  let ok = tryExecCommand();
  if (!ok) ok = await tryClipboardAPI();

  if (ok) {
    if (successMsg) toast(successMsg, 'success');
    return true;
  }

  // Last-resort: show modal with the text for manual copy
  if (typeof modal === 'function') {
    modal({
      title: '복사할 텍스트',
      body: `<div class="text-sm text-muted mb-12">자동 복사가 차단되었습니다. 아래 텍스트를 직접 선택하여 복사하세요.</div>
             <input class="input" readonly value="${value.replace(/"/g,'&quot;')}" onclick="this.select()" style="font-family:Menlo,Consolas,monospace;font-size:12px;">`,
      hideFoot: true
    });
  } else {
    window.prompt('아래 텍스트를 복사하세요:', value);
  }
  return false;
}

// ========== Smart redirect after login ==========
async function smartRedirect(user) {
  user = user || await getMe();
  if (!user) { location.href = '/login'; return; }
  // 시스템 관리자 → 루트(랜딩) 로 시작 — 단, 이미 루트에 있으면 관리 콘솔로 (중복 리다이렉트 방지)
  if (user.role === 'admin') {
    const isAtRoot = location.pathname === '/' || location.pathname === '/index.html';
    location.href = isAtRoot ? '/admin' : '/';
    return;
  }
  // Regular user → check their orgs
  try {
    const { organizations } = await api.get('/api/organizations');
    if (organizations.length === 1) {
      location.href = `/home?org=${organizations[0].id}`;
    } else {
      location.href = '/dashboard';
    }
  } catch (e) {
    location.href = '/dashboard';
  }
}

// ========== Role helpers ==========
function isOrgAdminRole(role) { return role === 'system_admin' || role === 'admin'; }
function roleLabel(role) {
  return ({ system_admin: '시스템 관리자', admin: '기관 관리자', member: '일반 사용자' })[role] || '';
}
function showOnlyForAdmin(role) {
  document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = isOrgAdminRole(role) ? '' : 'none');
  document.querySelectorAll('[data-member-only]').forEach(el => el.style.display = !isOrgAdminRole(role) ? '' : 'none');
}

// ========== Logo Slots (3 variants: logo / text / combo) ==========
// Returns HTML markup for 3 logo upload slots. Use bindLogoSlots() afterwards
//   and readLogoSlots() in onConfirm to collect values.
const LOGO_SLOT_DEFS = [
  { key: 'logo',  field: 'logo_url',       label: '🖼 Logo',         hint: '심볼/마크' },
  { key: 'text',  field: 'logo_text_url',  label: '📝 Text',         hint: '텍스트만' },
  { key: 'combo', field: 'logo_combo_url', label: '🔤 Logo & Text',  hint: '심볼+텍스트' }
];

function logoSlotsHtml(prefix, current = {}) {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:10px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;margin-bottom:14px;">
      ${LOGO_SLOT_DEFS.map(s => {
        const url = current[s.field] || '';
        const isImg = url && (url.startsWith('data:') || url.startsWith('http') || url.startsWith('/'));
        return `
          <div class="logo-slot" data-slot="${s.key}">
            <div style="font-size:12px;font-weight:700;margin-bottom:4px;">${s.label}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">${s.hint}</div>
            <div id="${prefix}_${s.key}_preview" style="width:100%;aspect-ratio:1.6;background:white;border:1px dashed var(--border);border-radius:6px;display:grid;place-items:center;overflow:hidden;margin-bottom:6px;font-size:11px;color:var(--text-muted);">
              ${isImg ? `<img src="${url}" style="width:100%;height:100%;object-fit:contain;background:white;">` : '없음'}
            </div>
            <input type="file" id="${prefix}_${s.key}_file" accept="image/*" style="display:none;">
            <div style="display:flex;gap:4px;margin-bottom:4px;">
              <button type="button" class="btn btn-sm" style="flex:1;font-size:11px;padding:4px;" onclick="document.getElementById('${prefix}_${s.key}_file').click()">📁 업로드</button>
              <button type="button" class="btn btn-sm btn-danger" id="${prefix}_${s.key}_clear" style="font-size:11px;padding:4px 6px;${url?'':'display:none;'}">🗑</button>
            </div>
            <input class="input" id="${prefix}_${s.key}_url" placeholder="또는 URL" style="font-size:11px;padding:4px 6px;" value="${(url && !url.startsWith('data:')) ? url : ''}">
          </div>
        `;
      }).join('')}
    </div>
    <div class="text-sm text-muted" style="font-size:11px;margin-top:-8px;margin-bottom:14px;">JPG / PNG / SVG, 각 4MB 이하 (모두 선택사항)</div>
  `;
}

function bindLogoSlots(prefix, state) {
  // state: { logo_url, logo_text_url, logo_combo_url } — mutated in place
  LOGO_SLOT_DEFS.forEach(s => {
    const fi = document.getElementById(`${prefix}_${s.key}_file`);
    const urlInput = document.getElementById(`${prefix}_${s.key}_url`);
    const preview = document.getElementById(`${prefix}_${s.key}_preview`);
    const clearBtn = document.getElementById(`${prefix}_${s.key}_clear`);
    if (fi) fi.onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 4 * 1024 * 1024) { toast('이미지는 4MB 이하만 가능합니다.', 'error'); return; }
      const r = new FileReader();
      r.onload = (ev) => {
        state[s.field] = ev.target.result;
        preview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:contain;">`;
        if (urlInput) urlInput.value = '';
        if (clearBtn) clearBtn.style.display = '';
      };
      r.readAsDataURL(f);
    };
    if (urlInput) urlInput.oninput = () => {
      if (urlInput.value && !state[s.field]?.startsWith('data:')) {
        state[s.field] = urlInput.value;
        preview.innerHTML = urlInput.value ? `<img src="${urlInput.value}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';">` : '없음';
        if (clearBtn) clearBtn.style.display = urlInput.value ? '' : 'none';
      }
    };
    if (clearBtn) clearBtn.onclick = () => {
      state[s.field] = '';
      if (urlInput) urlInput.value = '';
      preview.innerHTML = '없음';
      clearBtn.style.display = 'none';
    };
  });
}

function readLogoSlots(prefix, state) {
  // Final pass: prefer file (data URL in state) over URL field
  LOGO_SLOT_DEFS.forEach(s => {
    const urlInput = document.getElementById(`${prefix}_${s.key}_url`);
    const cur = state[s.field] || '';
    if (cur && cur.startsWith('data:')) return; // keep file upload
    state[s.field] = (urlInput && urlInput.value.trim()) || '';
  });
  return {
    logo_url:       state.logo_url       || '',
    logo_text_url:  state.logo_text_url  || '',
    logo_combo_url: state.logo_combo_url || ''
  };
}

// ========== Hero Image Slot ==========
//   Single-image upload slot for the home page banner background.
function heroImageHtml(prefix, currentUrl = '') {
  const has = !!currentUrl;
  return `
    <div style="padding:10px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;margin-bottom:14px;">
      <div style="display:grid;grid-template-columns:140px 1fr;gap:12px;align-items:start;">
        <div id="${prefix}_hero_preview" style="width:140px;aspect-ratio:1.6;background:white;border:1px dashed var(--border);border-radius:6px;display:grid;place-items:center;overflow:hidden;font-size:11px;color:var(--text-muted);">
          ${has ? `<img src="${currentUrl}" style="width:100%;height:100%;object-fit:cover;">` : '메인 이미지 없음'}
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;margin-bottom:4px;">🖼 기관홈 메인 이미지</div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">홈 hero 배경에 사용됩니다 (가로형 권장)</div>
          <input type="file" id="${prefix}_hero_file" accept="image/*" style="display:none;">
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-sm" style="flex:1;" onclick="document.getElementById('${prefix}_hero_file').click()">📁 이미지 선택</button>
            <button type="button" class="btn btn-sm btn-danger" id="${prefix}_hero_clear" ${has?'':'style="display:none;"'}>🗑 삭제</button>
          </div>
          <input class="input mt-8" id="${prefix}_hero_url" placeholder="또는 이미지 URL" style="font-size:12px;" value="${(currentUrl && !currentUrl.startsWith('data:')) ? currentUrl : ''}">
        </div>
      </div>
    </div>
  `;
}

function bindHeroImage(prefix, state) {
  const fi = document.getElementById(`${prefix}_hero_file`);
  const urlInput = document.getElementById(`${prefix}_hero_url`);
  const preview = document.getElementById(`${prefix}_hero_preview`);
  const clearBtn = document.getElementById(`${prefix}_hero_clear`);
  if (fi) fi.onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast('이미지는 4MB 이하만 가능합니다.', 'error'); return; }
    const r = new FileReader();
    r.onload = (ev) => {
      state.hero_image_url = ev.target.result;
      preview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
      if (urlInput) urlInput.value = '';
      if (clearBtn) clearBtn.style.display = '';
    };
    r.readAsDataURL(f);
  };
  if (urlInput) urlInput.oninput = () => {
    if (urlInput.value && !state.hero_image_url?.startsWith('data:')) {
      state.hero_image_url = urlInput.value;
      preview.innerHTML = urlInput.value ? `<img src="${urlInput.value}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';">` : '메인 이미지 없음';
      if (clearBtn) clearBtn.style.display = urlInput.value ? '' : 'none';
    }
  };
  if (clearBtn) clearBtn.onclick = () => {
    state.hero_image_url = '';
    if (urlInput) urlInput.value = '';
    preview.innerHTML = '메인 이미지 없음';
    clearBtn.style.display = 'none';
  };
}

function readHeroImage(prefix, state) {
  const urlInput = document.getElementById(`${prefix}_hero_url`);
  const cur = state.hero_image_url || '';
  if (cur && cur.startsWith('data:')) return cur;
  return (urlInput && urlInput.value.trim()) || '';
}

// Pick the best logo variant for a given context.
//   prefer: 'combo' (default) — for hero/cover (large featured display)
//           'logo' — for compact symbol display (sidebar, brand-mark)
//           'text' — for text-only display (topbar, headers)
//   Falls back through other variants if the preferred one is empty.
function pickLogo(org, prefer = 'combo') {
  if (!org) return '';
  const order = {
    combo: ['logo_combo_url', 'logo_url', 'logo_text_url'],
    logo:  ['logo_url', 'logo_combo_url', 'logo_text_url'],
    text:  ['logo_text_url', 'logo_combo_url', 'logo_url']
  }[prefer] || ['logo_combo_url', 'logo_url', 'logo_text_url'];
  for (const k of order) { if (org[k]) return org[k]; }
  return '';
}
