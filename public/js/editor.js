// Quill rich-text editor wrapper
(function () {
  const QUILL_CSS = 'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css';
  const QUILL_JS  = 'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js';

  function ensureLoaded() {
    if (window.__quillLoading) return window.__quillLoading;
    window.__quillLoading = new Promise((resolve, reject) => {
      if (window.Quill) return resolve(window.Quill);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = QUILL_CSS;
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = QUILL_JS;
      script.onload = () => resolve(window.Quill);
      script.onerror = () => reject(new Error('Quill 로드 실패'));
      document.head.appendChild(script);
    });
    return window.__quillLoading;
  }

  function looksLikeHtml(s) {
    if (!s) return false;
    return /<[a-z][\s\S]*>/i.test(s);
  }

  // Quill 의 기본 포맷으로 표현되지 않는 "복잡한" HTML 탐지
  //   - <div class="..."> / <div style="..."> / <span style="..."> 등 인라인 스타일 또는 클래스
  //   - <section>, <article>, <figure>, <table>, <iframe> 등 비표준 블록
  //   - 복잡한 HTML 인 경우 → 자동으로 HTML 모드로 진입하여 원본을 보존
  function isComplexHtml(html) {
    if (!html) return false;
    const s = String(html);
    // class 또는 style 속성이 있으면 복잡 처리
    if (/<\w+[^>]*\s(class|style)\s*=/i.test(s)) return true;
    // Quill 이 다루지 못하는 태그
    if (/<(div|span|section|article|figure|aside|header|footer|nav|main|table|iframe|video|audio)\b/i.test(s)) return true;
    return false;
  }

  function plainToHtml(text) {
    if (!text) return '';
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  }

  // 워드/구글독스 등에서 붙여넣은 HTML을 깔끔하게 정리
  function sanitizePastedHtml(html) {
    if (!html) return '';
    let s = String(html);
    s = s.replace(/<\?xml[\s\S]*?\?>/gi, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<meta[^>]*>/gi, '');
    s = s.replace(/<link[^>]*>/gi, '');
    s = s.replace(/\sclass="?Mso[^"\s>]*"?/gi, '');
    s = s.replace(/\smso-[a-z0-9-]+:[^;"]+;?/gi, '');
    s = s.replace(/\sstyle="\s*"/gi, '');
    const bodyMatch = s.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) s = bodyMatch[1];
    return s.trim();
  }

  /**
   * Mount a Quill editor inside a container element.
   * - container: HTMLElement (will get .editor-shell wrapper applied)
   * - opts: { value?: string, placeholder?: string, large?: boolean, minimal?: boolean }
   * Returns: { quill, getHtml(), setHtml(html), destroy() }
   */
  async function mountEditor(container, opts = {}) {
    const Quill = await ensureLoaded();
    container.classList.add('editor-shell');
    if (opts.large) container.classList.add('lg');

    const editorEl = document.createElement('div');
    container.appendChild(editorEl);

    // HTML 모드 안내 띠 (HTML 모드일 때만 보임)
    const htmlBannerEl = document.createElement('div');
    htmlBannerEl.className = 'editor-html-banner';
    htmlBannerEl.innerHTML = '🟦 HTML 소스 편집 모드 — 입력한 원본 HTML 이 그대로 저장됩니다. 우측에 실시간 미리보기가 표시됩니다.';
    container.appendChild(htmlBannerEl);

    // HTML 모드: 좌측 textarea + 우측 라이브 미리보기 (split view)
    const htmlSplitEl = document.createElement('div');
    htmlSplitEl.className = 'editor-html-split';
    container.appendChild(htmlSplitEl);

    // HTML 소스 편집용 textarea
    const htmlSourceEl = document.createElement('textarea');
    htmlSourceEl.className = 'editor-html-source';
    htmlSourceEl.spellcheck = false;
    htmlSourceEl.placeholder = '<!-- HTML 직접 입력 -->';
    htmlSplitEl.appendChild(htmlSourceEl);

    // 라이브 미리보기 패널 — innerHTML 그대로 렌더링 (Quill 우회)
    const htmlPreviewEl = document.createElement('div');
    htmlPreviewEl.className = 'editor-html-preview html-render';
    htmlSplitEl.appendChild(htmlPreviewEl);

    // textarea 입력 → 미리보기 즉시 업데이트
    const updatePreview = () => {
      htmlPreviewEl.innerHTML = htmlSourceEl.value || '<div style="color:#999;font-style:italic;">미리보기가 여기에 표시됩니다</div>';
    };
    htmlSourceEl.addEventListener('input', updatePreview);

    // 표준 Quill 툴바 (커스텀 버튼은 이후 DOM 에 직접 주입)
    const fullToolbar = [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
      [{ align: [] }],
      ['blockquote', 'code-block'],
      ['link', 'image'],
      ['clean']
    ];
    const minimalToolbar = [
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link'],
      ['clean']
    ];

    const quill = new Quill(editorEl, {
      theme: 'snow',
      placeholder: opts.placeholder || '내용을 입력하세요...',
      modules: {
        toolbar: opts.minimal ? minimalToolbar : fullToolbar,
        clipboard: { matchVisual: false }  // 외부 줄바꿈 보존
      }
    });

    // ===== 커스텀 버튼 (HTML 토글 / 붙여넣기) 을 툴바에 직접 주입 =====
    let htmlMode = false;
    const toolbarEl = container.querySelector('.ql-toolbar');
    let htmlBtn = null, pasteBtn = null;
    if (toolbarEl) {
      const customGroup = document.createElement('span');
      customGroup.className = 'ql-formats editor-custom-group';
      customGroup.innerHTML = `
        <button type="button" class="editor-custom-btn editor-paste-btn" title="클립보드에서 붙여넣기 (서식 유지)">📋</button>
        <button type="button" class="editor-custom-btn editor-html-btn" title="HTML 소스 편집 (토글)">&lt;/&gt;</button>
      `;
      toolbarEl.appendChild(customGroup);
      htmlBtn = customGroup.querySelector('.editor-html-btn');
      pasteBtn = customGroup.querySelector('.editor-paste-btn');
    }

    // ===== HTML 모드 토글 =====
    // quillDirty: WYSIWYG 에서 사용자가 편집했는지 추적 → HTML 모드 진입 시 textarea 덮어쓸지 결정
    let quillDirty = false;
    quill.on('text-change', (delta, oldDelta, source) => {
      if (source === 'user') quillDirty = true;
    });

    const syncHtmlToQuill = () => {
      const html = htmlSourceEl.value.trim();
      quill.setContents([]);
      if (html) {
        try { quill.clipboard.dangerouslyPasteHTML(html); } catch {}
      }
      quillDirty = false;
    };
    const syncQuillToHtml = () => {
      htmlSourceEl.value = quill.root.innerHTML;
      updatePreview();
    };
    const toggleHtmlMode = () => {
      if (htmlMode) {
        // HTML → WYSIWYG: textarea 내용을 Quill 에 로드 (참고용 미리보기 — Quill 이 처리 못하는 부분은 잘릴 수 있음)
        syncHtmlToQuill();
        htmlMode = false;
        container.classList.remove('html-mode');
        if (htmlBtn) htmlBtn.classList.remove('is-on');
        quill.focus();
      } else {
        // WYSIWYG → HTML: Quill 에서 편집됐을 때만 textarea 덮어쓰기 (그렇지 않으면 원본 보존)
        if (quillDirty || !htmlSourceEl.value.trim()) {
          syncQuillToHtml();
          quillDirty = false;
        }
        htmlMode = true;
        container.classList.add('html-mode');
        if (htmlBtn) htmlBtn.classList.add('is-on');
        htmlSourceEl.focus();
      }
    };
    if (htmlBtn) {
      htmlBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleHtmlMode();
      });
    }

    // ===== 복잡한 HTML 붙여넣기 자동 감지 =====
    //   Quill 의 WYSIWYG 영역에 복잡한 HTML 을 붙여넣으면 Quill 이 스타일을 모두 제거하므로,
    //   복잡 HTML 이 감지되면 자동으로 HTML 모드로 전환하여 원본을 textarea 에 그대로 보존 (sanitize 안 함)
    quill.root.addEventListener('paste', (e) => {
      try {
        const html = e.clipboardData && e.clipboardData.getData('text/html');
        if (html && isComplexHtml(html)) {
          e.preventDefault();
          e.stopPropagation();
          // 원본 그대로 (어떤 처리도 가하지 않음)
          if (htmlSourceEl.value.length > 0) {
            htmlSourceEl.value = htmlSourceEl.value + '\n' + html;
          } else {
            htmlSourceEl.value = html;
          }
          // HTML 모드로 자동 전환
          if (!htmlMode) {
            htmlMode = true;
            container.classList.add('html-mode');
            if (htmlBtn) htmlBtn.classList.add('is-on');
          }
          updatePreview();
          htmlSourceEl.focus();
          (window.toast || (() => {}))('복잡한 HTML이 감지되어 HTML 모드로 전환했습니다. 입력한 소스가 그대로 저장됩니다.', 'success');
        }
      } catch (err) {
        // 무시 — 기본 붙여넣기 동작 진행
      }
    });

    // ===== image handler — choose between URL or file upload =====
    quill.getModule('toolbar').addHandler('image', () => {
      const insertImage = (src) => {
        const range = quill.getSelection(true) || { index: quill.getLength() };
        quill.insertEmbed(range.index, 'image', src, 'user');
        quill.setSelection(range.index + 1);
      };
      const pickFile = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files[0];
          if (!file) return;
          if (file.size > 4 * 1024 * 1024) {
            (window.toast || alert)('이미지는 4MB 이하만 첨부 가능합니다.', 'error');
            return;
          }
          const reader = new FileReader();
          reader.onload = (e) => insertImage(e.target.result);
          reader.readAsDataURL(file);
        };
        input.click();
      };
      if (typeof window.modal === 'function') {
        window.modal({
          title: '이미지 삽입',
          body: `
            <div class="text-sm text-muted mb-12">방법을 선택하세요. URL은 외부 이미지 주소를 직접 입력합니다.</div>
            <button type="button" class="btn btn-block mb-12" id="imgPickFile">📁 컴퓨터에서 파일 선택</button>
            <div class="text-sm text-muted text-center mb-12">— 또는 —</div>
            <div class="field">
              <label class="label">이미지 URL</label>
              <input class="input" id="imgUrlInput" placeholder="https://example.com/image.jpg">
            </div>
          `,
          confirmText: 'URL로 삽입',
          onConfirm: () => {
            const url = document.getElementById('imgUrlInput').value.trim();
            if (!url) { (window.toast || alert)('URL을 입력하거나 파일을 선택하세요.', 'error'); return false; }
            if (!/^(https?:|data:image\/)/i.test(url)) { (window.toast || alert)('유효한 이미지 URL이 아닙니다.', 'error'); return false; }
            insertImage(url);
          }
        });
        setTimeout(() => {
          const btn = document.getElementById('imgPickFile');
          if (btn) btn.onclick = () => { document.querySelector('.modal-backdrop')?.remove(); pickFile(); };
        }, 30);
      } else {
        const url = prompt('이미지 URL을 입력하세요 (취소 → 파일 선택):');
        if (url === null) pickFile();
        else if (url.trim()) insertImage(url.trim());
      }
    });

    // ===== 붙여넣기 (Clipboard API) =====
    const handlePasteFromClipboard = async () => {
      const insertHtml = (html) => {
        const cleaned = sanitizePastedHtml(html);
        const range = quill.getSelection(true) || { index: quill.getLength() };
        quill.clipboard.dangerouslyPasteHTML(range.index, cleaned, 'user');
      };
      const insertText = (text) => {
        const range = quill.getSelection(true) || { index: quill.getLength() };
        quill.insertText(range.index, text, 'user');
        quill.setSelection(range.index + text.length);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.read) {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            if (item.types.includes('text/html')) {
              const blob = await item.getType('text/html');
              const html = await blob.text();
              insertHtml(html);
              (window.toast || (() => {}))('서식을 유지하여 붙여넣었습니다.', 'success');
              return;
            }
          }
          const text = await navigator.clipboard.readText();
          if (text) {
            insertText(text);
            (window.toast || (() => {}))('붙여넣었습니다.', 'success');
            return;
          }
        } else if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text) { insertText(text); return; }
        }
        throw new Error('clipboard empty');
      } catch (e) {
        // 권한 거부 또는 미지원 → 붙여넣기 모달로 fallback
        if (typeof window.modal === 'function') {
          window.modal({
            title: '붙여넣기',
            body: `
              <div class="text-sm text-muted mb-12">아래에 내용을 붙여넣으세요 (Ctrl+V). 서식이 있으면 그대로 유지됩니다.</div>
              <div id="pasteSink" contenteditable="true"
                   style="min-height:160px; max-height:320px; overflow:auto; padding:12px 14px;
                          border:1px solid var(--border); border-radius:8px; background:var(--surface);
                          font-size:13px; line-height:1.6;"></div>
              <div class="text-sm text-muted mt-8">※ 워드·구글독스·웹 페이지 모두 지원합니다.</div>
            `,
            confirmText: '삽입',
            onConfirm: () => {
              const sink = document.getElementById('pasteSink');
              if (!sink) return;
              const html = sink.innerHTML.trim();
              const text = sink.innerText.trim();
              if (!html && !text) {
                (window.toast || alert)('붙여넣을 내용이 없습니다.', 'error');
                return false;
              }
              if (html && /<[a-z]/i.test(html)) insertHtml(html);
              else insertText(text);
            }
          });
          setTimeout(() => { document.getElementById('pasteSink')?.focus(); }, 50);
        } else {
          (window.toast || alert)('클립보드 접근이 거부되었습니다. Ctrl+V 로 직접 붙여넣어 주세요.', 'error');
        }
      }
    };
    if (pasteBtn) {
      pasteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handlePasteFromClipboard();
      });
    }

    if (opts.value) {
      const raw = String(opts.value);
      // textarea 에 항상 원본 그대로 저장 (어떤 처리도 하지 않음)
      htmlSourceEl.value = raw;
      // Quill 에도 미리 채워둠 (사용자가 WYSIWYG 으로 전환 시 보이도록 — 잘릴 수 있음)
      const visible = looksLikeHtml(raw) ? raw : plainToHtml(raw);
      try { quill.clipboard.dangerouslyPasteHTML(visible); } catch {}
      quillDirty = false;
      // 기존 HTML 콘텐츠가 있으면 항상 HTML 모드로 시작 → 원본 100% 보존, Quill 의 손상 방지
      if (raw.trim()) {
        htmlMode = true;
        container.classList.add('html-mode');
        if (htmlBtn) htmlBtn.classList.add('is-on');
      }
      updatePreview();
    } else {
      updatePreview();
    }

    return {
      quill,
      getHtml: () => {
        // HTML 모드 → textarea 의 원본 그대로 반환 (트림·sanitize 없이 입력값 100% 보존)
        if (htmlMode) {
          const raw = htmlSourceEl.value;
          // 텍스트가 공백뿐이면 빈 값으로 처리, 그 외에는 입력값 EXACT 그대로
          return raw.trim() ? raw : '';
        }
        const html = quill.root.innerHTML.trim();
        if (html === '<p><br></p>' || html === '<p></p>') return '';
        return html;
      },
      setHtml: (html) => {
        const raw = String(html || '');
        htmlSourceEl.value = raw;
        updatePreview();
        const v = looksLikeHtml(raw) ? raw : plainToHtml(raw);
        quill.setContents([]);
        try { quill.clipboard.dangerouslyPasteHTML(v); } catch {}
        quillDirty = false;
      },
      destroy: () => container.replaceChildren()
    };
  }

  window.RichEditor = { mount: mountEditor, ensureLoaded, looksLikeHtml, plainToHtml };
})();
