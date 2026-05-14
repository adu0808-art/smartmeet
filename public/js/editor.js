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

      /* 스마트 블록 팝오버 */
      .rt-block-popover {
        position: absolute; z-index: 100;
        width: 320px;
        background: var(--surface, #fff); border: 1px solid var(--border, #e2e8f0);
        border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        padding: 10px;
      }
      .rt-block-title {
        font-size: 12px; font-weight: 700; color: var(--text-muted, #64748b);
        padding: 4px 8px 8px; letter-spacing: 0.4px;
      }
      .rt-block-grid {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;
      }
      .rt-block-item {
        display: flex; gap: 10px; align-items: flex-start;
        padding: 10px; border-radius: 8px; cursor: pointer;
        background: var(--surface-2, #fafbfc); border: 1px solid transparent;
        transition: background 0.1s, border-color 0.1s;
        text-align: left;
      }
      .rt-block-item:hover {
        background: var(--accent-soft, #fef3c7);
        border-color: var(--accent, #f59e0b);
      }
      .rt-block-item-icon {
        font-size: 20px; flex: 0 0 auto; line-height: 1;
      }
      .rt-block-item-text {
        flex: 1 1 auto; min-width: 0;
      }
      .rt-block-item-name {
        font-size: 13px; font-weight: 700; color: var(--text, #1a202c);
        margin-bottom: 2px;
      }
      .rt-block-item-desc {
        font-size: 11px; color: var(--text-muted, #64748b); line-height: 1.4;
      }

      /* 스마트 블록 — 에디터 안에서 살짝 강조 */
      .rt-content .sb-callout,
      .rt-content .sb-tldr,
      .rt-content .sb-checklist,
      .rt-content .sb-compare,
      .rt-content .sb-quote,
      .rt-content .sb-gallery,
      .rt-content .sb-cta {
        outline: 1px dashed transparent;
        transition: outline-color 0.15s;
      }
      .rt-content .sb-callout:hover,
      .rt-content .sb-tldr:hover,
      .rt-content .sb-checklist:hover,
      .rt-content .sb-compare:hover,
      .rt-content .sb-quote:hover,
      .rt-content .sb-gallery:hover,
      .rt-content .sb-cta:hover {
        outline-color: var(--accent, #f59e0b);
      }
      .rt-content .sb-cta-button { user-select: none; }

      /* 표 선택 — 클릭 시 외곽선, 셀 멀티선택 표시 */
      .rt-content table.rt-table-selected {
        outline: 2px solid var(--accent, #1e40af);
        outline-offset: 2px;
        border-radius: 2px;
      }
      .rt-content table .rt-cell-selected {
        background: rgba(30, 64, 175, 0.14) !important;
        position: relative;
      }
      .rt-content table .rt-cell-active {
        box-shadow: inset 0 0 0 2px var(--accent, #1e40af);
      }

      /* 표 떠 있는 도구막대 */
      .rt-table-tools {
        position: absolute;
        display: none;
        background: var(--surface, #fff);
        border: 1px solid var(--border, #e2e8f0);
        border-radius: 8px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.14);
        padding: 4px;
        z-index: 30;
        user-select: none;
        gap: 2px;
        font-size: 12px;
        align-items: center;
      }
      .rt-table-tools.is-on { display: inline-flex; }
      .rt-table-tools button, .rt-table-tools .rt-tt-color {
        height: 28px; padding: 0 8px; border: none; background: transparent;
        border-radius: 4px; cursor: pointer; font-size: 12px;
        display: inline-flex; align-items: center; gap: 4px;
        color: var(--text, #1a202c); position: relative;
        font-family: inherit;
      }
      .rt-table-tools button:hover, .rt-table-tools .rt-tt-color:hover {
        background: var(--accent-soft, #e0e7ff);
      }
      .rt-table-tools button:disabled { opacity: 0.4; cursor: not-allowed; }
      .rt-table-tools button:disabled:hover { background: transparent; }
      .rt-table-tools button.danger { color: var(--danger, #ef4444); }
      .rt-table-tools button.danger:hover { background: var(--danger-soft, #fee2e2); }
      .rt-table-tools .rt-tt-sep {
        width: 1px; height: 18px; background: var(--border, #e2e8f0); margin: 0 2px;
      }
      .rt-table-tools .rt-tt-color input[type="color"] {
        position: absolute; inset: 0; opacity: 0; cursor: pointer; padding: 0; border: none;
      }
      .rt-table-tools .rt-tt-swatch {
        display: inline-block; width: 12px; height: 12px; border-radius: 2px;
        border: 1px solid var(--border, #e2e8f0); background: #fde68a;
      }

      /* 배경색 팔레트 팝오버 */
      .rt-bg-palette {
        background: var(--surface, #fff);
        border: 1px solid var(--border, #e2e8f0);
        border-radius: 8px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        padding: 12px;
        min-width: 220px;
        font-size: 12px;
      }
      .rt-bg-title {
        font-size: 11px; color: var(--text-muted, #64748b);
        font-weight: 700; letter-spacing: 0.4px;
        margin-bottom: 8px;
      }
      .rt-bg-swatches {
        display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;
        margin-bottom: 10px;
      }
      .rt-bg-sw {
        width: 100%; aspect-ratio: 1;
        border: 2px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        padding: 0;
        transition: transform 0.08s, border-color 0.08s;
      }
      .rt-bg-sw:hover { transform: scale(1.08); }
      .rt-bg-sw.is-on {
        border-color: var(--accent, #1e40af);
        box-shadow: 0 0 0 2px rgba(30,64,175,0.18);
      }
      .rt-bg-custom-row {
        display: flex; align-items: center; gap: 8px;
        margin-bottom: 10px;
        font-size: 12px; color: var(--text-muted, #64748b);
      }
      .rt-bg-custom-pick {
        position: relative; width: 28px; height: 28px;
        border-radius: 6px; border: 1px solid var(--border, #e2e8f0);
        cursor: pointer; display: inline-block;
      }
      .rt-bg-custom-pick input[type="color"] {
        position: absolute; inset: 0; opacity: 0; cursor: pointer; padding: 0; border: none;
      }
      .rt-bg-actions {
        display: flex; gap: 6px; justify-content: flex-end;
      }
      .rt-bg-actions button {
        padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border, #e2e8f0);
        background: var(--surface, #fff); cursor: pointer; font-size: 12px;
        font-family: inherit; font-weight: 600;
        color: var(--text, #1a202c);
      }
      .rt-bg-actions .rt-bg-clear:hover { background: var(--danger-soft, #fee2e2); color: var(--danger, #ef4444); border-color: var(--danger, #ef4444); }
      .rt-bg-actions .rt-bg-apply { background: var(--accent, #1e40af); color: #fff; border-color: var(--accent, #1e40af); }
      .rt-bg-actions .rt-bg-apply:hover { background: var(--accent-hover, #1e3a8a); }

      /* 컬럼 크기 조절 그립 — 표 선택 시 우측 가장자리에 부착 */
      .rt-col-grip {
        position: absolute;
        top: 0; right: -3px; bottom: 0;
        width: 6px;
        cursor: col-resize;
        user-select: none;
        z-index: 5;
      }
      .rt-col-grip:hover {
        background: rgba(30, 64, 175, 0.18);
      }
      .rt-content table.rt-table-selected { /* fixed 레이아웃이 적용된 표는 셀 폭이 유지됨 */ }
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

    // 툴바 클릭 직전(mousedown)에 커서 위치 한 번 더 저장 — 안전장치
    toolbar.addEventListener('mousedown', () => {
      if (typeof saveCurrentRange === 'function') saveCurrentRange();
    });

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
      else if (action === 'block') toggleBlockPopover(t);
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
      restoreSavedRange(); // 팝오버 열기 전 커서 위치 복원
      exec('insertHTML', html);
    }

    // ===== 커서 위치 저장/복원 — 팝오버에서 포커스 잃기 전에 기록 =====
    let savedRange = null;
    function saveCurrentRange() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        if (content.contains(r.startContainer) && content.contains(r.endContainer)) {
          savedRange = r.cloneRange();
        }
      }
    }
    function restoreSavedRange() {
      if (!savedRange) return false;
      try {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
        return true;
      } catch { return false; }
    }
    content.addEventListener('mouseup', saveCurrentRange);
    content.addEventListener('keyup', saveCurrentRange);
    content.addEventListener('focus', saveCurrentRange);
    content.addEventListener('blur', saveCurrentRange);

    // ===== 표 선택/조작 — 외곽선 + 떠있는 도구막대 + 셀 멀티선택 + 합치기 =====
    let tableToolsEl = null;
    let selectedTable = null;
    let activeCell = null;
    let cellAnchor = null;

    // 추천 색상 — 의안 작성에 자주 쓰이는 파스텔 톤
    const TABLE_PRESET_COLORS = [
      { color: '#fde68a', name: '연노랑' },
      { color: '#fecaca', name: '연분홍' },
      { color: '#bbf7d0', name: '연초록' },
      { color: '#bae6fd', name: '연파랑' },
      { color: '#ddd6fe', name: '연보라' },
      { color: '#fed7aa', name: '연주황' },
      { color: '#e7e5e4', name: '회색' },
      { color: '#fef3c7', name: '베이지' },
      { color: '#a7f3d0', name: '민트' },
      { color: '#fbcfe8', name: '핑크' },
    ];
    let _pendingBgColor = '#fde68a'; // 팔레트에서 선택 후 적용 전 보류 색상
    let _bgPaletteEl = null;

    function ensureTableToolsEl() {
      if (tableToolsEl) return tableToolsEl;
      tableToolsEl = document.createElement('div');
      tableToolsEl.className = 'rt-table-tools';
      tableToolsEl.contentEditable = 'false';
      tableToolsEl.innerHTML = `
        <button type="button" data-tt="bg-open" title="선택 셀 / 컬럼 배경색">
          🎨 배경<span class="rt-tt-swatch" style="background:${_pendingBgColor};"></span>
        </button>
        <div class="rt-tt-sep"></div>
        <button type="button" data-tt="merge" title="선택한 셀 합치기">⬛ 합치기</button>
        <button type="button" data-tt="split" title="셀 분리">↩ 분리</button>
        <div class="rt-tt-sep"></div>
        <button type="button" data-tt="del-row" title="현재 행 삭제">행 −</button>
        <button type="button" data-tt="del-col" title="현재 열 삭제">열 −</button>
        <div class="rt-tt-sep"></div>
        <button type="button" class="danger" data-tt="del-table" title="표 삭제">🗑 표</button>
      `;
      // 도구 클릭 시 contenteditable 포커스 손실 방지
      tableToolsEl.addEventListener('mousedown', (e) => {
        if (e.target.tagName !== 'INPUT') e.preventDefault();
      });
      tableToolsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-tt]');
        if (!btn) return;
        e.preventDefault(); e.stopPropagation();
        const tt = btn.dataset.tt;
        if (tt === 'bg-open') toggleBgPalette(btn);
        else if (tt === 'merge') mergeSelectedCells();
        else if (tt === 'split') splitActiveCell();
        else if (tt === 'del-row') deleteCurrentRow();
        else if (tt === 'del-col') deleteCurrentColumn();
        else if (tt === 'del-table') deleteSelectedTable();
      });
      container.appendChild(tableToolsEl);
      return tableToolsEl;
    }

    // 배경색 팔레트 — 추천 10종 + 직접 선택 + 적용 / 제거 버튼
    function toggleBgPalette(anchorBtn) {
      if (_bgPaletteEl) { closeBgPalette(); return; }
      const pal = document.createElement('div');
      pal.className = 'rt-bg-palette';
      pal.contentEditable = 'false';
      pal.innerHTML = `
        <div class="rt-bg-title">추천 색상</div>
        <div class="rt-bg-swatches">
          ${TABLE_PRESET_COLORS.map(c => `
            <button type="button" class="rt-bg-sw${c.color === _pendingBgColor ? ' is-on' : ''}"
              data-color="${c.color}" title="${c.name}"
              style="background:${c.color};"></button>
          `).join('')}
        </div>
        <div class="rt-bg-custom-row">
          <span>직접 선택:</span>
          <label class="rt-bg-custom-pick" style="background:${_pendingBgColor};">
            <input type="color" class="rt-bg-custom-input" value="${_pendingBgColor}">
          </label>
        </div>
        <div class="rt-bg-actions">
          <button type="button" class="rt-bg-clear">배경 제거</button>
          <button type="button" class="rt-bg-apply">적용</button>
        </div>
      `;
      pal.addEventListener('mousedown', (e) => {
        if (e.target.tagName !== 'INPUT') e.preventDefault();
      });
      pal.addEventListener('click', (e) => {
        const sw = e.target.closest('.rt-bg-sw');
        const apply = e.target.closest('.rt-bg-apply');
        const clear = e.target.closest('.rt-bg-clear');
        if (sw) {
          e.preventDefault(); e.stopPropagation();
          _pendingBgColor = sw.dataset.color;
          pal.querySelectorAll('.rt-bg-sw').forEach(s => s.classList.toggle('is-on', s === sw));
          const pick = pal.querySelector('.rt-bg-custom-pick');
          const pickInput = pal.querySelector('.rt-bg-custom-input');
          if (pick) pick.style.background = _pendingBgColor;
          if (pickInput) pickInput.value = _pendingBgColor;
        } else if (apply) {
          e.preventDefault(); e.stopPropagation();
          applyCellBgColor(_pendingBgColor);
          const swatch = tableToolsEl?.querySelector('.rt-tt-swatch');
          if (swatch) swatch.style.background = _pendingBgColor;
          closeBgPalette();
        } else if (clear) {
          e.preventDefault(); e.stopPropagation();
          applyCellBgColor('');
          closeBgPalette();
        }
      });
      pal.addEventListener('input', (e) => {
        if (e.target.classList.contains('rt-bg-custom-input')) {
          _pendingBgColor = e.target.value;
          const pick = pal.querySelector('.rt-bg-custom-pick');
          if (pick) pick.style.background = _pendingBgColor;
          pal.querySelectorAll('.rt-bg-sw').forEach(s =>
            s.classList.toggle('is-on', s.dataset.color === _pendingBgColor));
        }
      });
      const rect = anchorBtn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      pal.style.position = 'absolute';
      pal.style.top = (rect.bottom - containerRect.top + 6) + 'px';
      pal.style.left = Math.max(4, rect.left - containerRect.left) + 'px';
      pal.style.zIndex = 40;
      container.appendChild(pal);
      _bgPaletteEl = pal;
      setTimeout(() => document.addEventListener('mousedown', _closeBgPaletteOutside, { once: true }), 0);
    }
    function _closeBgPaletteOutside(e) {
      if (_bgPaletteEl && !_bgPaletteEl.contains(e.target) && !e.target.closest('[data-tt="bg-open"]')) {
        closeBgPalette();
      } else if (_bgPaletteEl) {
        document.addEventListener('mousedown', _closeBgPaletteOutside, { once: true });
      }
    }
    function closeBgPalette() {
      if (_bgPaletteEl) { _bgPaletteEl.remove(); _bgPaletteEl = null; }
    }

    function showTableTools(table) {
      ensureTableToolsEl();
      const tableRect = table.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      tableToolsEl.classList.add('is-on');
      const top = tableRect.top - containerRect.top - 36;
      tableToolsEl.style.top = (top < 4 ? (tableRect.bottom - containerRect.top + 4) : top) + 'px';
      tableToolsEl.style.left = Math.max(4, tableRect.left - containerRect.left) + 'px';
      updateTableToolsState();
    }
    function hideTableTools() {
      if (tableToolsEl) tableToolsEl.classList.remove('is-on');
    }
    function updateTableToolsState() {
      if (!tableToolsEl || !selectedTable) return;
      const selCount = selectedTable.querySelectorAll('.rt-cell-selected').length;
      const mergeBtn = tableToolsEl.querySelector('[data-tt="merge"]');
      if (mergeBtn) mergeBtn.disabled = selCount < 2;
      const splitBtn = tableToolsEl.querySelector('[data-tt="split"]');
      const aRs = activeCell ? (activeCell.rowSpan || 1) : 1;
      const aCs = activeCell ? (activeCell.colSpan || 1) : 1;
      if (splitBtn) splitBtn.disabled = !activeCell || (aRs <= 1 && aCs <= 1);
      // 현재 셀 배경색을 swatch 반영
      const swatch = tableToolsEl.querySelector('.rt-tt-swatch');
      if (swatch && activeCell) {
        const bg = activeCell.style.backgroundColor;
        if (bg) swatch.style.background = bg;
      }
    }

    function selectTableEl(table) {
      if (selectedTable && selectedTable !== table) {
        selectedTable.classList.remove('rt-table-selected');
        clearCellSelection(selectedTable);
        removeColumnGrips(selectedTable);
      }
      selectedTable = table;
      table.classList.add('rt-table-selected');
      ensureColumnGrips(table);
      showTableTools(table);
    }
    function deselectTable() {
      if (selectedTable) {
        clearCellSelection(selectedTable);
        selectedTable.classList.remove('rt-table-selected');
        removeColumnGrips(selectedTable);
        selectedTable = null;
      }
      activeCell = null;
      cellAnchor = null;
      hideTableTools();
      closeBgPalette();
    }

    // ===== 컬럼 크기 조절 — 표 선택 시 헤더(첫 행) 셀 우측에 그립 부착 =====
    function ensureColumnGrips(table) {
      if (!table) return;
      // table-layout 을 fixed 로 — 셀 width 가 효과적이도록
      if (!table.style.tableLayout) table.style.tableLayout = 'fixed';
      const firstRow = table.querySelector('tr');
      if (!firstRow) return;
      [...firstRow.children].forEach(cell => {
        cell.style.position = cell.style.position || 'relative';
        if (cell.querySelector('.rt-col-grip')) return;
        const grip = document.createElement('span');
        grip.className = 'rt-col-grip';
        grip.contentEditable = 'false';
        grip.addEventListener('mousedown', (e) => startColumnResize(e, cell, table));
        cell.appendChild(grip);
      });
    }
    function removeColumnGrips(table) {
      if (!table) return;
      table.querySelectorAll('.rt-col-grip').forEach(g => g.remove());
    }

    function startColumnResize(e, headerCell, table) {
      e.preventDefault();
      e.stopPropagation();
      const grid = buildCellGrid(table);
      // 헤더 셀의 컬럼 위치
      const hg = grid.find(g => g.cell === headerCell);
      if (!hg) return;
      const targetCol = hg.col + hg.cs - 1; // 그립이 잡고 있는 컬럼의 마지막 인덱스
      const startX = e.clientX;
      const startWidth = headerCell.getBoundingClientRect().width;
      const tableWidth = table.getBoundingClientRect().width;
      const startWidthPct = (startWidth / tableWidth) * 100;
      // 동일 컬럼에 속한 모든 셀들의 인라인 width 도 함께 조정
      const sameColCells = grid
        .filter(g => g.col <= targetCol && g.col + g.cs - 1 >= targetCol)
        .map(g => g.cell);

      const onMove = (mv) => {
        const dx = mv.clientX - startX;
        const newWidth = Math.max(40, startWidth + dx);
        const newPct = Math.max(5, (newWidth / tableWidth) * 100);
        sameColCells.forEach(c => { c.style.width = newPct + '%'; });
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    function clearCellSelection(table) {
      const t = table || selectedTable;
      if (!t) return;
      t.querySelectorAll('.rt-cell-selected, .rt-cell-active').forEach(c => {
        c.classList.remove('rt-cell-selected', 'rt-cell-active');
      });
    }

    // rowspan/colspan 을 고려한 셀 그리드
    function buildCellGrid(table) {
      const trs = [...table.querySelectorAll('tr')];
      const grid = [];
      const occ = [];
      trs.forEach((tr, rowIdx) => {
        occ[rowIdx] = occ[rowIdx] || [];
        let col = 0;
        [...tr.children].forEach(cell => {
          while (occ[rowIdx][col]) col++;
          const rs = cell.rowSpan || 1;
          const cs = cell.colSpan || 1;
          grid.push({ cell, row: rowIdx, col, rs, cs, tr });
          for (let r = 0; r < rs; r++) {
            occ[rowIdx + r] = occ[rowIdx + r] || [];
            for (let c = 0; c < cs; c++) occ[rowIdx + r][col + c] = true;
          }
          col += cs;
        });
      });
      return grid;
    }

    // 앵커 ↔ 타겟 사이 직사각형 셀들 선택
    function extendCellSelection(anchor, target) {
      const table = anchor.closest('table');
      if (!table || target.closest('table') !== table) return;
      const grid = buildCellGrid(table);
      const a = grid.find(g => g.cell === anchor);
      const t = grid.find(g => g.cell === target);
      if (!a || !t) return;
      const r1 = Math.min(a.row, t.row);
      const r2 = Math.max(a.row + a.rs - 1, t.row + t.rs - 1);
      const c1 = Math.min(a.col, t.col);
      const c2 = Math.max(a.col + a.cs - 1, t.col + t.cs - 1);
      clearCellSelection(table);
      grid.forEach(g => {
        const gr2 = g.row + g.rs - 1;
        const gc2 = g.col + g.cs - 1;
        if (gr2 >= r1 && g.row <= r2 && gc2 >= c1 && g.col <= c2) {
          g.cell.classList.add('rt-cell-selected');
        }
      });
    }

    // 컨텐트 내 클릭 → 표 선택/셀 멀티선택
    content.addEventListener('mousedown', (e) => {
      const cell = e.target.closest('td, th');
      const table = e.target.closest('table');
      if (!table) {
        deselectTable();
        return;
      }
      if (table !== selectedTable) selectTableEl(table);
      if (cell) {
        if (e.shiftKey && cellAnchor && cellAnchor.closest('table') === table) {
          e.preventDefault();
          extendCellSelection(cellAnchor, cell);
          activeCell = cell;
        } else {
          clearCellSelection(table);
          cellAnchor = cell;
          activeCell = cell;
          cell.classList.add('rt-cell-active');
        }
        updateTableToolsState();
      }
    });

    // 컨테이너 외부 클릭 시 해제
    document.addEventListener('mousedown', (e) => {
      if (!container.contains(e.target)) deselectTable();
    });

    // 스크롤 시 도구막대 위치 갱신
    content.addEventListener('scroll', () => {
      if (selectedTable) showTableTools(selectedTable);
    });

    // 셀 배경색 적용 — 선택 셀이 있으면 그대로, 없으면 activeCell 의 전체 컬럼
    function applyCellBgColor(color) {
      if (!selectedTable) return;
      let targets = [...selectedTable.querySelectorAll('.rt-cell-selected')];
      if (targets.length === 0 && activeCell) {
        const grid = buildCellGrid(selectedTable);
        const a = grid.find(g => g.cell === activeCell);
        if (!a) return;
        // a.col ~ a.col + a.cs - 1 범위와 겹치는 모든 셀
        const c1 = a.col, c2 = a.col + a.cs - 1;
        targets = grid
          .filter(g => g.col <= c2 && g.col + g.cs - 1 >= c1)
          .map(g => g.cell);
      }
      targets.forEach(c => { c.style.backgroundColor = color || ''; });
      // 색 변경 후 셀 선택은 해제해서 적용 결과가 즉시 보이게
      clearCellSelection(selectedTable);
      if (activeCell) activeCell.classList.add('rt-cell-active');
      updateTableToolsState();
    }

    function mergeSelectedCells() {
      if (!selectedTable) return;
      const grid = buildCellGrid(selectedTable);
      const selGrid = grid.filter(g => g.cell.classList.contains('rt-cell-selected'));
      if (selGrid.length < 2) return;

      // 직사각형 영역인지 검증
      const r1 = Math.min(...selGrid.map(g => g.row));
      const r2 = Math.max(...selGrid.map(g => g.row + g.rs - 1));
      const c1 = Math.min(...selGrid.map(g => g.col));
      const c2 = Math.max(...selGrid.map(g => g.col + g.cs - 1));

      // 영역 내 모든 그리드 셀이 선택됐는지 확인
      const inBox = grid.filter(g =>
        g.row >= r1 && g.row + g.rs - 1 <= r2 &&
        g.col >= c1 && g.col + g.cs - 1 <= c2
      );
      const allSelected = inBox.every(g => g.cell.classList.contains('rt-cell-selected'));
      if (!allSelected) {
        if (window.toast) window.toast('직사각형 영역의 셀만 합칠 수 있습니다.', 'error');
        else alert('직사각형 영역의 셀만 합칠 수 있습니다.');
        return;
      }

      const sorted = [...selGrid].sort((a, b) => (a.row - b.row) || (a.col - b.col));
      const keeper = sorted[0].cell;
      const mergedHtml = sorted
        .map(g => g.cell.innerHTML.replace(/&nbsp;/gi, '').trim())
        .filter(Boolean)
        .join('<br>');
      keeper.innerHTML = mergedHtml || '&nbsp;';
      keeper.rowSpan = r2 - r1 + 1;
      keeper.colSpan = c2 - c1 + 1;
      sorted.slice(1).forEach(g => g.cell.remove());

      clearCellSelection(selectedTable);
      activeCell = keeper;
      keeper.classList.add('rt-cell-active');
      updateTableToolsState();
    }

    function splitActiveCell() {
      if (!activeCell || !selectedTable) return;
      const rs = activeCell.rowSpan || 1;
      const cs = activeCell.colSpan || 1;
      if (rs <= 1 && cs <= 1) return;
      const grid = buildCellGrid(selectedTable);
      const target = grid.find(g => g.cell === activeCell);
      if (!target) return;

      const trs = [...selectedTable.querySelectorAll('tr')];
      const tag = activeCell.tagName.toLowerCase();
      activeCell.rowSpan = 1;
      activeCell.colSpan = 1;

      // 채울 좌표(자기 위치 제외)
      const fill = [];
      for (let r = target.row; r < target.row + rs; r++) {
        for (let c = target.col; c < target.col + cs; c++) {
          if (r === target.row && c === target.col) continue;
          fill.push({ r, c });
        }
      }
      // 행별로 정렬해 좌→우 순으로 삽입
      const byRow = {};
      fill.forEach(({ r, c }) => { (byRow[r] = byRow[r] || []).push(c); });
      Object.keys(byRow).sort((a, b) => a - b).forEach(rKey => {
        const r = +rKey;
        const cols = byRow[r].sort((a, b) => a - b);
        const tr = trs[r];
        if (!tr) return;
        cols.forEach(c => {
          // 현재 시점에서 같은 행의 그리드를 다시 계산 (방금 추가한 셀 반영)
          const updated = buildCellGrid(selectedTable);
          const inRow = updated.filter(g => g.row === r).sort((a, b) => a.col - b.col);
          const next = inRow.find(g => g.col >= c);
          const newCell = document.createElement(tag);
          newCell.innerHTML = '&nbsp;';
          if (next && next.cell.parentElement === tr) tr.insertBefore(newCell, next.cell);
          else tr.appendChild(newCell);
        });
      });
      updateTableToolsState();
    }

    function deleteCurrentRow() {
      if (!activeCell || !selectedTable) return;
      const tr = activeCell.closest('tr');
      if (!tr) return;
      // 마지막 행이면 표 자체 삭제
      const totalRows = selectedTable.querySelectorAll('tr').length;
      if (totalRows <= 1) { deleteSelectedTable(); return; }
      tr.remove();
      activeCell = null;
      cellAnchor = null;
      showTableTools(selectedTable);
    }

    function deleteCurrentColumn() {
      if (!activeCell || !selectedTable) return;
      const grid = buildCellGrid(selectedTable);
      const a = grid.find(g => g.cell === activeCell);
      if (!a) return;
      const c1 = a.col, c2 = a.col + a.cs - 1;
      // 모든 행에 걸쳐 컬럼 c1~c2 와 겹치는 셀들을 처리
      const toRemove = new Set();
      grid.forEach(g => {
        const gc1 = g.col, gc2 = g.col + g.cs - 1;
        if (gc2 < c1 || gc1 > c2) return; // 미겹침
        const removeCs = Math.min(gc2, c2) - Math.max(gc1, c1) + 1;
        if (removeCs >= g.cs) toRemove.add(g.cell);
        else g.cell.colSpan = g.cs - removeCs;
      });
      toRemove.forEach(c => c.remove());
      // 빈 행 제거
      [...selectedTable.querySelectorAll('tr')].forEach(tr => {
        if (!tr.children.length) tr.remove();
      });
      // 표 자체가 비었으면 삭제
      if (!selectedTable.querySelector('tr')) { deleteSelectedTable(); return; }
      activeCell = null;
      cellAnchor = null;
      showTableTools(selectedTable);
    }

    function deleteSelectedTable() {
      if (!selectedTable) return;
      selectedTable.remove();
      deselectTable();
    }

    // ===== 스마트 블록 팝오버 =====
    let blockPopoverEl = null;
    function toggleBlockPopover(anchorBtn) {
      if (blockPopoverEl) { closeBlockPopover(); return; }
      blockPopoverEl = buildBlockPopover((kind) => {
        insertSmartBlock(kind);
        closeBlockPopover();
      });
      const rect = anchorBtn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      blockPopoverEl.style.top = (rect.bottom - containerRect.top + 4) + 'px';
      // 팝오버는 320px — 오른쪽으로 넘치지 않게 보정
      const idealLeft = rect.left - containerRect.left;
      const maxLeft = container.clientWidth - 320 - 8;
      blockPopoverEl.style.left = Math.max(8, Math.min(idealLeft, maxLeft)) + 'px';
      container.appendChild(blockPopoverEl);
      setTimeout(() => {
        document.addEventListener('mousedown', _closeBlkOutside, { once: true });
      }, 10);
    }
    function _closeBlkOutside(e) {
      if (blockPopoverEl && !blockPopoverEl.contains(e.target) && !e.target.closest('[data-action="block"]')) {
        closeBlockPopover();
      } else if (blockPopoverEl) {
        document.addEventListener('mousedown', _closeBlkOutside, { once: true });
      }
    }
    function closeBlockPopover() {
      if (blockPopoverEl) { blockPopoverEl.remove(); blockPopoverEl = null; }
    }

    function insertSmartBlock(kind) {
      content.focus();
      const html = renderSmartBlockHtml(kind);
      if (!html) return;
      // 블록 뒤에 빈 단락을 추가해 커서 이동 여지 확보
      exec('insertHTML', html + '<p><br></p>');
      // 직후 도구막대 위치 갱신
      setTimeout(updateBlockTools, 50);
    }

    // ===== 활성 블록 도구막대 (⚙️ 설정 / 🗑️ 삭제) =====
    let blockToolsEl = null;
    let activeBlockEl = null;

    function ensureBlockToolsEl() {
      if (blockToolsEl) return blockToolsEl;
      blockToolsEl = document.createElement('div');
      blockToolsEl.className = 'sb-block-tools';
      blockToolsEl.contentEditable = 'false';
      blockToolsEl.innerHTML = `
        <button type="button" data-tool="settings" title="설정">⚙️</button>
        <button type="button" data-tool="delete" class="danger" title="블록 삭제">🗑️</button>
      `;
      blockToolsEl.addEventListener('mousedown', (e) => e.preventDefault());
      blockToolsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-tool]');
        if (!btn || !activeBlockEl) return;
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.tool === 'settings') {
          openBlockSettings(activeBlockEl);
        } else if (btn.dataset.tool === 'delete') {
          if (confirm('이 블록을 삭제하시겠습니까?')) {
            activeBlockEl.remove();
            activeBlockEl = null;
            hideBlockTools();
          }
        }
      });
      container.appendChild(blockToolsEl);
      return blockToolsEl;
    }

    function showBlockTools(blockEl) {
      ensureBlockToolsEl();
      activeBlockEl = blockEl;
      const blockRect = blockEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const top = blockRect.top - containerRect.top + 6;
      const right = containerRect.right - blockRect.right + 6;
      blockToolsEl.style.display = 'flex';
      blockToolsEl.style.top = top + 'px';
      blockToolsEl.style.right = Math.max(6, right) + 'px';
      blockToolsEl.style.left = '';
    }
    function hideBlockTools() {
      if (blockToolsEl) blockToolsEl.style.display = 'none';
      activeBlockEl = null;
    }

    function updateBlockTools() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) { hideBlockTools(); return; }
      const node = sel.getRangeAt(0).startContainer;
      if (!content.contains(node)) { hideBlockTools(); return; }
      const block = findBlockRoot(node);
      if (block) showBlockTools(block);
      else hideBlockTools();
    }
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === content || content.contains(document.activeElement)) {
        updateBlockTools();
      }
    });
    content.addEventListener('click', updateBlockTools);
    content.addEventListener('keyup', updateBlockTools);
    content.addEventListener('scroll', () => {
      if (activeBlockEl) showBlockTools(activeBlockEl);
    });

    // 블록 설정 모달
    function openBlockSettings(blockEl) {
      const kind = detectBlockKind(blockEl);
      if (!kind) return;
      const fields = renderBlockSettingsBody(kind, blockEl);
      if (!window.modal) { alert('설정 UI 를 사용할 수 없습니다.'); return; }
      const m = window.modal({
        title: '⚙️ ' + (SMART_BLOCKS.find(b => b.kind === kind)?.name || '블록') + ' 설정',
        body: `<div class="sb-settings-grid">${fields}</div>`,
        confirmText: '적용',
        onConfirm: (root) => {
          applyBlockSettings(kind, blockEl, root);
        }
      });
      // 옵션/스워치 클릭 시 즉시 강조 + 즉시 add/remove 항목 처리
      setTimeout(() => {
        const root = m && m.root;
        if (!root) return;
        // 옵션 토글
        root.querySelectorAll('.sb-settings-options').forEach(group => {
          group.addEventListener('click', (e) => {
            const opt = e.target.closest('.sb-settings-opt');
            if (!opt) return;
            group.querySelectorAll('.sb-settings-opt').forEach(o => o.classList.remove('is-on'));
            opt.classList.add('is-on');
          });
        });
        // 스워치 토글
        root.querySelectorAll('.sb-settings-swatches').forEach(group => {
          group.addEventListener('click', (e) => {
            const sw = e.target.closest('.sb-settings-swatch');
            if (!sw) return;
            group.querySelectorAll('.sb-settings-swatch').forEach(o => o.classList.remove('is-on'));
            sw.classList.add('is-on');
          });
        });
        // 즉시 적용되는 add/remove 버튼들
        root.querySelectorAll('button[data-field]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const action = btn.dataset.field;
            handleBlockAction(kind, blockEl, action);
          });
        });
      }, 30);
    }

    // Add/remove 등 즉시 적용 액션
    function handleBlockAction(kind, blockEl, action) {
      if (kind === 'features') {
        if (action === 'add-feature') {
          const colors = ['blue', 'orange', 'green', 'purple', 'pink', 'cyan'];
          const used = blockEl.querySelectorAll('.sb-feature').length;
          const color = colors[used % colors.length];
          blockEl.insertAdjacentHTML('beforeend',
            `<div class="sb-feature" data-color="${color}"><div class="sb-feature-icon">⭐</div><div class="sb-feature-text"><div class="sb-feature-title">새 항목</div><div class="sb-feature-desc">설명을 입력하세요.</div></div></div>`);
        } else if (action === 'remove-feature') {
          const items = blockEl.querySelectorAll('.sb-feature');
          if (items.length > 1) items[items.length - 1].remove();
          else (window.toast || alert)('최소 1개 항목은 유지해야 합니다.', 'error');
        }
      } else if (kind === 'checklist') {
        if (action === 'add-item') {
          const ul = blockEl.querySelector('ul');
          if (ul) ul.insertAdjacentHTML('beforeend',
            `<li><input type="checkbox"><span>새 항목</span></li>`);
        } else if (action === 'remove-item') {
          const items = blockEl.querySelectorAll('ul > li');
          if (items.length > 1) items[items.length - 1].remove();
          else (window.toast || alert)('최소 1개 항목은 유지해야 합니다.', 'error');
        }
      } else if (kind === 'gallery') {
        if (action === 'add-slot') {
          blockEl.insertAdjacentHTML('beforeend', `<div class="sb-gallery-item" contenteditable="false"></div>`);
        } else if (action === 'remove-slot') {
          const items = blockEl.querySelectorAll('.sb-gallery-item');
          if (items.length > 1) items[items.length - 1].remove();
          else (window.toast || alert)('최소 1개 슬롯은 유지해야 합니다.', 'error');
        }
      }
    }

    // 갤러리 placeholder 클릭 → 파일 선택 → 이미지로 교체
    content.addEventListener('click', (e) => {
      const galleryItem = e.target.closest('.sb-gallery-item');
      if (!galleryItem || galleryItem.querySelector('img')) return;
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
      fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        fileInput.remove();
        if (!f) return;
        if (f.size > 4 * 1024 * 1024) {
          (window.toast || alert)('이미지는 4MB 이하만 첨부 가능합니다.', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          galleryItem.innerHTML = `<img src="${escapeHtml(reader.result)}" alt="">`;
        };
        reader.readAsDataURL(f);
      });
      fileInput.click();
    });

    // CTA 버튼 클릭 → 링크 URL 편집 프롬프트 (Ctrl+클릭으로 호출)
    content.addEventListener('click', (e) => {
      const cta = e.target.closest('.sb-cta-button');
      if (!cta) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const newUrl = prompt('CTA 버튼 링크 URL', cta.getAttribute('href') || '');
        if (newUrl !== null) cta.setAttribute('href', newUrl);
      } else {
        // 편집 모드에서는 링크 동작 차단 (편집 가능하도록)
        e.preventDefault();
      }
    });

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
        closeBlockPopover();
        if (blockToolsEl) blockToolsEl.remove();
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
        <button type="button" class="rt-btn" data-action="table" title="표 삽입">표 삽입</button>
        <button type="button" class="rt-btn" data-action="image" title="이미지 삽입 — 파일 업로드 또는 URL">이미지</button>
        <button type="button" class="rt-btn" data-action="block" title="스마트 블록 — 콜아웃·요약·CTA 등">＋ 블록</button>
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

  // ===== 스마트 블록 팝오버 빌더 =====
  const SMART_BLOCKS = [
    { kind: 'statement',    icon: '🎯', name: '스테이트먼트', desc: 'MISSION/VISION 등 강조 배너' },
    { kind: 'hero',         icon: '🌅', name: '히어로 배너', desc: '인사말·소개 그라디언트 헤더' },
    { kind: 'features',     icon: '🧩', name: '피처 그리드', desc: '아이콘 + 제목 + 설명 (2~4열)' },
    { kind: 'card',         icon: '📇', name: '피처 카드', desc: '단일 강조 카드 (아이콘+제목+설명)' },
    { kind: 'callout-info', icon: '💡', name: '정보 콜아웃', desc: '강조하고 싶은 정보 박스' },
    { kind: 'callout-warn', icon: '⚠️', name: '주의 콜아웃', desc: '주의·경고 박스' },
    { kind: 'callout-tip',  icon: '✨', name: '팁 콜아웃', desc: '팁·노하우 박스' },
    { kind: 'tldr',         icon: '📌', name: 'TL;DR 요약', desc: '글 시작에 한 줄 요약' },
    { kind: 'compare',      icon: '⚖️', name: '2단 비교', desc: 'Before/After · 장단점' },
    { kind: 'checklist',    icon: '✅', name: '체크리스트', desc: '체크박스 항목 묶음' },
    { kind: 'quote',        icon: '❝',  name: '인용 + 출처', desc: '강조 인용문과 출처' },
    { kind: 'gallery',      icon: '🖼️', name: '이미지 갤러리', desc: '3장 그리드 — 클릭해 업로드' },
    { kind: 'cta',          icon: '🔘', name: 'CTA 버튼', desc: '클릭 유도 버튼' }
  ];

  function buildBlockPopover(onPick) {
    const root = document.createElement('div');
    root.className = 'rt-block-popover';
    const titleEl = document.createElement('div');
    titleEl.className = 'rt-block-title';
    titleEl.textContent = '스마트 블록 — 클릭해 삽입';
    const grid = document.createElement('div');
    grid.className = 'rt-block-grid';
    SMART_BLOCKS.forEach(b => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'rt-block-item';
      item.dataset.kind = b.kind;
      item.innerHTML = `
        <div class="rt-block-item-icon">${b.icon}</div>
        <div class="rt-block-item-text">
          <div class="rt-block-item-name">${escapeHtml(b.name)}</div>
          <div class="rt-block-item-desc">${escapeHtml(b.desc)}</div>
        </div>`;
      item.addEventListener('click', () => onPick(b.kind));
      grid.appendChild(item);
    });
    root.appendChild(titleEl);
    root.appendChild(grid);
    root.addEventListener('mousedown', (e) => e.stopPropagation());
    return root;
  }

  // ===== 스마트 블록 HTML 템플릿 =====
  function renderSmartBlockHtml(kind) {
    switch (kind) {
      case 'statement':
        return `<div class="sb-statement" data-bg="navy" data-accent="yellow"><div class="sb-statement-label">MISSION</div><div class="sb-statement-body">여기에 핵심 메시지를 입력하세요. <span class="sb-accent">강조 텍스트</span> 부분은 색상이 다르게 표시됩니다.</div></div>`;
      case 'hero':
        return `<div class="sb-hero" data-gradient="blue" data-accent="yellow"><div class="sb-hero-label">PRESIDENT'S GREETINGS</div><div class="sb-hero-title">제목을 입력하세요</div><div class="sb-hero-subtitle">부제목을 입력하세요</div><div class="sb-hero-bar" contenteditable="false"></div></div>`;
      case 'features':
        return `<div class="sb-features" data-cols="2">`
          + `<div class="sb-feature" data-color="blue"><div class="sb-feature-icon">📚</div><div class="sb-feature-text"><div class="sb-feature-title">학술 연구</div><div class="sb-feature-desc">정기 학술대회·전문 학술지 발간</div></div></div>`
          + `<div class="sb-feature" data-color="orange"><div class="sb-feature-icon">🏭</div><div class="sb-feature-text"><div class="sb-feature-title">산학 협력</div><div class="sb-feature-desc">기업·연구기관 공동 연구 및 자문</div></div></div>`
          + `<div class="sb-feature" data-color="cyan"><div class="sb-feature-icon">🌐</div><div class="sb-feature-text"><div class="sb-feature-title">국제 교류</div><div class="sb-feature-desc">글로벌 학회·연구기관과 MOU</div></div></div>`
          + `<div class="sb-feature" data-color="purple"><div class="sb-feature-icon">🎯</div><div class="sb-feature-text"><div class="sb-feature-title">인재 양성</div><div class="sb-feature-desc">차세대 기술경영 리더 교육</div></div></div>`
          + `</div>`;
      case 'card':
        return `<div class="sb-card" data-color="blue"><div class="sb-card-icon">🎓</div><div class="sb-card-title">제목을 입력하세요</div><div class="sb-card-desc">설명 문구를 입력하세요. 한두 문장 정도로 핵심 내용을 정리하면 좋습니다.</div></div>`;
      case 'callout-info':
        return `<div class="sb-callout sb-callout--info"><div class="sb-callout-icon">💡</div><div class="sb-callout-body">정보 — 여기에 강조하고 싶은 내용을 입력하세요.</div></div>`;
      case 'callout-warn':
        return `<div class="sb-callout sb-callout--warn"><div class="sb-callout-icon">⚠️</div><div class="sb-callout-body">주의 — 꼭 확인해야 할 내용을 입력하세요.</div></div>`;
      case 'callout-tip':
        return `<div class="sb-callout sb-callout--tip"><div class="sb-callout-icon">✨</div><div class="sb-callout-body">팁 — 알아두면 좋은 노하우를 입력하세요.</div></div>`;
      case 'tldr':
        return `<div class="sb-tldr"><div class="sb-tldr-label">TL;DR</div><div class="sb-tldr-body">한 줄 요약을 입력하세요. 독자가 글을 끝까지 읽지 않아도 핵심을 알 수 있게.</div></div>`;
      case 'compare':
        return `<div class="sb-compare"><div class="sb-compare-col sb-compare-col--left"><div class="sb-compare-head">Before</div><div class="sb-compare-body">변경 전 또는 단점을 입력하세요.</div></div><div class="sb-compare-col sb-compare-col--right"><div class="sb-compare-head">After</div><div class="sb-compare-body">변경 후 또는 장점을 입력하세요.</div></div></div>`;
      case 'checklist':
        return `<div class="sb-checklist"><div class="sb-checklist-title">체크리스트</div><ul><li><input type="checkbox"><span>첫 번째 항목</span></li><li><input type="checkbox"><span>두 번째 항목</span></li><li><input type="checkbox"><span>세 번째 항목</span></li></ul></div>`;
      case 'quote':
        return `<blockquote class="sb-quote"><div class="sb-quote-text">여기에 인용문을 입력하세요. 강조하고 싶은 문장을 그대로 옮겨오면 됩니다.</div><div class="sb-quote-cite">출처를 입력하세요</div></blockquote>`;
      case 'gallery':
        return `<div class="sb-gallery"><div class="sb-gallery-item" contenteditable="false"></div><div class="sb-gallery-item" contenteditable="false"></div><div class="sb-gallery-item" contenteditable="false"></div></div>`;
      case 'cta':
        return `<div class="sb-cta"><a href="#" class="sb-cta-button">지금 신청하기</a><div class="sb-cta-sub">Ctrl+클릭 으로 링크 URL 을 편집할 수 있습니다.</div></div>`;
      default:
        return '';
    }
  }

  // ===== 블록 종류 식별 (DOM 노드 → kind) =====
  function detectBlockKind(el) {
    if (!el || !el.classList) return null;
    if (el.classList.contains('sb-statement')) return 'statement';
    if (el.classList.contains('sb-hero')) return 'hero';
    if (el.classList.contains('sb-features')) return 'features';
    if (el.classList.contains('sb-card')) return 'card';
    if (el.classList.contains('sb-callout')) {
      if (el.classList.contains('sb-callout--info')) return 'callout-info';
      if (el.classList.contains('sb-callout--warn')) return 'callout-warn';
      if (el.classList.contains('sb-callout--tip')) return 'callout-tip';
      return 'callout-info';
    }
    if (el.classList.contains('sb-tldr')) return 'tldr';
    if (el.classList.contains('sb-compare')) return 'compare';
    if (el.classList.contains('sb-checklist')) return 'checklist';
    if (el.classList.contains('sb-quote')) return 'quote';
    if (el.classList.contains('sb-gallery')) return 'gallery';
    if (el.classList.contains('sb-cta')) return 'cta';
    return null;
  }

  // 활성 블록 노드 찾기 (커서가 들어 있는 가장 가까운 sb-* 블록)
  const SB_SELECTOR = '.sb-statement, .sb-hero, .sb-features, .sb-card, .sb-callout, .sb-tldr, .sb-compare, .sb-checklist, .sb-quote, .sb-gallery, .sb-cta';
  function findBlockRoot(node) {
    while (node && node !== document.body) {
      if (node.nodeType === 1 && node.matches && node.matches(SB_SELECTOR)) return node;
      node = node.parentNode;
    }
    return null;
  }

  // ===== 블록 설정 폼 — 블록 종류별 필드 =====
  function settingsRow(label, html) {
    return `<div class="sb-settings-row"><div class="sb-settings-label">${escapeHtml(label)}</div>${html}</div>`;
  }
  function optionsHtml(name, options, current) {
    return `<div class="sb-settings-options" data-field="${name}">` +
      options.map(o => `<button type="button" class="sb-settings-opt${o.value === current ? ' is-on' : ''}" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`).join('') +
      `</div>`;
  }
  function swatchesHtml(name, swatches, current) {
    return `<div class="sb-settings-swatches" data-field="${name}">` +
      swatches.map(s => `<div class="sb-settings-swatch${s.value === current ? ' is-on' : ''}" data-value="${escapeHtml(s.value)}" title="${escapeHtml(s.label)}" style="background:${s.bg};"></div>`).join('') +
      `</div>`;
  }
  function inputHtml(name, value, placeholder = '') {
    return `<input type="text" class="input" data-field="${escapeHtml(name)}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}">`;
  }
  function textareaHtml(name, value, placeholder = '') {
    return `<textarea class="input" data-field="${escapeHtml(name)}" rows="3" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || '')}</textarea>`;
  }

  function renderBlockSettingsBody(kind, el) {
    if (kind === 'statement') {
      return [
        settingsRow('라벨 (예: MISSION, VISION)', inputHtml('label', el.querySelector('.sb-statement-label')?.textContent || '')),
        settingsRow('배경 스타일', optionsHtml('bg', [
          { value: 'navy', label: '네이비' },
          { value: 'dark', label: '다크' },
          { value: 'blue', label: '블루' },
          { value: 'purple', label: '퍼플' },
          { value: 'green', label: '그린' },
          { value: 'light', label: '라이트' }
        ], el.dataset.bg || 'navy')),
        settingsRow('강조 색상', optionsHtml('accent', [
          { value: 'yellow', label: '옐로우' },
          { value: 'orange', label: '오렌지' },
          { value: 'green', label: '그린' },
          { value: 'pink', label: '핑크' },
          { value: 'cyan', label: '시안' }
        ], el.dataset.accent || 'yellow'))
      ].join('');
    }
    if (kind === 'hero') {
      return [
        settingsRow('라벨 (소제목)', inputHtml('label', el.querySelector('.sb-hero-label')?.textContent || '')),
        settingsRow('배경 그라디언트', optionsHtml('gradient', [
          { value: 'navy', label: '네이비' },
          { value: 'blue', label: '블루' },
          { value: 'purple', label: '퍼플' },
          { value: 'teal', label: '틸' },
          { value: 'orange', label: '오렌지' },
          { value: 'rose', label: '로즈' }
        ], el.dataset.gradient || 'blue')),
        settingsRow('강조 바 색상', optionsHtml('accent', [
          { value: 'yellow', label: '옐로우' },
          { value: 'white', label: '화이트' },
          { value: 'orange', label: '오렌지' },
          { value: 'cyan', label: '시안' }
        ], el.dataset.accent || 'yellow'))
      ].join('');
    }
    if (kind === 'features') {
      return [
        settingsRow('컬럼 수', optionsHtml('cols', [
          { value: '2', label: '2열' },
          { value: '3', label: '3열' },
          { value: '4', label: '4열' }
        ], el.dataset.cols || '2')),
        settingsRow('항목', `<div class="text-sm text-muted" style="font-size:12px;">항목별 아이콘·제목·설명은 본문에서 직접 클릭해 수정하세요. 항목 색상은 각 카드에 마우스를 올려 ⚙️ 으로 개별 설정하거나, 추가/삭제는 아래 버튼 사용.</div>`),
        settingsRow('항목 추가/삭제', `
          <div class="flex gap-8" style="display:flex;gap:8px;">
            <button type="button" class="btn btn-sm" data-field="add-feature">+ 항목 추가</button>
            <button type="button" class="btn btn-sm" data-field="remove-feature">- 마지막 항목 삭제</button>
          </div>`)
      ].join('');
    }
    if (kind === 'card') {
      return [
        settingsRow('아이콘 (이모지 또는 텍스트)', inputHtml('icon', el.querySelector('.sb-card-icon')?.textContent || '')),
        settingsRow('상단 강조선 색상', optionsHtml('color', [
          { value: 'blue', label: '블루' },
          { value: 'orange', label: '오렌지' },
          { value: 'green', label: '그린' },
          { value: 'purple', label: '퍼플' },
          { value: 'pink', label: '핑크' },
          { value: 'rose', label: '로즈' }
        ], el.dataset.color || 'blue'))
      ].join('');
    }
    if (kind === 'callout-info' || kind === 'callout-warn' || kind === 'callout-tip') {
      const variant = kind.split('-')[1];
      return [
        settingsRow('아이콘 (이모지)', inputHtml('icon', el.querySelector('.sb-callout-icon')?.textContent || '')),
        settingsRow('스타일', optionsHtml('variant', [
          { value: 'info', label: '💡 정보 (파랑)' },
          { value: 'warn', label: '⚠️ 주의 (호박)' },
          { value: 'tip',  label: '✨ 팁 (초록)' }
        ], variant))
      ].join('');
    }
    if (kind === 'tldr') {
      return [
        settingsRow('라벨', inputHtml('label', el.querySelector('.sb-tldr-label')?.textContent || 'TL;DR'))
      ].join('');
    }
    if (kind === 'compare') {
      const left = el.querySelector('.sb-compare-col--left .sb-compare-head')?.textContent || 'Before';
      const right = el.querySelector('.sb-compare-col--right .sb-compare-head')?.textContent || 'After';
      return [
        settingsRow('왼쪽 제목', inputHtml('left', left)),
        settingsRow('오른쪽 제목', inputHtml('right', right))
      ].join('');
    }
    if (kind === 'checklist') {
      return [
        settingsRow('제목', inputHtml('title', el.querySelector('.sb-checklist-title')?.textContent || '체크리스트')),
        settingsRow('항목 추가/삭제', `
          <div class="flex gap-8" style="display:flex;gap:8px;">
            <button type="button" class="btn btn-sm" data-field="add-item">+ 항목 추가</button>
            <button type="button" class="btn btn-sm" data-field="remove-item">- 마지막 항목 삭제</button>
          </div>`)
      ].join('');
    }
    if (kind === 'quote') {
      const cite = el.querySelector('.sb-quote-cite');
      return [
        settingsRow('출처 표시', optionsHtml('cite', [
          { value: 'show', label: '표시' },
          { value: 'hide', label: '숨김' }
        ], cite ? 'show' : 'hide'))
      ].join('');
    }
    if (kind === 'gallery') {
      const cols = el.classList.contains('sb-gallery--2') ? '2' :
                   el.classList.contains('sb-gallery--4') ? '4' : '3';
      return [
        settingsRow('컬럼 수', optionsHtml('cols', [
          { value: '2', label: '2열' },
          { value: '3', label: '3열' },
          { value: '4', label: '4열' }
        ], cols)),
        settingsRow('이미지 슬롯', `
          <div class="flex gap-8" style="display:flex;gap:8px;">
            <button type="button" class="btn btn-sm" data-field="add-slot">+ 슬롯 추가</button>
            <button type="button" class="btn btn-sm" data-field="remove-slot">- 마지막 슬롯 삭제</button>
          </div>`)
      ].join('');
    }
    if (kind === 'cta') {
      const btn = el.querySelector('.sb-cta-button');
      const sub = el.querySelector('.sb-cta-sub');
      return [
        settingsRow('버튼 텍스트', inputHtml('text', btn?.textContent || '')),
        settingsRow('링크 URL', inputHtml('href', btn?.getAttribute('href') || '#', 'https://...')),
        settingsRow('보조 설명 (선택)', inputHtml('sub', sub?.textContent || ''))
      ].join('');
    }
    return '<div class="text-sm text-muted">이 블록은 추가 설정이 없습니다.</div>';
  }

  function applyBlockSettings(kind, el, modalRoot) {
    const get = (field) => modalRoot.querySelector(`[data-field="${field}"]`);
    const getOptValue = (field) => modalRoot.querySelector(`[data-field="${field}"] .sb-settings-opt.is-on`)?.dataset.value;
    const getInputValue = (field) => modalRoot.querySelector(`input[data-field="${field}"], textarea[data-field="${field}"]`)?.value;

    if (kind === 'statement') {
      const label = getInputValue('label');
      const bg = getOptValue('bg');
      const accent = getOptValue('accent');
      if (label !== undefined) el.querySelector('.sb-statement-label').textContent = label || 'MISSION';
      if (bg) el.dataset.bg = bg;
      if (accent) el.dataset.accent = accent;
    } else if (kind === 'hero') {
      const label = getInputValue('label');
      const gradient = getOptValue('gradient');
      const accent = getOptValue('accent');
      if (label !== undefined) el.querySelector('.sb-hero-label').textContent = label || '';
      if (gradient) el.dataset.gradient = gradient;
      if (accent) el.dataset.accent = accent;
    } else if (kind === 'features') {
      const cols = getOptValue('cols');
      if (cols) el.dataset.cols = cols;
    } else if (kind === 'card') {
      const icon = getInputValue('icon');
      const color = getOptValue('color');
      if (icon !== undefined) el.querySelector('.sb-card-icon').textContent = icon || '';
      if (color) el.dataset.color = color;
    } else if (kind === 'callout-info' || kind === 'callout-warn' || kind === 'callout-tip') {
      const icon = getInputValue('icon');
      const variant = getOptValue('variant');
      if (icon !== undefined) el.querySelector('.sb-callout-icon').textContent = icon || '';
      if (variant) {
        el.classList.remove('sb-callout--info', 'sb-callout--warn', 'sb-callout--tip');
        el.classList.add('sb-callout--' + variant);
      }
    } else if (kind === 'tldr') {
      const label = getInputValue('label');
      if (label !== undefined) el.querySelector('.sb-tldr-label').textContent = label || 'TL;DR';
    } else if (kind === 'compare') {
      const left = getInputValue('left');
      const right = getInputValue('right');
      if (left !== undefined) el.querySelector('.sb-compare-col--left .sb-compare-head').textContent = left || 'Before';
      if (right !== undefined) el.querySelector('.sb-compare-col--right .sb-compare-head').textContent = right || 'After';
    } else if (kind === 'checklist') {
      const title = getInputValue('title');
      if (title !== undefined) el.querySelector('.sb-checklist-title').textContent = title || '체크리스트';
    } else if (kind === 'quote') {
      const cite = getOptValue('cite');
      const citeEl = el.querySelector('.sb-quote-cite');
      if (cite === 'hide' && citeEl) citeEl.remove();
      if (cite === 'show' && !citeEl) {
        const newCite = document.createElement('div');
        newCite.className = 'sb-quote-cite';
        newCite.textContent = '출처를 입력하세요';
        el.appendChild(newCite);
      }
    } else if (kind === 'gallery') {
      const cols = getOptValue('cols');
      if (cols) {
        el.classList.remove('sb-gallery--2', 'sb-gallery--4');
        if (cols === '2') el.classList.add('sb-gallery--2');
        else if (cols === '4') el.classList.add('sb-gallery--4');
      }
    } else if (kind === 'cta') {
      const text = getInputValue('text');
      const href = getInputValue('href');
      const sub = getInputValue('sub');
      const btn = el.querySelector('.sb-cta-button');
      if (btn) {
        if (text !== undefined) btn.textContent = text || '버튼';
        if (href !== undefined) btn.setAttribute('href', href || '#');
      }
      let subEl = el.querySelector('.sb-cta-sub');
      if (sub !== undefined) {
        if (sub.trim()) {
          if (!subEl) {
            subEl = document.createElement('div');
            subEl.className = 'sb-cta-sub';
            el.appendChild(subEl);
          }
          subEl.textContent = sub;
        } else if (subEl) {
          subEl.remove();
        }
      }
    }
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
