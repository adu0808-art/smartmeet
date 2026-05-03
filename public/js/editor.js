// SmartMeet 커스텀 리치 에디터 (vanilla, contenteditable 기반)
//   - HTML 모드 제거 — 항상 WYSIWYG
//   - 툴바: 본문 / H1·H2·H3 / 폰트·크기 / B·I·U·S / 정렬 / 색상 / 목록 / 표 / 이미지 / 되돌리기·다시하기
//   - 이미지 삽입은 버튼 아래 floating 팝오버 (파일/URL + 설명)
//   - 표 삽입은 버튼 아래 floating 팝오버 — 그리드에서 마우스 호버로 행/열 선택
//
// 호환 API (기존과 동일):
//   RichEditor.mount(container, { value, placeholder, large?, minimal? }) → Promise<{ getHtml, setHtml, destroy }>

(function () {
  // 한 번만 주입할 CSS
  function ensureCss() {
    if (document.getElementById('rt-editor-css')) return;
    const css = document.createElement('style');
    css.id = 'rt-editor-css';
    css.textContent = `
      .rt-editor { border: 1px solid var(--border, #e2e8f0); border-radius: 10px; overflow: visible; background: var(--surface, #fff); position: relative; }
      .rt-toolbar { display: flex; flex-wrap: wrap; gap: 1px; padding: 6px 6px; border-bottom: 1px solid var(--border, #e2e8f0); background: var(--surface-2, #f8fafc); align-items: center; }
      .rt-tb-group { display: inline-flex; gap: 1px; align-items: center; padding: 0 2px; }
      .rt-tb-sep { width: 1px; height: 22px; background: var(--border, #e2e8f0); margin: 0 2px; }
      .rt-btn {
        height: 30px; min-width: 28px; padding: 0 6px;
        background: transparent; border: 1px solid transparent; border-radius: 5px;
        font-size: 13px; color: var(--text, #1a202c); cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 4px;
        font-weight: 500; transition: background 0.12s, color 0.12s;
      }
      .rt-btn:hover { background: var(--accent-soft, #e0e7ff); }
      .rt-btn.is-on { background: var(--accent, #1e40af); color: #fff; }
      .rt-btn.is-on:hover { background: var(--accent-hover, #1e3a8a); }
      .rt-btn-bold { font-weight: 800; }
      .rt-btn-italic { font-style: italic; font-weight: 600; }
      .rt-btn-under { text-decoration: underline; font-weight: 600; }
      .rt-btn-strike { text-decoration: line-through; font-weight: 600; }
      .rt-btn-h1 { font-weight: 800; font-size: 13.5px; }
      .rt-btn-h2 { font-weight: 800; font-size: 13px; }
      .rt-btn-h3 { font-weight: 700; font-size: 12.5px; }
      .rt-select {
        height: 30px; padding: 0 6px; border-radius: 5px;
        border: 1px solid var(--border, #e2e8f0); background: var(--surface, #fff);
        font-size: 12.5px; color: var(--text, #1a202c); cursor: pointer; min-width: 64px;
      }
      .rt-color-wrap { position: relative; display: inline-flex; align-items: center; }
      .rt-color-swatch { display: inline-block; width: 14px; height: 4px; border-radius: 2px; margin-left: 4px; background: #1a202c; }
      .rt-color-input {
        position: absolute; left: 0; top: 0; width: 100%; height: 100%;
        opacity: 0; cursor: pointer; padding: 0; border: none;
      }
      .rt-content {
        min-height: 220px; max-height: 600px; overflow-y: auto;
        padding: 14px 16px; outline: none; font-size: 14px; line-height: 1.7;
        color: var(--text, #1a202c); background: var(--surface, #fff);
        border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;
      }
      .rt-content.lg { min-height: 360px; }
      .rt-content:empty::before {
        content: attr(data-placeholder);
        color: var(--text-soft, #94a3b8); pointer-events: none;
      }
      .rt-content > *:first-child { margin-top: 0; }
      .rt-content h1 { font-size: 22px; font-weight: 800; margin: 18px 0 10px; line-height: 1.3; }
      .rt-content h2 { font-size: 18px; font-weight: 800; margin: 16px 0 8px; line-height: 1.35; }
      .rt-content h3 { font-size: 15.5px; font-weight: 700; margin: 14px 0 6px; line-height: 1.4; }
      .rt-content p { margin: 0 0 10px; }
      .rt-content ul, .rt-content ol { padding-left: 24px; margin: 0 0 10px; }
      .rt-content blockquote { border-left: 3px solid var(--accent, #1e40af); padding: 6px 14px; margin: 10px 0; color: var(--text-muted, #64748b); background: var(--surface-2, #f8fafc); border-radius: 0 6px 6px 0; }
      .rt-content table { border-collapse: collapse; width: 100%; margin: 10px 0; }
      .rt-content table th, .rt-content table td { border: 1px solid var(--border-strong, #cbd5e0); padding: 6px 10px; min-width: 40px; }
      .rt-content table th { background: var(--surface-2, #f8fafc); font-weight: 700; }
      .rt-content img { max-width: 100%; height: auto; display: block; margin: 10px auto; border-radius: 6px; }
      .rt-content figure { margin: 14px 0; text-align: center; }
      .rt-content figcaption { font-size: 12px; color: var(--text-muted, #64748b); margin-top: 6px; font-style: italic; }
      .rt-content a { color: var(--accent, #1e40af); text-decoration: underline; }

      /* 이미지 삽입 팝오버 */
      .rt-popover {
        position: absolute; z-index: 100; min-width: 280px; max-width: 320px;
        background: var(--surface, #fff); border: 1px solid var(--border, #e2e8f0);
        border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        padding: 14px; font-size: 13px;
      }
      .rt-popover-title { font-size: 13.5px; font-weight: 700; margin-bottom: 10px; }
      .rt-popover-label { font-size: 12px; font-weight: 600; color: var(--text-muted, #64748b); margin: 8px 0 4px; }
      .rt-popover-input {
        width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px;
        border: 1px solid var(--border, #e2e8f0); font-size: 13px; background: #fff;
      }
      .rt-popover-input:focus { outline: 2px solid var(--accent, #1e40af); outline-offset: -1px; }
      .rt-file-btn {
        display: block; width: 100%; padding: 14px; text-align: center;
        background: var(--surface-2, #f8fafc); border: 1.5px dashed var(--border-strong, #cbd5e0);
        border-radius: 8px; color: var(--text-muted, #64748b); cursor: pointer;
        font-size: 13px; transition: background 0.12s, border-color 0.12s;
      }
      .rt-file-btn:hover { background: var(--accent-soft, #e0e7ff); border-color: var(--accent, #1e40af); color: var(--accent, #1e40af); }
      .rt-popover-or { text-align: center; font-size: 11.5px; color: var(--text-muted, #64748b); margin: 10px 0 6px; position: relative; }
      .rt-popover-or::before, .rt-popover-or::after {
        content: ''; position: absolute; top: 50%; width: 38%; height: 1px; background: var(--border, #e2e8f0);
      }
      .rt-popover-or::before { left: 0; }
      .rt-popover-or::after { right: 0; }
      .rt-popover-submit {
        width: 100%; padding: 10px; background: linear-gradient(135deg, #fbbf24, #f59e0b);
        color: #fff; border: none; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer;
        margin-top: 12px;
      }
      .rt-popover-submit:hover { background: linear-gradient(135deg, #f59e0b, #d97706); }

      /* 표 삽입 — 그리드 선택 팝오버 */
      .rt-table-popover {
        position: absolute; z-index: 100;
        background: var(--surface, #fff); border: 1px solid var(--border, #e2e8f0);
        border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        padding: 12px;
      }
      .rt-table-grid {
        display: grid; grid-template-columns: repeat(10, 22px); grid-auto-rows: 22px;
        gap: 3px;
      }
      .rt-table-cell {
        width: 22px; height: 22px; border-radius: 4px;
        background: var(--surface, #fff); border: 1.5px solid var(--border-strong, #cbd5e0);
        cursor: pointer; transition: background 0.08s, border-color 0.08s;
      }
      .rt-table-cell.is-on {
        background: var(--accent-soft, #e0e7ff);
        border-color: var(--accent, #1e40af);
      }
      .rt-table-label {
        margin-top: 8px; text-align: center; font-size: 12px;
        color: var(--text-muted, #64748b); font-weight: 500;
      }
    `;
    document.head.appendChild(css);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function mountEditor(container, opts = {}) {
    ensureCss();
    container.classList.add('rt-editor');

    const toolbar = document.createElement('div');
    toolbar.className = 'rt-toolbar';
    toolbar.innerHTML = renderToolbarHtml(!!opts.minimal);
    container.appendChild(toolbar);

    const content = document.createElement('div');
    content.className = 'rt-content' + (opts.large ? ' lg' : '');
    content.contentEditable = 'true';
    content.dataset.placeholder = opts.placeholder || '내용을 입력하세요...';
    if (opts.value) content.innerHTML = opts.value;
    container.appendChild(content);

    // 명령 실행 헬퍼 — execCommand 는 deprecated 이지만 모든 주요 브라우저 지원, contenteditable 에 가장 단순
    const exec = (cmd, val) => {
      try { document.execCommand(cmd, false, val); } catch {}
      content.focus();
      updateToolbarState();
    };

    // 활성 상태 갱신 (B/I/U 등)
    function updateToolbarState() {
      const cmds = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight'];
      cmds.forEach(c => {
        const btn = toolbar.querySelector(`[data-cmd="${c}"]`);
        if (btn) {
          let on = false;
          try { on = document.queryCommandState(c); } catch {}
          btn.classList.toggle('is-on', on);
        }
      });
      // 헤딩 토글
      const block = (() => {
        try { return document.queryCommandValue('formatBlock').toLowerCase(); } catch { return ''; }
      })();
      ['p', 'h1', 'h2', 'h3'].forEach(tag => {
        const btn = toolbar.querySelector(`[data-block="${tag}"]`);
        if (btn) btn.classList.toggle('is-on', block === tag);
      });
    }
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === content || content.contains(document.activeElement)) {
        updateToolbarState();
      }
    });
    content.addEventListener('keyup', updateToolbarState);
    content.addEventListener('mouseup', updateToolbarState);

    // ===== 툴바 클릭 처리 =====
    toolbar.addEventListener('click', (e) => {
      const t = e.target.closest('[data-cmd], [data-block], [data-action]');
      if (!t) return;
      e.preventDefault();
      content.focus();
      // 단순 명령
      if (t.dataset.cmd) {
        exec(t.dataset.cmd);
        return;
      }
      // 블록 변경 (본문/H1/H2/H3)
      if (t.dataset.block) {
        exec('formatBlock', t.dataset.block);
        return;
      }
      // 특수 액션
      const action = t.dataset.action;
      if (action === 'undo') exec('undo');
      else if (action === 'redo') exec('redo');
      else if (action === 'table') toggleTablePopover(t);
      else if (action === 'image') toggleImagePopover(t);
      else if (action === 'quote') exec('formatBlock', 'blockquote');
    });

    // 폰트/크기 select
    toolbar.addEventListener('change', (e) => {
      const sel = e.target;
      if (sel.classList.contains('rt-select-font')) {
        if (sel.value) exec('fontName', sel.value);
        sel.value = '';
      } else if (sel.classList.contains('rt-select-size')) {
        if (sel.value) {
          // size: 1~7 (execCommand) → 사용자 친화적인 px 매핑
          const map = { 'xs': '1', 'sm': '2', 'md': '3', 'lg': '4', 'xl': '5', '2xl': '6', '3xl': '7' };
          exec('fontSize', map[sel.value] || '3');
        }
        sel.value = '';
      }
    });

    // 색상 입력
    toolbar.addEventListener('input', (e) => {
      const t = e.target;
      if (t.classList.contains('rt-color-input')) {
        exec('foreColor', t.value);
        const swatch = toolbar.querySelector('.rt-color-swatch');
        if (swatch) swatch.style.background = t.value;
      }
    });

    // ===== 이미지 삽입 팝오버 =====
    let popoverEl = null;
    function toggleImagePopover(anchorBtn) {
      if (popoverEl) { closeImagePopover(); return; }
      popoverEl = buildImagePopover((src, alt) => {
        insertImage(src, alt);
        closeImagePopover();
      });
      // 위치 — 버튼 아래에
      const rect = anchorBtn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      popoverEl.style.top = (rect.bottom - containerRect.top + 4) + 'px';
      popoverEl.style.left = Math.max(8, rect.left - containerRect.left) + 'px';
      container.appendChild(popoverEl);
      // 외부 클릭 시 닫기
      setTimeout(() => {
        document.addEventListener('mousedown', _closeImgOutside, { once: true });
      }, 10);
    }
    function _closeImgOutside(e) {
      if (popoverEl && !popoverEl.contains(e.target) && !e.target.closest('[data-action="image"]')) {
        closeImagePopover();
      } else if (popoverEl) {
        // 다시 바인딩
        document.addEventListener('mousedown', _closeImgOutside, { once: true });
      }
    }
    function closeImagePopover() {
      if (popoverEl) { popoverEl.remove(); popoverEl = null; }
    }
    function insertImage(src, alt) {
      content.focus();
      const html = alt
        ? `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"><figcaption>${escapeHtml(alt)}</figcaption></figure>`
        : `<p><img src="${escapeHtml(src)}" alt=""></p>`;
      exec('insertHTML', html);
    }

    // ===== 표 삽입 — 그리드 호버 선택 팝오버 =====
    let tablePopoverEl = null;
    const TABLE_MAX_ROWS = 8;
    const TABLE_MAX_COLS = 10;

    function toggleTablePopover(anchorBtn) {
      if (tablePopoverEl) { closeTablePopover(); return; }
      tablePopoverEl = buildTablePopover((rows, cols) => {
        insertTable(rows, cols);
        closeTablePopover();
      });
      const rect = anchorBtn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      tablePopoverEl.style.top = (rect.bottom - containerRect.top + 4) + 'px';
      tablePopoverEl.style.left = Math.max(8, rect.left - containerRect.left) + 'px';
      container.appendChild(tablePopoverEl);
      setTimeout(() => {
        document.addEventListener('mousedown', _closeTblOutside, { once: true });
      }, 10);
    }
    function _closeTblOutside(e) {
      if (tablePopoverEl && !tablePopoverEl.contains(e.target) && !e.target.closest('[data-action="table"]')) {
        closeTablePopover();
      } else if (tablePopoverEl) {
        document.addEventListener('mousedown', _closeTblOutside, { once: true });
      }
    }
    function closeTablePopover() {
      if (tablePopoverEl) { tablePopoverEl.remove(); tablePopoverEl = null; }
    }

    function insertTable(rows, cols) {
      rows = Math.min(TABLE_MAX_ROWS, Math.max(1, rows | 0));
      cols = Math.min(TABLE_MAX_COLS, Math.max(1, cols | 0));
      let html = '<table><thead><tr>';
      for (let c = 0; c < cols; c++) html += '<th>&nbsp;</th>';
      html += '</tr></thead><tbody>';
      for (let r = 0; r < rows - 1; r++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) html += '<td>&nbsp;</td>';
        html += '</tr>';
      }
      html += '</tbody></table><p><br></p>';
      content.focus();
      exec('insertHTML', html);
    }

    // 초기 상태
    updateToolbarState();

    return {
      getHtml: () => {
        const html = content.innerHTML.trim();
        // contenteditable 의 빈 상태 — <br> 만 있거나 빈 <p>
        if (html === '' || html === '<br>' || html === '<p></p>' || html === '<p><br></p>') return '';
        return html;
      },
      setHtml: (html) => {
        content.innerHTML = String(html || '');
      },
      destroy: () => {
        closeImagePopover();
        closeTablePopover();
        container.replaceChildren();
      },
      focus: () => content.focus()
    };
  }

  // ===== 툴바 HTML =====
  function renderToolbarHtml(minimal) {
    if (minimal) {
      return `
        <div class="rt-tb-group">
          <button type="button" class="rt-btn rt-btn-bold" data-cmd="bold" title="굵게 (Ctrl+B)">B</button>
          <button type="button" class="rt-btn rt-btn-italic" data-cmd="italic" title="기울임 (Ctrl+I)">I</button>
          <button type="button" class="rt-btn rt-btn-under" data-cmd="underline" title="밑줄 (Ctrl+U)">U</button>
        </div>
        <div class="rt-tb-sep"></div>
        <div class="rt-tb-group">
          <button type="button" class="rt-btn" data-cmd="insertUnorderedList" title="글머리 기호">• 목록</button>
          <button type="button" class="rt-btn" data-cmd="insertOrderedList" title="번호 매기기">1. 목록</button>
        </div>
        <div class="rt-tb-sep"></div>
        <div class="rt-tb-group">
          <button type="button" class="rt-btn" data-action="undo" title="되돌리기 (Ctrl+Z)">⤺</button>
          <button type="button" class="rt-btn" data-action="redo" title="다시하기 (Ctrl+Y)">⤻</button>
        </div>`;
    }
    return `
      <div class="rt-tb-group">
        <button type="button" class="rt-btn" data-block="p" title="본문 단락">본문</button>
        <button type="button" class="rt-btn rt-btn-h1" data-block="h1" title="제목 1">H1</button>
        <button type="button" class="rt-btn rt-btn-h2" data-block="h2" title="제목 2">H2</button>
        <button type="button" class="rt-btn rt-btn-h3" data-block="h3" title="제목 3">H3</button>
      </div>
      <div class="rt-tb-sep"></div>
      <div class="rt-tb-group">
        <select class="rt-select rt-select-font" title="폰트">
          <option value="">폰트</option>
          <option value="Pretendard">Pretendard</option>
          <option value="'Malgun Gothic', sans-serif">맑은 고딕</option>
          <option value="'Nanum Gothic', sans-serif">나눔고딕</option>
          <option value="'Noto Serif KR', serif">노토 명조</option>
          <option value="'Courier New', monospace">고정폭</option>
        </select>
        <select class="rt-select rt-select-size" title="크기">
          <option value="">크기</option>
          <option value="xs">아주 작게</option>
          <option value="sm">작게</option>
          <option value="md">보통</option>
          <option value="lg">크게</option>
          <option value="xl">아주 크게</option>
          <option value="2xl">제목</option>
          <option value="3xl">큰 제목</option>
        </select>
      </div>
      <div class="rt-tb-sep"></div>
      <div class="rt-tb-group">
        <button type="button" class="rt-btn rt-btn-bold" data-cmd="bold" title="굵게 (Ctrl+B)">B</button>
        <button type="button" class="rt-btn rt-btn-italic" data-cmd="italic" title="기울임 (Ctrl+I)">I</button>
        <button type="button" class="rt-btn rt-btn-under" data-cmd="underline" title="밑줄 (Ctrl+U)">U</button>
        <button type="button" class="rt-btn rt-btn-strike" data-cmd="strikeThrough" title="취소선">S</button>
      </div>
      <div class="rt-tb-sep"></div>
      <div class="rt-tb-group">
        <button type="button" class="rt-btn" data-cmd="justifyLeft" title="왼쪽 정렬">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="12" height="1.5"/><rect x="1" y="6" width="8" height="1.5"/><rect x="1" y="10" width="12" height="1.5"/></svg>
        </button>
        <button type="button" class="rt-btn" data-cmd="justifyCenter" title="가운데 정렬">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="12" height="1.5"/><rect x="3" y="6" width="8" height="1.5"/><rect x="1" y="10" width="12" height="1.5"/></svg>
        </button>
        <button type="button" class="rt-btn" data-cmd="justifyRight" title="오른쪽 정렬">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="12" height="1.5"/><rect x="5" y="6" width="8" height="1.5"/><rect x="1" y="10" width="12" height="1.5"/></svg>
        </button>
      </div>
      <div class="rt-tb-sep"></div>
      <div class="rt-tb-group rt-color-wrap">
        <button type="button" class="rt-btn" title="글자 색상 — 클릭해서 색 선택">A<span class="rt-color-swatch"></span></button>
        <input type="color" class="rt-color-input" value="#1a202c" title="글자 색상">
      </div>
      <div class="rt-tb-sep"></div>
      <div class="rt-tb-group">
        <button type="button" class="rt-btn" data-cmd="insertUnorderedList" title="글머리 기호 목록">• 목록</button>
        <button type="button" class="rt-btn" data-cmd="insertOrderedList" title="번호 매기기 목록">1. 목록</button>
        <button type="button" class="rt-btn" data-action="quote" title="인용구">❝</button>
      </div>
      <div class="rt-tb-sep"></div>
      <div class="rt-tb-group">
        <button type="button" class="rt-btn" data-action="table" title="표 삽입 (행x열)">표 삽입</button>
        <button type="button" class="rt-btn" data-action="image" title="이미지 삽입 — 파일 업로드 또는 URL">이미지</button>
      </div>
      <div class="rt-tb-sep"></div>
      <div class="rt-tb-group">
        <button type="button" class="rt-btn" data-action="undo" title="되돌리기 (Ctrl+Z)">⤺</button>
        <button type="button" class="rt-btn" data-action="redo" title="다시하기 (Ctrl+Y)">⤻</button>
      </div>`;
  }

  // ===== 이미지 팝오버 빌더 =====
  function buildImagePopover(onInsert) {
    const root = document.createElement('div');
    root.className = 'rt-popover';
    root.innerHTML = `
      <div class="rt-popover-title">이미지 삽입</div>
      <div class="rt-popover-label">파일 업로드</div>
      <label class="rt-file-btn">파일 선택<input type="file" accept="image/*" style="display:none;"></label>
      <div class="rt-popover-or">또는</div>
      <div class="rt-popover-label">이미지 URL</div>
      <input type="text" class="rt-popover-input rt-img-url" placeholder="https://...">
      <input type="text" class="rt-popover-input rt-img-alt" placeholder="설명 텍스트 (선택)" style="margin-top:6px;">
      <button type="button" class="rt-popover-submit">삽입</button>
    `;
    const fileInput = root.querySelector('input[type="file"]');
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (f.size > 4 * 1024 * 1024) {
        (window.toast || alert)('이미지는 4MB 이하만 첨부 가능합니다.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const alt = root.querySelector('.rt-img-alt').value.trim();
        onInsert(reader.result, alt);
      };
      reader.readAsDataURL(f);
    });
    root.querySelector('.rt-popover-submit').addEventListener('click', () => {
      const url = root.querySelector('.rt-img-url').value.trim();
      const alt = root.querySelector('.rt-img-alt').value.trim();
      if (!url) { (window.toast || alert)('이미지 URL 또는 파일을 선택하세요.', 'error'); return; }
      if (!/^(https?:|data:image\/)/i.test(url)) {
        (window.toast || alert)('유효한 이미지 URL이 아닙니다.', 'error');
        return;
      }
      onInsert(url, alt);
    });
    // 팝오버 클릭이 외부로 전파되지 않도록
    root.addEventListener('mousedown', (e) => e.stopPropagation());
    return root;
  }

  // ===== 표 그리드 팝오버 빌더 (마우스 호버로 행/열 선택) =====
  function buildTablePopover(onPick, maxRows = 8, maxCols = 10) {
    const root = document.createElement('div');
    root.className = 'rt-table-popover';
    const grid = document.createElement('div');
    grid.className = 'rt-table-grid';
    grid.style.gridTemplateColumns = `repeat(${maxCols}, 22px)`;
    const cells = [];
    for (let r = 1; r <= maxRows; r++) {
      for (let c = 1; c <= maxCols; c++) {
        const cell = document.createElement('div');
        cell.className = 'rt-table-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        grid.appendChild(cell);
        cells.push(cell);
      }
    }
    const label = document.createElement('div');
    label.className = 'rt-table-label';
    label.textContent = '크기를 선택하세요';
    root.appendChild(grid);
    root.appendChild(label);

    function paint(rows, cols) {
      cells.forEach(cell => {
        const r = +cell.dataset.r, c = +cell.dataset.c;
        cell.classList.toggle('is-on', r <= rows && c <= cols);
      });
      label.textContent = (rows && cols) ? `${rows} × ${cols}` : '크기를 선택하세요';
    }
    grid.addEventListener('mousemove', (e) => {
      const cell = e.target.closest('.rt-table-cell');
      if (!cell) return;
      paint(+cell.dataset.r, +cell.dataset.c);
    });
    grid.addEventListener('mouseleave', () => paint(0, 0));
    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.rt-table-cell');
      if (!cell) return;
      onPick(+cell.dataset.r, +cell.dataset.c);
    });
    root.addEventListener('mousedown', (e) => e.stopPropagation());
    return root;
  }

  // 호환 — 외부에서 사용하는 helper 들
  function looksLikeHtml(s) { return /<[a-z][\s\S]*>/i.test(String(s || '')); }
  function plainToHtml(text) {
    if (!text) return '';
    return String(text).split(/\n{2,}/).map(p =>
      '<p>' + escapeHtml(p).replace(/\n/g, '<br>') + '</p>'
    ).join('');
  }

  window.RichEditor = {
    mount: (container, opts) => Promise.resolve(mountEditor(container, opts || {})),
    ensureLoaded: () => Promise.resolve(),
    looksLikeHtml,
    plainToHtml
  };
})();
