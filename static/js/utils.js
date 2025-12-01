/* ========================================
   工具函数
   ======================================== */

import { dom } from './dom.js';

// ===== Toast 通知系统 =====
export function showToast(message, type = 'info') {
    if (!dom.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = document.createElement('div');
    icon.innerHTML = type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ';
    icon.style.fontSize = '18px';
    icon.style.fontWeight = 'bold';

    const text = document.createElement('span');
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%) scale(0.9)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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
            document.addEventListener('mousemove', PanelResizer.panelMouseMove);
            document.addEventListener('mouseup', PanelResizer.panelMouseUp);
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
        const minLlmWidth = 300;

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
    }

    static panelMouseUp(state, resizer, asrPanel) {
        state.isResizing = false;
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // 保存 ASR 面板宽度（LLM 面板宽度会自适应）
        localStorage.setItem(`ast_asr_width`, asrPanel.offsetWidth);
        document.removeEventListener('mousemove', PanelResizer.panelMouseMove);
        document.removeEventListener('mouseup', PanelResizer.panelMouseUp);
    }
}

// ===== 宽度持久化 =====
export function loadSavedWidths() {
    const sidebarWidth = localStorage.getItem('ast_sidebar_width');
    if (sidebarWidth) {
        document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
    }

    const asrWidth = localStorage.getItem('ast_asr_width');
    const asrPanel = document.getElementById('asr-panel');
    if (asrWidth && asrPanel) {
        asrPanel.style.width = `${asrWidth}px`;
    }
}

// ===== UI状态持久化 =====
export function saveUIState(uiState) {
    const state = {
        ...uiState,
        timestamp: Date.now()
    };
    localStorage.setItem('ast_ui_state', JSON.stringify(state));
    console.log('💾 UI状态已保存:', state);
}

export function loadUIState() {
    try {
        const savedState = localStorage.getItem('ast_ui_state');
        if (!savedState) return null;

        const uiState = JSON.parse(savedState);
        const age = Date.now() - (uiState.timestamp || 0);

        // 状态超过7天则忽略，恢复默认
        if (age > 7 * 24 * 60 * 60 * 1000) {
            console.log('保存的UI状态已过期，使用默认状态');
            return null;
        }

        console.log('UI状态已恢复:', uiState);
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
export function updateModelDisplay(isMultiMode = false, currentConfigName = '') {
    if (!dom.currentModelDisplay) return;

    const modelNameDisplay = dom.currentModelDisplay.querySelector('.model-name-display');
    const modelIndicator = dom.currentModelDisplay.querySelector('.model-indicator');

    if (isMultiMode) {
        // 显示智囊团
        if (modelNameDisplay) modelNameDisplay.textContent = '智囊团';
        if (modelIndicator) {
            modelIndicator.style.background = 'linear-gradient(135deg, #3b82f6, #60a5fa)';
            modelIndicator.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.5)';
        }
    } else {
        // 显示当前选择的模型
        if (modelNameDisplay) modelNameDisplay.textContent = currentConfigName || 'DeepSeek-V3.2';
        if (modelIndicator) {
            modelIndicator.style.background = 'var(--accent-primary)';
            modelIndicator.style.boxShadow = '0 0 10px rgba(79, 70, 229, 0.5)';
        }
    }
}

// ===== 布局调整 =====
export function adjustPanelLayout(width) {
    const asrStatus = dom.asrStatusDiv;

    if (!asrStatus) return;

    // 宽度小于380px时，隐藏状态文字
    if (width < 380) {
        if (asrStatus) {
            asrStatus.style.maxWidth = '24px';
            asrStatus.style.padding = '6px';
            asrStatus.style.background = 'transparent';
            asrStatus.style.border = 'none';
        }
        const statusText = asrStatus.querySelector('.status-text');
        if (statusText) statusText.style.display = 'none';
    } else {
        // 恢复正常显示
        if (asrStatus) {
            asrStatus.style.maxWidth = '120px';
            asrStatus.style.padding = '6px 10px';
            asrStatus.style.background = '';
            asrStatus.style.border = '';
        }
        const statusText = asrStatus.querySelector('.status-text');
        if (statusText) statusText.style.display = '';
    }

    // 宽度小于320px时，隐藏发送全部按钮
    if (dom.sendAllBtn) {
        dom.sendAllBtn.style.display = width < 320 ? 'none' : '';
    }

    // 宽度小于300px时，隐藏当前模型显示
    if (dom.currentModelDisplay) {
        dom.currentModelDisplay.style.display = width < 300 ? 'none' : '';
    }
}

// ===== 面板宽度监听 - 后备方案 =====
export function initPanelResizeListener() {
    // 使用 ResizeObserver 监听面板宽度变化（后备方案）
    if ('ResizeObserver' in window) {
        const asrPanel = document.getElementById('asr-panel');
        if (asrPanel) {
            const resizeObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    const width = entry.contentRect.width;
                    adjustPanelLayout(width);
                }
            });
            resizeObserver.observe(asrPanel);
            console.log('✅ 面板宽度监听已启用 (ResizeObserver)');
        }
    } else {
        // 使用 window resize 事件作为后备
        window.addEventListener('resize', () => {
            const asrPanel = document.getElementById('asr-panel');
            if (asrPanel) {
                adjustPanelLayout(asrPanel.offsetWidth);
            }
        });
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