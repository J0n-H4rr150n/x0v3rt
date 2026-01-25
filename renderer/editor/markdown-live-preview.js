/**
 * Markdown Live Preview
 * Renders markdown blocks in-place while keeping the active block editable.
 */

import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import http from 'highlight.js/lib/languages/http';
import DOMPurify from 'dompurify';
import IPC from '../utils/ipc-client.js';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('http', http);

const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return '<pre class="hljs"><code>' +
                    hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                    '</code></pre>';
            } catch (error) {
                console.warn('Highlight error:', error);
            }
        }
        // No language or highlighting failed, return escaped
        return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
    }
});

let workspacePath = null;
let activeView = null;

const refreshEffect = StateEffect.define();

class MarkdownBlockWidget extends WidgetType {
    constructor(html, from, to, tasks, lineCount, plain = false) {
        super();
        this.html = html;
        this.from = from;
        this.to = to;
        this.tasks = tasks || [];
        this.lineCount = Math.max(1, lineCount || 1);
        this.plain = plain;
    }

    toDOM(view) {
        const wrapper = document.createElement('div');
        wrapper.className = 'cm-live-preview';
        // Sanitize HTML to prevent XSS attacks
        wrapper.innerHTML = DOMPurify.sanitize(this.html, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'code', 'pre', 'a', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div'],
            ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style'],
            ALLOW_DATA_ATTR: false
        });
        wrapper.style.display = 'inline-block';
        wrapper.style.width = '100%';
        wrapper.setAttribute('contenteditable', 'false');
        if (this.plain) {
            wrapper.classList.add('cm-plain');
        }

        resolveImages(wrapper);
        applyTaskCheckboxes(wrapper, this.tasks, view, this.from);
        addCopyButtonsToCodeBlocks(wrapper);

        // Handle link clicks
        wrapper.addEventListener('click', (event) => {
            const target = event.target.closest('a');
            if (target && target.href) {
                event.preventDefault();
                event.stopPropagation();

                const parent = null; // TODO: Get the path to the parent file
                const href = target.getAttribute('href');

                // External URLs - open in default browser
                if (href.startsWith('http://') || href.startsWith('https://')) {
                    window.IPC.invoke('shell:open-external', href);
                }
                // Wiki links [[filename]] - navigate to file
                else if (!href.startsWith('#')) {
                    // Handle relative file paths
                    let resolvedPath = href;
                    if (window.NotesUI?.resolveFilePath) {
                        resolvedPath = window.NotesUI.resolveFilePath(href);
                    }
                    window.NotesUI?.openFile(resolvedPath);
                }
                return;
            }
        });

        wrapper.addEventListener('pointerdown', (event) => {
            if (event.target && event.target.matches && event.target.matches('input.cm-task-checkbox')) {
                return;
            }
            if (event.target && event.target.closest && event.target.closest('button.cm-copy-code-btn')) {
                return;
            }
            // Don't prevent default on links
            if (event.target && event.target.closest('a')) {
                return;
            }
            event.preventDefault();
            view.focus();
            view.dispatch({
                selection: { anchor: this.from }
            });
        });

        return wrapper;
    }

    ignoreEvent() {
        return true;
    }
}

class FrontMatterWidget extends WidgetType {
    toDOM() {
        const el = document.createElement('div');
        el.className = 'cm-front-matter-hidden';
        el.setAttribute('aria-hidden', 'true');
        return el;
    }

    ignoreEvent() {
        return true;
    }
}

const livePreviewViewTracker = ViewPlugin.fromClass(class {
    constructor(view) {
        this.view = view;
        activeView = view;
    }

    update(update) {
        if (update.view !== activeView) {
            activeView = update.view;
        }
    }
});

const livePreviewField = StateField.define({
    create(state) {
        return buildDecorations(state);
    },
    update(decorations, transaction) {
        if (transaction.docChanged || transaction.selection || transaction.effects.some((e) => e.is(refreshEffect))) {
            return buildDecorations(transaction.state);
        }
        return decorations;
    },
    provide: (field) => EditorView.decorations.from(field)
});

function getActiveLineNumbers(state) {
    const doc = state.doc;
    const ranges = state.selection.ranges;
    const activeLines = new Set();

    for (const range of ranges) {
        const startLine = doc.lineAt(range.from).number;
        const endLine = doc.lineAt(range.to).number;
        for (let line = startLine; line <= endLine; line += 1) {
            activeLines.add(line);
        }

    }

    return activeLines;
}

function isAnyLineActive(activeLines, startLine, endLine) {
    for (let line = startLine; line <= endLine; line += 1) {
        if (activeLines.has(line)) return true;
    }
    return false;
}

function buildDecorations(state) {
    const doc = state.doc;
    if (!doc.length) return Decoration.none;

    const activeLineNumbers = getActiveLineNumbers(state);
    const text = doc.toString();
    const tokens = md.parse(text, {});
    const builder = new RangeSetBuilder();
    const pending = [];
    const renderedLines = new Set();

    const frontMatterRange = getFrontMatterRange(doc);
    if (frontMatterRange) {
        const { startLine, endLine } = frontMatterRange;
        const startPos = doc.line(startLine).from;
        const endPos = endLine < doc.lines ? doc.line(endLine + 1).from : doc.line(endLine).to;
        const widget = new FrontMatterWidget();
        pending.push({ from: startPos, to: endPos, decoration: Decoration.replace({ widget, block: false }) });
        for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
            renderedLines.add(lineNumber);
        }
    }

    for (const token of tokens) {
        if (!token.block || !token.map || token.level !== 0) continue;
        if (!isRenderableToken(token)) continue;

        const [startLine0, endLine0] = token.map;
        const startLine = Math.min(startLine0 + 1, doc.lines);
        const endLine = Math.min(Math.max(endLine0, startLine0 + 1), doc.lines);
        const isCodeBlock = token.type === 'fence' || token.type === 'code_block';

        if (isCodeBlock) {
            if (renderedLines.has(startLine)) {
                continue;
            }

            if (isAnyLineActive(activeLineNumbers, startLine, endLine)) {
                continue;
            }

            const lineStart = doc.line(startLine).from;
            const lineEnd = doc.line(endLine).to;
            const blockText = doc.sliceString(lineStart, lineEnd);
            const tasks = extractTasks(blockText);
            const html = renderLineHtml(blockText);

            if (!html.trim()) continue;

            const lineCount = Math.max(1, endLine - startLine + 1);
            const widget = new MarkdownBlockWidget(html, lineStart, lineEnd, tasks, lineCount, false);
            pending.push({ from: lineStart, to: lineEnd, decoration: Decoration.replace({ widget, block: false }) });
            renderedLines.add(startLine);
            continue;
        }

        if (startLine !== endLine) {
            for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
                if (renderedLines.has(lineNumber)) continue;
                if (activeLineNumbers.has(lineNumber)) continue;

                const line = doc.line(lineNumber);
                const lineText = line.text;
                if (!lineText.trim()) continue;

                if (isListText(lineText)) {
                    console.log('[LivePreview] list line', { lineNumber, lineText });
                }

                const tasks = extractTasks(lineText);
                const html = renderLineHtml(lineText);
                if (!html.trim()) continue;

                const widget = new MarkdownBlockWidget(html, line.from, line.to, tasks, 1, isPlainTextBlock(lineText));
                pending.push({ from: line.from, to: line.to, decoration: Decoration.replace({ widget, block: false }) });
                renderedLines.add(lineNumber);
            }
            continue;
        }

        if (renderedLines.has(startLine)) {
            continue;
        }

        if (isAnyLineActive(activeLineNumbers, startLine, endLine)) {
            continue;
        }

        const lineStart = doc.line(startLine).from;
        const lineEnd = doc.line(endLine).to;
        const blockText = doc.sliceString(lineStart, lineEnd);
        if (isListText(blockText)) {
            console.log('[LivePreview] list block', { startLine, endLine, blockText });
        }
        const tasks = extractTasks(blockText);
        const html = renderLineHtml(blockText);

        if (!html.trim()) continue;

        const widget = new MarkdownBlockWidget(html, lineStart, lineEnd, tasks, 1, isPlainTextBlock(blockText));
        pending.push({ from: lineStart, to: lineEnd, decoration: Decoration.replace({ widget, block: false }) });
        renderedLines.add(startLine);
    }

    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
        if (renderedLines.has(lineNumber)) continue;
        if (activeLineNumbers.has(lineNumber)) continue;

        const line = doc.line(lineNumber);
        if (line.text.trim() !== '') continue;

        // Use a widget with <br> to ensure vertical spacing for empty lines
        const html = '<br>';
        const widget = new MarkdownBlockWidget(html, line.from, line.to, [], 1, true);
        pending.push({ from: line.from, to: line.to, decoration: Decoration.replace({ widget, block: false }) });
        renderedLines.add(lineNumber);
    }

    pending.sort((a, b) => {
        if (a.from !== b.from) return a.from - b.from;
        const aSide = a.decoration.startSide ?? 0;
        const bSide = b.decoration.startSide ?? 0;
        if (aSide !== bSide) return aSide - bSide;
        return a.to - b.to;
    });

    for (const entry of pending) {
        builder.add(entry.from, entry.to, entry.decoration);
    }

    return builder.finish();
}

function getFrontMatterRange(doc) {
    if (!doc || doc.lines < 2) return null;
    const firstLine = doc.line(1).text.replace(/^\uFEFF/, '').trim();
    if (firstLine !== '---') return null;

    for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber += 1) {
        const lineText = doc.line(lineNumber).text.trim();
        if (lineText === '---') {
            return { startLine: 1, endLine: lineNumber };
        }
    }

    return null;
}

function extractTasks(blockText) {
    if (!blockText) return [];
    const tasks = [];
    let offset = 0;
    const lines = blockText.split('\n');

    for (const line of lines) {
        const match = line.match(/^(\s*(?:[-+*]|\d+\.)\s+)\[( |x|X)\]\s+/);
        if (match) {
            const markerIndex = line.indexOf('[');
            if (markerIndex !== -1) {
                tasks.push({
                    offset: offset + markerIndex,
                    checked: match[2].toLowerCase() === 'x'
                });
            }
        }
        offset += line.length + 1;
    }

    return tasks;
}

function isPlainTextBlock(blockText) {
    if (!blockText) return true;
    const hasWiki = /\[\[|!\[\[/.test(blockText);
    if (hasWiki) return false;
    if (/^\s{0,3}(#{1,6})\s+/m.test(blockText)) return false;
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(blockText)) return false;
    if (/^\s*>/.test(blockText)) return false;
    if (/`/.test(blockText)) return false;
    if (/\|/.test(blockText)) return false;
    if (/!\[[^\]]*\]\([^)]*\)/.test(blockText)) return false;
    if (/\[[^\]]+\]\([^)]*\)/.test(blockText)) return false;
    return true;
}

function isListText(text) {
    return /^\s*(?:[-*+]|\d+\.)\s+/.test(text);
}

function renderPlain(blockText) {
    return escapeHtml(blockText).replace(/\n/g, '<br>');
}

function renderLineHtml(lineText) {
    if (isPlainTextBlock(lineText)) {
        return renderPlain(lineText);
    }
    return md.render(preprocess(lineText));
}

function escapeHtml(input) {
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function applyTaskCheckboxes(container, tasks, view, baseOffset) {
    if (!tasks.length) return;

    const items = Array.from(container.querySelectorAll('li'));
    let taskIndex = 0;

    for (const item of items) {
        if (taskIndex >= tasks.length) break;

        const textNode = item.firstChild && item.firstChild.nodeType === Node.TEXT_NODE ? item.firstChild : null;
        const text = textNode ? textNode.textContent : item.textContent || '';
        const markerMatch = text.match(/^\s*\[( |x|X)\]\s+/);
        if (!markerMatch) continue;

        const task = tasks[taskIndex];
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.checked;
        checkbox.className = 'cm-task-checkbox';

        checkbox.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        checkbox.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const nextChecked = !task.checked;
            const from = baseOffset + task.offset;
            const to = from + 3;

            // Auto-advance cursor to next line
            let nextAnchor = from;
            const state = view.state;
            const currentLine = state.doc.lineAt(from);

            if (currentLine.number < state.doc.lines) {
                const nextLine = state.doc.line(currentLine.number + 1);
                // Try to find the start of the text content (skip whitespace for better UX)
                const firstChar = nextLine.text.search(/\S/);
                nextAnchor = nextLine.from + (firstChar >= 0 ? firstChar : 0);
            }

            view.dispatch({
                changes: { from, to, insert: nextChecked ? '[x]' : '[ ]' },
                selection: { anchor: nextAnchor }
            });
            view.focus();
        });

        if (textNode) {
            textNode.textContent = textNode.textContent.replace(/^\s*\[( |x|X)\]\s+/, '');
        }

        item.insertBefore(checkbox, item.firstChild);
        item.insertBefore(document.createTextNode(' '), checkbox.nextSibling);

        taskIndex += 1;
    }
}

function isRenderableToken(token) {
    if (token.type === 'fence' || token.type === 'code_block') return true;
    if (token.type.endsWith('_open')) return true;
    return false;
}

function preprocess(markdown) {
    if (!markdown) return '';

    let output = markdown.replace(/!\[\[([^\]]+)\]\]/g, (_match, path) => {
        const trimmed = String(path).trim();
        return `![](${trimmed})`;
    });

    output = output.replace(/\[\[([^\]]+)\]\]/g, (_match, target) => {
        const trimmed = String(target).trim();
        const hasExt = /\.[a-z0-9]+$/i.test(trimmed);
        const href = hasExt ? trimmed : `${trimmed}.md`;
        return `[${trimmed}](${href})`;
    });

    return output;
}

function resolveImages(container) {
    const images = container.querySelectorAll('img');
    images.forEach((img) => {
        const src = img.getAttribute('src');
        if (!src) return;
        if (isAbsoluteUrl(src) || !workspacePath) return;

        const fileUrl = toFileUrl(workspacePath, src);
        if (fileUrl) {
            img.setAttribute('src', fileUrl);
        }
    });
}

function isAbsoluteUrl(value) {
    return /^(https?:|data:|file:)/i.test(value);
}

function toFileUrl(basePath, relativePath) {
    const normalizedBase = normalizePath(basePath);
    const normalizedRelative = normalizeRelativePath(relativePath);
    if (!normalizedBase || !normalizedRelative) return null;
    const joined = `${normalizedBase}/${normalizedRelative}`;
    const encoded = joined.replace(/ /g, '%20');
    if (/^[a-zA-Z]:\//.test(encoded)) {
        return `file:///${encoded}`;
    }
    return `file://${encoded}`;
}

function normalizePath(input) {
    if (!input) return '';
    return String(input).replace(/\\/g, '/').replace(/\/$/, '');
}

function normalizeRelativePath(input) {
    if (!input) return '';
    const raw = String(input).replace(/\\/g, '/').replace(/^\//, '');
    const segments = raw.split('/');
    const resolved = [];
    for (const segment of segments) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            resolved.pop();
            continue;
        }
        resolved.push(segment);
    }
    return resolved.join('/');
}

function addCopyButtonsToCodeBlocks(container) {
    const codeBlocks = container.querySelectorAll('pre code');
    codeBlocks.forEach((codeElement) => {
        const pre = codeElement.parentElement;
        if (!pre || pre.querySelector('button.cm-copy-code-btn')) return;

        // Create copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'cm-copy-code-btn';
        copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
        `;
        copyBtn.title = 'Copy to clipboard';

        copyBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            event.preventDefault();

            const code = codeElement.textContent || '';

            try {
                await navigator.clipboard.writeText(code);
                copyBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00ff00" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                `;
                copyBtn.title = 'Copied!';

                setTimeout(() => {
                    copyBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    `;
                    copyBtn.title = 'Copy to clipboard';
                }, 2000);
            } catch (error) {
                console.error('Failed to copy code:', error);
                copyBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff0000" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                `;
                setTimeout(() => {
                    copyBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    `;
                    copyBtn.title = 'Copy to clipboard';
                }, 2000);
            }
        });

        // Wrap pre in a container for positioning
        if (!pre.parentElement.classList.contains('cm-code-block-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'cm-code-block-wrapper';
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);
            wrapper.appendChild(copyBtn);
        }
    });
}

const MarkdownLivePreview = {
    extension: [livePreviewField, livePreviewViewTracker],

    async init() {
        try {
            workspacePath = await IPC.getWorkspacePath();
        } catch (error) {
            console.warn('Failed to get workspace path:', error);
        }

        IPC.onNotesFolderChanged(async () => {
            try {
                workspacePath = await IPC.getWorkspacePath();
                if (activeView) {
                    activeView.dispatch({ effects: refreshEffect.of(true) });
                }
            } catch (error) {
                console.warn('Failed to refresh workspace path:', error);
            }
        });
    }
};

window.MarkdownLivePreview = MarkdownLivePreview;

export default MarkdownLivePreview;
