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
        this.checkResumeStatus();
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

        // Resume Upload Button - Open Modal
        if (dom.uploadResumeBtn) {
            dom.uploadResumeBtn.addEventListener('click', () => {
                this.openResumeModal();
            });
        }

        // Resume Modal Events
        if (dom.resumeModal) {
            // Close button
            if (dom.resumeModalCloseBtn) {
                dom.resumeModalCloseBtn.addEventListener('click', () => {
                    dom.resumeModal.classList.remove('active');
                });
            }

            // Overlay click
            const overlay = dom.resumeModal.querySelector('.modal-overlay');
            if (overlay) {
                overlay.addEventListener('click', () => {
                    dom.resumeModal.classList.remove('active');
                });
            }

            // Model Type Change
            if (dom.resumeModelTypeSelect) {
                dom.resumeModelTypeSelect.addEventListener('change', (e) => {
                    this.handleResumeModelTypeChange(e.target.value);
                });
            }

            // Save Config
            if (dom.saveResumeConfigBtn) {
                dom.saveResumeConfigBtn.addEventListener('click', () => {
                    this.saveResumeConfig();
                });
            }

            // File Upload
            if (dom.resumeDropZone && dom.resumeFileInput) {
                dom.resumeDropZone.addEventListener('click', () => {
                    dom.resumeFileInput.click();
                });

                dom.resumeDropZone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dom.resumeDropZone.classList.add('drag-over');
                });

                dom.resumeDropZone.addEventListener('dragleave', () => {
                    dom.resumeDropZone.classList.remove('drag-over');
                });

                dom.resumeDropZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dom.resumeDropZone.classList.remove('drag-over');
                    const files = e.dataTransfer.files;
                    if (files.length > 0) {
                        this.handleResumeUpload(files[0]);
                    }
                });

                dom.resumeFileInput.addEventListener('change', (e) => {
                    const files = e.target.files;
                    if (files.length > 0) {
                        this.handleResumeUpload(files[0]);
                    }
                    dom.resumeFileInput.value = ''; // Reset
                });
            }
        }

        // Resume Personalization Toggle
        if (dom.resumeToggleBtn) {
            dom.resumeToggleBtn.addEventListener('click', async () => {
                if (dom.resumeToggleBtn.classList.contains('disabled')) {
                    showToast('请先上传简历', 'warning');
                    return;
                }

                const isActive = dom.resumeToggleBtn.classList.contains('active');
                const newState = !isActive;

                try {
                    const response = await fetch('/api/resume/toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enabled: newState })
                    });

                    if (response.ok) {
                        if (newState) {
                            dom.resumeToggleBtn.classList.add('active');
                            showToast('简历个性化已开启', 'success');
                        } else {
                            dom.resumeToggleBtn.classList.remove('active');
                            showToast('简历个性化已关闭', 'info');
                        }
                    }
                } catch (e) {
                    console.error('Toggle error:', e);
                }
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
        window.resolveConfigDisplayName = (configName, preferIdentity = false) => {
            if (!this.managers || !this.managers.config) return configName;
            return this.managers.config.getConfigDisplayName(configName, preferIdentity);
        };
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

    updateResumeStatus(status) {
        if (!dom.resumeStatusIndicator) return;

        const dot = dom.resumeStatusIndicator.querySelector('.resume-status-dot');
        const text = dom.resumeStatusIndicator.querySelector('.resume-status-text');

        dom.resumeStatusIndicator.style.display = 'flex';
        dom.resumeStatusIndicator.className = 'resume-status-indicator'; // reset

        if (status === 'uploading') {
            dom.resumeStatusIndicator.classList.add('status-parsing');
            text.textContent = '解析中...';
        } else if (status === 'ready') {
            dom.resumeStatusIndicator.classList.add('status-ready');
            text.textContent = '简历就绪';
        } else if (status === 'error') {
            dom.resumeStatusIndicator.classList.add('status-error');
            text.textContent = '解析失败';
        } else {
            dom.resumeStatusIndicator.style.display = 'none';
        }
    }

    async checkResumeStatus() {
        try {
            const response = await fetch('/api/resume/status');
            if (response.ok) {
                const data = await response.json();

                if (data.has_resume) {
                    this.updateResumeStatus('ready');
                    if (dom.resumeToggleBtn) {
                        dom.resumeToggleBtn.classList.remove('disabled');
                        if (data.personalization_enabled) {
                            dom.resumeToggleBtn.classList.add('active');
                        }
                    }
                } else {
                    this.updateResumeStatus('missing');
                    if (dom.resumeToggleBtn) {
                        dom.resumeToggleBtn.classList.add('disabled');
                        dom.resumeToggleBtn.classList.remove('active');
                    }
                }
            }
        } catch (e) {
            console.error('Check resume status error:', e);
        }
    }

    async openResumeModal() {
        if (!dom.resumeModal) return;

        // Load config
        await this.loadResumeConfig();

        dom.resumeModal.classList.add('active');

        // Reset status
        if (dom.resumeUploadStatus) {
            dom.resumeUploadStatus.style.display = 'none';
            dom.resumeUploadStatus.className = 'status-message';
            dom.resumeUploadStatus.textContent = '';
        }
    }

    async loadResumeConfig() {
        try {
            // Use existing config loading mechanism
            await this.managers.config.loadConfigs();
            const config = this.managers.config.configData?.resume_config || {};
            const type = config.model_type || 'api';

            if (dom.resumeModelTypeSelect) {
                dom.resumeModelTypeSelect.value = type;
            }

            // Handle type change and populate models
            this.handleResumeModelTypeChange(type, config.model_name);

        } catch (e) {
            console.error('Load resume config error:', e);
        }
    }

    populateResumeModelSelect(selectedModel, customList = null) {
        if (!dom.resumeModelSelect) return;

        dom.resumeModelSelect.innerHTML = '';

        let items = [];
        if (customList) {
            items = customList.map(m => ({ name: m, value: m }));
        } else {
            const configs = this.managers.config.configs || [];
            items = configs.map(c => ({ name: c.name, value: c.name }));
        }

        if (items.length === 0) {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "无可用模型 (请先在设置中添加)";
            dom.resumeModelSelect.appendChild(option);
            return;
        }

        let hasSelection = false;
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.name;
            if (item.value === selectedModel) {
                option.selected = true;
                hasSelection = true;
            }
            dom.resumeModelSelect.appendChild(option);
        });

        // If no model selected (or saved model not found), select the first one
        if (!hasSelection && items.length > 0) {
            dom.resumeModelSelect.selectedIndex = 0;
        }
    }

    handleResumeModelTypeChange(type, preferredModel = null) {
        // Always show select, hide input (deprecated)
        if (dom.resumeModelSelect) dom.resumeModelSelect.style.display = 'block';
        if (dom.resumeLocalModelInput) dom.resumeLocalModelInput.style.display = 'none';

        const selected = preferredModel || (dom.resumeModelSelect ? dom.resumeModelSelect.value : '');

        if (type === 'local') {
            const localModels = this.managers.config.modelLocal || ['Qwen3-0.6B'];
            this.populateResumeModelSelect(selected, localModels);
        } else {
            this.populateResumeModelSelect(selected);
        }
    }


    async saveResumeConfig() {
        // Ensure we have the latest config data
        await this.managers.config.loadConfigs();

        const type = dom.resumeModelTypeSelect?.value;
        const name = dom.resumeModelSelect?.value || 'default';

        // Construct the full config object to update
        const currentConfig = this.managers.config.configData || {};
        const resumeConfig = {
            model_type: type,
            model_name: name
        };

        const newConfig = {
            ...currentConfig,
            resume_config: resumeConfig
        };

        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            });

            if (response.ok) {
                showToast('简历配置已保存', 'success');
                // Reload to ensure sync
                await this.managers.config.loadConfigs();
            } else {
                showToast('保存失败', 'error');
            }
        } catch (e) {
            console.error('Save resume config error:', e);
            showToast('保存出错', 'error');
        }
    }

    async handleResumeUpload(file) {
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            showToast('请上传 PDF 文件', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        // Update status UI
        if (dom.resumeUploadStatus) {
            dom.resumeUploadStatus.style.display = 'block';
            dom.resumeUploadStatus.className = 'status-message uploading';
            dom.resumeUploadStatus.textContent = '正在上传并分析简历...';
        }

        this.updateResumeStatus('uploading');

        try {
            const response = await fetch('/api/resume/upload', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (response.ok) {
                showToast('简历解析成功', 'success');
                this.updateResumeStatus('ready');
                this.checkResumeStatus();

                if (dom.resumeUploadStatus) {
                    dom.resumeUploadStatus.className = 'status-message success';
                    dom.resumeUploadStatus.textContent = '简历解析成功！已准备好进行个性化对话。';
                }
            } else {
                showToast(result.message || '上传失败', 'error');
                this.updateResumeStatus('error');

                if (dom.resumeUploadStatus) {
                    dom.resumeUploadStatus.className = 'status-message error';
                    dom.resumeUploadStatus.textContent = '解析失败: ' + (result.message || '未知错误');
                }
            }
        } catch (error) {
            console.error('Upload error:', error);
            showToast('上传出错', 'error');
            this.updateResumeStatus('error');

            if (dom.resumeUploadStatus) {
                dom.resumeUploadStatus.className = 'status-message error';
                dom.resumeUploadStatus.textContent = '上传出错: ' + error.message;
            }
        }
    }
}
