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
        this.intentModel = null;
        this.intentModelFetchPromise = null;
    }

    async fetchIntentModelName() {
        if (this.intentModel) return this.intentModel;
        if (this.intentModelFetchPromise) return this.intentModelFetchPromise;
        this.intentModelFetchPromise = fetch('/api/agent/status')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                const name = data?.config?.intent_model_name || null;
                if (name) {
                    this.intentModel = name;
                }
                return this.intentModel || null;
            })
            .catch(() => null)
            .finally(() => {
                this.intentModelFetchPromise = null;
            });
        return this.intentModelFetchPromise;
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

    disconnectASR() {
        if (this.asrSocket) {
            // Prevent auto-reconnect logic if manually closed
            this.asrSocket.onclose = null;
            this.asrSocket.close();
            this.asrSocket = null;
        }
        this.isConnected.asr = false;
        this.updateASRStatus(false);
        console.log('[ASR] WebSocket 连接已手动关闭');
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

            // Sync Toggle Button
            const toggleBtn = document.getElementById('asr-toggle-listening-btn');
            const visualizer = document.getElementById('asr-mic-visualizer');
            if (toggleBtn) {
                const playIcon = toggleBtn.querySelector('.icon-play');
                const stopIcon = toggleBtn.querySelector('.icon-stop');

                toggleBtn.classList.add('active');
                toggleBtn.title = "停止监听";
                if (playIcon) playIcon.style.display = 'none';
                if (stopIcon) stopIcon.style.display = 'block';

                // Auto-start visualizer if connected (optional, but consistent with "Listening")
                // We can't easily access UI manager here to start visualizer, 
                // but usually "Connected" means backend is listening.
                // For local visualizer, user might need to click or we rely on them clicking "Start" if not auto-started.
                // However, finding `ASTManagers` or dispatching event is better.
                if (window.ASTManagers && window.ASTManagers.ui && typeof window.ASTManagers.ui.startASRVisualizer === 'function') {
                    window.ASTManagers.ui.startASRVisualizer().catch(e => console.log("Auto-start visualizer failed/skipped:", e));
                    if (visualizer) {
                        visualizer.style.display = 'flex';
                        setTimeout(() => visualizer.classList.add('active'), 10);
                    }
                }
            }

        } else {
            dom.asrStatusDiv.className = 'status disconnected';
            if (text) text.textContent = 'ASR 未初始化';
            console.log('[ASR] 请使用正常模式启动服务器以启用实时语音转写功能');

            // Sync Toggle Button
            const toggleBtn = document.getElementById('asr-toggle-listening-btn');
            const visualizer = document.getElementById('asr-mic-visualizer');
            if (toggleBtn) {
                const playIcon = toggleBtn.querySelector('.icon-play');
                const stopIcon = toggleBtn.querySelector('.icon-stop');

                toggleBtn.classList.remove('active');
                toggleBtn.title = "开始监听";
                if (playIcon) playIcon.style.display = 'block';
                if (stopIcon) stopIcon.style.display = 'none';

                if (window.ASTManagers && window.ASTManagers.ui && typeof window.ASTManagers.ui.stopASRVisualizer === 'function') {
                    window.ASTManagers.ui.stopASRVisualizer();
                    if (visualizer) {
                        visualizer.style.display = 'none';
                        visualizer.classList.remove('active');
                    }
                }
            }
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
            } else if (data.analysis_status === 'intent_started') {
                statusEl.textContent = '意图识别中';
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

            const buildIntentCard = ({ model, status, summary, needsModelUpdate }) => {
                const statusMap = {
                    success: '✅ 意图识别完成',
                    progress: '🔄 正在分析意图...',
                    error: '⚠️ 意图识别失败'
                };
                const statusClass = status ? `status-${status}` : '';
                const intentDiv = document.createElement('div');
                intentDiv.className = ['intent-result-compact', statusClass].filter(Boolean).join(' ');

                const statusText = statusMap[status] || 'ℹ️ 状态更新';

                const metaRow = document.createElement('div');
                metaRow.className = 'intent-meta-compact';

                // 只有当模型名不为空时才显示模型信息
                if (model && model.trim()) {
                    const labelEl = document.createElement('span');
                    labelEl.className = 'intent-label-compact';
                    labelEl.textContent = `调用模型: ${model}`;
                    metaRow.appendChild(labelEl);
                }

                const statusEl = document.createElement('span');
                statusEl.className = 'intent-status-compact';
                statusEl.textContent = statusText;

                metaRow.appendChild(statusEl);
                intentDiv.appendChild(metaRow);

                if (summary) {
                    const cleanedSummary = summary.replace(/^意图总结[:：]\s*/i, '');
                    const summaryRow = document.createElement('div');
                    summaryRow.className = 'intent-summary-compact';

                    const summaryLabel = document.createElement('span');
                    summaryLabel.className = 'intent-summary-label';
                    summaryLabel.textContent = '意图总结';

                    const summaryText = document.createElement('span');
                    summaryText.className = 'intent-summary-text';
                    summaryText.textContent = cleanedSummary;

                    summaryRow.appendChild(summaryLabel);
                    summaryRow.appendChild(summaryText);
                    intentDiv.appendChild(summaryRow);
                }

                // 如果需要异步补全模型名，尝试获取后更新
                if (needsModelUpdate && model) {
                    this.fetchIntentModelName().then(fetched => {
                        if (fetched) {
                            this.intentModel = fetched;
                            const labelEl = metaRow.querySelector('.intent-label-compact');
                            if (labelEl) {
                                labelEl.textContent = `调用模型: ${fetched}`;
                            }
                        }
                    });
                }

                return intentDiv;
            };

            // 捕获/缓存模型，确保一开始就显示真实模型
            // 优先从 intentRecognitionConfig 获取，这是页面加载时从后端获取的配置
            const intentConfig = window.intentRecognitionConfig || {};
            const configModel = intentConfig.model_name || null;
            // 后端消息中可能包含的模型字段
            const incomingModel = data.analysis_model || data.intent_model || data.model || (data.intent_info && data.intent_info.model);

            // 更新缓存：优先使用后端返回的模型名，其次使用配置中的
            if (incomingModel && incomingModel !== 'Unknown') {
                this.intentModel = incomingModel;
            } else if (!this.intentModel && configModel) {
                this.intentModel = configModel;
            }

            // 最终解析模型名：后端返回 > 缓存 > 配置 > Unknown
            const resolvedModel = (incomingModel && incomingModel !== 'Unknown')
                ? incomingModel
                : (this.intentModel || configModel || 'Unknown');
            const needsModelUpdate = resolvedModel === 'Unknown';

            // 显示意图识别进行中状态 - 不显示模型名，等待后端返回真实信息
            if (data.analysis_status === 'intent_started') {
                // 只显示进度状态，不显示模型名
                const intentDiv = buildIntentCard({
                    model: '',  // 不显示模型名
                    status: 'progress',
                    summary: '',
                    needsModelUpdate: false  // 不需要异步更新
                });
                noteEl.appendChild(intentDiv);
                noteEl.style.display = 'block';
                return;
            }

            // 显示常规分析信息
            if (noteText) {
                const textDiv = document.createElement('div');
                textDiv.textContent = noteText;
                noteEl.appendChild(textDiv);
            }

            // 显示意图识别结果 - 只有在获得真实模型名时才显示
            if (data.intent_info) {
                const { summary } = data.intent_info;
                // 只有当模型名不是 "Unknown" 且不为空时才显示模型信息
                const modelToShow = (resolvedModel && resolvedModel !== 'Unknown') ? resolvedModel : '';
                const intentDiv = buildIntentCard({
                    model: modelToShow,
                    status: 'success',
                    summary,
                    needsModelUpdate: false  // 已有真实数据，无需异步更新
                });
                noteEl.appendChild(intentDiv);
            } else if (data.analysis_status === 'intent_error' || data.analysis_status === 'error' || data.intent_error) {
                const intentDiv = buildIntentCard({
                    model: '',
                    status: 'error',
                    summary: data.intent_error || '意图识别出现问题，请稍后重试。',
                    needsModelUpdate: false
                });
                noteEl.appendChild(intentDiv);
            }

            noteEl.style.display = (noteText || data.intent_info || data.analysis_status === 'intent_error' || data.intent_error) ? 'block' : 'none';
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

            // Header with Model Tag - Only show tag if different from speaker name
            const safeName = speakerName || 'AI 助手';
            let headerHtml = `<div class="message-header"><span class="speaker-name">${safeName}</span>`;

            if (modelName && modelName !== safeName) {
                headerHtml += `<span class="model-tag">${modelName}</span>`;
            }
            headerHtml += '</div>';

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

            // Always prefer identity if available, even in single mode
            const speakerName = resolveName(currentConfigName || '', true);
            preDiv.innerHTML = `
                <div class="message-header">
                    <span class="speaker-name">${speakerName}</span>
                    ${(currentConfigName && currentConfigName !== speakerName) ? `<span class="model-tag">${currentConfigName}</span>` : ''}
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
