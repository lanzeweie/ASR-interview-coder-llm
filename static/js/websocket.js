/* ========================================
   WebSocket连接管理
   ======================================== */

import { dom, domUtils } from './dom.js';

// ===== WebSocket: ASR 连接与处理 =====
export class WebSocketManager {
    constructor() {
        this.asrSocket = null;
        this.llmSocket = null;
        this.isConnected = {
            asr: false,
            llm: false
        };
        this.agentStatusHandler = null;
        this.analysisFlags = new Map();
    }

    // ASR WebSocket连接
    connectASR() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        this.asrSocket = new WebSocket(wsUrl);

        // 连接成功时显示"未连接"状态，等待后端确认
        this.asrSocket.onopen = () => {
            console.log('[ASR] WebSocket 连接已建立，等待服务器响应...');
            this.isConnected.asr = true;
            // 先设置为未连接状态
            this.updateASRStatus(false);
        };

        this.asrSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // 如果是初始状态消息，更新UI
                if (data.asr_status) {
                    const asrInitialized = data.asr_status.initialized;
                    this.updateASRStatus(asrInitialized);
                } else {
                    // 正常的ASR消息
                    this.addASRMessage(data);
                }
            } catch (e) {
                console.error('ASR消息解析错误:', e);
            }
        };

        this.asrSocket.onclose = () => {
            console.log('[ASR] WebSocket 连接已断开');
            this.isConnected.asr = false;
            this.updateASRStatus(false);
            // 自动重连
            setTimeout(() => this.connectASR(), 3000);
        };

        this.asrSocket.onerror = () => {
            console.log('[ASR] WebSocket 连接错误');
            this.isConnected.asr = false;
            this.updateASRStatus(false);
        };
    }

    // LLM WebSocket连接
    connectLLM() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/llm`;
        this.llmSocket = new WebSocket(wsUrl);

        this.llmSocket.onopen = () => {
            console.log('[LLM] WebSocket 连接已建立');
            this.isConnected.llm = true;
        };

        this.llmSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleLLMMessage(data);
            } catch (e) {
                console.error('LLM消息解析错误:', e);
            }
        };

        this.llmSocket.onclose = () => {
            console.log('[LLM] WebSocket 连接已断开');
            this.isConnected.llm = false;
            // 自动重连
            setTimeout(() => this.connectLLM(), 3000);
        };

        this.llmSocket.onerror = () => {
            console.log('[LLM] WebSocket 连接错误');
            this.isConnected.llm = false;
        };
    }

    // 更新ASR状态
    updateASRStatus(asrInitialized) {
        if (!dom.asrStatusDiv) return;

        const dot = dom.asrStatusDiv.querySelector('.status-dot');
        const text = dom.asrStatusDiv.querySelector('.status-text');

        // ASR 系统是否真正初始化
        if (asrInitialized) {
            dom.asrStatusDiv.className = 'status connected';
            if (text) text.textContent = '已连接';
            console.log('[ASR] 实时语音转写功能已启用');
        } else {
            dom.asrStatusDiv.className = 'status disconnected';
            if (text) text.textContent = 'ASR 未初始化';
            console.log('[ASR] 请使用正常模式启动服务器以启用实时语音转写功能');
        }
    }

    // 添加ASR消息
    addASRMessage(data) {
        // 跳过初始状态消息（包含 asr_status）
        if (data.asr_status) {
            return;
        }

        if (data.analysis_status) {
            if (this.agentStatusHandler) {
                this.agentStatusHandler({
                    status: data.analysis_status,
                    needAI: data.analysis_need_ai === true,
                    reason: data.analysis_reason || '',
                    summary: data.analysis_summary || '',
                    count: data.analysis_count || 0,
                    preview: data.analysis_preview || '',
                    analysisId: data.analysis_id || null,
                    model: data.analysis_model || ''
                });
            }
            const flag = this.getOrCreateAnalysisFlag(data.analysis_id);
            this.updateAnalysisFlag(flag, data);
            if (dom.asrWindow) {
                dom.asrWindow.scrollTop = dom.asrWindow.scrollHeight;
            }
            return;
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.innerHTML = `
            <div class="message-header"><span class="speaker-name">${data.speaker}</span><span class="timestamp">${data.time}</span></div>
            <div class="content">${data.text}</div>
        `;

        if (dom.asrWindow) {
            dom.asrWindow.appendChild(messageDiv);
            dom.asrWindow.scrollTop = dom.asrWindow.scrollHeight;
        }
    }

    // 发送消息到LLM
    sendToLLM(messageData) {
        if (this.llmSocket && this.llmSocket.readyState === WebSocket.OPEN) {
            this.llmSocket.send(JSON.stringify(messageData));
            return true;
        }
        return false;
    }

    // 获取连接状态
    getConnectionStatus() {
        return {
            asr: this.isConnected.asr,
            llm: this.isConnected.llm
        };
    }

    // LLM消息处理（需要与LLMManager配合）
    handleLLMMessage(data) {
        // 这个方法需要LLMManager来重写
        console.log('[LLM收到消息]:', data);
    }

    // 关闭所有连接
    closeAll() {
        if (this.asrSocket) {
            this.asrSocket.close();
        }
        if (this.llmSocket) {
            this.llmSocket.close();
        }
    }

    setAgentStatusHandler(handler) {
        this.agentStatusHandler = handler;
    }

    getOrCreateAnalysisFlag(analysisId) {
        const key = analysisId || `analysis-${Date.now()}`;
        if (this.analysisFlags.has(key)) {
            return this.analysisFlags.get(key);
        }
        const flagDiv = document.createElement('div');
        flagDiv.className = 'message system-message agent-analysis-flag';
        flagDiv.dataset.analysisId = key;
        flagDiv.innerHTML = `
            <div class="analysis-flag-badge">
                <span class="analysis-flag-summary">[智能分析]</span>
                <span class="analysis-flag-status">分析中</span>
            </div>
            <div class="analysis-flag-note"></div>
        `;
        if (dom.asrWindow) {
            dom.asrWindow.appendChild(flagDiv);
        }
        this.analysisFlags.set(key, flagDiv);
        return flagDiv;
    }

    updateAnalysisFlag(flag, data) {
        if (!flag) return;
        const badge = flag.querySelector('.analysis-flag-badge');
        const summaryEl = flag.querySelector('.analysis-flag-summary');
        const statusEl = flag.querySelector('.analysis-flag-status');
        const noteEl = flag.querySelector('.analysis-flag-note');

        const summaryText = data.analysis_summary || `[智能分析]`;
        const modelLabel = data.analysis_model ? `[${data.analysis_model}]` : '';
        let noteText = data.analysis_reason || data.analysis_preview || '';
        if (modelLabel) {
            noteText = noteText ? `${modelLabel} ${noteText}` : modelLabel;
        }

        if (summaryEl) {
            summaryEl.textContent = summaryText;
        }
        if (statusEl) {
            if (data.analysis_status === 'in_progress') {
                statusEl.textContent = '分析中';
                flag.classList.remove('flag-complete', 'flag-helper');
                flag.classList.add('flag-progress');
            } else if (data.analysis_need_ai) {
                statusEl.textContent = '助手介入';
                flag.classList.remove('flag-progress', 'flag-complete');
                flag.classList.add('flag-helper');
            } else {
                statusEl.textContent = '分析完成';
                flag.classList.remove('flag-progress', 'flag-helper');
                flag.classList.add('flag-complete');
            }
        }
        if (badge) {
            badge.title = summaryText;
        }
        if (noteEl) {
            noteEl.innerHTML = '';

            // 显示常规分析信息
            if (noteText) {
                const textDiv = document.createElement('div');
                textDiv.textContent = noteText;
                noteEl.appendChild(textDiv);
            }

            // 显示意图识别结果
            if (data.intent_info) {
                const { model, summary } = data.intent_info;
                const intentDiv = document.createElement('div');
                intentDiv.className = 'intent-result';
                intentDiv.style.marginTop = '8px';
                intentDiv.style.paddingTop = '8px';
                intentDiv.style.borderTop = '1px solid rgba(255,255,255,0.1)';
                intentDiv.style.fontSize = '0.9em';

                intentDiv.innerHTML = `
                    <div style="opacity: 0.7; margin-bottom: 2px;">调用模型：${model}</div>
                    <div style="color: #4caf50; font-weight: 600; margin-bottom: 2px;">✅ 意图识别完成</div>
                    <div style="line-height: 1.4;">意图总结：${summary}</div>
                `;
                noteEl.appendChild(intentDiv);
            }

            noteEl.style.display = (noteText || data.intent_info) ? 'block' : 'none';
        }
    }
}

// LLM流式响应管理器
export class LLMStreamManager {
    constructor() {
        this.activeResponseDivs = {}; // Map<modelName, HTMLElement>
        this.activeResponseBuffers = {}; // Map<modelName, string>
        this.preResponseDivs = {}; // Map<modelName, HTMLElement> - 预响应提示
    }

    // 清理所有LLM相关状态
    clearLLMState() {
        this.activeResponseDivs = {};
        this.activeResponseBuffers = {};
        this.preResponseDivs = {};
        console.log('🧹 LLM状态已清理');
    }

    // 获取或创建响应div
    getOrCreateResponseDiv(modelName, speakerName) {
        const key = modelName || 'default';
        if (this.activeResponseDivs[key]) {
            return this.activeResponseDivs[key];
        }

        // 如果有预响应提示，先使用它，然后清除预响应引用
        let msgDiv;
        if (this.preResponseDivs[key]) {
            msgDiv = this.preResponseDivs[key];
            delete this.preResponseDivs[key];
        } else {
            // 创建新的响应div
            msgDiv = document.createElement('div');
            msgDiv.className = 'message ai';

            // Header with Model Tag - 使用当前模型配置名称
            const safeName = speakerName || 'AI 助手';
            const headerHtml = modelName
                ? `<div class="message-header"><span class="speaker-name">${safeName}</span><span class="model-tag">${modelName}</span></div>`
                : `<div class="message-header"><span class="speaker-name">${safeName}</span></div>`;

            msgDiv.innerHTML = `
                ${headerHtml}
                <div class="message-content llm-markdown"></div>
            `;
        }

        if (dom.llmWindow) {
            dom.llmWindow.appendChild(msgDiv);
            this.activeResponseDivs[key] = msgDiv;
        }
        return msgDiv;
    }

    // 创建预响应提示
    createPreResponse(isMulti, multiLLMActiveNames, { currentConfigName = '', resolveDisplayName } = {}) {
        // 清理旧的预响应提示
        this.preResponseDivs = {};

        const baseSpeaker = currentConfigName || window.currentDisplayName || 'AI 助手';
        const resolveName = (configName, preferIdentity) => {
            if (typeof resolveDisplayName === 'function' && configName) {
                const resolved = resolveDisplayName(configName, preferIdentity);
                if (resolved) return resolved;
            }
            if (configName && !preferIdentity) {
                return configName;
            }
            return baseSpeaker;
        };

        const activeNames = multiLLMActiveNames instanceof Set
            ? Array.from(multiLLMActiveNames)
            : Array.isArray(multiLLMActiveNames)
                ? multiLLMActiveNames
                : [];

        if (isMulti && activeNames.length > 0) {
            // 多模型模式：为每个活跃的模型创建预响应提示
            activeNames.forEach(modelName => {
                const preDiv = document.createElement('div');
                preDiv.className = 'message ai';

                const speakerName = resolveName(modelName, true);
                preDiv.innerHTML = `
                    <div class="message-header">
                        <span class="speaker-name">${speakerName}</span>
                        <span class="model-tag">${modelName}</span>
                    </div>
                    <div class="message-content llm-markdown thinking" data-is-pre-response="true">
                        正在输入<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
                    </div>
                `;

                if (dom.llmWindow) {
                    dom.llmWindow.appendChild(preDiv);
                    this.preResponseDivs[modelName] = preDiv;
                }
            });
        } else {
            // 单模型模式或没有特定模型信息：创建一个预响应提示
            const preDiv = document.createElement('div');
            preDiv.className = 'message ai';

            const speakerName = resolveName(currentConfigName || '', false);
            preDiv.innerHTML = `
                <div class="message-header">
                    <span class="speaker-name">${speakerName}</span>
                </div>
                <div class="message-content llm-markdown thinking" data-is-pre-response="true">
                    正在输入<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
            `;

            if (dom.llmWindow) {
                dom.llmWindow.appendChild(preDiv);
                this.preResponseDivs['default'] = preDiv;
            }
        }

        if (dom.llmWindow) {
            dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;
        }
    }
}
