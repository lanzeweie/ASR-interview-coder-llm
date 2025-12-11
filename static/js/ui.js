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
    initPanelResizeListener,
    API
} from './utils.js';
import { renderMarkdown } from './markdown.js';

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
        this.initJobEvents();
        this.checkJobStatus();
        this.initASRControls();
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
                if (dom.systemPromptInput) {
                    dom.systemPromptInput.value = '';
                    dom.systemPromptInput.disabled = false;
                }
            });
        });

        // Global handlers for model type changes
        window.handleModelTypeChange = (select) => {
            this.managers.config.handleModelTypeChange(select);
        };
        window.handleJobModelTypeChange = (select) => {
            this.populateModelSelectForJob(select.value);
            // Trigger visibility check for thinking mode
            this.managers.config.updateThinkingModeVisibility('job', select.value);
        };
        window.handleResumeModelTypeChange = (select) => {
            // Populating logic is separate, but we need visibility check
            // Note: Resume model select population is handled by handleResumeModelTypeChange method in UI
            // But we need to update thinking mode visibility from the dropdown change
            if (this.managers.config && typeof this.managers.config.updateThinkingModeVisibility === 'function') {
                this.managers.config.updateThinkingModeVisibility('resume', select.value);
            }
        };
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
                this.persistUIState({}, { immediate: true });
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





            // File Upload
            if (dom.resumeUploadBtn && dom.resumeFileInput) {
                console.log('[Resume] 上传按钮事件已绑定');
                // Upload button click - trigger file input
                dom.resumeUploadBtn.addEventListener('click', () => {
                    console.log('[Resume] 上传按钮被点击');
                    dom.resumeFileInput.click();
                });

                // File input change - handle upload
                dom.resumeFileInput.addEventListener('change', (e) => {
                    const files = e.target.files;
                    console.log('[Resume] 文件选择:', files.length, '个文件');
                    if (files.length > 0) {
                        this.handleResumeUpload(files[0]);
                    }
                    dom.resumeFileInput.value = ''; // Reset
                });
            } else {
                console.warn('[Resume] 上传按钮或文件输入框未找到', {
                    uploadBtn: !!dom.resumeUploadBtn,
                    fileInput: !!dom.resumeFileInput
                });
            }



            // Stop Button
            const stopBtn = document.getElementById('resume-stop-btn');
            if (stopBtn) {
                stopBtn.addEventListener('click', () => {
                    this.stopResumeProcessing();
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
                this.persistUIState({}, { immediate: true });
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
    async initResizerEvents() {
        // 加载保存的宽度
        await loadSavedWidths();

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
            // 使用 API 保存
            API.saveUIState({ ast_sidebar_width: sidebarPanel.offsetWidth });

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
    async initMultiLLMToggle() {
        // 初始状态由 restoreUIState 处理，这里仅做 DOM 检查或默认值设定
        if (dom.multiLLMToggle) {
            dom.multiLLMToggle.title = '智囊团已关闭，点击开启';
        }
    }

    // 初始化意图识别开关
    async initIntentRecognitionToggle() {
        if (dom.intentRecognitionToggle) {
            dom.intentRecognitionToggle.title = '意图识别已关闭，点击开启';
        }
    }

    // 恢复UI状态
    async restoreUIState() {
        const savedState = await loadUIState(); // await the async function
        const collapseState = savedState ? !!savedState.sidebarCollapsed : false;
        this.applySidebarCollapsed(collapseState, { skipSave: true });

        if (!savedState) return;

        // 恢复智囊团开关状态
        if (typeof savedState.multiLLMActive === 'boolean') {
            if (savedState.multiLLMActive && dom.multiLLMToggle && !dom.multiLLMToggle.classList.contains('active')) {
                dom.multiLLMToggle.classList.add('active');
                // Consider updating display name here if needed, but config might not be loaded yet
                // Defer updateModelDisplay until config is definitely loaded, or call it safely
                setTimeout(() => updateModelDisplay(true, this.managers.config.currentConfigName), 1000);
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
            }, 500); // Increased delay slightly
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

    persistUIState(extra = {}, options = {}) {
        const { immediate = false } = options;
        saveUIState({
            multiLLMActive: dom.multiLLMToggle?.classList.contains('active') || false,
            agentToggleActive: this.managers.agent.isEnabled(),
            intentRecognitionActive: this.managers.intentRecognition.isEnabled(),
            currentChatId: this.managers.chat.getCurrentChatId(),
            sidebarCollapsed: document.body.classList.contains('sidebar-collapsed'),
            ...extra
        }, immediate);
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
        // Read directly from CSS variable which is set by loadSavedWidths
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
            this.persistUIState({}, { immediate: true });
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
            this.persistUIState({}, { immediate: true });
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

    updateResumeStatus(statusData) {
        // Handle both string input (legacy) and object input
        const status = typeof statusData === 'string' ? statusData : statusData.state;
        const step = statusData.step || '';
        const message = statusData.message || '';

        // 1. Update Resume Button Icon (Active State)
        if (dom.uploadResumeBtn) {
            const icon = dom.uploadResumeBtn.querySelector('svg');
            const text = dom.uploadResumeBtn.querySelector('text'); // The PDF text
            if (icon && text) {
                if (status === 'processing' || status === 'uploading') {
                    icon.style.color = '#fbbf24'; // Orange
                    text.style.fill = '#fbbf24';  // Ensure text matches
                } else if (status === 'completed' || status === 'ready' || statusData.has_resume) {
                    icon.style.color = '#10b981'; // Green
                    text.style.fill = '#10b981';
                } else {
                    icon.style.color = 'currentColor'; // Default
                    text.style.fill = 'currentColor';
                }
            }
        }
        // 2. Update Modal UI
        const progressContainer = document.getElementById('resume-progress-container');
        const progressBar = document.getElementById('resume-progress-bar');
        const stepText = document.getElementById('resume-step-text');
        const uploadStatus = document.getElementById('resume-upload-status');
        const previewArea = document.getElementById('resume-preview-area');

        if (status === 'processing') {
            // Show progress
            if (progressContainer) progressContainer.style.display = 'block';
            if (uploadStatus) uploadStatus.style.display = 'none';
            if (previewArea) previewArea.style.display = 'none';

            // Update progress bar based on step
            let progress = 10;
            let text = message || '正在处理...';

            if (step === 'uploading') progress = 20;
            else if (step === 'extracting') progress = 40;
            else if (step === 'analyzing_xml') progress = 60;
            else if (step === 'analyzing_markdown') progress = 80;

            if (progressBar) progressBar.style.width = `${progress}%`;
            if (stepText) stepText.textContent = text;

        } else if (status === 'completed' || status === 'ready') {
            if (progressContainer) progressContainer.style.display = 'none';
            if (uploadStatus) {
                uploadStatus.style.display = 'block';
                uploadStatus.className = 'status-message success';
                uploadStatus.textContent = '简历分析完成！';
            }

            // Load markdown if available
            if (statusData.has_markdown) {
                this.loadResumeMarkdown();
            }

        } else if (status === 'error') {
            if (progressContainer) progressContainer.style.display = 'none';
            if (uploadStatus) {
                uploadStatus.style.display = 'block';
                uploadStatus.className = 'status-message error';
                uploadStatus.textContent = statusData.error || '发生错误';
            }
        } else {
            // Idle
            if (progressContainer) progressContainer.style.display = 'none';
        }
    }

    async checkResumeStatus() {
        try {
            const response = await fetch('/api/resume/status');
            if (response.ok) {
                const data = await response.json();

                this.updateResumeStatus(data);

                if (data.has_resume) {
                    if (dom.resumeToggleBtn) {
                        dom.resumeToggleBtn.classList.remove('disabled');
                        if (data.personalization_enabled) {
                            dom.resumeToggleBtn.classList.add('active');
                        }
                    }
                } else {
                    if (dom.resumeToggleBtn) {
                        dom.resumeToggleBtn.classList.add('disabled');
                        dom.resumeToggleBtn.classList.remove('active');
                    }
                }

                // Poll if processing
                if (data.state === 'processing') {
                    setTimeout(() => this.checkResumeStatus(), 1000);
                }
            }
        } catch (e) {
            console.error('Check resume status error:', e);
        }
    }

    async stopResumeProcessing() {
        try {
            const response = await fetch('/api/resume/stop', { method: 'POST' });
            if (response.ok) {
                showToast('已停止处理', 'info');
                this.checkResumeStatus();
            }
        } catch (e) {
            console.error('Stop processing error:', e);
        }
    }

    async loadResumeMarkdown() {
        const previewArea = document.getElementById('resume-preview-area');
        const contentDiv = document.getElementById('resume-markdown-content');

        try {
            const response = await fetch('/api/resume/markdown');
            if (response.ok) {
                const data = await response.json();
                if (data.markdown && previewArea && contentDiv) {
                    previewArea.style.display = 'block';
                    renderMarkdown(contentDiv, data.markdown);
                }
            }
        } catch (e) {
            console.error('Load markdown error:', e);
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

            // Restore Thinking Mode
            if (config.thinking_mode) {
                this.managers.config.updateThinkingModeUI('resume', true);
            } else {
                this.managers.config.updateThinkingModeUI('resume', false);
            }
            // Ensure visibility is correct
            if (this.managers.config && typeof this.managers.config.updateThinkingModeVisibility === 'function') {
                this.managers.config.updateThinkingModeVisibility('resume', type);
            }

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

        // Update Thinking Mode Visibility
        if (this.managers.config && typeof this.managers.config.updateThinkingModeVisibility === 'function') {
            this.managers.config.updateThinkingModeVisibility('resume', type);
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
            model_name: name,
            thinking_mode: dom.resumeEnableThinkingBtn?.classList.contains('active') || false
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

        // Auto-save config before upload as requested
        await this.saveResumeConfig();

        // Initial UI update
        this.updateResumeStatus({ state: 'processing', step: 'uploading', message: '正在上传...' });

        try {
            const response = await fetch('/api/resume/upload', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (response.ok) {
                showToast('上传成功，开始分析...', 'success');
                // Start polling
                this.checkResumeStatus();
            } else {
                showToast(result.message || '上传失败', 'error');
                this.updateResumeStatus({ state: 'error', error: result.message });
            }
        } catch (error) {
            console.error('Upload error:', error);
            showToast('上传出错', 'error');
            this.updateResumeStatus({ state: 'error', error: error.message });
        }
    }

    // --- Job Analysis Methods ---

    initJobEvents() {
        document.querySelectorAll('.job-tab-button').forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;

                document.querySelectorAll('.job-tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.job-tab-content').forEach(content => content.classList.remove('active'));

                button.classList.add('active');
                const content = document.getElementById(`job-tab-${tabName}`);
                if (content) content.classList.add('active');
            });
        });

        if (dom.jobStatusIndicator) {
            dom.jobStatusIndicator.addEventListener('click', () => {
                this.openJobModal();
            });
        }

        if (dom.jobModal) {
            if (dom.jobModalCloseBtn) {
                dom.jobModalCloseBtn.addEventListener('click', () => {
                    dom.jobModal.classList.remove('active');
                });
            }
            // Overlay click
            const overlay = dom.jobModal.querySelector('.modal-overlay');
            if (overlay) {
                overlay.addEventListener('click', () => {
                    dom.jobModal.classList.remove('active');
                });
            }

            // Generate Button
            if (dom.jobGenerateBtn) {
                dom.jobGenerateBtn.addEventListener('click', () => {
                    this.handleJobGenerate();
                });
            }

            // Clear Button
            if (dom.jobClearBtn) {
                dom.jobClearBtn.addEventListener('click', () => {
                    this.handleJobClear();
                });
            }

            // Model Type Change
            // Model Type Change
            if (dom.jobModelTypeSelect) {
                dom.jobModelTypeSelect.addEventListener('change', (e) => {
                    this.populateModelSelectForJob(e.target.value);
                    if (this.managers.config && typeof this.managers.config.updateThinkingModeVisibility === 'function') {
                        this.managers.config.updateThinkingModeVisibility('job', e.target.value);
                    }
                });
            }
        }
    }

    async openJobModal() {
        if (!dom.jobModal) return;
        dom.jobModal.classList.add('active');

        // Initialize Model Select
        const jobConfig = this.managers.config.configData?.job_config || {};
        const savedType = jobConfig.model_type || 'api';
        const savedModel = jobConfig.model_name || '';

        if (dom.jobModelTypeSelect) {
            dom.jobModelTypeSelect.value = savedType;
            this.populateModelSelectForJob(savedType, savedModel);
        }

        // Restore Thinking Mode
        if (jobConfig.thinking_mode) {
            this.managers.config.updateThinkingModeUI('job', true);
        } else {
            this.managers.config.updateThinkingModeUI('job', false);
        }

        if (this.managers.config && typeof this.managers.config.updateThinkingModeVisibility === 'function') {
            this.managers.config.updateThinkingModeVisibility('job', savedType);
        }


        // Fetch current status and info
        try {
            const response = await fetch('/api/job/status');
            if (response.ok) {
                const data = await response.json();

                // Fill inputs if available
                if (data.info && data.info.title) {
                    if (dom.jobTitleInput) dom.jobTitleInput.value = data.info.title;
                }

                this.updateJobStatus(data);
            }
        } catch (e) {
            console.error('Failed to open job modal:', e);
        }
    }

    populateModelSelectForJob(type, selectedModel = null) {
        if (!dom.jobModelSelect) return;

        dom.jobModelSelect.innerHTML = '';
        const group = document.getElementById('job-model-name-group');
        if (group) group.style.display = 'block';

        let items = [];
        if (type === 'local') {
            const localModels = this.managers.config.modelLocal || ['Qwen3-0.6B'];
            items = localModels.map(m => ({ name: m, value: m }));
        } else {
            const configs = this.managers.config.configs || [];
            items = configs.map(c => ({ name: c.name, value: c.name }));
        }

        if (items.length === 0) {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "无可用模型";
            dom.jobModelSelect.appendChild(option);
            return;
        }

        let hasSelection = false;
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.value;
            opt.textContent = item.name;
            if (selectedModel && item.value === selectedModel) {
                opt.selected = true;
                hasSelection = true;
            }
            dom.jobModelSelect.appendChild(opt);
        });

        if (!hasSelection && items.length > 0) {
            dom.jobModelSelect.selectedIndex = 0;
        }
    }

    async handleJobGenerate() {
        const title = dom.jobTitleInput.value.trim();
        const jd = dom.jobJdInput.value.trim();

        if (!title) {
            showToast('请输入岗位名称', 'warning');
            return;
        }

        const thinkingMode = dom.jobEnableThinkingBtn?.classList.contains('active') || false;
        const modelType = dom.jobModelTypeSelect ? dom.jobModelTypeSelect.value : 'api';
        const modelName = dom.jobModelSelect ? dom.jobModelSelect.value : '';

        const config = {
            title: title,
            jd: jd,
            thinking_mode: thinkingMode,
            model_type: modelType,
            model_name: modelName
        };

        // UI Feedback
        if (dom.jobGenerateBtn) dom.jobGenerateBtn.disabled = true;

        try {
            const response = await fetch('/api/job/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                showToast('开始生成岗位分析...', 'success');

                // Save Job Config
                if (this.managers.config) {
                    if (!this.managers.config.configData) this.managers.config.configData = {};
                    if (!this.managers.config.configData.job_config) this.managers.config.configData.job_config = {};

                    this.managers.config.configData.job_config.model_type = modelType;
                    this.managers.config.configData.job_config.model_name = modelName;
                    // thinking_mode is already saved in toggleThinkingMode, but good to be safe/consistent if we wanted
                    this.managers.config.configData.job_config.thinking_mode = thinkingMode;

                    this.managers.config.saveConfigs();
                }

                this.pollJobStatus();
            } else {
                const err = await response.json();
                showToast('生成失败: ' + err.message, 'error');
                if (dom.jobGenerateBtn) dom.jobGenerateBtn.disabled = false;
            }
        } catch (e) {
            showToast('请求失败: ' + e.message, 'error');
            if (dom.jobGenerateBtn) dom.jobGenerateBtn.disabled = false;
        }
    }

    async handleJobClear() {
        if (!confirm('确定要清空岗位分析吗？这将删除已生成的文件。')) return;

        try {
            const response = await fetch('/api/job/clear', { method: 'POST' });
            if (response.ok) {
                showToast('已清空', 'success');
                if (dom.jobTitleInput) dom.jobTitleInput.value = '';
                if (dom.jobJdInput) dom.jobJdInput.value = '';
                this.checkJobStatus();
                this.updateJobPreview(''); // Clear preview
            }
        } catch (e) {
            console.error(e);
        }
    }

    pollJobStatus() {
        if (this.jobPollInterval) clearInterval(this.jobPollInterval);

        this.jobPollInterval = setInterval(async () => {
            const statusData = await this.checkJobStatus();
            if (statusData && (statusData.status.state === 'completed' || statusData.status.state === 'error')) {
                clearInterval(this.jobPollInterval);
                if (dom.jobGenerateBtn) dom.jobGenerateBtn.disabled = false;
            }
        }, 1000);
    }

    async checkJobStatus() {
        try {
            const response = await fetch('/api/job/status');
            if (response.ok) {
                const data = await response.json();
                this.updateJobStatus(data);
                return data;
            }
        } catch (e) {
            console.error('Job status check failed:', e);
        }
        return null;
    }

    async updateJobStatus(data) {
        const { status, has_analysis, info } = data;

        // 1. Update Indicator
        if (dom.jobStatusIndicator) {
            if (has_analysis && info && info.title) {
                dom.jobStatusIndicator.style.display = 'flex';
                dom.jobStatusIndicator.title = '岗位: ' + info.title + (status.state === 'processing' ? ' (生成中)' : '');

                const icon = dom.jobStatusIndicator.querySelector('svg');
                if (icon) {
                    if (status.state === 'processing') {
                        icon.style.color = '#fbbf24'; // Orange
                    } else {
                        icon.style.color = '#10b981'; // Green
                    }
                }
            } else {
                dom.jobStatusIndicator.style.display = 'flex'; // Always show
                dom.jobStatusIndicator.title = '设置目标岗位';
                const icon = dom.jobStatusIndicator.querySelector('svg');
                if (icon) icon.style.color = 'currentColor';
            }
        }

        // 2. Update Modal Status Text
        if (dom.jobStatusText) {
            if (status.state === 'processing') {
                dom.jobStatusText.textContent = '生成中... ' + (status.message || '');
            } else if (status.state === 'error') {
                dom.jobStatusText.textContent = '错误: ' + status.error;
            } else if (has_analysis) {
                dom.jobStatusText.textContent = '已生成';
            } else {
                dom.jobStatusText.textContent = '';
            }
        }

        // 3. Load Content if needed
        if (has_analysis && status.state !== 'processing') {
            try {
                const contentRes = await fetch('/api/job/content');
                if (contentRes.ok) {
                    const contentData = await contentRes.json();
                    this.updateJobPreview(contentData.content);
                }
            } catch (e) { }
        } else if (!has_analysis) {
            this.updateJobPreview('');
        }
    }

    updateJobPreview(markdown) {
        if (!dom.jobMarkdownContent) return;

        if (!markdown) {
            dom.jobMarkdownContent.innerHTML = `<div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-tertiary);"><p>等待生成...</p></div>`;
            return;
        }

        renderMarkdown(dom.jobMarkdownContent, markdown);
    }

    // ===== ASR Control Methods =====
    initASRControls() {
        // Toggle Button
        const toggleBtn = document.getElementById('asr-toggle-listening-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleASRListening());
        }
    }

    async toggleASRListening() {
        const toggleBtn = document.getElementById('asr-toggle-listening-btn');
        const visualizer = document.getElementById('asr-mic-visualizer');
        const playIcon = toggleBtn.querySelector('.icon-play');
        const stopIcon = toggleBtn.querySelector('.icon-stop');

        // Check if currently connected
        const isConnected = this.managers.websocket.getConnectionStatus().asr;

        if (isConnected) {
            // Stop
            this.managers.websocket.disconnectASR();
            this.stopASRVisualizer();

            // UI Update
            if (visualizer) {
                visualizer.style.display = 'none';
                visualizer.classList.remove('active');
            }
            if (playIcon) playIcon.style.display = 'block';
            if (stopIcon) stopIcon.style.display = 'none';
            toggleBtn.classList.remove('active');
            toggleBtn.title = "开始监听";

            showToast('已停止监听', 'info');
        } else {
            // Start
            try {
                this.managers.websocket.connectASR();
                await this.startASRVisualizer();

                // UI Update
                if (visualizer) {
                    visualizer.style.display = 'flex';
                    // Trigger reflow/anim
                    setTimeout(() => { visualizer.classList.add('active'); }, 10);
                }

                if (playIcon) playIcon.style.display = 'none';
                if (stopIcon) stopIcon.style.display = 'block';
                toggleBtn.classList.add('active');
                toggleBtn.title = "停止监听";

                showToast('正在监听...', 'success');
            } catch (err) {
                console.error("Failed to start ASR:", err);
                showToast('无法启动监听: ' + (err.message || '未知错误'), 'error');
                // Cleanup if failed
                this.managers.websocket.disconnectASR();
                this.stopASRVisualizer();
            }
        }
    }

    async startASRVisualizer() {
        if (this.asrAudioContext && this.asrAudioContext.state !== 'closed') {
            if (this.asrAudioContext.state === 'suspended') {
                await this.asrAudioContext.resume();
            }
            this.asrVisualizerActive = true;
            this.animateASRVisualizer();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.asrAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.asrAudioContext.createMediaStreamSource(stream);
            const analyser = this.asrAudioContext.createAnalyser();
            analyser.fftSize = 64; // Low res for 5 bars is enough (32 bins)

            source.connect(analyser);

            this.asrAnalyser = analyser;
            this.asrStream = stream; // Keep ref to stop later
            this.asrVisualizerActive = true;
            this.animateASRVisualizer();

        } catch (e) {
            console.error('Mic access denied:', e);
            throw new Error('无法访问麦克风'); // Propagate error
        }
    }

    stopASRVisualizer() {
        this.asrVisualizerActive = false;
        if (this.asrStream) {
            this.asrStream.getTracks().forEach(track => track.stop());
            this.asrStream = null;
        }
        if (this.asrAudioContext) {
            this.asrAudioContext.close().catch(e => console.error(e));
            this.asrAudioContext = null;
        }
        this.asrAnalyser = null;
    }

    animateASRVisualizer() {
        if (!this.asrVisualizerActive || !this.asrAnalyser) return;

        const dataArray = new Uint8Array(this.asrAnalyser.frequencyBinCount);
        this.asrAnalyser.getByteFrequencyData(dataArray);

        const bars = document.querySelectorAll('#asr-mic-visualizer .mic-bar');

        const step = Math.floor(dataArray.length / bars.length);

        bars.forEach((bar, i) => {
            let sum = 0;
            for (let j = 0; j < step; j++) {
                sum += dataArray[i * step + j];
            }
            const avg = sum / step;

            let val = avg / 255;
            val = val * 1.5; // Gain
            if (val > 1) val = 1;

            const height = Math.max(4, val * 24);
            bar.style.height = `${height}px`;

            if (avg > 100) {
                bar.style.backgroundColor = 'var(--accent-primary)';
            } else {
                bar.style.backgroundColor = 'var(--text-tertiary)';
            }
        });

        if (this.asrVisualizerActive) {
            requestAnimationFrame(() => this.animateASRVisualizer());
        }
    }
}

