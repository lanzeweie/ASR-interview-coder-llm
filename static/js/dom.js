/* ========================================
   DOM元素获取和管理
   ======================================== */

// ===== DOM 元素获取 =====
export const dom = {
    // 主要面板元素
    asrWindow: document.getElementById('asr-window'),
    asrStatusDiv: document.getElementById('asr-status'),
    llmWindow: document.getElementById('llm-window'),
    llmInput: document.getElementById('llm-input'),
    llmSendBtn: document.getElementById('llm-send-btn'),
    sendAllBtn: document.getElementById('send-all-btn'),

    // 设置相关元素
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    saveConfigBtn: document.getElementById('save-config-btn'),
    deleteConfigBtn: document.getElementById('delete-config-btn'),
    testConnBtn: document.getElementById('test-conn-btn'),
    addConfigBtn: document.getElementById('add-config-btn'),

    // Settings Form Elements
    configListDiv: document.getElementById('config-list'),
    configNameInput: document.getElementById('config-name'),
    configTagsInput: document.getElementById('config-tags'),
    apiBaseInput: document.getElementById('api-base'),
    apiKeyInput: document.getElementById('api-key'),
    modelNameInput: document.getElementById('model-name'),
    systemPromptInput: document.getElementById('system-prompt'),
    systemPromptHint: document.getElementById('system-prompt-hint'),
    sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
    identityManagerBtn: document.getElementById('identity-manager-btn'),
    identityManagerModal: document.getElementById('identity-manager-modal'),
    identityManagerCloseBtn: document.getElementById('identity-manager-close-btn'),
    identityModalList: document.getElementById('identity-modal-list'),
    identityModalSaveBtn: document.getElementById('identity-modal-save'),
    identityModalResetBtn: document.getElementById('identity-modal-reset'),
    identityIdInput: document.getElementById('identity-id-input'),
    identityNameInput: document.getElementById('identity-name-input'),
    identityPromptInput: document.getElementById('identity-prompt-input'),

    // Close modal buttons
    settingsCloseBtn: document.getElementById('settings-close-btn'),

    // 浮动按钮
    floatSendBtn: document.getElementById('float-send-btn'),
    multiLLMToggle: document.getElementById('multi-llm-toggle'),

    // 智能分析 DOM
    agentToggleBtn: document.getElementById('agent-toggle'),
    agentAnalysisIndicator: document.getElementById('agent-analysis-indicator'),

    // 意图识别 DOM
    intentRecognitionToggle: document.getElementById('intent-recognition-toggle'),

    // 聊天管理 DOM
    chatListDiv: document.getElementById('chat-list'),
    newChatBtn: document.getElementById('new-chat-btn'),
    clearLlmBtn: document.getElementById('clear-llm-btn'),
    clearAsrBtn: document.getElementById('clear-asr-btn'),

    // Toast 容器
    toastContainer: document.getElementById('toast-container'),

    // 声纹管理 DOM 元素
    voiceprintModal: document.getElementById('voiceprint-modal'),
    voiceprintSettingsBtn: document.getElementById('voiceprint-settings-btn'),
    voiceprintCloseBtn: document.getElementById('voiceprint-close-btn'),
    startRecordBtn: document.getElementById('start-record-btn'),
    stopRecordBtn: document.getElementById('stop-record-btn'),
    saveRecordBtn: document.getElementById('save-record-btn'),
    discardRecordBtn: document.getElementById('discard-record-btn'),
    recordingStatus: document.getElementById('recording-status'),
    recordingDuration: document.getElementById('recording-duration'),
    progressFill: document.getElementById('progress-fill'),
    audioPreview: document.getElementById('audio-preview'),
    audioPlayer: document.getElementById('audio-player'),
    voiceprintList: document.getElementById('voiceprint-list'),
    rebuildVoiceprintsBtn: document.getElementById('rebuild-voiceprints-btn'),

    // 智能分析配置元素
    agentModelSelect: document.getElementById('agent-model-select'),
    agentModelTypeSelect: document.getElementById('agent-model-type-select'),
    agentMinCharsInput: document.getElementById('agent-min-chars'),
    agentSilenceThresholdInput: document.getElementById('agent-silence-threshold'),
    agentMaxMessagesInput: document.getElementById('agent-max-messages'),

    // 意图识别配置元素
    intentRecognitionModelSelect: document.getElementById('intent-recognition-model-select'),
    intentRecognitionModelTypeSelect: document.getElementById('intent-recognition-model-type-select'),

    // 状态指示器
    agentStatusIndicator: document.getElementById('agent-status-indicator'),
    intentRecognitionIndicator: document.getElementById('intent-recognition-indicator'),
    currentModelDisplay: document.querySelector('.current-model-display'),
    multiLLMCount: document.getElementById('multi-llm-count'),

    // Resume Elements
    uploadResumeBtn: document.getElementById('upload-resume-btn'),
    resumeStatusIndicator: document.getElementById('resume-status-indicator'),
    resumeToggleBtn: document.getElementById('resume-toggle'),

    // Resume Modal Elements
    resumeModal: document.getElementById('resume-modal'),
    resumeModalCloseBtn: document.getElementById('resume-modal-close-btn'),
    resumeModelTypeSelect: document.getElementById('resume-model-type-select'),
    resumeModelSelect: document.getElementById('resume-model-select'),
    resumeLocalModelInput: document.getElementById('resume-local-model-input'),
    saveResumeConfigBtn: document.getElementById('save-resume-config-btn'),
    resumeDropZone: document.getElementById('resume-drop-zone'),
    resumeFileInput: document.getElementById('resume-file-input'),
    resumeUploadStatus: document.getElementById('resume-upload-status'),
    resumeProgressContainer: document.getElementById('resume-progress-container'),
    resumeProgressBar: document.getElementById('resume-progress-bar'),
    resumeStepText: document.getElementById('resume-step-text'),
    resumeStopBtn: document.getElementById('resume-stop-btn'),
    resumePreviewArea: document.getElementById('resume-preview-area'),
    resumeMarkdownContent: document.getElementById('resume-markdown-content')
};

// ===== DOM工具函数 =====
export const domUtils = {
    // 获取元素（带容错处理）
    get(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`DOM元素未找到: ${id}`);
        }
        return element;
    },

    // 检查元素是否存在
    exists(id) {
        return !!document.getElementById(id);
    },

    // 安全获取元素文本
    getText(id) {
        const element = this.get(id);
        return element ? element.textContent || '' : '';
    },

    // 安全设置元素文本
    setText(id, text) {
        const element = this.get(id);
        if (element) {
            element.textContent = text;
        }
    },

    // 安全设置元素显示/隐藏
    toggleDisplay(id, show) {
        const element = this.get(id);
        if (element) {
            element.style.display = show ? '' : 'none';
        }
    },

    // 安全设置元素样式
    setStyle(id, property, value) {
        const element = this.get(id);
        if (element) {
            element.style[property] = value;
        }
    },

    // 添加事件监听器（带容错处理）
    addEvent(id, event, handler) {
        const element = this.get(id);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`无法添加事件监听器，元素不存在: ${id}`);
        }
    }
};
