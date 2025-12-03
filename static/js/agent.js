/* ========================================
   智能分析功能
   ======================================== */

import { dom } from './dom.js';
import { showToast } from './utils.js';

// ===== 智能分析管理类 =====
export class AgentManager {
    constructor() {
        this.enabled = false;
        this.status = null;
    }

    // 初始化智能分析状态
    async initAgentStatus() {
        try {
            const response = await fetch('/api/agent/status');
            const data = await response.json();

            if (data.available) {
                // 检查是否有保存的UI状态
                const savedState = localStorage.getItem('ast_ui_state');
                const hasSavedUIState = savedState && JSON.parse(savedState).agentToggleActive !== undefined;

                // 如果没有保存的UI状态，则使用API状态
                if (!hasSavedUIState) {
                    this.enabled = data.enabled || false;
                    this.updateAgentToggleUI();
                    this.updateAgentStatusIndicator();
                    if (dom.agentToggleBtn) {
                        dom.agentToggleBtn.title = this.enabled ? '智能分析已开启，点击关闭' : '智能分析已关闭，点击开启';
                    }
                } else {
                    // 有保存的UI状态，使用API状态更新后端状态，但保持UI显示
                    this.enabled = data.enabled || false;
                    console.log('智能分析状态：API=' + this.enabled + ', UI已恢复=' + (JSON.parse(savedState).agentToggleActive ? '开启' : '关闭'));
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

    // 切换意图识别状态
    async toggle() {
        this.enabled = !this.enabled;
        this.updateIntentRecognitionIndicator();
        return this.enabled;
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
        this.enabled = false;
        this.updateIntentRecognitionIndicator();
    }
}

// ===== LLM管理器（与WebSocketManager配合） =====
export class LLMManager {
    constructor() {
        this.chatHistory = [];
        this.currentChatId = null;
        this.isProcessing = false;
        this.streamManager = null;
    }

    // 设置流管理器
    setStreamManager(streamManager) {
        this.streamManager = streamManager;
    }

    // 设置WebSocket管理器
    setWebSocketManager(wsManager) {
        this.wsManager = wsManager;
    }

    // 处理LLM消息
    handleLLMMessage(data) {
        if (!this.streamManager) return;

        if (data.type === 'chunk') {
            const model = data.model || 'default';
            const div = this.streamManager.getOrCreateResponseDiv(model, window.currentDisplayName || window.currentConfigName);
            const contentDiv = div.querySelector('.content');

            // 如果是预响应提示，需要先清除"正在输入"文本
            if (contentDiv.dataset.isPreResponse === 'true') {
                contentDiv.textContent = '';
                contentDiv.dataset.isPreResponse = 'false';
                // 移除thinking样式
                contentDiv.classList.remove('thinking');
            }

            contentDiv.textContent += data.content;

            // Update buffer
            if (!this.streamManager.activeResponseBuffers[model]) {
                this.streamManager.activeResponseBuffers[model] = "";
            }
            this.streamManager.activeResponseBuffers[model] += data.content;

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
                // Single mode legacy
                this.chatHistory.push({ role: "assistant", content: data.full_text });
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

            // 显示触发通知
            showToast(`智能分析已触发: ${reason}`, 'info');

            // 关键修复：将触发消息发送回服务器以启动 LLM 生成
            if (this.wsManager) {
                console.log('[智能分析] 正在请求服务器开始生成回复...');

                // 创建预响应提示 (Visual feedback)
                const isMulti = data.is_multi_llm || false;
                if (this.streamManager) {
                    // 清除旧状态
                    this.streamManager.clearLLMState();
                    // 创建新的预响应
                    this.streamManager.createPreResponse(
                        isMulti,
                        window.multiLLMActiveNames || new Set(),
                        window.currentDisplayName || window.currentConfigName || ''
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
            // 1. 更新本地聊天历史，供后续流程使用
            this.chatHistory.push({ role: "user", content: text });

            // 2. 准备对话历史（用于意图识别）
            const messages = [...this.chatHistory];

            // 3. 显示意图识别中...
            analyzingDiv = document.createElement('div');
            analyzingDiv.className = 'message system-message intent-analysis';
            const analysisId = `intent-analysis-${Date.now()}`;
            analyzingDiv.dataset.analysisId = analysisId;
            analyzingDiv.innerHTML = `
                <div class="message-content intent-analysis-card">
                    <div class="intent-header">
                        <div class="intent-status-text">🤔 正在进行意图识别...</div>
                        <div class="intent-progress-dot pulse"></div>
                    </div>
                    <div class="intent-steps">
                        ${this.renderIntentStep('collect', '1. 收集上下文', true)}
                        ${this.renderIntentStep('analyze', '2. 调用模型')}
                        ${this.renderIntentStep('summarize', '3. 生成结论')}
                    </div>
                    <div class="intent-log"></div>
                    <div class="intent-result" style="display: none;"></div>
                </div>
            `;
            if (dom.llmWindow) {
                dom.llmWindow.appendChild(analyzingDiv);
                dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;
            }
            this.setIntentAnalysisStep(analyzingDiv, 'collect');
            this.appendIntentAnalysisLog(analyzingDiv, `上下文收集完成（${messages.length} 条消息）`);

            // 4. 调用意图识别API（使用后端的 /api/agent/analyze 端点）
            console.log('[LLM] 调用智能分析API...');
            // 获取意图识别配置
            const intentConfig = window.intentRecognitionConfig || { model_type: 'local', model_name: 'Qwen3-0.6B' };
            console.log('[LLM] 意图识别配置:', intentConfig);
            this.setIntentAnalysisStep(analyzingDiv, 'analyze');
            this.appendIntentAnalysisLog(analyzingDiv, `准备调用模型：${intentConfig.model_type}/${intentConfig.model_name}`);

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
             this.setIntentAnalysisStep(analyzingDiv, 'summarize');
             this.appendIntentAnalysisLog(analyzingDiv, '模型返回结果，正在生成结论...');

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
        if (!containerDiv || !dom.llmWindow) return;

        // 提取结果信息
        const phase1Result = result.phase1 || result || {};
        const phase2Result = result.phase2 || result || {};
        const summaryInfo = this.parseIntentSummary(phase2Result);
        const analysisSuccess = phase2Result.success !== false;
        const summaryDetected = summaryInfo.summary && summaryInfo.summary !== '未检测到技术问题';
        const reason = phase1Result.reason || (phase2Result.error || '意图识别完成');

        const summarySegments = [];
        if (summaryInfo.summary) {
            summarySegments.push(`意图总结：${summaryInfo.summary}`);
        }
        if (summaryInfo.question) {
            summarySegments.push(`用户真正的问题：${summaryInfo.question}`);
        }
        if (summaryInfo.steps.length > 0) {
            summarySegments.push(`下一步行动：${summaryInfo.steps.join(' / ')}`);
        }
        if (summaryInfo.error) {
            summarySegments.push(`提示：${summaryInfo.error}`);
        }
        const combinedSummary = summarySegments.length > 0 ? summarySegments.join('\n') : reason;

        let icon = 'ℹ️';
        let statusClass = 'intent-neutral';
        if (!analysisSuccess) {
            icon = '⚠️';
            statusClass = 'intent-error';
        } else if (summaryDetected) {
            icon = '✅';
            statusClass = 'intent-positive';
        }

        if (containerDiv) {
            const headerText = containerDiv.querySelector('.intent-status-text');
            const progressDot = containerDiv.querySelector('.intent-progress-dot');
            if (headerText) {
                headerText.textContent = icon === '⚠️' ? '⚠️ 意图识别失败' : `${icon} 意图识别完成`;
                headerText.classList.add(statusClass);
            }
            if (progressDot) {
                progressDot.classList.remove('pulse');
                progressDot.classList.add('completed');
            }

            const resultSection = containerDiv.querySelector('.intent-result');
            if (resultSection) {
                const detailsId = `${containerDiv.dataset.analysisId || 'intent'}-details`;
                resultSection.style.display = 'block';
                resultSection.innerHTML = `
                    <div class="intent-summary ${statusClass}">
                        <div class="intent-summary-text">${combinedSummary}</div>
                        <button class="intent-toggle-btn" data-expanded="false" aria-expanded="false">展开分析</button>
                    </div>
                    <div class="intent-details collapsed" id="${detailsId}">
                        ${this.buildIntentDetailContent(phase1Result, summaryInfo)}
                    </div>
                `;

                const toggleBtn = resultSection.querySelector('.intent-toggle-btn');
                const detailsEl = resultSection.querySelector('.intent-details');
                if (toggleBtn && detailsEl) {
                    toggleBtn.addEventListener('click', () => {
                        const expanded = toggleBtn.getAttribute('data-expanded') === 'true';
                        toggleBtn.setAttribute('data-expanded', (!expanded).toString());
                        toggleBtn.setAttribute('aria-expanded', (!expanded).toString());
                        detailsEl.classList.toggle('collapsed', expanded);
                        toggleBtn.textContent = expanded ? '展开分析' : '收起分析';
                    });
                }
            }

            this.markIntentAnalysisDone(containerDiv);
        }

        dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;
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

    renderIntentStep(step, label, active = false) {
        return `
            <div class="intent-step ${active ? 'active' : ''}" data-step="${step}">
                <span class="intent-step-label">${label}</span>
            </div>
        `;
    }

    setIntentAnalysisStep(containerDiv, stage) {
        if (!containerDiv) return;
        const stages = ['collect', 'analyze', 'summarize'];
        const targetIndex = stages.indexOf(stage);
        const steps = containerDiv.querySelectorAll('.intent-step');
        steps.forEach(stepEl => {
            const idx = stages.indexOf(stepEl.dataset.step);
            stepEl.classList.remove('active', 'completed');
            if (idx < targetIndex) {
                stepEl.classList.add('completed');
            } else if (idx === targetIndex) {
                stepEl.classList.add('active');
            }
        });
    }

    markIntentAnalysisDone(containerDiv) {
        if (!containerDiv) return;
        const steps = containerDiv.querySelectorAll('.intent-step');
        steps.forEach(stepEl => {
            stepEl.classList.remove('active');
            stepEl.classList.add('completed');
        });
    }

    appendIntentAnalysisLog(containerDiv, text) {
        if (!containerDiv) return;
        const logContainer = containerDiv.querySelector('.intent-log');
        if (!logContainer) return;
        const entry = document.createElement('div');
        entry.className = 'intent-log-entry';
        entry.textContent = text;
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    buildIntentDetailContent(phase1Result, summaryInfo) {
        const rows = [];
        const hidePhase1 = phase1Result.intent_only === true;
        if (!hidePhase1) {
            const statusText = phase1Result.is ? '需要 AI 介入' : '普通对话';
            rows.push(this.renderIntentDetailRow('判定', statusText));
            if (phase1Result.reason) {
                rows.push(this.renderIntentDetailRow('理由', phase1Result.reason));
            }
            if (typeof phase1Result.confidence === 'number') {
                rows.push(this.renderIntentDetailRow('置信度', `${Math.round(phase1Result.confidence * 100)}%`));
            }
        }
        if (summaryInfo.summary) {
            rows.push(this.renderIntentDetailRow('意图总结', summaryInfo.summary));
        }
        if (summaryInfo.question) {
            rows.push(this.renderIntentDetailRow('真实问题', summaryInfo.question));
        }
        if (summaryInfo.steps.length > 0) {
            const stepsHtml = summaryInfo.steps.map(item => `<li>${item}</li>`).join('');
            rows.push(`
                <div class="intent-detail-row">
                    <div class="intent-detail-label">下一步行动</div>
                    <ul class="intent-outline">${stepsHtml}</ul>
                </div>
            `);
        }
        if (summaryInfo.error) {
            rows.push(this.renderIntentDetailRow('提示', summaryInfo.error));
        }
        return rows.join('') || '<div class="intent-detail-row">暂无额外信息</div>';
    }

    renderIntentDetailRow(label, value) {
        return `
            <div class="intent-detail-row">
                <div class="intent-detail-label">${label}</div>
                <div class="intent-detail-value">${value}</div>
            </div>
        `;
    }

    displayIntentAnalysisError(containerDiv, message) {
        if (!containerDiv) return;
        const headerText = containerDiv.querySelector('.intent-status-text');
        const progressDot = containerDiv.querySelector('.intent-progress-dot');
        if (headerText) {
            headerText.textContent = '⚠️ 意图识别失败';
            headerText.classList.add('intent-error');
        }
        if (progressDot) {
            progressDot.classList.remove('pulse');
            progressDot.classList.add('completed');
        }
        this.appendIntentAnalysisLog(containerDiv, `失败原因：${message}`);
        const resultSection = containerDiv.querySelector('.intent-result');
        if (resultSection) {
            resultSection.style.display = 'block';
            resultSection.innerHTML = `
                <div class="intent-summary intent-error">
                    <div class="intent-summary-text">${message}</div>
                </div>
            `;
        }
        this.markIntentAnalysisDone(containerDiv);
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
                    this.streamManager.createPreResponse(isMulti, window.multiLLMActiveNames || new Set(), window.currentDisplayName || window.currentConfigName || '');
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
