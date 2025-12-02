/* ========================================
   主初始化文件 - AST Frontend
   精致技术美学 - JavaScript核心逻辑
   ======================================== */

// 导入所有模块
import { dom } from './dom.js';
import { WebSocketManager, LLMStreamManager } from './websocket.js';
import { showToast, loadSavedWidths, updateModelDisplay } from './utils.js';
import { ChatManager } from './chat.js';
import { ConfigManager } from './config.js';
import { VoiceprintManager } from './voiceprint.js';
import { AgentManager, LLMManager, IntentRecognitionManager } from './agent.js';
import { UIManager } from './ui.js';

// ===== 全局管理器实例 =====
const managers = {
    websocket: null,
    chat: null,
    config: null,
    voiceprint: null,
    agent: null,
    llm: null,
    intentRecognition: null,

    ui: null,
    streamManager: null
};

// ===== 主初始化函数 =====
async function init() {
    console.log('🎤 AST Frontend 初始化中...');

    try {
        // 1. 初始化管理器
        await initializeManagers();

        // 2. 设置WebSocket连接
        await setupWebSocketConnections();

        // 3. 初始化UI事件
        setupUIEvents();

        // 4. 加载初始状态
        await loadInitialState();

        // 5. 完成初始化
        completeInitialization();

    } catch (error) {
        console.error('初始化失败:', error);
        showToast('初始化失败，请刷新页面重试', 'error');
    }
}

// ===== 初始化管理器 =====
async function initializeManagers() {
    // 初始化WebSocket管理器
    managers.websocket = new WebSocketManager();
    managers.streamManager = new LLMStreamManager();

    // 初始化各个功能管理器
    managers.chat = new ChatManager();
    managers.config = new ConfigManager();
    managers.voiceprint = new VoiceprintManager();
    managers.agent = new AgentManager();
    managers.intentRecognition = new IntentRecognitionManager();
    managers.llm = new LLMManager();

    // 设置管理器之间的依赖关系
    managers.llm.setStreamManager(managers.streamManager);
    managers.llm.setWebSocketManager(managers.websocket);

    // 设置WebSocket消息处理
    managers.websocket.handleLLMMessage = (data) => {
        managers.llm.handleLLMMessage(data);
    };

    // 初始化UI管理器
    managers.ui = new UIManager(managers);

    console.log('✅ 管理器初始化完成');
}

// ===== 设置WebSocket连接 =====
async function setupWebSocketConnections() {
    // 连接ASR WebSocket
    managers.websocket.connectASR();

    // 连接LLM WebSocket
    managers.websocket.connectLLM();

    console.log('🔌 WebSocket连接已建立');
}

// ===== 设置UI事件 =====
function setupUIEvents() {
    // 初始化事件监听器
    managers.ui.initEventListeners();

    // 初始化声纹音频播放器事件
    managers.voiceprint.initAudioPlayerEvents();

    // 初始化面板调节
    loadSavedWidths();

    console.log('🎛️ UI事件初始化完成');
}

// ===== 加载初始状态 =====
async function loadInitialState() {
    try {
        // 1. 恢复UI状态
        managers.ui.restoreUIState();

        // 2. 加载配置
        const configState = await managers.config.loadConfigs();

        // 3. 初始化智能分析状态
        await managers.agent.initAgentStatus();

        // 4. 初始化多模型开关状态
        managers.ui.initMultiLLMToggle();

        // 5. 初始化意图识别开关状态
        managers.ui.initIntentRecognitionToggle();

        // 6. 初始化意图识别状态
        managers.intentRecognition.initIntentRecognitionStatus();

        // 7. 更新模型显示
        const isMultiMode = dom.multiLLMToggle?.classList.contains('active') || false;
        updateModelDisplay(isMultiMode, managers.config.currentConfigName);

        // 6. 自动调整输入框
        if (dom.llmInput) {
            dom.llmInput.style.height = 'auto';
            dom.llmInput.style.height = Math.min(dom.llmInput.scrollHeight, 120) + 'px';
        }

        // 7. 加载聊天列表
        await managers.chat.loadChatList();

        // 8. 更新全局变量
        managers.ui.updateGlobalVariables();

        // 9. 立即更新欢迎语以反映当前功能状态
        managers.chat.updateWelcomeMessage();

        console.log('📋 初始状态加载完成');

    } catch (error) {
        console.error('加载初始状态失败:', error);
        showToast('加载配置失败', 'error');
    }
}

// ===== 完成初始化 =====
function completeInitialization() {
    // 在所有状态加载完成后，更新欢迎语以反映当前功能状态
    setTimeout(() => {
        managers.chat.updateWelcomeMessage();
    }, 100);

    console.log('✨ AST Frontend 初始化完成');
}

// ===== DOM就绪时启动 =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ===== 窗口关闭时清理资源 =====
window.addEventListener('beforeunload', () => {
    if (managers.websocket) {
        managers.websocket.closeAll();
    }
});

// ===== 导出管理器实例（供调试使用） =====
window.ASTManagers = managers;

// ===== 快捷键支持 =====
document.addEventListener('keydown', (e) => {
    // Ctrl + R: 新话题
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        managers.chat.createNewChat();
    }
});

// ===== 全局错误处理 =====
window.addEventListener('error', (e) => {
    console.error('全局错误:', e.error);
    showToast('发生错误，请刷新页面重试', 'error');
});

// ===== 网络状态监控 =====
window.addEventListener('online', () => {
    console.log('🌐 网络连接已恢复');
    showToast('网络连接已恢复', 'success');
});

window.addEventListener('offline', () => {
    console.log('📴 网络连接已断开');
    showToast('网络连接已断开', 'warning');
});

// ===== 导出主要功能（供HTML调用） =====
window.ASTFrontend = {
    // 重新连接WebSocket
    reconnectWebSocket: () => {
        managers.websocket.connectASR();
        managers.websocket.connectLLM();
    },

    // 获取当前状态
    getCurrentState: () => {
        return {
            chat: managers.chat.getCurrentChatId(),
            config: managers.config.getCurrentState(),
            agent: managers.agent.getCurrentState(),
            websocket: managers.websocket.getConnectionStatus()
        };
    },

    // 强制刷新配置
    refreshConfig: async () => {
        await managers.config.loadConfigs();
        managers.ui.updateGlobalVariables();
    },

    // 显示调试信息
    showDebugInfo: () => {
        console.log('AST Frontend 调试信息:', {
            managers,
            dom: Object.keys(dom).filter(key => dom[key] !== null),
            timestamp: new Date().toISOString()
        });
    }
};