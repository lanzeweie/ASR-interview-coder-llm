/* ========================================
   Markdown 渲染工具
   - 基于 marked + DOMPurify
   - 负责在前端安全地渲染 Markdown 文本
   ======================================== */

import { marked } from './vendor/marked.esm.js';
import DOMPurify from './vendor/purify.es.mjs';

// 自定义链接渲染，默认在新标签页打开
const renderer = new marked.Renderer();
renderer.link = (href, title, text) => {
    const safeHref = href ?? '';
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
    renderer
});

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

    const rawHtml = marked.parse(source);
    const safeHtml = DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: ['target', 'rel'],
        ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td']
    });

    target.innerHTML = safeHtml;

    if (!target.classList.contains('markdown-body')) {
        target.classList.add('markdown-body');
    }
}
