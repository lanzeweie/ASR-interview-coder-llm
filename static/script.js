/* ========================================
   AST Frontend - 精致技术美学
   JavaScript 核心逻辑
   ======================================== */

// ===== DOM 元素获取 =====
const asrWindow = document.getElementById('asr-window');
const asrStatusDiv = document.getElementById('asr-status');
const llmWindow = document.getElementById('llm-window');
const llmInput = document.getElementById('llm-input');
const llmSendBtn = document.getElementById('llm-send-btn');
const sendAllBtn = document.getElementById('send-all-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModalBtn = document.querySelector('.close-btn');
const saveConfigBtn = document.getElementById('save-config-btn');
const deleteConfigBtn = document.getElementById('delete-config-btn');
const testConnBtn = document.getElementById('test-conn-btn');
const configSelect = document.getElementById('config-select');
const configNameInput = document.getElementById('config-name');
const apiBaseInput = document.getElementById('api-base');
const apiKeyInput = document.getElementById('api-key');
const modelNameInput = document.getElementById('model-name');
const floatSendBtn = document.getElementById('float-send-btn');
const llmStatusDiv = document.getElementById('llm-status');

// 聊天管理 DOM
const chatListDiv = document.getElementById('chat-list');
const newChatBtn = document.getElementById('new-chat-btn');
const clearLlmBtn = document.getElementById('clear-llm-btn');
const clearAsrBtn = document.getElementById('clear-asr-btn');

// Toast 容器
const toastContainer = document.getElementById('toast-container');

// ===== 全局状态 =====
let asrSocket;
let llmSocket;
let configs = [];
let currentConfigName = "";
let llmHistory = [];
let currentChatId = null;

// ===== 面板调节状态 =====
const resizeState = {
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
        maxWidth: window.innerWidth * 0.6, // 最大宽度限制
        isResizing: false
    }
};

// ===== Toast 通知系统 =====
function showToast(message, type = 'info') {
    if (!toastContainer) {
        console.error('Toast container not found');
        return;
    }

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

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%) scale(0.9)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== WebSocket: ASR 连接与处理 =====
function connectASR() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    asrSocket = new WebSocket(wsUrl);

    asrSocket.onopen = () => {
        updateStatus(asrStatusDiv, true);
        showToast('ASR 服务已连接', 'success');
    };

    asrSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            addASRMessage(data);
        } catch (error) {
            console.error('Failed to parse ASR message:', error);
        }
    };

    asrSocket.onclose = () => {
        updateStatus(asrStatusDiv, false);
        showToast('ASR 连接断开，正在重连...', 'error');
        setTimeout(connectASR, 3000);
    };

    asrSocket.onerror = (error) => {
        console.error('ASR WebSocket error:', error);
        updateStatus(asrStatusDiv, false);
    };
}

function addASRMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    headerDiv.innerHTML = `<span class="speaker-name">${data.speaker}</span><span class="timestamp">${data.time}</span>`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    contentDiv.textContent = data.text;

    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    asrWindow.appendChild(messageDiv);
    asrWindow.scrollTop = asrWindow.scrollHeight;
}

// ===== WebSocket: LLM 连接与处理 =====
function connectLLM() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/llm`;

    llmSocket = new WebSocket(wsUrl);

    llmSocket.onopen = () => {
        console.log("LLM WebSocket Connected");
        updateStatus(llmStatusDiv, true);
    };

    llmSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleLLMMessage(data);
        } catch (error) {
            console.error('Failed to parse LLM message:', error);
        }
    };

    llmSocket.onclose = () => {
        console.log("LLM WebSocket Disconnected, retrying...");
        updateStatus(llmStatusDiv, false);
        setTimeout(connectLLM, 3000);
    };

    llmSocket.onerror = (error) => {
        console.error('LLM WebSocket error:', error);
        updateStatus(llmStatusDiv, false);
    };
}

let currentAIResponseDiv = null;
let currentAIContentDiv = null;
let thinkingDiv = null;

function showThinking() {
    if (thinkingDiv) return;
    thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'message ai';
    thinkingDiv.innerHTML = `
        <div class="message-header"><span class="speaker-name">AI 助手</span></div>
        <div class="content"><div class="thinking-dots"><span></span><span></span><span></span></div></div>
    `;
    llmWindow.appendChild(thinkingDiv);
    llmWindow.scrollTop = llmWindow.scrollHeight;
}

function removeThinking() {
    if (thinkingDiv) {
        thinkingDiv.remove();
        thinkingDiv = null;
    }
}

function handleLLMMessage(data) {
    if (data.type === 'chunk') {
        removeThinking();

        if (!currentAIResponseDiv) {
            currentAIResponseDiv = document.createElement('div');
            currentAIResponseDiv.className = 'message ai';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'message-header';
            headerDiv.innerHTML = `<span class="speaker-name">AI 助手</span>`;

            currentAIContentDiv = document.createElement('div');
            currentAIContentDiv.className = 'content';

            currentAIResponseDiv.appendChild(headerDiv);
            currentAIResponseDiv.appendChild(currentAIContentDiv);
            llmWindow.appendChild(currentAIResponseDiv);
        }
        currentAIContentDiv.textContent += data.content;
        llmWindow.scrollTop = llmWindow.scrollHeight;
    } else if (data.type === 'done') {
        removeThinking();
        llmHistory.push({ role: "assistant", content: data.full_text });
        currentAIResponseDiv = null;
        currentAIContentDiv = null;
        loadChatList();
    } else if (data.type === 'error') {
        removeThinking();
        showToast("LLM 错误: " + data.content, 'error');

        const errorDiv = document.createElement('div');
        errorDiv.className = 'message system-message';
        errorDiv.innerHTML = `<div class="message-content" style="color: var(--color-error)">❌ ${data.content}</div>`;
        llmWindow.appendChild(errorDiv);

        currentAIResponseDiv = null;
    }
}

function sendToLLM(text) {
    if (!text.trim()) return;

    const userDiv = document.createElement('div');
    userDiv.className = 'message user';
    userDiv.innerHTML = `<div class="message-content">${text}</div>`;
    llmWindow.appendChild(userDiv);
    llmWindow.scrollTop = llmWindow.scrollHeight;

    llmHistory.push({ role: "user", content: text });

    if (llmSocket && llmSocket.readyState === WebSocket.OPEN) {
        showThinking();
        llmSocket.send(JSON.stringify({
            messages: llmHistory,
            chat_id: currentChatId
        }));
    } else {
        showToast("LLM 服务未连接", 'error');
    }
}

// ===== 状态更新 =====
function updateStatus(statusDiv, connected) {
    if (!statusDiv) return;

    if (connected) {
        statusDiv.className = 'status connected';
        statusDiv.querySelector('.status-text').textContent = '已连接';
    } else {
        statusDiv.className = 'status disconnected';
        statusDiv.querySelector('.status-text').textContent = '未连接';
    }
}

// ===== 聊天管理逻辑 =====
async function loadChatList() {
    try {
        const res = await fetch('/api/chats');
        const data = await res.json();

        if (!currentChatId && data.current_chat_id) {
            currentChatId = data.current_chat_id;
            loadChatMessages(currentChatId);
        } else if (!currentChatId && data.chats.length > 0) {
            currentChatId = data.chats[0].id;
            loadChatMessages(currentChatId);
        } else if (!currentChatId && data.chats.length === 0) {
            createNewChat();
            return;
        }

        renderChatList(data.chats);
    } catch (e) {
        console.error("Failed to load chat list", e);
        showToast('加载聊天列表失败', 'error');
    }
}

function renderChatList(chats) {
    chatListDiv.innerHTML = '';
    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.innerHTML = `
            <span class="chat-title">${chat.title}</span>
            <button class="delete-chat-btn" title="删除对话">&times;</button>
        `;

        item.onclick = (e) => {
            if (e.target.classList.contains('delete-chat-btn')) return;
            if (chat.id !== currentChatId) {
                currentChatId = chat.id;
                loadChatMessages(chat.id);
                loadChatList();
            }
        };

        const deleteBtn = item.querySelector('.delete-chat-btn');
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`确定删除对话 "${chat.title}" 吗?`)) {
                await deleteChat(chat.id);
            }
        };

        chatListDiv.appendChild(item);
    });
}

async function createNewChat() {
    try {
        const res = await fetch('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: "新对话 " + new Date().toLocaleTimeString() })
        });
        const newChat = await res.json();
        currentChatId = newChat.id;
        llmHistory = [];
        llmWindow.innerHTML = '';
        addSystemWelcome();
        loadChatList();
    } catch (e) {
        showToast("创建对话失败", 'error');
    }
}

async function deleteChat(chatId) {
    try {
        await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
        if (currentChatId === chatId) {
            currentChatId = null;
            llmHistory = [];
            llmWindow.innerHTML = '';
        }
        loadChatList();
    } catch (e) {
        showToast("删除对话失败", 'error');
    }
}

async function loadChatMessages(chatId) {
    try {
        const res = await fetch(`/api/chats/${chatId}`);
        const chat = await res.json();

        llmHistory = [];
        llmWindow.innerHTML = '';

        if (chat.messages && chat.messages.length > 0) {
            chat.messages.forEach(msg => {
                if (msg.role === 'system') return;

                llmHistory.push(msg);

                const msgDiv = document.createElement('div');
                msgDiv.className = `message ${msg.role === 'assistant' ? 'ai' : 'user'}`;

                if (msg.role === 'assistant') {
                    msgDiv.innerHTML = `
                        <div class="message-header"><span class="speaker-name">AI 助手</span></div>
                        <div class="message-content">${msg.content}</div>
                    `;
                } else {
                    msgDiv.innerHTML = `<div class="message-content">${msg.content}</div>`;
                }
                llmWindow.appendChild(msgDiv);
            });
        } else {
            addSystemWelcome();
        }

        llmWindow.scrollTop = llmWindow.scrollHeight;
    } catch (e) {
        console.error("Failed to load chat messages", e);
        showToast('加载聊天记录失败', 'error');
    }
}

function addSystemWelcome() {
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'message system-message';
    welcomeDiv.innerHTML = `<div class="message-content">你好！我是你的AI助手。你可以直接跟我对话，或者从左侧发送语音记录让我分析。选中任意文本也可以快速提问哦！</div>`;
    llmWindow.appendChild(welcomeDiv);
}

async function clearCurrentChat() {
    if (!currentChatId) return;
    if (!confirm("确定清空当前对话记录吗？")) return;

    try {
        await fetch(`/api/chats/${currentChatId}/clear`, { method: 'POST' });
        llmHistory = [];
        llmWindow.innerHTML = '';
        addSystemWelcome();
        showToast("对话记录已清空", 'success');
    } catch (e) {
        showToast("清空失败", 'error');
    }
}

// ===== 配置管理 =====
async function loadConfigs() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        configs = data.configs;
        currentConfigName = data.current_config;
        renderConfigSelect();
    } catch (e) {
        showToast("加载配置失败", 'error');
    }
}

function renderConfigSelect() {
    configSelect.innerHTML = '<option value="new">+ 新建配置</option>';
    configs.forEach(c => {
        const option = document.createElement('option');
        option.value = c.name;
        option.textContent = c.name;
        if (c.name === currentConfigName) option.selected = true;
        configSelect.appendChild(option);
    });

    if (currentConfigName) {
        configSelect.value = currentConfigName;
        populateConfigFields(currentConfigName);
    } else {
        configSelect.value = 'new';
        clearConfigFields();
    }
}

function populateConfigFields(name) {
    const config = configs.find(c => c.name === name);
    if (config) {
        configNameInput.value = config.name;
        apiBaseInput.value = config.base_url;
        apiKeyInput.value = config.api_key;
        modelNameInput.value = config.model;
        deleteConfigBtn.style.display = 'block';
    } else {
        clearConfigFields();
    }
}

function clearConfigFields() {
    configNameInput.value = "";
    apiBaseInput.value = "";
    apiKeyInput.value = "";
    modelNameInput.value = "";
    deleteConfigBtn.style.display = 'none';
}

// ===== 面板调节功能 =====
function initResizers() {
    const sidebarResizer = document.querySelector('.sidebar-resizer');
    const asrResizer = document.querySelector('.panel-resizer');

    if (sidebarResizer) {
        initResizer(sidebarResizer, 'sidebar');
    }

    if (asrResizer) {
        initResizer(asrResizer, 'asr');
    }
}

function initResizer(resizer, target) {
    const targetElement = document.getElementById(
        target === 'sidebar' ? 'sidebar' :
        target === 'asr' ? 'asr-panel' : ''
    );

    if (!targetElement) return;

    const state = resizeState[target];

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        state.isResizing = true;
        state.startX = e.clientX;
        state.startWidth = targetElement.offsetWidth;
        state.maxWidth = window.innerWidth * 0.6;

        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });

    function handleMouseMove(e) {
        if (!state.isResizing) return;

        const diff = e.clientX - state.startX;
        let newWidth = state.startWidth + (target === 'sidebar' ? diff : -diff);

        newWidth = Math.max(state.minWidth, Math.min(state.maxWidth, newWidth));

        // 对于sidebar，直接修改CSS变量
        if (target === 'sidebar') {
            document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
        }
        // 对于asr面板，也直接设置width
        else if (target === 'asr') {
            targetElement.style.width = `${newWidth}px`;
        }
    }

    function handleMouseUp() {
        state.isResizing = false;
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
}

// ===== 事件监听器 =====
function initEventListeners() {
    // 设置模态框
    settingsBtn.addEventListener('click', () => {
        loadConfigs();
        settingsModal.classList.add('active');
    });

    closeModalBtn.addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });

    settingsModal.querySelector('.modal-overlay').addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });

    // 配置管理
    configSelect.addEventListener('change', (e) => {
        if (e.target.value === 'new') {
            clearConfigFields();
        } else {
            populateConfigFields(e.target.value);
        }
    });

    saveConfigBtn.addEventListener('click', async () => {
        const name = configNameInput.value.trim();
        if (!name) return showToast("请输入配置名称", 'error');

        const newConfig = {
            name: name,
            base_url: apiBaseInput.value.trim(),
            api_key: apiKeyInput.value.trim(),
            model: modelNameInput.value.trim()
        };

        const idx = configs.findIndex(c => c.name === name);
        if (idx >= 0) {
            configs[idx] = newConfig;
        } else {
            configs.push(newConfig);
        }
        currentConfigName = name;

        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ configs, current_config: currentConfigName })
            });
            showToast("配置已保存", 'success');
            renderConfigSelect();
            settingsModal.classList.remove('active');

            if (llmSocket) llmSocket.close();
        } catch (e) {
            showToast("保存失败", 'error');
        }
    });

    deleteConfigBtn.addEventListener('click', async () => {
        const name = configNameInput.value.trim();
        if (!name) return;

        if (!confirm(`确定删除配置 "${name}" 吗?`)) return;

        configs = configs.filter(c => c.name !== name);
        if (currentConfigName === name) {
            currentConfigName = configs.length > 0 ? configs[0].name : "";
        }

        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ configs, current_config: currentConfigName })
            });
            showToast("配置已删除", 'success');
            renderConfigSelect();
            if (configs.length === 0) clearConfigFields();
        } catch (e) {
            showToast("删除失败", 'error');
        }
    });

    testConnBtn.addEventListener('click', async () => {
        saveConfigBtn.click();
        await new Promise(resolve => setTimeout(resolve, 500));

        if (!currentChatId) {
            await createNewChat();
        }

        const testMessage = "你好";
        showToast("正在测试连接...", 'info');

        try {
            sendToLLM(testMessage);
            showToast("测试消息已发送，请查看右侧聊天窗口", 'success');
        } catch (error) {
            showToast("测试失败: " + error.message, 'error');
        }
    });

    // 发送消息
    llmSendBtn.addEventListener('click', () => {
        const text = llmInput.value;
        if (text) {
            sendToLLM(text);
            llmInput.value = '';
            autoResizeTextarea();
        }
    });

    llmInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            llmSendBtn.click();
        }
    });

    llmInput.addEventListener('input', autoResizeTextarea);

    // ASR 操作
    sendAllBtn.addEventListener('click', () => {
        const messages = Array.from(asrWindow.querySelectorAll('.message .content')).map(el => el.textContent);
        if (messages.length === 0) return showToast("没有语音记录可发送", 'info');

        const fullText = "以下是语音转写的聊天记录：\n" + messages.join("\n");
        sendToLLM(fullText);
    });

    // 聊天管理
    newChatBtn.addEventListener('click', createNewChat);
    clearLlmBtn.addEventListener('click', clearCurrentChat);

    clearAsrBtn.addEventListener('click', () => {
        if (confirm("确定清空语音转写记录吗？")) {
            asrWindow.innerHTML = '';
            showToast("语音记录已清空", 'success');
        }
    });

    // 文本选择分析
    document.addEventListener('mouseup', handleTextSelection);
}

function autoResizeTextarea() {
    llmInput.style.height = 'auto';
    llmInput.style.height = Math.min(llmInput.scrollHeight, 120) + 'px';
}

function handleTextSelection(e) {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text && text.length > 1) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        floatSendBtn.style.display = 'flex';
        floatSendBtn.style.top = `${rect.bottom + window.scrollY + 10}px`;
        floatSendBtn.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 60}px`;

        floatSendBtn.onclick = () => {
            sendToLLM(`请分析这段文本：\n${text}`);
            floatSendBtn.style.display = 'none';
            window.getSelection().removeAllRanges();
        };
    } else {
        floatSendBtn.style.display = 'none';
    }
}

// ===== 初始化 =====
function init() {
    console.log('🎤 AST Frontend 初始化中...');

    initResizers();
    initEventListeners();
    autoResizeTextarea();

    connectASR();
    connectLLM();
    loadChatList();

    console.log('✨ AST Frontend 初始化完成');
}

// DOM 加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (asrSocket) asrSocket.close();
    if (llmSocket) llmSocket.close();
});
