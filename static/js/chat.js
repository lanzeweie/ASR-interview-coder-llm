/* ========================================
   聊天管理逻辑
   ======================================== */

import { dom } from './dom.js';
import { showToast } from './utils.js';
import { renderMarkdown } from './markdown.js';

// ===== 聊天管理类 =====
export class ChatManager {
    constructor() {
        this.currentChatId = null;
        this.llmHistory = [];
        this.llmManager = null;
    }

    setLLMManager(llmManager) {
        this.llmManager = llmManager;
        if (!this.llmManager) return;
        if (this.currentChatId) {
            this.llmManager.setCurrentChatId(this.currentChatId);
        }
        if (typeof this.llmManager.replaceHistory === 'function') {
            this.llmManager.replaceHistory(this.llmHistory);
        }
    }

    _setActiveChat(chatId) {
        this.currentChatId = chatId;
        if (this.llmManager) {
            this.llmManager.setCurrentChatId(chatId);
        }
    }

    _syncLLMHistory(history = this.llmHistory) {
        if (this.llmManager && typeof this.llmManager.replaceHistory === 'function') {
            const safeHistory = Array.isArray(history) ? history : [];
            this.llmManager.replaceHistory(safeHistory);
        }
    }

    // 加载聊天列表
    async loadChatList() {
        try {
            const res = await fetch('/api/chats');
            const data = await res.json();

            if (!this.currentChatId && data.current_chat_id) {
                this._setActiveChat(data.current_chat_id);
                this.loadChatMessages(this.currentChatId);
            } else if (!this.currentChatId && data.chats.length > 0) {
                this._setActiveChat(data.chats[0].id);
                this.loadChatMessages(this.currentChatId);
            } else if (!this.currentChatId && data.chats.length === 0) {
                await this.createNewChat();
                return;
            }

            this.renderChatList(data.chats);
        } catch (e) {
            console.error('加载聊天列表失败:', e);
        }
    }

    // 渲染聊天列表
    renderChatList(chats) {
        if (!dom.chatListDiv) return;

        dom.chatListDiv.innerHTML = '';

        chats.forEach(chat => {
            const item = document.createElement('div');
            item.className = `chat-item ${chat.id === this.currentChatId ? 'active' : ''}`;
            item.innerHTML = `<span class="chat-title">${chat.title}</span><button class="delete-chat-btn">&times;</button>`;

            item.onclick = (e) => {
                if (e.target.classList.contains('delete-chat-btn')) return;
                if (chat.id !== this.currentChatId) {
                    this.switchToChat(chat.id);
                }
            };

            item.querySelector('.delete-chat-btn').onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`确定删除对话 "${chat.title}" 吗?`)) {
                    await this.deleteChat(chat.id);
                }
            };

            dom.chatListDiv.appendChild(item);
        });
    }

    // 切换到指定聊天
    async switchToChat(chatId) {
        this._setActiveChat(chatId);
        await this.loadChatMessages(chatId);
        await this.loadChatList(); // 刷新列表以更新活动状态
    }

    // 创建新聊天
    async createNewChat() {
        try {
            const res = await fetch('/api/chats', {
                method: 'POST',
                body: JSON.stringify({
                    title: "新对话 " + new Date().toLocaleTimeString()
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            const newChat = await res.json();

            this._setActiveChat(newChat.id);
            this.llmHistory = [];
            this._syncLLMHistory([]);

            if (dom.llmWindow) {
                dom.llmWindow.innerHTML = '';
            }

            this.addSystemWelcome();
            await this.loadChatList();
        } catch (e) {
            showToast("创建对话失败", 'error');
        }
    }

    // 删除聊天
    async deleteChat(chatId) {
        await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });

        if (this.currentChatId === chatId) {
            this._setActiveChat(null);
            this.llmHistory = [];
            this._syncLLMHistory([]);
            if (dom.llmWindow) {
                dom.llmWindow.innerHTML = '';
            }
        }

        await this.loadChatList();
    }

    // 加载聊天消息
    async loadChatMessages(chatId) {
        const res = await fetch(`/api/chats/${chatId}`);
        const chat = await res.json();

        this._setActiveChat(chatId);
        this.llmHistory = [];
        this._syncLLMHistory([]);

        if (dom.llmWindow) {
            dom.llmWindow.innerHTML = '';
        }

        if (chat.messages && chat.messages.length > 0) {
            chat.messages.forEach(msg => {
                if (msg.role === 'system') return;

                this.llmHistory.push(msg);
                this.renderMessage(msg);
            });
        }
        this._syncLLMHistory(this.llmHistory);

        // 无论是否有历史消息，都添加欢迎语以反映当前功能状态
        this.addSystemWelcome();

        if (dom.llmWindow) {
            dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;
        }
    }

    // 渲染单条消息
    renderMessage(msg) {
        if (!dom.llmWindow) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.role === 'assistant' ? 'ai' : 'user'}`;

        if (msg.role === 'assistant') {
            // Try to extract model name if formatted as **Name**: Content
            let content = msg.content;
            let modelName = null;
            const match = content.match(/^\*\*([^*]+)\*\*:\n([\s\S]*)/);

            if (match) {
                modelName = match[1];
                content = match[2];
            }

            // 使用当前模型配置名称显示
            // 智囊团时使用modelName，单模型时使用当前配置
            const speakerName = modelName || 'AI 助手';

            const header = document.createElement('div');
            header.className = 'message-header';
            header.innerHTML = modelName
                ? `<span class="speaker-name">${speakerName}</span><span class="model-tag">${modelName}</span>`
                : `<span class="speaker-name">${speakerName}</span>`;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content llm-markdown';
            renderMarkdown(contentDiv, content);

            msgDiv.appendChild(header);
            msgDiv.appendChild(contentDiv);
        } else {
            msgDiv.innerHTML = `<div class="message-content">${msg.content}</div>`;
        }

        dom.llmWindow.appendChild(msgDiv);
    }

    // 添加系统欢迎消息
    addSystemWelcome() {
        // 构建动态欢迎消息
        let welcomeText = '你好！';
        welcomeText += '你可以直接跟我对话，或者从左侧发送语音记录让我分析。';

        // 检查智囊团状态
        const isMultiMode = dom.multiLLMToggle?.classList.contains('active');
        if (isMultiMode) {
            const activeCount = window.multiLLMActiveNames?.size || 0;
            welcomeText += ` 智囊团已开启，现在你的消息会有${activeCount}个模型帮你同时分析呢。`;
        }

        // 检查智能分析状态
        const isAgentActive = dom.agentToggleBtn?.classList.contains('active');
        if (isAgentActive) {
            welcomeText += ' 智能分析已启动，我会跟语音情况来分析问题哦，记得设置主人公哦，一切回答以主人公的有利形势展开。';
        }

        // 检查意图识别状态 - 使用全局变量判断
        const isIntentRecognitionActive = window.intentRecognitionEnabled === true;
        if (isIntentRecognitionActive) {
            welcomeText += ' 意图识别已开启，我会先从信息中分析后，再进行助手回答。';
        }

        welcomeText += ' 选中任意文本也可以快速提问哦！';

        if (dom.llmWindow) {
            dom.llmWindow.innerHTML += `<div class="message system-message"><div class="message-content">${welcomeText}</div></div>`;
        }
    }

    // 更新欢迎语（当功能状态改变时调用）
    updateWelcomeMessage() {
        if (!dom.llmWindow) return;

        // 查找当前的欢迎消息
        const welcomeMsgs = dom.llmWindow.querySelectorAll('.message.system-message');
        welcomeMsgs.forEach(msg => {
            // 删除所有旧的欢迎语
            msg.remove();
        });

        // 重新添加欢迎语
        this.addSystemWelcome();
    }

    // 清空当前聊天
    async clearCurrentChat() {
        if (!this.currentChatId) return;

        try {
            await fetch(`/api/chats/${this.currentChatId}/clear`, { method: 'POST' });
            this.llmHistory = [];
            this._syncLLMHistory([]);

            if (dom.llmWindow) {
                dom.llmWindow.innerHTML = '';
            }

            this.addSystemWelcome();
            showToast("对话记录已清空", 'success');
        } catch (e) {
            showToast("清空失败", 'error');
        }
    }

    // 添加用户消息
    addUserMessage(text) {
        if (!dom.llmWindow) return;

        const userDiv = document.createElement('div');
        userDiv.className = 'message user';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = text;
        userDiv.appendChild(contentDiv);
        dom.llmWindow.appendChild(userDiv);
        dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;

        this.llmHistory.push({ role: "user", content: text });
        this._syncLLMHistory();
    }

    // 添加助手消息
    addAssistantMessage(text, modelName = null) {
        if (!dom.llmWindow) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ai';

        const speakerName = modelName || 'AI 助手';
        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML = modelName
            ? `<span class="speaker-name">${speakerName}</span><span class="model-tag">${modelName}</span>`
            : `<span class="speaker-name">${speakerName}</span>`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content llm-markdown';
        renderMarkdown(contentDiv, text);

        msgDiv.appendChild(header);
        msgDiv.appendChild(contentDiv);

        dom.llmWindow.appendChild(msgDiv);
        dom.llmWindow.scrollTop = dom.llmWindow.scrollHeight;

        // 添加到历史记录
        const content = modelName ? `**${modelName}**:\n${text}` : text;
        this.llmHistory.push({ role: "assistant", content });
        this._syncLLMHistory();
    }

    // 获取当前聊天ID
    getCurrentChatId() {
        return this.currentChatId;
    }

    // 获取聊天历史
    getChatHistory() {
        return this.llmHistory;
    }

    // 清空聊天历史
    clearHistory() {
        this.llmHistory = [];
        this._syncLLMHistory([]);
    }

    // 发送语音记录到AI
    sendVoiceRecordsToAI(sendToLLM) {
        console.log('[发送全部到AI] sendVoiceRecordsToAI 被调用');
        if (!dom.asrWindow) {
            console.error('[发送全部到AI] ASR窗口不存在');
            return;
        }

        // 提取完整的消息信息（说话人、时间、内容）
        const messageElements = dom.asrWindow.querySelectorAll('.message');
        const formattedMessages = [];

        messageElements.forEach(msgEl => {
            // 跳过系统消息（如果有特殊标识）
            if (msgEl.classList.contains('system-message') && !msgEl.classList.contains('agent-analysis')) {
                return;
            }

            // 提取时间（如果存在）
            const timeEl = msgEl.querySelector('.timestamp');
            const time = timeEl ? timeEl.textContent.trim() : '';

            // 提取说话人（如果存在）
            const speakerEl = msgEl.querySelector('.speaker-name');
            const speaker = speakerEl ? speakerEl.textContent.trim() : '未知';

            // 提取内容（兼容 .content 和 .message-content）
            const contentEl = msgEl.querySelector('.content, .message-content');
            const content = contentEl ? contentEl.textContent.trim() : '';

            if (content) {
                // 格式：[时间] 说话人: 内容
                const formattedMessage = time ? `[${time}] ${speaker}: ${content}` : `${speaker}: ${content}`;
                formattedMessages.push(formattedMessage);
            }
        });

        console.log('[发送全部到AI] 提取到消息数量:', formattedMessages.length);
        console.log('[发送全部到AI] 格式化后的消息:', formattedMessages);

        if (formattedMessages.length === 0) {
            console.log('[发送全部到AI] 没有语音记录可发送');
            showToast("没有语音记录可发送", 'info');
            return;
        }

        // 添加智能分析消息（如果有）
        const agentMessages = Array.from(dom.asrWindow.querySelectorAll('.message.agent-analysis .message-content'))
            .map(el => {
                const text = el.textContent.trim();
                return text ? `[系统] ${text}` : '';
            })
            .filter(text => text);

        if (agentMessages.length > 0) {
            formattedMessages.push(...agentMessages);
        }

        const combinedText = "以下是语音转写的聊天记录：\n" + formattedMessages.join("\n");
        console.log('[发送全部到AI] 合并后的文本:', combinedText);
        sendToLLM(combinedText);
    }
}
