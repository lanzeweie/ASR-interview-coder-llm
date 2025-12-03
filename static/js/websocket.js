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
        this.analysisCards = new Map();
        this.analysisCardTimers = new Map();
        this.lastAnalysisCardKey = null;
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
                    analysisId: data.analysis_id || null
                });
            }
            const card = this.getOrCreateAnalysisCard(data.analysis_id);
            this.updateAnalysisCard(card, data);
            if (dom.asrWindow) {
                dom.asrWindow.scrollTop = dom.asrWindow.scrollHeight;
            }
            if (data.analysis_status === 'completed') {
                this.scheduleAnalysisCardCleanup(data.analysis_id);
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

    getOrCreateAnalysisCard(analysisId) {
        const fallbackKey = analysisId || this.lastAnalysisCardKey || `analysis-${Date.now()}`;
        const key = fallbackKey;
        this.lastAnalysisCardKey = key;
        if (this.analysisCards.has(key)) {
            return this.analysisCards.get(key);
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'message system-message agent-analysis-card';
        wrapper.dataset.analysisId = key;
        wrapper.innerHTML = `
            <div class="agent-analysis-card">
                <div class="analysis-card-header">
                    <span class="analysis-pill">智能分析</span>
                    <span class="analysis-status-pill status-progress">分析中</span>
                </div>
                <div class="analysis-card-body">
                    <div class="analysis-detail">🤔 语音分析中...</div>
                    <div class="analysis-subtext"></div>
                </div>
            </div>
        `;
        if (dom.asrWindow) {
            dom.asrWindow.appendChild(wrapper);
        }
        this.analysisCards.set(key, wrapper);
        return wrapper;
    }

    updateAnalysisCard(card, data) {
        if (!card) return;
        const statusPill = card.querySelector('.analysis-status-pill');
        const detailEl = card.querySelector('.analysis-detail');
        const subtextEl = card.querySelector('.analysis-subtext');

        if (detailEl && data.text) {
            detailEl.textContent = data.text;
        }
        if (subtextEl) {
            const reasonText = data.analysis_reason || '';
            subtextEl.textContent = reasonText;
            subtextEl.style.display = reasonText ? 'block' : 'none';
            subtextEl.title = reasonText || '';
        }
        if (statusPill) {
            statusPill.classList.remove('status-progress', 'status-complete', 'status-helper');
            if (data.analysis_status === 'in_progress') {
                statusPill.textContent = '分析中';
                statusPill.classList.add('status-progress');
            } else if (data.analysis_need_ai) {
                statusPill.textContent = '助手介入';
                statusPill.classList.add('status-helper');
            } else {
                statusPill.textContent = '分析完成';
                statusPill.classList.add('status-complete');
            }
        }
    }

    scheduleAnalysisCardCleanup(analysisId) {
        const key = analysisId || this.lastAnalysisCardKey;
        if (!key) return;
        if (this.analysisCardTimers.has(key)) {
            clearTimeout(this.analysisCardTimers.get(key));
        }
        const timer = setTimeout(() => {
            const card = this.analysisCards.get(key);
            if (card) {
                card.classList.add('fade-out');
                setTimeout(() => card.remove(), 300);
            }
            this.analysisCards.delete(key);
            this.analysisCardTimers.delete(key);
        }, 8000);
        this.analysisCardTimers.set(key, timer);
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
    getOrCreateResponseDiv(modelName, currentConfigName) {
        if (this.activeResponseDivs[modelName]) {
            return this.activeResponseDivs[modelName];
        }

        // 如果有预响应提示，先使用它，然后清除预响应引用
        let msgDiv;
        if (this.preResponseDivs[modelName]) {
            msgDiv = this.preResponseDivs[modelName];
            delete this.preResponseDivs[modelName];
        } else {
            // 创建新的响应div
            msgDiv = document.createElement('div');
            msgDiv.className = 'message ai';

            // Header with Model Tag - 使用当前模型配置名称
            const speakerName = currentConfigName || 'AI 助手';
            const headerHtml = modelName
                ? `<div class="message-header"><span class="speaker-name">${speakerName}</span><span class="model-tag">${modelName}</span></div>`
                : `<div class="message-header"><span class="speaker-name">${speakerName}</span></div>`;

            msgDiv.innerHTML = `
                ${headerHtml}
                <div class="message-content llm-markdown"></div>
            `;
        }

        if (dom.llmWindow) {
            dom.llmWindow.appendChild(msgDiv);
            this.activeResponseDivs[modelName || 'default'] = msgDiv;
        }
        return msgDiv;
    }

    // 创建预响应提示
    createPreResponse(isMulti, multiLLMActiveNames, currentConfigName) {
        // 清理旧的预响应提示
        this.preResponseDivs = {};

        if (isMulti) {
            // 多模型模式：为每个活跃的模型创建预响应提示
            multiLLMActiveNames.forEach(modelName => {
                const preDiv = document.createElement('div');
                preDiv.className = 'message ai';

                const speakerName = currentConfigName || 'AI 助手';
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
            // 单模型模式：创建一个预响应提示
            const preDiv = document.createElement('div');
            preDiv.className = 'message ai';

            const speakerName = currentConfigName || 'AI 助手';
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
