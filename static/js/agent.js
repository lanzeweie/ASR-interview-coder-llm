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
            // Add User Message
            this.addUserMessage(text);

            this.chatHistory.push({ role: "user", content: text });

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

                const payload = {
                    messages: this.chatHistory,
                    chat_id: this.currentChatId,
                    is_multi_llm: isMulti
                };
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