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
const addConfigBtn = document.getElementById('add-config-btn');

// Settings Form Elements
const configListDiv = document.getElementById('config-list');
const configNameInput = document.getElementById('config-name');
const configTagsInput = document.getElementById('config-tags');
const apiBaseInput = document.getElementById('api-base');
const apiKeyInput = document.getElementById('api-key');
const modelNameInput = document.getElementById('model-name');
const systemPromptInput = document.getElementById('system-prompt');

const floatSendBtn = document.getElementById('float-send-btn');
const multiLLMToggle = document.getElementById('multi-llm-toggle');

// 智能分析 DOM
const agentToggleBtn = document.getElementById('agent-toggle');

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
let multiLLMActiveNames = new Set(); // Stores names of configs selected for cluster
let llmHistory = [];
let currentChatId = null;
let editingConfigName = null; // Track which config is being edited in the form
// 智能分析状态
let agentEnabled = false;
let agentStatus = null;

// ===== 面板调节状态 =====
const resizeState = {
    sidebar: { startX: 0, startWidth: 0, minWidth: 200, maxWidth: 400, isResizing: false },
    asr: { startX: 0, startWidth: 0, minWidth: 300, maxWidth: window.innerWidth * 0.6, isResizing: false }
};

// ===== Toast 通知系统 =====
function showToast(message, type = 'info') {
    if (!toastContainer) return;
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
    asrSocket.onopen = () => { updateStatus(asrStatusDiv, true); showToast('ASR 服务已连接', 'success'); };
    asrSocket.onmessage = (event) => { try { addASRMessage(JSON.parse(event.data)); } catch (e) { console.error(e); } };
    asrSocket.onclose = () => { updateStatus(asrStatusDiv, false); setTimeout(connectASR, 3000); };
    asrSocket.onerror = () => { updateStatus(asrStatusDiv, false); };
}

function addASRMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.innerHTML = `
        <div class="message-header"><span class="speaker-name">${data.speaker}</span><span class="timestamp">${data.time}</span></div>
        <div class="content">${data.text}</div>
    `;
    asrWindow.appendChild(messageDiv);
    asrWindow.scrollTop = asrWindow.scrollHeight;
}

// ===== WebSocket: LLM 连接与处理 =====
function connectLLM() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/llm`;
    llmSocket = new WebSocket(wsUrl);
    llmSocket.onopen = () => { console.log("LLM Connected"); };
    llmSocket.onmessage = (event) => { try { handleLLMMessage(JSON.parse(event.data)); } catch (e) { console.error(e); } };
    llmSocket.onclose = () => { console.log("LLM Disconnected"); setTimeout(connectLLM, 3000); };
    llmSocket.onerror = () => { console.log("LLM Connection Error"); };
}

// Multi-LLM Stream State
let activeResponseDivs = {}; // Map<modelName, HTMLElement>
let activeResponseBuffers = {}; // Map<modelName, string>

function getOrCreateResponseDiv(modelName) {
    if (activeResponseDivs[modelName]) {
        return activeResponseDivs[modelName];
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai';
    
    // Header with Model Tag
    const headerHtml = modelName 
        ? `<div class="message-header"><span class="speaker-name">AI 助手</span><span class="model-tag">${modelName}</span></div>`
        : `<div class="message-header"><span class="speaker-name">AI 助手</span></div>`;

    msgDiv.innerHTML = `
        ${headerHtml}
        <div class="content"></div>
    `;
    
    llmWindow.appendChild(msgDiv);
    activeResponseDivs[modelName || 'default'] = msgDiv;
    return msgDiv;
}

function handleLLMMessage(data) {
    if (data.type === 'chunk') {
        const model = data.model || 'default';
        const div = getOrCreateResponseDiv(model);
        const contentDiv = div.querySelector('.content');
        contentDiv.textContent += data.content;
        
        // Update buffer
        if (!activeResponseBuffers[model]) activeResponseBuffers[model] = "";
        activeResponseBuffers[model] += data.content;
        
        llmWindow.scrollTop = llmWindow.scrollHeight;
    } 
    else if (data.type === 'done_one') {
        // One model finished
        const model = data.model;
        // Optional: Mark this bubble as done visually?
    }
    else if (data.type === 'done' || data.type === 'done_all') {
        // All finished
        if (data.full_text) {
            // Single mode legacy
            llmHistory.push({ role: "assistant", content: data.full_text });
        } else {
            // Multi mode: push all buffers to history
            for (const [model, text] of Object.entries(activeResponseBuffers)) {
                if (text) {
                    llmHistory.push({ role: "assistant", content: `**${model}**:\n${text}` });
                }
            }
        }
        
        // Reset state
        activeResponseDivs = {};
        activeResponseBuffers = {};
        loadChatList(); // Refresh chat list preview if needed
    }
    else if (data.type === 'error') {
        showToast("LLM 错误: " + data.content, 'error');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message system-message';
        errorDiv.innerHTML = `<div class="message-content" style="color: var(--color-error)">❌ ${data.content}</div>`;
        llmWindow.appendChild(errorDiv);
        llmWindow.scrollTop = llmWindow.scrollHeight;
    }
}

function sendToLLM(text) {
    if (!text.trim()) return;

    // Add User Message
    const userDiv = document.createElement('div');
    userDiv.className = 'message user';
    userDiv.innerHTML = `<div class="message-content">${text}</div>`;
    llmWindow.appendChild(userDiv);
    llmWindow.scrollTop = llmWindow.scrollHeight;

    llmHistory.push({ role: "user", content: text });

    if (llmSocket && llmSocket.readyState === WebSocket.OPEN) {
        const isMulti = multiLLMToggle.classList.contains('active');

        // Reset stream state
        activeResponseDivs = {};
        activeResponseBuffers = {};

        llmSocket.send(JSON.stringify({
            messages: llmHistory,
            chat_id: currentChatId,
            is_multi_llm: isMulti
        }));
    } else {
        showToast("LLM 服务未连接", 'error');
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
    } catch (e) { console.error(e); }
}

function renderChatList(chats) {
    chatListDiv.innerHTML = '';
    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.innerHTML = `<span class="chat-title">${chat.title}</span><button class="delete-chat-btn">&times;</button>`;
        item.onclick = (e) => {
            if (e.target.classList.contains('delete-chat-btn')) return;
            if (chat.id !== currentChatId) {
                currentChatId = chat.id;
                loadChatMessages(chat.id);
                loadChatList();
            }
        };
        item.querySelector('.delete-chat-btn').onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`确定删除对话 "${chat.title}" 吗?`)) await deleteChat(chat.id);
        };
        chatListDiv.appendChild(item);
    });
}

async function createNewChat() {
    try {
        const res = await fetch('/api/chats', { method: 'POST', body: JSON.stringify({ title: "新对话 " + new Date().toLocaleTimeString() }), headers: { 'Content-Type': 'application/json' } });
        const newChat = await res.json();
        currentChatId = newChat.id;
        llmHistory = [];
        llmWindow.innerHTML = '';
        addSystemWelcome();
        loadChatList();
    } catch (e) { showToast("创建对话失败", 'error'); }
}

async function deleteChat(chatId) {
    await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
    if (currentChatId === chatId) { currentChatId = null; llmHistory = []; llmWindow.innerHTML = ''; }
    loadChatList();
}

async function loadChatMessages(chatId) {
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
                // Try to extract model name if formatted as **Name**: Content
                let content = msg.content;
                let modelName = null;
                const match = content.match(/^\*\*([^*]+)\*\*:\n([\s\S]*)/);
                if (match) {
                    modelName = match[1];
                    content = match[2];
                }
                
                const headerHtml = modelName 
                    ? `<div class="message-header"><span class="speaker-name">AI 助手</span><span class="model-tag">${modelName}</span></div>`
                    : `<div class="message-header"><span class="speaker-name">AI 助手</span></div>`;
                
                msgDiv.innerHTML = `${headerHtml}<div class="message-content">${content}</div>`;
            } else {
                msgDiv.innerHTML = `<div class="message-content">${msg.content}</div>`;
            }
            llmWindow.appendChild(msgDiv);
        });
    } else {
        addSystemWelcome();
    }
    llmWindow.scrollTop = llmWindow.scrollHeight;
}

function addSystemWelcome() {
    llmWindow.innerHTML += `<div class="message system-message"><div class="message-content">你好！我是你的AI助手。你可以直接跟我对话，或者从左侧发送语音记录让我分析。选中任意文本也可以快速提问哦！</div></div>`;
}

async function clearCurrentChat() {
    if (!currentChatId) return;
    // Removed confirm dialog as requested
    try {
        await fetch(`/api/chats/${currentChatId}/clear`, { method: 'POST' });
        llmHistory = [];
        llmWindow.innerHTML = '';
        addSystemWelcome();
        showToast("对话记录已清空", 'success');
    } catch (e) { showToast("清空失败", 'error'); }
}

// ===== 配置管理 =====
async function loadConfigs() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        configs = data.configs || [];
        currentConfigName = data.current_config;
        multiLLMActiveNames = new Set(data.multi_llm_active_names || []);

        // 初始化标签页
        initTabs();

        renderConfigList();

        // Select current config by default if editingConfigName is not set
        if (!editingConfigName && currentConfigName) {
            selectConfigToEdit(currentConfigName);
        } else if (configs.length > 0) {
            selectConfigToEdit(configs[0].name);
        } else {
            clearConfigForm();
        }

        // 加载智能分析配置
        loadAgentConfig();

        // 更新模型显示
        const isMultiMode = multiLLMToggle.classList.contains('active');
        updateModelDisplay(isMultiMode);
    } catch (e) { showToast("加载配置失败", 'error'); }
}

function renderConfigList() {
    configListDiv.innerHTML = '';
    configs.forEach(c => {
        const item = document.createElement('div');
        const isCurrent = c.name === currentConfigName;
        const isEditing = c.name === editingConfigName;

        item.className = `config-item ${isEditing ? 'active' : ''} ${isCurrent ? 'is-current' : ''}`;
        item.title = isCurrent ? '当前生效模型' : '点击设置为当前模型';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'config-item-name';
        nameSpan.textContent = c.name;

        // 如果是当前模型，添加绿色标识
        if (isCurrent) {
            const indicator = document.createElement('div');
            indicator.className = 'current-indicator';
            indicator.innerHTML = `
            `;
            item.appendChild(indicator);
        }

        item.appendChild(nameSpan);

        // 添加"设为当前"按钮（仅在非当前模型时显示）
        if (!isCurrent) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'config-item-actions';

            const setCurrentBtn = document.createElement('button');
            setCurrentBtn.className = 'set-current-btn';
            setCurrentBtn.textContent = '设为当前';
            setCurrentBtn.onclick = async (e) => {
                e.stopPropagation();
                currentConfigName = c.name;
                showToast(`已切换到模型: ${c.name}`, 'success');
                await saveConfigs();
                renderConfigList();
                selectConfigToEdit(c.name);
                // 更新模型显示
                const isMultiMode = multiLLMToggle.classList.contains('active');
                updateModelDisplay(isMultiMode);
            };

            actionsDiv.appendChild(setCurrentBtn);
            item.appendChild(actionsDiv);
        }

        item.onclick = async (e) => {
            // 只加载配置到表单查看和编辑，不自动设置当前模型
            selectConfigToEdit(c.name);
        };

        configListDiv.appendChild(item);
    });

    updateMultiLLMStatus();
}

async function saveConfigs() {
    try {
        await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                configs,
                current_config: currentConfigName,
                multi_llm_active_names: Array.from(multiLLMActiveNames)
            })
        });
        return true;
    } catch (e) {
        showToast('保存失败', 'error');
        return false;
    }
}

function updateMultiLLMStatus() {
    const countSpan = document.getElementById('multi-llm-count');
    if (!countSpan) return;

    const count = multiLLMActiveNames.size;
    if (count === 0) {
        countSpan.textContent = '未启用';
        countSpan.style.color = 'var(--text-tertiary)';
        countSpan.style.background = 'transparent';
    } else {
        const names = Array.from(multiLLMActiveNames).join(', ');
        countSpan.textContent = `已启用 ${count} 个模型 (${names})`;
        countSpan.style.color = 'var(--accent-primary)';
        countSpan.style.background = 'rgba(79, 70, 229, 0.1)';
    }
}

function selectConfigToEdit(name) {
    editingConfigName = name;
    const config = configs.find(c => c.name === name);
    if (config) {
        configNameInput.value = config.name;
        apiBaseInput.value = config.base_url;
        apiKeyInput.value = config.api_key;
        modelNameInput.value = config.model;

        // 加载标签到快速选择
        const selectedTag = config.tags && config.tags.length > 0 ? config.tags[0] : '';
        document.querySelectorAll('.tags-quick-select input[type="radio"]').forEach(radio => {
            radio.checked = radio.value === selectedTag;
        });
        // 更新隐藏的输入框
        updateTagsInput();

        systemPromptInput.value = config.system_prompt || "";
        deleteConfigBtn.style.display = 'block';
    }
    renderConfigList(); // Re-render to update active class
}

function loadMultiModelList() {
    const multiModelList = document.getElementById('multi-model-list');
    if (!multiModelList) return;

    multiModelList.innerHTML = '';
    configs.forEach(config => {
        const isActive = multiLLMActiveNames.has(config.name);

        const option = document.createElement('div');
        option.className = 'multi-model-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `multi-model-${config.name}`;
        checkbox.checked = isActive;
        checkbox.onchange = async (e) => {
            if (checkbox.checked) {
                multiLLMActiveNames.add(config.name);
                showToast(`已添加 ${config.name} 到多模型集群`, 'success');
            } else {
                multiLLMActiveNames.delete(config.name);
                showToast(`已从多模型集群移除 ${config.name}`, 'info');
            }
            updateMultiLLMStatus();
            await saveConfigs();
        };

        const label = document.createElement('label');
        label.htmlFor = `multi-model-${config.name}`;
        label.innerHTML = `
            <span>${config.name}</span>
            <span class="model-tag-small">${config.tags.join(', ')}</span>
        `;

        option.appendChild(checkbox);
        option.appendChild(label);
        multiModelList.appendChild(option);
    });
}

// 更新隐藏的标签输入框
function updateTagsInput() {
    const selectedRadio = document.querySelector('.tags-quick-select input[type="radio"]:checked');
    if (selectedRadio) {
        configTagsInput.value = selectedRadio.value;
    } else {
        configTagsInput.value = '';
    }
}

function clearConfigForm() {
    editingConfigName = null;
    configNameInput.value = "";
    apiBaseInput.value = "";
    apiKeyInput.value = "";
    modelNameInput.value = "";
    configTagsInput.value = "";
    // 清除标签单选框
    document.querySelectorAll('.tags-quick-select input[type="radio"]').forEach(radio => {
        radio.checked = false;
    });
    systemPromptInput.value = "";
    deleteConfigBtn.style.display = 'none';
    renderConfigList();
}

// ===== 标签页管理 =====
function initTabs() {
    // 获取所有标签按钮和标签内容
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        if (btn.dataset.tab === 'config') {
            btn.classList.add('active'); // 激活按钮
        } else {
            btn.classList.remove('active');
        }
    });

    tabContents.forEach(content => {
        if (content.id === 'tab-config') {
            content.classList.add('active'); // 激活内容
        } else {
            content.classList.remove('active');
        }
    });
}

// ===== Event Listeners =====
function initEventListeners() {
    settingsBtn.addEventListener('click', () => { loadConfigs(); settingsModal.classList.add('active'); });
    closeModalBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
    settingsModal.querySelector('.modal-overlay').addEventListener('click', () => settingsModal.classList.remove('active'));

    // 模型选择器点击事件（标题栏）
    const modelSelector = document.querySelector('.current-model-display');
    if (modelSelector) {
        modelSelector.addEventListener('click', () => {
            loadConfigs();
            settingsModal.classList.add('active');
        });
    }

    addConfigBtn.addEventListener('click', clearConfigForm);

    // 标签快速选择的事件监听
    document.querySelectorAll('.tags-quick-select input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', updateTagsInput);
    });

    // 标签页切换
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;

            // 移除所有活动状态
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            // 添加当前活动状态
            button.classList.add('active');
            document.getElementById(`tab-${tabName}`).classList.add('active');

            // 如果切换到多模型集群，刷新列表
            if (tabName === 'multi') {
                loadMultiModelList();
            }
        });
    });

    saveConfigBtn.addEventListener('click', async () => {
        const name = configNameInput.value.trim();
        if (!name) return showToast("请输入配置名称", 'error');

        const newConfig = {
            name: name,
            base_url: apiBaseInput.value.trim(),
            api_key: apiKeyInput.value.trim(),
            model: modelNameInput.value.trim(),
            tags: configTagsInput.value.split(',').map(t => t.trim()).filter(t => t),
            system_prompt: systemPromptInput.value.trim()
        };

        const idx = configs.findIndex(c => c.name === name);
        if (idx >= 0) configs[idx] = newConfig;
        else configs.push(newConfig);

        // 保存时自动设置为当前模型
        if (name !== currentConfigName) {
            currentConfigName = name;
            showToast(`配置已保存并切换到模型: ${name}`, 'success');
        } else {
            showToast("配置已保存", 'success');
        }

        const success = await saveConfigs();

        // 同时保存智能分析配置
        const agentSuccess = await saveAgentConfig();
        if (agentSuccess) {
            // 智能分析配置保存成功
        }
        if (success) {
            loadConfigs();
            // 保存后更新模型显示
            const isMultiMode = multiLLMToggle.classList.contains('active');
            updateModelDisplay(isMultiMode);
        }
    });

    deleteConfigBtn.addEventListener('click', async () => {
        const name = configNameInput.value.trim();
        if (!name || !confirm(`确定删除配置 "${name}" 吗?`)) return;
        
        configs = configs.filter(c => c.name !== name);
        multiLLMActiveNames.delete(name);
        
        if (currentConfigName === name) currentConfigName = configs.length > 0 ? configs[0].name : "";
        
        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ configs, current_config: currentConfigName, multi_llm_active_names: Array.from(multiLLMActiveNames) })
            });
            showToast("配置已删除", 'success');
            loadConfigs();
        } catch (e) { showToast("删除失败", 'error'); }
    });

    testConnBtn.addEventListener('click', async () => {
        const data = {
            api_key: apiKeyInput.value.trim(),
            base_url: apiBaseInput.value.trim(),
            model: modelNameInput.value.trim()
        };
        if (!data.api_key || !data.base_url || !data.model) return showToast("请填写完整配置信息", 'error');
        
        showToast("正在测试连接...", 'info');
        try {
            const res = await fetch('/api/test_connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) showToast("连接成功! " + result.message, 'success');
            else showToast("连接失败: " + result.message, 'error');
        } catch (e) { showToast("测试请求失败", 'error'); }
    });

    llmSendBtn.addEventListener('click', () => {
        const text = llmInput.value;
        if (text) { sendToLLM(text); llmInput.value = ''; autoResizeTextarea(); }
    });

    llmInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); llmSendBtn.click(); }
    });
    llmInput.addEventListener('input', autoResizeTextarea);

    sendAllBtn.addEventListener('click', () => {
        const messages = Array.from(asrWindow.querySelectorAll('.message .content')).map(el => el.textContent);
        if (messages.length === 0) return showToast("没有语音记录可发送", 'info');
        sendToLLM("以下是语音转写的聊天记录：\n" + messages.join("\n"));
    });

    newChatBtn.addEventListener('click', createNewChat);
    clearLlmBtn.addEventListener('click', clearCurrentChat);
    clearAsrBtn.addEventListener('click', () => {
        // Removed confirm dialog as requested
        asrWindow.innerHTML = '';
        showToast("语音记录已清空", 'success');
    });

    // 智能分析开关
    agentToggleBtn.addEventListener('click', toggleAgent);

    // 多模型会话开关
    multiLLMToggle.addEventListener('click', () => {
        const isMulti = multiLLMToggle.classList.toggle('active');
        multiLLMToggle.title = isMulti ? '多模型会话已开启，点击关闭' : '多模型会话已关闭，点击开启';
        showToast(`多模型会话模式已${isMulti ? '开启' : '关闭'}`, 'info');
        updateModelDisplay(isMulti);
    });

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

// ===== Width Persistence =====
function loadSavedWidths() {
    const sidebarWidth = localStorage.getItem('ast_sidebar_width');
    if (sidebarWidth) document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
    const asrWidth = localStorage.getItem('ast_asr_width');
    const asrPanel = document.getElementById('asr-panel');
    if (asrWidth && asrPanel) asrPanel.style.width = `${asrWidth}px`;
}

function initResizers() {
    const sidebarResizer = document.querySelector('.sidebar-resizer');
    const asrResizer = document.querySelector('.panel-resizer');
    if (sidebarResizer) initResizer(sidebarResizer, 'sidebar');
    if (asrResizer) initResizer(asrResizer, 'asr');
}

function initResizer(resizer, target) {
    const targetElement = document.getElementById(target === 'sidebar' ? 'sidebar' : 'asr-panel');
    if (!targetElement) return;
    const state = resizeState[target];
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        state.isResizing = true;
        state.startX = e.clientX;
        state.startWidth = targetElement.offsetWidth;
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
        if (target === 'sidebar') document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
        else targetElement.style.width = `${newWidth}px`;
    }
    function handleMouseUp() {
        state.isResizing = false;
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem(`ast_${target}_width`, targetElement.offsetWidth);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
}

// ===== 模型显示管理 =====
function updateModelDisplay(isMultiMode = false) {
    const modelDisplay = document.getElementById('current-model-display');
    const modelNameDisplay = modelDisplay.querySelector('.model-name-display');
    const modelIndicator = modelDisplay.querySelector('.model-indicator');

    if (isMultiMode) {
        // 显示多模型会议
        modelNameDisplay.textContent = '多模型会议';
        modelIndicator.style.background = 'linear-gradient(135deg, #3b82f6, #60a5fa)';
        modelIndicator.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.5)';
    } else {
        // 显示当前选择的模型
        modelNameDisplay.textContent = currentConfigName || 'DeepSeek-V3.2';
        modelIndicator.style.background = 'var(--accent-primary)';
        modelIndicator.style.boxShadow = '0 0 10px rgba(79, 70, 229, 0.5)';
    }
}

// ===== 初始化 =====
function init() {
    console.log('🎤 AST Frontend 初始化中...');
    loadSavedWidths();
    initResizers();
    initEventListeners();
    autoResizeTextarea();
    connectASR();
    connectLLM();
    loadChatList();
    initMultiLLMToggle(); // 初始化多模型共话开关
    initAgentStatus();
    updateModelDisplay(false); // 初始化模型显示
    console.log('✨ AST Frontend 初始化完成');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// ===== 多模型会话开关初始化 =====
function initMultiLLMToggle() {
    // 默认状态为关闭
    multiLLMToggle.classList.remove('active');
    multiLLMToggle.title = '多模型会话已关闭，点击开启';
}

// ===== 智能分析功能 =====

// 初始化智能分析状态
async function initAgentStatus() {
    try {
        const response = await fetch('/api/agent/status');
        const data = await response.json();

        if (data.available) {
            agentEnabled = data.enabled || false;
            agentStatus = data.status;
            updateAgentToggleUI();
            updateAgentStatusIndicator();
            agentToggleBtn.title = agentEnabled ? '智能分析已开启，点击关闭' : '智能分析已关闭，点击开启';
        } else {
            agentToggleBtn.style.display = 'none';
            const indicator = document.getElementById('agent-status-indicator');
            if (indicator) indicator.style.display = 'none';
        }
    } catch (e) {
        console.error('Failed to load agent status:', e);
        agentToggleBtn.style.display = 'none';
        const indicator = document.getElementById('agent-status-indicator');
        if (indicator) indicator.style.display = 'none';
    }
}

// 更新智能分析开关 UI
function updateAgentToggleUI() {
    if (agentEnabled) {
        agentToggleBtn.classList.add('active');
        agentToggleBtn.title = '智能分析已开启，点击关闭';
    } else {
        agentToggleBtn.classList.remove('active');
        agentToggleBtn.title = '智能分析已关闭，点击开启';
    }
}

// 更新智能分析状态指示器
function updateAgentStatusIndicator() {
    const indicator = document.getElementById('agent-status-indicator');
    if (!indicator) return;

    if (agentEnabled) {
        indicator.classList.add('active');
    } else {
        indicator.classList.remove('active');
    }
}

// 切换智能分析开关
async function toggleAgent() {
    try {
        const newEnabled = !agentEnabled;
        const response = await fetch('/api/agent/enable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enabled: newEnabled,
                auto_trigger: true
            })
        });

        if (response.ok) {
            agentEnabled = newEnabled;
            updateAgentToggleUI();
            updateAgentStatusIndicator();
            showToast(`智能分析已${newEnabled ? '开启' : '关闭'}`, 'success');
        } else {
            showToast('操作失败', 'error');
        }
    } catch (e) {
        console.error('Failed to toggle agent:', e);
        showToast('操作失败', 'error');
    }
}

// ===== 智能分析配置管理 =====

// DOM 元素获取
const agentModelSelect = document.getElementById('agent-model-select');
const agentModelTypeSelect = document.getElementById('agent-model-type-select');
const agentMinCharsInput = document.getElementById('agent-min-chars');
const agentSilenceThresholdInput = document.getElementById('agent-silence-threshold');

// 加载智能分析配置
async function loadAgentConfig() {
    try {
        const response = await fetch('/api/agent/status');
        const data = await response.json();

        if (!data.available) {
            console.log('智能分析模块不可用');
            return;
        }

        // 填充模型类型选择框
        agentModelTypeSelect.innerHTML = `
            <option value="local">本地模型</option>
            <option value="api">API 模型</option>
        `;

        // 设置模型选择
        const agentConfig = data.config || {};
        if (agentConfig.model_type) {
            agentModelTypeSelect.value = agentConfig.model_type;
        }

        // 触发模型类型变化事件来设置模型选择框
        handleModelTypeChange(agentModelTypeSelect);

        // 如果是API模式且有保存的模型名称，需要选中它
        if (agentConfig.model_type === 'api' && agentConfig.model_name) {
            // 延迟一点再设置，确保选项已经加载
            setTimeout(() => {
                agentModelSelect.value = agentConfig.model_name;
            }, 100);
        }

        // 设置阈值
        agentMinCharsInput.value = agentConfig.min_characters || 10;
        agentSilenceThresholdInput.value = agentConfig.silence_threshold || 2;

    } catch (e) {
        console.error('加载智能分析配置失败:', e);
    }
}

// 保存智能分析配置（当点击保存时触发）
async function saveAgentConfig() {
    try {
        const modelType = agentModelTypeSelect.value;
        const config = {
            model_type: modelType,
            model_name: agentModelSelect.value,
            min_characters: parseInt(agentMinCharsInput.value) || 10,
            silence_threshold: parseFloat(agentSilenceThresholdInput.value) || 2
        };

        // 验证配置
        if (!config.model_name && modelType === 'api') {
            showToast('请选择智能分析模型', 'error');
            return false;
        }

        const response = await fetch('/api/agent/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        if (response.ok) {
            return true;
        } else {
            return false;
        }
    } catch (e) {
        console.error('保存智能分析配置失败:', e);
        return false;
    }
}

// 处理模型类型切换
function handleModelTypeChange(select) {
    const apiModelGroup = document.getElementById('api-model-select-group');
    const apiModelLabel = apiModelGroup.querySelector('label');
    const apiModelSelect = document.getElementById('agent-model-select');
    const hintText = apiModelGroup.querySelector('.form-hint');

    if (select.value === 'local') {
        // 本地模型模式
        apiModelGroup.style.display = 'block';
        apiModelLabel.textContent = '本地模型';
        apiModelSelect.innerHTML = '<option value="Qwen2.5-1.5B-Instruct" selected>Qwen2.5-1.5B-Instruct</option>';
        apiModelSelect.disabled = true;
        hintText.textContent = '本地模型：Qwen2.5-1.5B-Instruct';
    } else {
        // API 模型模式
        apiModelGroup.style.display = 'block';
        apiModelLabel.textContent = 'API 模型选择';
        apiModelSelect.innerHTML = '<option value="">-- 请选择 --</option>';
        apiModelSelect.disabled = false;

        // 加载配置列表中的所有模型
        configs.forEach(config => {
            const option = document.createElement('option');
            option.value = config.name;
            option.textContent = config.name;
            apiModelSelect.appendChild(option);
        });

        hintText.textContent = '选择用于智能判定的小模型（建议使用轻量级模型）';
    }
}


