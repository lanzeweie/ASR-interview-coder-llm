/* ========================================
   智能分析功能
   ======================================== */

import { dom } from './dom.js';
import { showToast, API } from './utils.js';
import { renderMarkdown } from './markdown.js';

// ===== 智能分析管理类 =====
export class AgentManager {
    constructor() {
        this.enabled = false;
        this.status = null;
        this.analysisState = 'idle';
        this.analysisNeedAI = false;
        this.analysisReason = '';
        this.analysisSummary = '';
        this.analysisCount = 0;
        this.analysisPreview = '';
        this.analysisModel = '';
        this.analysisResetTimer = null;
    }

    // 初始化智能分析状态
    async initAgentStatus() {
        try {
            const [statusRes, uiState] = await Promise.all([
                fetch('/api/agent/status'),
                API.loadUIState()
            ]);
            const data = await statusRes.json();

            if (data.available) {
                // 检查是否有保存的UI状态
                const hasSavedUIState = uiState && uiState.agentToggleActive !== undefined;

                // 如果没有保存的UI状态，则使用API状态
                if (!hasSavedUIState) {
                    this.enabled = data.enabled || false;
                    this.updateAgentToggleUI();
                    this.updateAgentStatusIndicator();
                    if (dom.agentToggleBtn) {
                        dom.agentToggleBtn.title = this.enabled ? '智能分析已开启，点击关闭' : '智能分析已关闭，点击开启';
                    }
                } else {
                    // 有保存的UI状态，使用UI状态
                    // 注意：这里我们优先信赖 UI state，因为它是用户偏好
                    this.enabled = uiState.agentToggleActive;

                    // 如果UI状态和后端实际状态不一致，可能需要同步后端
                    // 但目前 initAgentStatus 主要是为了初始化前端显示
                    // toggleAgent 会调用 /api/agent/enable 来同步

                    this.updateAgentToggleUI();
                    this.updateAgentStatusIndicator();
                    console.log('智能分析状态已恢复(Server):', this.enabled ? '开启' : '关闭');
                }
            } else {
                // 智能分析不可用，隐藏相关UI
                if (dom.agentToggleBtn) {
                    dom.agentToggleBtn.style.display = 'none';
                }
                const indicator = document.getElementById('agent-status-indicator');
                if (indicator) indicator.style.display = 'none';
            }
        } catch (e) {
            console.error('Failed to load agent status:', e);
            if (dom.agentToggleBtn) {
                dom.agentToggleBtn.style.display = 'none';
            }
            const indicator = document.getElementById('agent-status-indicator');
            if (indicator) indicator.style.display = 'none';
        }
    }

    // 更新智能分析开关 UI
    updateAgentToggleUI() {
        if (dom.agentToggleBtn) {
            if (this.enabled) {
                dom.agentToggleBtn.classList.add('active');
                dom.agentToggleBtn.title = '智能分析已开启，点击关闭';
            } else {
                dom.agentToggleBtn.classList.remove('active');
                dom.agentToggleBtn.title = '智能分析已关闭，点击开启';
            }
        }
    }

    // 更新智能分析状态指示器
    updateAgentStatusIndicator() {
        const indicator = dom.agentStatusIndicator;
        if (!indicator) return;

        if (this.enabled) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    }

    // 切换智能分析开关
    async toggleAgent() {
        try {
            const newEnabled = !this.enabled;

            // 如果要开启智能分析，先检查是否设置了主人公
            if (newEnabled) {
                const protagonist = await this.loadProtagonist();
                if (!protagonist) {
                    // 检查是否有声纹数据
                    const voiceRes = await fetch('/api/voiceprints');
                    const voiceData = await voiceRes.json();
                    const voiceprints = voiceData.voiceprints || [];

                    if (voiceprints.length === 0) {
                        showToast('建议在声纹中设置主人公后再开启智能分析', 'warning');
                    } else {
                        showToast('建议设置一个声纹为主人公后再开启智能分析', 'warning');
                    }
                }
            }

            const response = await fetch('/api/agent/enable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: newEnabled,
                    auto_trigger: true
                })
            });

            if (response.ok) {
                this.enabled = newEnabled;
                this.updateAgentToggleUI();
                this.updateAgentStatusIndicator();

                // 保存UI状态（开关按钮的状态）
                if (dom.agentToggleBtn) {
                    if (newEnabled) {
                        dom.agentToggleBtn.classList.add('active');
                    } else {
                        dom.agentToggleBtn.classList.remove('active');
                    }
                }

                showToast(`智能分析已${newEnabled ? '开启' : '关闭'}`, 'success');
                return newEnabled;
            } else {
                showToast('操作失败', 'error');
                return this.enabled;
            }
        } catch (e) {
            console.error('Failed to toggle agent:', e);
            showToast('操作失败', 'error');
            return this.enabled;
        }
    }

    // 获取当前主人公
    async loadProtagonist() {
        try {
            const response = await fetch('/api/protagonist');
            if (response.ok) {
                const data = await response.json();
                return data.protagonist || '';
            }
        } catch (error) {
            console.error('获取主人公失败:', error);
        }
        return '';
    }

    // 获取当前状态
    getCurrentState() {
        return {
            enabled: this.enabled,
            status: this.status
        };
    }

    // 检查是否启用
    isEnabled() {
        return this.enabled;
    }

    updateAnalysisState(state = {}) {
        if (!this.enabled) return;

        if (state.status) {
            this.analysisState = state.status;
        }
        if (typeof state.needAI === 'boolean') {
            this.analysisNeedAI = state.needAI;
        }
        if ('reason' in state) {
            this.analysisReason = state.reason || '';
        }
        if (typeof state.summary === 'string' && state.summary) {
            this.analysisSummary = state.summary;
        }
        if (typeof state.count === 'number') {
            this.analysisCount = state.count;
        }
        if (typeof state.preview === 'string' && state.preview) {
            this.analysisPreview = state.preview;
        }
        if ('model' in state) {
            this.analysisModel = state.model || '';
        }
    }
}

// ===== 意图识别管理类 =====
export class IntentRecognitionManager {
    constructor() {
        this.enabled = false;
    }

    // 获取意图识别是否启用
    isEnabled() {
        return this.enabled;
    }

    // 显式设置状态，保持指示器同步
    setEnabled(enabled) {
        this.enabled = !!enabled;
        this.updateIntentRecognitionIndicator();
        return this.enabled;
    }

    // 切换意图识别状态
    async toggle() {
        return this.setEnabled(!this.enabled);
    }

    // 更新意图识别状态指示器
    updateIntentRecognitionIndicator() {
        if (!dom.intentRecognitionIndicator) return;

        if (this.enabled) {
            dom.intentRecognitionIndicator.style.display = 'flex';
        } else {
            dom.intentRecognitionIndicator.style.display = 'none';
        }
    }

    // 初始化意图识别状态
    initIntentRecognitionStatus() {
        // 默认状态为关闭
        this.setEnabled(false);
    }
}

// ===== LLM管理器（与WebSocketManager配合） =====
export class LLMManager {
    constructor() {
        this.chatHistory = [];
        this.currentChatId = null;
        this.isProcessing = false;
        this.streamManager = null;
        this.chatManager = null;
    }

    // 设置流管理器
    setStreamManager(streamManager) {
        this.streamManager = streamManager;
    }

    // 设置WebSocket管理器
    setWebSocketManager(wsManager) {
        this.wsManager = wsManager;
    }

    // 连接聊天管理器以同步聊天ID与历史
    setChatManager(chatManager) {
        this.chatManager = chatManager;
        if (chatManager && typeof chatManager.setLLMManager === 'function') {
            chatManager.setLLMManager(this);
        }
        if (chatManager && typeof chatManager.getCurrentChatId === 'function') {
            this.currentChatId = chatManager.getCurrentChatId();
        }
        if (chatManager && typeof chatManager.getChatHistory === 'function') {
            this.replaceHistory(chatManager.getChatHistory());
        }
    }

    replaceHistory(messages = []) {
        if (!Array.isArray(messages)) {
            this.chatHistory = [];
            return;
        }
        this.chatHistory = messages.map(msg => ({ ...msg }));
    }

    // 处理LLM消息
    handleLLMMessage(data) {
        if (!this.streamManager) return;

        if (data.type === 'chunk') {
            const model = data.model || 'default';
            const preferIdentity = dom.multiLLMToggle?.classList.contains('active');
            const isSpecificModel = model && model !== 'default';
            let resolvedSpeaker = null;
            if (typeof window.resolveConfigDisplayName === 'function' && isSpecificModel) {
                resolvedSpeaker = window.resolveConfigDisplayName(model, preferIdentity);
            }
            const fallbackSpeaker = resolvedSpeaker
                || window.currentDisplayName
                || window.currentConfigName
                || (isSpecificModel ? model : 'AI 助手');

            const div = this.streamManager.getOrCreateResponseDiv(
                model,
                fallbackSpeaker
            );
            const contentDiv = div.querySelector('.message-content, .content');
            if (!contentDiv) return;

            // 如果是预响应提示，需要先清除"正在输入"文本
            if (contentDiv.dataset.isPreResponse === 'true') {
                contentDiv.textContent = '';
                contentDiv.dataset.isPreResponse = 'false';
                // 移除thinking样式
                contentDiv.classList.remove('thinking');
            }

            // Update buffer
            if (!this.streamManager.activeResponseBuffers[model]) {
                this.streamManager.activeResponseBuffers[model] = '';
            }
            this.streamManager.activeResponseBuffers[model] += data.content;

            renderMarkdown(contentDiv, this.streamManager.activeResponseBuffers[model]);

            if (dom.llmWindow) {
                dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;
            }
        }
        else if (data.type === 'done_one') {
            // One model finished - 可选：标记这个气泡为完成状态
            const model = data.model;
            console.log(`模型 ${model} 完成响应`);
        }
        else if (data.type === 'done' || data.type === 'done_all') {
            // All finished
            if (data.full_text) {
                // Single mode legacy or direct response (no chunks)
                this.chatHistory.push({ role: "assistant", content: data.full_text });

                // Ensure UI is updated, especially for cases with no chunks (e.g. immediate errors/prompts)
                const model = data.model || 'default';
                const div = this.streamManager.getOrCreateResponseDiv(model);
                if (div) {
                    const contentDiv = div.querySelector('.message-content, .content');
                    if (contentDiv) {
                        // Clear thinking state if present
                        if (contentDiv.dataset.isPreResponse === 'true') {
                            contentDiv.textContent = '';
                            contentDiv.classList.remove('thinking');
                            delete contentDiv.dataset.isPreResponse;
                        }
                        // Render full text
                        renderMarkdown(contentDiv, data.full_text);
                        if (dom.llmWindow) {
                            dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;
                        }
                    }
                }
            } else {
                // Multi mode: push all buffers to history
                for (const [model, text] of Object.entries(this.streamManager.activeResponseBuffers)) {
                    if (text) {
                        this.chatHistory.push({ role: "assistant", content: `**${model}**:\n${text}` });
                    }
                }
            }

            // Reset state
            this.streamManager.clearLLMState();
            window.latestIntentAnalysis = null;
            this.finishProcessing();

            // Refresh chat list preview if needed
            if (typeof window.loadChatList === 'function') {
                window.loadChatList();
            }
        }
        else if (data.type === 'error') {
            showToast("LLM 错误: " + data.content, 'error');
            const errorDiv = document.createElement('div');
            errorDiv.className = 'message system-message';
            errorDiv.innerHTML = `<div class="message-content" style="color: var(--color-error)">❌ ${data.content}</div>`;

            if (dom.llmWindow) {
                dom.llmWindow.appendChild(errorDiv);
                dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;
            }
            this.finishProcessing();
        }
        else if (data.type === 'agent_notification') {
            // 智能分析通知消息
            console.log('[智能分析通知]:', data.content);
            const notificationDiv = document.createElement('div');
            notificationDiv.className = 'message system-message agent-notification';
            notificationDiv.innerHTML = `<div class="message-content">${data.content}</div>`;

            if (dom.llmWindow) {
                dom.llmWindow.appendChild(notificationDiv);
                dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;
            }
        }
        else if (data.type === 'agent_triggered') {
            // 智能分析触发消息
            console.log('[智能分析触发]:', data);
            const reason = data.reason || '检测到需要AI帮助分析';

            // ✅ 优化：区分意图识别和智能分析的触发消息
            // 如果是意图识别-only模式，显示不同的文案
            if (data.is_intent_only) {
                showToast(`🔍 意图识别完成: ${reason}`, 'info');
                console.log('[意图识别] 这是意图识别-only的触发，不消耗token');
            } else {
                showToast(`🤖 智能分析已触发: ${reason}`, 'info');
                console.log('[智能分析] 这是完整的智能分析，会消耗token');
            }

            // 关键修复：将触发消息发送回服务器以启动 LLM 生成
            if (this.wsManager) {
                console.log('[智能分析] 正在请求服务器开始生成回复...');

                // 语音厅意图识别已在ASR面板展示，LLM窗口不再重复渲染意图总结

                // 创建预响应提示 (Visual feedback)
                const isMulti = data.is_multi_llm || false;
                if (this.streamManager) {
                    // 清除旧状态
                    this.streamManager.clearLLMState();
                    // 创建新的预响应
                    this.streamManager.createPreResponse(
                        isMulti,
                        window.multiLLMActiveNames || new Set(),
                        {
                            currentConfigName: window.currentConfigName || '',
                            resolveDisplayName: window.resolveConfigDisplayName
                        }
                    );
                }

                // 发送回服务器
                this.wsManager.sendToLLM(data);
            } else {
                console.error('[智能分析] 无法发送请求：WebSocketManager 未设置');
                showToast('智能分析无法启动：连接错误', 'error');
            }
        }
    }

    // 发送消息到LLM
    async sendToLLM(wsManager, text) {
        console.log('[LLM] sendToLLM 被调用, 文本长度:', text.length);
        console.log('[LLM] 文本内容:', text);
        console.log('[LLM] 是否正在处理:', this.isProcessing);

        if (!text.trim() || this.isProcessing) {
            console.log('[LLM] 发送失败: 文本为空或正在处理');
            return;
        }

        this.isProcessing = true;

        try {
            // 检查上一条消息是否与当前要发送的消息相同
            // 这是为了防止在 ui.js 中已经通过 echoUserMessage -> ChatManager -> syncLLMHistory 流程添加过消息
            // 导致此处再次添加，形成重复消息
            const lastMsg = this.chatHistory[this.chatHistory.length - 1];
            if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== text) {
                this.chatHistory.push({ role: "user", content: text });
            }
            if (this.chatManager && typeof this.chatManager.getCurrentChatId === 'function') {
                this.setCurrentChatId(this.chatManager.getCurrentChatId());
            }

            // 检查是否启用了意图识别
            const intentRecognitionEnabled = window.intentRecognitionEnabled === true;
            console.log('[LLM] 意图识别状态:', intentRecognitionEnabled);

            if (intentRecognitionEnabled) {
                // 启用了意图识别，先进行分析
                console.log('[LLM] 意图识别已启用，开始分析...');
                await this.processWithIntentRecognition(wsManager, text);
            } else {
                // 未启用意图识别，直接发送
                console.log('[LLM] 意图识别未启用，直接发送');
                await this.sendDirectlyToLLM(wsManager, text);
            }
        } catch (error) {
            console.error('[LLM] 发送消息失败:', error);
            showToast("发送消息失败: " + error.message, 'error');
            this.isProcessing = false;
        }
    }

    // 处理意图识别流程
    async processWithIntentRecognition(wsManager, text) {
        let analyzingDiv = null;
        try {
            const messages = [...this.chatHistory];

            // 3. 显示意图识别中...
            analyzingDiv = document.createElement('div');
            analyzingDiv.className = 'message system-message intent-analysis';
            analyzingDiv.dataset.analysisId = `intent-analysis-${Date.now()}`;
            analyzingDiv.innerHTML = `
                <div class="message-content intent-analysis-card compact">
                    <div class="intent-meta">
                        <!-- 不显示模型信息，等待后端返回真实数据 -->
                        <div class="intent-status-text intent-status-progress">正在收集上下文...</div>
                    </div>
                    <div class="intent-summary" style="display: none;"></div>
                </div>
            `;
            if (dom.llmWindow) {
                dom.llmWindow.appendChild(analyzingDiv);
                dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;
            }
            this.updateIntentStatus(analyzingDiv, `正在收集上下文（${messages.length} 条消息）`, 'progress');

            // 4. 调用意图识别API（使用后端的 /api/agent/analyze 端点）
            console.log('[LLM] 调用智能分析API...');
            // 获取意图识别配置 - 但不显示，等待后端返回真实信息
            const intentConfig = window.intentRecognitionConfig || { model_type: 'local', model_name: 'Qwen3-0.6B' };
            console.log('[LLM] 意图识别配置:', intentConfig);
            // 不显示模型名，等待后端返回真实信息
            // this.updateIntentModelInfo(analyzingDiv, intentConfig);
            this.updateIntentStatus(analyzingDiv, '正在调用模型，生成结论中...', 'progress');

            const response = await fetch('/api/agent/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: messages,
                    speaker_name: '用户', // 可以根据实际情况设置
                    // 传递意图识别模型配置
                    intent_recognition_config: {
                        model_type: intentConfig.model_type,
                        model_name: intentConfig.model_name
                    },
                    // 仅启用意图识别模块，避免触发智能分析
                    modules: ['intent'],
                    // 标识这是意图识别请求，而不是智能分析请求
                    request_type: 'intent_recognition'
                })
            });

            if (!response.ok) {
                throw new Error(`意图识别API请求失败: ${response.status}`);
            }

            const analysisResult = await response.json();
            console.log('[LLM] 意图识别结果:', analysisResult);
            this.updateIntentStatus(analyzingDiv, '模型返回结果，正在生成结论...', 'progress');

            // 5. 显示意图识别结果
            this.displayIntentAnalysisResult(analysisResult, analyzingDiv);
            window.latestIntentAnalysis = analysisResult;

            // 6. 继续发送到LLM
            setTimeout(async () => {
                await this.sendDirectlyToLLM(wsManager, text);
            }, 1000); // 延迟1秒后继续，让用户看到意图识别结果

        } catch (error) {
            console.error('[LLM] 意图识别失败:', error);
            showToast("意图识别失败: " + error.message, 'error');
            this.displayIntentAnalysisError(analyzingDiv, error.message);
            window.latestIntentAnalysis = null;

            // 意图识别失败时，仍然继续发送原始消息
            console.log('[LLM] 意图识别失败，继续发送原始消息');
            await this.sendDirectlyToLLM(wsManager, text);
        }
    }

    // 显示意图识别结果
    displayIntentAnalysisResult(result, containerDiv) {
        if (!containerDiv) return;

        const phase1Result = result.phase1 || result || {};
        const phase2Result = result.phase2 || result || {};
        const summaryInfo = this.parseIntentSummary(phase2Result);
        const analysisSuccess = phase2Result.success !== false;
        const reason = phase1Result.reason || (phase2Result.error || '意图识别完成');

        const summarySegments = [];
        if (summaryInfo.summary) {
            summarySegments.push(summaryInfo.summary);
        }
        if (summaryInfo.question) {
            summarySegments.push(`用户问题：${summaryInfo.question}`);
        }
        if (summaryInfo.steps.length > 0) {
            summarySegments.push(`下一步：${summaryInfo.steps.join(' / ')}`);
        }
        if (summaryInfo.error && analysisSuccess) {
            summarySegments.push(`提示：${summaryInfo.error}`);
        }
        const combinedSummary = summarySegments.length > 0 ? summarySegments.join('\n') : reason;
        const statusState = analysisSuccess ? 'success' : 'error';
        const statusLabel = analysisSuccess ? '✅ 意图识别完成' : '⚠️ 意图识别失败';

        this.updateIntentStatus(containerDiv, statusLabel, statusState);
        this.updateIntentSummary(containerDiv, combinedSummary, statusState);

        if (dom.llmWindow) {
            dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;
        }
    }

    parseIntentSummary(phase2Result) {
        if (!phase2Result) {
            return { summary: '', question: '', steps: [], error: '', raw: '' };
        }

        const summaryXml = phase2Result.summary_xml || '';
        const summaryMatch = summaryXml.match(/<summary>([\s\S]*?)<\/summary>/i);
        const questionMatch = summaryXml.match(/<true_question>([\s\S]*?)<\/true_question>/i);
        const stepMatches = [...summaryXml.matchAll(/<step>([\s\S]*?)<\/step>/gi)];
        const steps = stepMatches.map(match => match[1].trim()).filter(Boolean);
        const error = phase2Result.success ? '' : (phase2Result.error || '意图识别失败');

        return {
            summary: summaryMatch ? summaryMatch[1].trim() : '',
            question: questionMatch ? questionMatch[1].trim() : '',
            steps,
            error,
            raw: summaryXml
        };
    }


    displayIntentAnalysisError(containerDiv, message) {
        if (!containerDiv) return;
        this.updateIntentStatus(containerDiv, '⚠️ 意图识别失败', 'error');
        this.updateIntentSummary(containerDiv, message || '未知错误', 'error');
    }

    // 直接发送到LLM（不经过意图识别）
    async sendDirectlyToLLM(wsManager, text) {
        try {
            if (wsManager && wsManager.llmSocket && wsManager.llmSocket.readyState === WebSocket.OPEN) {
                console.log('[LLM] WebSocket已连接');
                const isMulti = dom.multiLLMToggle?.classList.contains('active') || false;
                console.log('[LLM] 智囊团模式:', isMulti);

                // Reset stream state
                if (this.streamManager) {
                    this.streamManager.clearLLMState();
                }

                // 创建预响应提示
                if (this.streamManager) {
                    this.streamManager.createPreResponse(
                        isMulti,
                        window.multiLLMActiveNames || new Set(),
                        {
                            currentConfigName: window.currentConfigName || '',
                            resolveDisplayName: window.resolveConfigDisplayName
                        }
                    );
                }

                const payload = this.buildLLMPayload(isMulti);
                console.log('[LLM] 发送载荷:', payload);

                const success = wsManager.sendToLLM(payload);

                if (!success) {
                    console.log('[LLM] 发送失败: sendToLLM返回false');
                    showToast("LLM 服务未连接", 'error');
                    this.isProcessing = false;
                } else {
                    console.log('[LLM] 发送成功');
                }
            } else {
                console.log('[LLM] 发送失败: WebSocket未连接');
                showToast("LLM 服务未连接", 'error');
                this.isProcessing = false;
            }
        } catch (error) {
            console.error('[LLM] 发送消息失败:', error);
            showToast("发送消息失败", 'error');
            this.isProcessing = false;
        }
    }

    buildLLMPayload(isMulti) {
        const intentData = window.latestIntentAnalysis?.phase2 || window.latestIntentAnalysis || null;
        const intentMessages = this.composeIntentOnlyMessages(intentData);
        const payload = {
            messages: intentMessages || this.chatHistory,
            chat_id: this.currentChatId,
            is_multi_llm: isMulti,
            intent_data: intentData || null
        };
        payload.context_mode = intentMessages ? 'intent_only' : 'full_chat';
        return payload;
    }

    composeIntentOnlyMessages(intentData) {
        if (!intentData || !(intentData.summary_xml || intentData.raw_response)) {
            return null;
        }
        const intentText = this.formatIntentForLLM(intentData);
        if (!intentText.trim()) {
            return null;
        }
        return [
            { role: 'system', content: '你是AI助手，根据意图识别结果直接提供技术解答与建议。' },
            { role: 'user', content: intentText }
        ];
    }

    formatIntentForLLM(intentData) {
        const summaryInfo = this.parseIntentSummary(intentData);
        const segments = [];
        if (summaryInfo.summary) {
            segments.push(`意图总结：${summaryInfo.summary}`);
        }
        if (summaryInfo.question) {
            segments.push(`真实问题：${summaryInfo.question}`);
        }
        if (summaryInfo.steps.length > 0) {
            segments.push('下一步行动：');
            summaryInfo.steps.forEach((step, index) => {
                segments.push(`${index + 1}. ${step}`);
            });
        }
        if (summaryInfo.error) {
            segments.push(`提示：${summaryInfo.error}`);
        }
        if (!segments.length) {
            return intentData.summary_xml || intentData.raw_response || '';
        }
        return segments.join('\n');
    }

    updateIntentModelInfo(containerDiv, intentConfig) {
        if (!containerDiv) return;
        const modelEl = containerDiv.querySelector('.intent-model');
        if (!modelEl) return;
        if (!intentConfig) {
            // 没有配置时，隐藏模型信息
            modelEl.style.display = 'none';
            return;
        }
        modelEl.style.display = 'block';
        modelEl.textContent = `调用模型：${intentConfig.model_type}/${intentConfig.model_name}`;
    }

    updateIntentStatus(containerDiv, text, state = 'progress') {
        if (!containerDiv) return;
        const statusEl = containerDiv.querySelector('.intent-status-text');
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.classList.remove(
            'intent-status-progress',
            'intent-status-success',
            'intent-status-error'
        );
        statusEl.classList.add(`intent-status-${state}`);
    }

    updateIntentSummary(containerDiv, text, state = 'success') {
        if (!containerDiv) return;
        const summaryEl = containerDiv.querySelector('.intent-summary');
        if (!summaryEl) return;
        const safeText = text && text.trim() ? text : '未获取到意图总结';
        summaryEl.style.display = 'block';
        summaryEl.classList.remove(
            'intent-summary-progress',
            'intent-summary-success',
            'intent-summary-error'
        );
        summaryEl.classList.add(`intent-summary-${state}`);
        summaryEl.innerHTML = `<div class="intent-summary-text">意图总结：${safeText}</div>`;
    }

    // 添加用户消息
    addUserMessage(text) {
        if (!dom.llmWindow) return;

        const userDiv = document.createElement('div');
        userDiv.className = 'message user';
        userDiv.innerHTML = `<div class="message-content">${text}</div>`;
        dom.llmWindow.appendChild(userDiv);
        dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;
    }

    // 添加助手消息
    addAssistantMessage(text, modelName = null) {
        if (!dom.llmWindow) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ai';

        const speakerName = modelName || 'AI 助手';
        const headerHtml = modelName
            ? `<div class="message-header"><span class="speaker-name">${speakerName}</span><span class="model-tag">${modelName}</span></div>`
            : `<div class="message-header"><span class="speaker-name">${speakerName}</span></div>`;

        msgDiv.innerHTML = `
            ${headerHtml}
            <div class="message-content">${text}</div>
        `;

        dom.llmWindow.appendChild(msgDiv);
        dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;

        // 添加到历史记录
        const content = modelName ? `**${modelName}**:\n${text}` : text;
        this.chatHistory.push({ role: "assistant", content });
    }

    // 设置当前聊天ID
    setCurrentChatId(chatId) {
        this.currentChatId = chatId;
    }

    // 获取聊天历史
    getChatHistory() {
        return this.chatHistory;
    }

    // 清空聊天历史
    clearHistory() {
        this.chatHistory = [];
        this.finishProcessing();
    }

    // 完成处理
    finishProcessing() {
        this.isProcessing = false;
    }

    // 检查是否正在处理
    isCurrentlyProcessing() {
        return this.isProcessing;
    }
}
