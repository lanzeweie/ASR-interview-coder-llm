/* ========================================
   UI交互和事件监听
   ======================================== */

import { dom, domUtils } from './dom.js';
import {
    showToast,
    autoResizeTextarea,
    handleTextSelection,
    saveUIState,
    loadUIState,
    updateModelDisplay,
    loadSavedWidths,
    PanelResizer,
    initPanelResizeListener
} from './utils.js';

// ===== UI事件管理类 =====
export class UIManager {
    constructor(managers) {
        this.managers = managers; // 包含所有管理器实例
        this.sidebarStoredWidth = null;
    }

    // 初始化所有事件监听器
    initEventListeners() {
        this.initSettingsEvents();
        this.initVoiceprintEvents();
        this.initChatEvents();
        this.initLLMEvents();
        this.initToggleEvents();
        this.initResizerEvents();
        this.initTextSelectionEvents();
        this.initSidebarToggle();
    }

    // 设置相关事件
    initSettingsEvents() {
        // 设置按钮事件
        domUtils.addEvent('settings-btn', 'click', (e) => {
            e.stopPropagation();
            this.managers.config.loadConfigs();
            dom.settingsModal.classList.add('active');
        });

        // 设置模态框关闭按钮
        const settingsCloseBtn = domUtils.get('settings-close-btn');
        if (settingsCloseBtn) {
            settingsCloseBtn.onclick = () => {
                dom.settingsModal.classList.remove('active');
            };
        }

        // 设置模态框遮罩层
        if (dom.settingsModal) {
            const settingsOverlay = dom.settingsModal.querySelector('.modal-overlay');
            if (settingsOverlay) {
                settingsOverlay.onclick = () => {
                    dom.settingsModal.classList.remove('active');
                };
            }
        }

        // 模型选择器点击事件（标题栏）
        const modelSelector = document.querySelector('.current-model-display');
        if (modelSelector) {
            modelSelector.addEventListener('click', (e) => {
                e.stopPropagation();
                this.managers.config.loadConfigs();
                dom.settingsModal.classList.add('active');
            });
        }

        // 身份快速选择的事件监听
        document.querySelectorAll('.tags-quick-select input[type="radio"]').forEach(radio => {
            radio.addEventListener('click', (e) => {
                // 如果点击的是已经选中的，则取消选中
                if (e.target.dataset.wasChecked === 'true') {
                    e.target.checked = false;
                    e.target.dataset.wasChecked = 'false';
                    // 清除其他 radio 的状态
                    document.querySelectorAll('.tags-quick-select input[type="radio"]').forEach(r => {
                        if (r !== e.target) r.dataset.wasChecked = 'false';
                    });
                } else {
                    // 如果点击的是未选中的，设为选中状态
                    e.target.dataset.wasChecked = 'true';
                    // 清除其他 radio 的状态
                    document.querySelectorAll('.tags-quick-select input[type="radio"]').forEach(r => {
                        if (r !== e.target) r.dataset.wasChecked = 'false';
                    });
                }
                this.managers.config.updateTagsInput();

                // 获取当前选中的身份标签
                const selectedRadio = document.querySelector('.tags-quick-select input[type="radio"]:checked');
                const selectedTag = selectedRadio ? selectedRadio.value : '';
                this.managers.config.updateSystemPromptHintVisibility(selectedTag);
                if (!selectedTag && dom.systemPromptInput) {
                    dom.systemPromptInput.value = '';
                    dom.systemPromptInput.disabled = false;
                }
            });
        });

        // 标签页切换
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                this.managers.config.switchTab(tabName);
            });
        });

        // 保存配置
        domUtils.addEvent('save-config-btn', 'click', async () => {
            const configSaved = await this.managers.config.saveConfigForm({ skipReload: true });
            if (!configSaved) return;

            // 同时保存智能分析配置
            const agentSuccess = await this.managers.config.saveAgentConfig();
            if (!agentSuccess) {
                showToast('智能分析配置保存失败', 'error');
            }

            await this.managers.config.loadConfigs();
        });

        // 删除配置
        domUtils.addEvent('delete-config-btn', 'click', async () => {
            await this.managers.config.deleteConfig();
        });

        // 测试连接
        domUtils.addEvent('test-conn-btn', 'click', async () => {
            await this.managers.config.testConnection();
        });

        // 添加配置
        domUtils.addEvent('add-config-btn', 'click', () => {
            this.managers.config.clearConfigForm();
        });

        // 智能分析配置相关
        if (dom.agentModelTypeSelect) {
            dom.agentModelTypeSelect.addEventListener('change', (e) => {
                this.managers.config.handleModelTypeChange(e.target);
            });
        }

        // 意图识别配置相关
        if (dom.intentRecognitionModelTypeSelect) {
            dom.intentRecognitionModelTypeSelect.addEventListener('change', (e) => {
                this.managers.config.handleIntentRecognitionModelTypeChange(e.target);
            });
        }

        // 全局window对象，供其他模块使用
        window.handleModelTypeChange = (select) => {
            this.managers.config.handleModelTypeChange(select);
        };
    }

    // 声纹管理事件
    initVoiceprintEvents() {
        // 声纹管理按钮事件
        if (dom.voiceprintSettingsBtn) {
            dom.voiceprintSettingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.managers.voiceprint.openVoiceprintModal();
            });
        }

        // 声纹模态框关闭按钮
        const voiceprintCloseBtn = domUtils.get('voiceprint-close-btn');
        if (voiceprintCloseBtn) {
            voiceprintCloseBtn.onclick = () => {
                this.managers.voiceprint.closeVoiceprintModal();
            };
        }

        // 声纹模态框遮罩层
        if (dom.voiceprintModal) {
            const voiceprintOverlay = dom.voiceprintModal.querySelector('.modal-overlay');
            if (voiceprintOverlay) {
                voiceprintOverlay.onclick = () => {
                    this.managers.voiceprint.closeVoiceprintModal();
                };
            }
        }

        // 录音按钮事件
        if (dom.startRecordBtn) {
            dom.startRecordBtn.addEventListener('click', () => this.managers.voiceprint.startRecording());
        }
        if (dom.stopRecordBtn) {
            dom.stopRecordBtn.addEventListener('click', () => this.managers.voiceprint.stopRecording());
        }
        if (dom.saveRecordBtn) {
            dom.saveRecordBtn.addEventListener('click', () => this.managers.voiceprint.saveVoiceprint());
        }
        if (dom.discardRecordBtn) {
            dom.discardRecordBtn.addEventListener('click', () => this.managers.voiceprint.discardRecording());
        }

        // 重建声纹按钮事件
        if (dom.rebuildVoiceprintsBtn) {
            dom.rebuildVoiceprintsBtn.addEventListener('click', () => this.managers.voiceprint.rebuildVoiceprints());
        }
    }

    // 聊天管理事件
    initChatEvents() {
        // 新建聊天
        domUtils.addEvent('new-chat-btn', 'click', () => {
            this.managers.chat.createNewChat();
        });

        // 清空对话
        domUtils.addEvent('clear-llm-btn', 'click', () => {
            this.managers.chat.clearCurrentChat();
            this.managers.llm.clearHistory();
        });

        // 清空语音记录
        domUtils.addEvent('clear-asr-btn', 'click', () => {
            // Removed confirm dialog as requested
            if (dom.asrWindow) {
                dom.asrWindow.innerHTML = '';
            }
            showToast("语音记录已清空", 'success');
        });

        // 发送全部到AI
        domUtils.addEvent('send-all-btn', 'click', () => {
            console.log('[发送全部到AI] 按钮被点击');
            console.log('[发送全部到AI] 当前WebSocket状态:', {
                asrConnected: this.managers.websocket?.asrSocket?.readyState,
                llmConnected: this.managers.websocket?.llmSocket?.readyState,
                llmSocketExists: !!this.managers.websocket?.llmSocket
            });

            this.managers.chat.sendVoiceRecordsToAI((text) => {
                console.log('[发送全部到AI] 准备发送文本（格式：[时间] 说话人: 内容）:');
                console.log('--- 发送内容开始 ---');
                console.log(text);
                console.log('--- 发送内容结束 ---');
                console.log('[发送全部到AI] 文本长度:', text.length);
                console.log('[发送全部到AI] 调用sendToLLM...');

                try {
                    this.managers.llm.sendToLLM(this.managers.websocket, text);
                    console.log('[发送全部到AI] sendToLLM调用完成');
                } catch (error) {
                    console.error('[发送全部到AI] 发送失败:', error);
                    showToast('发送失败: ' + error.message, 'error');
                }
            });
        });
    }

    // LLM相关事件
    initLLMEvents() {
        // 发送按钮
        domUtils.addEvent('llm-send-btn', 'click', () => {
            const text = dom.llmInput.value;
            const trimmed = text.trim();
            if (trimmed) {
                this.echoUserMessage(trimmed);
                this.managers.llm.sendToLLM(this.managers.websocket, trimmed);
                dom.llmInput.value = '';
                autoResizeTextarea(dom.llmInput);
            }
        });

        // 输入框事件
        if (dom.llmInput) {
            dom.llmInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    dom.llmSendBtn.click();
                }
            });

            dom.llmInput.addEventListener('input', () => {
                autoResizeTextarea(dom.llmInput);
            });
        }
    }

    // 开关按钮事件
    initToggleEvents() {
        // 智能分析开关
        if (dom.agentToggleBtn) {
            dom.agentToggleBtn.addEventListener('click', async () => {
                const newState = await this.managers.agent.toggleAgent();
                // 更新全局变量和UI
                window.agentEnabled = newState;
                this.managers.chat.updateWelcomeMessage();
                this.persistUIState();
            });
        }

        // 智囊团开关
        if (dom.multiLLMToggle) {
            dom.multiLLMToggle.addEventListener('click', async () => {
                const isMulti = dom.multiLLMToggle.classList.toggle('active');
                dom.multiLLMToggle.title = isMulti ? '智囊团已开启，点击关闭' : '智囊团已关闭，点击开启';

                // 检查是否有启用的模型
                if (isMulti && this.managers.config.multiLLMActiveNames.size === 0) {
                    showToast('请先在设置中启用智囊团模型', 'warning');
                    // 还原开关状态
                    dom.multiLLMToggle.classList.remove('active');
                    return;
                }

                showToast(`智囊团模式已${isMulti ? '开启' : '关闭'}`, 'info');

                // 更新模型显示名称（根据智囊团开关状态决定显示配置名还是身份标签名）
                const displayName = await this.managers.config.updateCurrentDisplayNameByToggle(isMulti);

                this.managers.chat.updateWelcomeMessage();
                this.persistUIState();
            });
        }

        // 意图识别开关
        if (dom.intentRecognitionToggle) {
            dom.intentRecognitionToggle.addEventListener('click', async () => {
                const previousState = this.managers.intentRecognition.isEnabled();
                const targetState = !previousState;

                // 预先更新UI反馈
                this.applyIntentRecognitionState(targetState, { skipSave: true });

                const synced = await this.managers.config.updateIntentRecognitionState(targetState);
                if (!synced) {
                    this.applyIntentRecognitionState(previousState, { skipSave: true });
                    showToast('意图识别状态同步失败，请重试', 'error');
                    return;
                }

                this.applyIntentRecognitionState(targetState);
                showToast(`意图识别功能已${targetState ? '开启' : '关闭'}`, 'info');
            });
        }
    }

    // 面板调节事件
    initResizerEvents() {
        // 加载保存的宽度
        loadSavedWidths();

        // 初始化调节器
        this.initResizers();
        initPanelResizeListener();
    }

    // 初始化调节器
    initResizers() {
        const sidebarResizer = document.querySelector('.sidebar-resizer');
        const asrResizer = document.querySelector('.panel-resizer');

        if (sidebarResizer) {
            this.initSidebarResizer(sidebarResizer);
        }
        if (asrResizer) {
            PanelResizer.initPanelResizer(asrResizer);
        }
    }

    // 初始化侧边栏调节器
    initSidebarResizer(resizer) {
        const sidebarPanel = document.getElementById('sidebar');
        const state = {
            isResizing: false,
            startX: 0,
            startWidth: 0
        };

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            state.isResizing = true;
            state.startX = e.clientX;
            state.startWidth = sidebarPanel.offsetWidth;
            resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', this.handleSidebarMouseMove);
            document.addEventListener('mouseup', this.handleSidebarMouseUp);
        });

        this.handleSidebarMouseMove = (e) => {
            if (!state.isResizing) return;
            const diff = e.clientX - state.startX;
            let newWidth = state.startWidth + diff;
            newWidth = Math.max(200, Math.min(400, newWidth));
            document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
        };

        this.handleSidebarMouseUp = () => {
            state.isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            localStorage.setItem('ast_sidebar_width', sidebarPanel.offsetWidth);
            this.sidebarStoredWidth = `${sidebarPanel.offsetWidth}px`;
            document.removeEventListener('mousemove', this.handleSidebarMouseMove);
            document.removeEventListener('mouseup', this.handleSidebarMouseUp);
        };


    }

    // 文本选择事件
    initTextSelectionEvents() {
        document.addEventListener('mouseup', (e) => {
            handleTextSelection(e, (text) => {
                this.echoUserMessage(text);
                this.managers.llm.sendToLLM(this.managers.websocket, text);
            });
        });
    }

    // 初始化智囊团开关
    initMultiLLMToggle() {
        // 如果没有保存的状态，则设置为默认关闭状态
        if (!localStorage.getItem('ast_ui_state')) {
            if (dom.multiLLMToggle) {
                dom.multiLLMToggle.classList.remove('active');
                dom.multiLLMToggle.title = '智囊团已关闭，点击开启';
            }
        }
    }

    // 初始化意图识别开关
    initIntentRecognitionToggle() {
        // 如果没有保存的状态，则设置为默认关闭状态
        if (!localStorage.getItem('ast_ui_state')) {
            if (dom.intentRecognitionToggle) {
                dom.intentRecognitionToggle.classList.remove('active');
                dom.intentRecognitionToggle.title = '意图识别已关闭，点击开启';
            }
        } else {
            // 如果有保存的状态，也要设置对应的title
            if (dom.intentRecognitionToggle) {
                const isActive = dom.intentRecognitionToggle.classList.contains('active');
                dom.intentRecognitionToggle.title = isActive ? '意图识别已开启，点击关闭' : '意图识别已关闭，点击开启';
            }
        }
    }

    // 恢复UI状态
    restoreUIState() {
        const savedState = loadUIState();
        const collapseState = savedState ? !!savedState.sidebarCollapsed : false;
        this.applySidebarCollapsed(collapseState, { skipSave: true });
        if (!savedState) return;

        // 恢复智囊团开关状态
        if (typeof savedState.multiLLMActive === 'boolean') {
            if (savedState.multiLLMActive && dom.multiLLMToggle && !dom.multiLLMToggle.classList.contains('active')) {
                dom.multiLLMToggle.classList.add('active');
                updateModelDisplay(true, this.managers.config.currentConfigName);
            } else if (!savedState.multiLLMActive && dom.multiLLMToggle && dom.multiLLMToggle.classList.contains('active')) {
                dom.multiLLMToggle.classList.remove('active');
                updateModelDisplay(false, this.managers.config.currentConfigName);
            }
        }

        // 恢复智能分析UI状态
        if (typeof savedState.agentToggleActive === 'boolean') {
            if (savedState.agentToggleActive && dom.agentToggleBtn && !dom.agentToggleBtn.classList.contains('active')) {
                dom.agentToggleBtn.classList.add('active');
            } else if (!savedState.agentToggleActive && dom.agentToggleBtn && dom.agentToggleBtn.classList.contains('active')) {
                dom.agentToggleBtn.classList.remove('active');
            }
        }

        // 恢复意图识别UI状态
        if (typeof savedState.intentRecognitionActive === 'boolean') {
            this.applyIntentRecognitionState(savedState.intentRecognitionActive, { skipSave: true });
        }

        // 恢复当前聊天ID（需要检查是否存在）
        if (savedState.currentChatId) {
            // 延迟到聊天列表加载完成后恢复
            setTimeout(async () => {
                try {
                    const response = await fetch(`/api/chats/${savedState.currentChatId}`);
                    if (response.ok) {
                        const chatData = await response.json();
                        this.managers.chat.currentChatId = savedState.currentChatId;
                        this.managers.chat.loadChatMessages(savedState.currentChatId);
                        console.log('已恢复上次查看的聊天:', chatData.title);
                    }
                } catch (error) {
                    console.log('恢复聊天失败，聊天可能已删除:', error);
                }
            }, 100);
        }
    }

    // 更新全局变量（供其他模块使用）
    updateGlobalVariables() {
        window.currentConfigName = this.managers.config.currentConfigName;
        window.currentDisplayName = this.managers.config.getCurrentDisplayName();
        window.multiLLMActiveNames = this.managers.config.multiLLMActiveNames;
        window.agentEnabled = this.managers.agent.isEnabled();
        window.intentRecognitionEnabled = this.managers.intentRecognition.isEnabled();
    }

    persistUIState(extra = {}) {
        saveUIState({
            multiLLMActive: dom.multiLLMToggle?.classList.contains('active') || false,
            agentToggleActive: this.managers.agent.isEnabled(),
            intentRecognitionActive: this.managers.intentRecognition.isEnabled(),
            currentChatId: this.managers.chat.getCurrentChatId(),
            sidebarCollapsed: document.body.classList.contains('sidebar-collapsed'),
            ...extra
        });
    }

    initSidebarToggle() {
        if (!dom.sidebarToggleBtn) return;
        this.sidebarStoredWidth = this.getStoredSidebarWidth();
        dom.sidebarToggleBtn.addEventListener('click', () => {
            const collapsed = !document.body.classList.contains('sidebar-collapsed');
            this.applySidebarCollapsed(collapsed);
        });
    }

    getStoredSidebarWidth() {
        const stored = localStorage.getItem('ast_sidebar_width');
        if (stored && !Number.isNaN(parseInt(stored, 10))) {
            return `${parseInt(stored, 10)}px`;
        }
        const computed = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width');
        return computed?.trim() || '260px';
    }

    applySidebarCollapsed(collapsed, options = {}) {
        const { skipSave = false } = options;
        document.body.classList.toggle('sidebar-collapsed', collapsed);

        if (collapsed) {
            if (!this.sidebarStoredWidth || this.sidebarStoredWidth === '0px') {
                this.sidebarStoredWidth = this.getStoredSidebarWidth();
            }
            document.documentElement.style.setProperty('--sidebar-width', '0px');
            dom.sidebarToggleBtn?.classList.add('collapsed');
        } else {
            const fallbackWidth = this.sidebarStoredWidth && this.sidebarStoredWidth !== '0px'
                ? this.sidebarStoredWidth
                : this.getStoredSidebarWidth();
            this.sidebarStoredWidth = fallbackWidth;
            document.documentElement.style.setProperty('--sidebar-width', fallbackWidth);
            dom.sidebarToggleBtn?.classList.remove('collapsed');
        }

        if (dom.sidebarToggleBtn) {
            dom.sidebarToggleBtn.setAttribute('title', collapsed ? '展开聊天列表' : '收起聊天列表');
            dom.sidebarToggleBtn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
        }

        if (!skipSave) {
            this.persistUIState();
        }
    }

    applyIntentRecognitionState(isEnabled, options = {}) {
        const { skipSave = false } = options;
        const normalized = !!isEnabled;

        if (dom.intentRecognitionToggle) {
            dom.intentRecognitionToggle.classList.toggle('active', normalized);
            dom.intentRecognitionToggle.title = normalized ? '意图识别已开启，点击关闭' : '意图识别已关闭，点击开启';
        }

        if (this.managers.intentRecognition && typeof this.managers.intentRecognition.setEnabled === 'function') {
            this.managers.intentRecognition.setEnabled(normalized);
        }

        window.intentRecognitionEnabled = normalized;
        this.managers.chat.updateWelcomeMessage();

        if (!skipSave) {
            this.persistUIState();
        }
    }

    echoUserMessage(content) {
        const chatManager = this.managers.chat;
        if (!chatManager) return;

        if (typeof chatManager.addUserMessage === 'function') {
            chatManager.addUserMessage(content);
        } else if (typeof chatManager.addMessage === 'function') {
            chatManager.addMessage({ role: 'user', content });
        } else if (typeof chatManager.appendMessage === 'function') {
            chatManager.appendMessage('user', content);
        } else if (typeof chatManager.appendUserMessage === 'function') {
            chatManager.appendUserMessage(content);
        } else {
            document.dispatchEvent(new CustomEvent('ast:user-message', {
                detail: { role: 'user', content }
            }));
        }
    }
}
