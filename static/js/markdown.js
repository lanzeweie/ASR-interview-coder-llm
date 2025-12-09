/* ========================================
   Markdown 渲染工具
   - 基于 marked + DOMPurify
   - 负责在前端安全地渲染 Markdown 文本
   ======================================== */

// Fallback to globals if imports fail or are not used
const markedVal = typeof marked !== 'undefined' ? marked : (window.marked || {});
const DOMPurifyVal = typeof DOMPurify !== 'undefined' ? DOMPurify : (window.DOMPurify || {});

// 自定义链接渲染，默认在新标签页打开
const renderer = new markedVal.Renderer ? new markedVal.Renderer() : {};
if (renderer.link) {
    renderer.link = (href, title, text) => {
        const safeHref = href ?? '';
        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };
}

if (markedVal.setOptions) {
    markedVal.setOptions({
        gfm: true,
        breaks: true,
        headerIds: false,
        mangle: false,
        renderer
    });
}

/**
 * 将 Markdown 渲染为安全的 HTML
 * @param {HTMLElement} target
 * @param {string} markdownText
 */
export function renderMarkdown(target, markdownText) {
    if (!target) return;

    const source = typeof markdownText === 'string' ? markdownText : '';
    if (!source.trim()) {
        target.textContent = '';
        return;
    }

    const rawHtml = markedVal.parse ? markedVal.parse(source) : source;
    const safeHtml = DOMPurifyVal.sanitize ? DOMPurifyVal.sanitize(rawHtml, {
        ADD_ATTR: ['target', 'rel'],
        ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td']
    }) : rawHtml;

    target.innerHTML = safeHtml;

    if (!target.classList.contains('markdown-body')) {
        target.classList.add('markdown-body');
    }
}
