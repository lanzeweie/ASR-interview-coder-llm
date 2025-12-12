/* ========================================
   工具函数
   ======================================== */

import { dom } from './dom.js';

// ===== API Helper =====
let saveTimer = null;
let pendingState = {};

export const API = {
    async loadUIState() {
        try {
            const res = await fetch('/api/ui_state');
            if (res.ok) {
                return await res.json();
            }
            return {};
        } catch (e) {
            console.error('Failed to load UI state:', e);
            return {};
        }
    },
    async saveUIState(state, immediate = false) {
        // 合并新状态到待保存状态
        pendingState = { ...pendingState, ...state };

        // 如果之前的定时器存在，清除它
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }

        const commitSave = async () => {
            if (Object.keys(pendingState).length === 0) return;

            try {
                const stateToSave = { ...pendingState };
                pendingState = {}; // 清空待保存状态

                await fetch('/api/ui_state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(stateToSave)
                });
                console.log('💾 UI状态已保存(Server):', stateToSave);
            } catch (e) {
                console.error('Failed to save UI state:', e);
                // 保存失败，尝试将未保存的状态合并回去（简单起见，这里暂不处理复杂的回滚）
            }
        };

        if (immediate) {
            await commitSave();
        } else {
            console.log('⏳ UI状态变更已缓存，5秒后保存...');
            saveTimer = setTimeout(commitSave, 5000);
        }
    }
};

// ===== Toast 通知系统 =====
export function showToast(message, type = 'info') {
    if (!dom.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cursor = 'pointer'; // 提示可点击
    toast.title = '点击关闭';

    const icon = document.createElement('div');
    icon.innerHTML = type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ';
    icon.style.fontSize = '18px';
    icon.style.fontWeight = 'bold';

    const text = document.createElement('span');
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    dom.toastContainer.appendChild(toast);

    const removeToast = () => {
        toast.classList.add('closing');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 250);
    };

    // 自动关闭定时器
    const autoCloseTimer = setTimeout(removeToast, 3000);

    // 点击立即关闭
    toast.onclick = () => {
        clearTimeout(autoCloseTimer);
        removeToast();
    };
}

// ===== 面板调节状态 =====
export const resizeState = {
    sidebar: {
        startX: 0,
        startWidth: 0,
        minWidth: 200,
        maxWidth: 400,
        isResizing: false
    },
    asr: {
        startX: 0,
        startWidth: 0,
        minWidth: 300,
        maxWidth: window.innerWidth * 0.6,
        isResizing: false
    }
};

// ===== 面板宽度调整工具 =====
export class PanelResizer {
    static initResizer(resizer, target, state) {
        const targetElement = document.getElementById(target === 'sidebar' ? 'sidebar' : 'asr-panel');
        if (!targetElement) return;

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            state.isResizing = true;
            state.startX = e.clientX;
            state.startWidth = targetElement.offsetWidth;
            resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', PanelResizer.handleMouseMove);
            document.addEventListener('mouseup', PanelResizer.handleMouseUp);
        });
    }

    static handleMouseMove(e) {
        // 通用处理逻辑由调用者实现
    }

    static handleMouseUp() {
        // 通用处理逻辑由调用者实现
    }

    // 专门处理 ASR 面板和 LLM 面板之间的 resizer
    static initPanelResizer(resizer) {
        const asrPanel = document.getElementById('asr-panel');
        const llmPanel = document.getElementById('llm-panel');
        if (!asrPanel || !llmPanel) return;

        const state = {
            isResizing: false,
            startX: 0,
            asrStartWidth: 0,
            llmStartWidth: 0
        };

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            state.isResizing = true;
            state.startX = e.clientX;
            state.asrStartWidth = asrPanel.offsetWidth;
            state.llmStartWidth = llmPanel.offsetWidth;
            resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            state.mouseMoveHandler = (event) => PanelResizer.panelMouseMove(event, state, asrPanel, llmPanel);
            state.mouseUpHandler = () => PanelResizer.panelMouseUp(state, resizer, asrPanel);
            document.addEventListener('mousemove', state.mouseMoveHandler);
            document.addEventListener('mouseup', state.mouseUpHandler);
        });
    }

    static panelMouseMove(e, state, asrPanel, llmPanel) {
        if (!state.isResizing) return;
        const diff = e.clientX - state.startX;

        // 计算新宽度：ASR面板 + diff，LLM面板 - diff
        let newAsrWidth = state.asrStartWidth + diff;
        let newLlmWidth = state.llmStartWidth - diff;

        // 最小宽度限制
        const minAsrWidth = 250;
        const minLlmWidth = 400;

        // 确保两个面板都不小于最小宽度
        if (newAsrWidth < minAsrWidth) {
            newAsrWidth = minAsrWidth;
            newLlmWidth = state.asrStartWidth + state.llmStartWidth - newAsrWidth;
        }
        if (newLlmWidth < minLlmWidth) {
            newLlmWidth = minLlmWidth;
            newAsrWidth = state.asrStartWidth + state.llmStartWidth - newLlmWidth;
        }

        asrPanel.style.width = `${newAsrWidth}px`;
        llmPanel.style.width = `${newLlmWidth}px`;

        adjustPanelLayout({
            asrWidth: newAsrWidth,
            llmWidth: newLlmWidth
        });
    }

    static panelMouseUp(state, resizer, asrPanel) {
        state.isResizing = false;
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // 保存 ASR 面板宽度（LLM 面板宽度会自适应）
        const width = asrPanel.offsetWidth;
        API.saveUIState({ ast_asr_width: width });

        adjustPanelLayout({
            asrWidth: asrPanel.offsetWidth,
            llmWidth: document.getElementById('llm-panel')?.offsetWidth
        });
        if (state.mouseMoveHandler) {
            document.removeEventListener('mousemove', state.mouseMoveHandler);
            state.mouseMoveHandler = null;
        }
        if (state.mouseUpHandler) {
            document.removeEventListener('mouseup', state.mouseUpHandler);
            state.mouseUpHandler = null;
        }
    }
}

// ===== 宽度持久化 =====
export async function loadSavedWidths() {
    const state = await API.loadUIState();

    const sidebarWidth = state.ast_sidebar_width;
    if (sidebarWidth) {
        document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
    }

    const asrWidth = state.ast_asr_width;
    const asrPanel = document.getElementById('asr-panel');
    const llmPanel = document.getElementById('llm-panel');
    if (asrWidth && asrPanel) {
        asrPanel.style.width = `${asrWidth}px`;
    }

    adjustPanelLayout({
        asrWidth: asrPanel ? asrPanel.offsetWidth : undefined,
        llmWidth: llmPanel ? llmPanel.offsetWidth : undefined
    });
    return state; // Return state so caller can use other properties
}

// ===== UI状态持久化 =====
export function saveUIState(uiState, immediate = false) {
    const state = {
        ...uiState,
        timestamp: Date.now()
    };
    API.saveUIState(state, immediate);
}

export async function loadUIState() {
    try {
        const uiState = await API.loadUIState();
        if (!uiState) return null;

        // Backend storage is persistent, no need for 7-day expiration check unless logic requires valid session
        console.log('UI状态已恢复(Server):', uiState);
        return uiState;
    } catch (error) {
        console.error('恢复UI状态失败:', error);
        return null;
    }
}

// ===== 文本框自动调整 =====
export function autoResizeTextarea(textarea) {
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// ===== 文本选择处理 =====
export function handleTextSelection(e, onSend) {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text && text.length > 1) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (dom.floatSendBtn) {
            dom.floatSendBtn.style.display = 'flex';
            dom.floatSendBtn.style.top = `${rect.bottom + window.scrollY + 10}px`;
            dom.floatSendBtn.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 60}px`;
            dom.floatSendBtn.onclick = () => {
                onSend(`请分析这段文本：\n${text}`);
                dom.floatSendBtn.style.display = 'none';
                window.getSelection().removeAllRanges();
            };
        }
    } else {
        if (dom.floatSendBtn) {
            dom.floatSendBtn.style.display = 'none';
        }
    }
}

// ===== 模型显示管理 =====
// ===== 模型显示管理 =====
export function updateModelDisplay(isMultiMode = false, currentConfigName = '') {
    if (!dom.currentModelDisplay) return;

    const modelNameDisplay = dom.currentModelDisplay.querySelector('.model-name-display');
    const modelSubtitleDisplay = dom.currentModelDisplay.querySelector('.model-subtitle');
    const modelIndicator = dom.currentModelDisplay.querySelector('.model-indicator');

    if (isMultiMode) {
        // 智囊团模式下统一显示“智囊团”
        if (modelNameDisplay) modelNameDisplay.textContent = '智囊团';
        if (modelSubtitleDisplay) {
            modelSubtitleDisplay.textContent = '';
            modelSubtitleDisplay.style.display = 'none';
        }

        if (modelIndicator) {
            modelIndicator.style.background = 'linear-gradient(135deg, #3b82f6, #60a5fa)';
            modelIndicator.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.5)';
        }
    } else {
        // 显示当前选择的模型 - 使用当前配置的显示名称
        // window.currentDisplayName is now the Title (e.g. Identity Name)
        // window.currentDisplaySubtitle is the Subtitle (e.g. Config Name)
        const displayName = window.currentDisplayName || currentConfigName || '';
        const displaySubtitle = window.currentDisplaySubtitle || '';

        if (modelNameDisplay) modelNameDisplay.textContent = displayName;

        if (modelSubtitleDisplay) {
            if (displaySubtitle && displaySubtitle !== displayName) {
                modelSubtitleDisplay.textContent = displaySubtitle;
                modelSubtitleDisplay.style.display = 'block';
            } else {
                modelSubtitleDisplay.textContent = '';
                modelSubtitleDisplay.style.display = 'none';
            }
        }

        if (modelIndicator) {
            modelIndicator.style.background = 'var(--accent-primary)';
            modelIndicator.style.boxShadow = '0 0 10px rgba(79, 70, 229, 0.5)';
        }
    }
}

// ===== 布局调整 =====
export function adjustPanelLayout({ asrWidth, llmWidth } = {}) {
    const asrStatus = dom.asrStatusDiv;
    const currentModelDisplay = dom.currentModelDisplay;

    if (typeof asrWidth === 'number' && asrStatus) {
        if (asrWidth < 380) {
            asrStatus.style.maxWidth = '24px';
            asrStatus.style.padding = '6px';
            asrStatus.style.background = 'transparent';
            asrStatus.style.border = 'none';
            const statusText = asrStatus.querySelector('.status-text');
            if (statusText) statusText.style.display = 'none';
        } else {
            asrStatus.style.maxWidth = '120px';
            asrStatus.style.padding = '6px 10px';
            asrStatus.style.background = '';
            asrStatus.style.border = '';
            const statusText = asrStatus.querySelector('.status-text');
            if (statusText) statusText.style.display = '';
        }
    }

    if (typeof llmWidth === 'number') {
        if (currentModelDisplay) {
            currentModelDisplay.style.display = llmWidth < 450 ? 'none' : '';
        }

        // 当 LLM 面板变窄时，隐藏状态指示器的文字，只显示点
        const isCompact = llmWidth < 580;
        const indicators = [
            { el: dom.agentStatusIndicator, textClass: '.agent-status-text' },
            { el: dom.intentRecognitionIndicator, textClass: '.intent-recognition-text' },
            { el: dom.resumeStatusIndicator, textClass: '.resume-status-text' }
        ];

        indicators.forEach(({ el, textClass }) => {
            if (el) {
                const text = el.querySelector(textClass);
                if (text) {
                    text.style.display = isCompact ? 'none' : '';
                }
            }
        });
    }
}

// ===== 面板宽度监听 - 后备方案 =====
export function initPanelResizeListener() {
    const asrPanel = document.getElementById('asr-panel');
    const llmPanel = document.getElementById('llm-panel');

    if ('ResizeObserver' in window) {
        if (asrPanel) {
            const asrObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    adjustPanelLayout({ asrWidth: entry.contentRect.width });
                }
            });
            asrObserver.observe(asrPanel);
        }

        if (llmPanel) {
            const llmObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    adjustPanelLayout({ llmWidth: entry.contentRect.width });
                }
            });
            llmObserver.observe(llmPanel);
        }

        adjustPanelLayout({
            asrWidth: asrPanel?.offsetWidth,
            llmWidth: llmPanel?.offsetWidth
        });
        console.log('✅ 面板宽度监听已启用 (ResizeObserver)');
    } else {
        const handleResize = () => {
            const asrCurrent = document.getElementById('asr-panel');
            const llmCurrent = document.getElementById('llm-panel');
            adjustPanelLayout({
                asrWidth: asrCurrent ? asrCurrent.offsetWidth : undefined,
                llmWidth: llmCurrent ? llmCurrent.offsetWidth : undefined
            });
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        console.log('⚠️ 面板宽度监听已启用 (window.resize)');
    }
}

// ===== 音频处理工具 =====
export function convertToWav(blob) {
    return new Promise((resolve, reject) => {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const fileReader = new FileReader();
        fileReader.onload = async () => {
            try {
                const arrayBuffer = fileReader.result;
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                const wavBuffer = audioBufferToWav(audioBuffer);
                resolve(new Blob([wavBuffer], { type: 'audio/wav' }));
            } catch (error) {
                reject(error);
            }
        };
        fileReader.onerror = reject;
        fileReader.readAsArrayBuffer(blob);
    });
}

// 将 AudioBuffer 转换为 WAV 格式
export function audioBufferToWav(buffer) {
    const length = buffer.length;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);

    // WAV 文件头
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    // 写入音频数据
    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < length; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
    }

    return arrayBuffer;
}

// ===== 时间格式化 =====
export function formatTime(timestamp) {
    return new Date(timestamp * 1000).toLocaleString();
}

export function formatDuration(seconds) {
    return `${seconds.toFixed(1)}秒`;
}


