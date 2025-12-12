/* ========================================
   配置管理
   ======================================== */

import { dom, domUtils } from './dom.js';
import { showToast } from './utils.js';

const LEGACY_IDENTITY_MAP = {
    '思考': 'tech_assistant',
    '快速': 'concise_assistant',
    '引导': 'guide',
    '技术辅助者': 'tech_assistant',
    '精简辅助者': 'concise_assistant',
    '资深求职着': 'guide'
};
const THINK_TANK_DISPLAY_NAME = '智囊团';

// ===== 配置管理类 =====
export class ConfigManager {
    constructor() {
        this.configs = [];
        this.currentConfigName = "";
        this.multiLLMActiveNames = new Set();
        this.editingConfigName = null; // Track which config is being edited in the form
        this.identities = []; // Store loaded identities
        this.identityEventsInitialized = false;
        this.editingIdentityId = null;
    }

    normalizeIdentityTag(value = '') {
        if (!value) return '';
        let normalized = value.trim();
        if (!normalized) return '';
        if (LEGACY_IDENTITY_MAP[normalized]) {
            return LEGACY_IDENTITY_MAP[normalized];
        }
        const lowered = normalized.toLowerCase();
        if (LEGACY_IDENTITY_MAP[lowered]) {
            return LEGACY_IDENTITY_MAP[lowered];
        }
        normalized = lowered.replace(/\s+/g, '_');
        if (normalized.endsWith('_tag')) {
            normalized = normalized.slice(0, -4);
        }
        return normalized;
    }

    normalizeConfigTags(config = {}) {
        if (config && Array.isArray(config.tags)) {
            config.tags = config.tags
                .map(tag => this.normalizeIdentityTag(tag))
                .filter(Boolean);
        } else if (config) {
            config.tags = [];
        }
        return config;
    }

    getIdentityDisplayName(tag) {
        const normalized = this.normalizeIdentityTag(tag);
        const identity = this.identities.find(i => i.id === normalized);
        return identity ? identity.name : normalized;
    }

    escapeHtml(text = '') {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 加载配置
    async loadConfigs() {
        try {
            const res = await fetch('/api/config');
            const data = await res.json();
            this.configData = data;

            this.configs = (data.configs || []).map(config => this.normalizeConfigTags({ ...config }));
            this.currentConfigName = data.current_config;
            this.multiLLMActiveNames = new Set(data.multi_llm_active_names || []);
            this.modelLocal = data.model_local || ["Qwen3-0.6B"];

            // Load identities first
            await this.loadIdentities();

            // 更新显示名称（根据智囊团开关状态决定显示配置名还是“智囊团”标签）
            const isMulti = dom.multiLLMToggle?.classList.contains('active') || false;
            await this.updateCurrentDisplayNameByToggle(isMulti);

            // 初始化标签页
            this.initTabs();

            this.renderConfigList();

            // Select current config by default if editingConfigName is not set
            if (!this.editingConfigName && this.currentConfigName) {
                this.selectConfigToEdit(this.currentConfigName);
            } else if (this.configs.length > 0) {
                this.selectConfigToEdit(this.configs[0].name);
            } else {
                this.clearConfigForm();
            }

            // 加载智能分析配置
            await this.loadAgentConfig();

            // 加载意图识别配置
            await this.loadIntentRecognitionConfig();
            this.initIdentityManagementEvents();

            return {
                currentConfigName: this.currentConfigName,
                multiLLMActiveNames: this.multiLLMActiveNames
            };
        } catch (e) {
            showToast("加载配置失败", 'error');
            throw e;
        }
    }

    // Load identities from backend
    async loadIdentities() {
        try {
            const res = await fetch('/api/identities');
            const data = await res.json();

            const normalizedIdentities = (data || []).map(identity => {
                const normalizedId = this.normalizeIdentityTag(identity.id || identity.name);
                return {
                    id: normalizedId,
                    name: identity.name || normalizedId,
                    prompt: identity.prompt || '',
                    enabled: identity.enabled !== false
                };
            });

            // 去除重复ID（保留最后一次定义）
            const uniqueMap = new Map();
            normalizedIdentities.forEach(identity => {
                if (identity.id) {
                    uniqueMap.set(identity.id, identity);
                }
            });

            this.identities = Array.from(uniqueMap.values());
            this.configs = this.configs.map(config => this.normalizeConfigTags(config));
            const selectedTag = this.normalizeIdentityTag(dom.configTagsInput?.value || '');
            this.renderIdentityOptions(selectedTag);
            this.renderIdentityModalList();
        } catch (e) {
            console.error("Failed to load identities:", e);
            this.identities = [];
            this.renderIdentityOptions('');
            this.renderIdentityModalList();
        }
    }

    // Render identity options
    renderIdentityOptions(selectedTag = '') {
        const container = document.getElementById('identity-list');
        if (!container) return;

        container.innerHTML = '';

        // Reset disabled state initially
        if (dom.systemPromptInput) dom.systemPromptInput.disabled = false;

        if (this.identities.length === 0) {
            container.innerHTML = '<div class="no-identities">暂无可用身份</div>';
            return;
        }

        const normalizedSelected = this.normalizeIdentityTag(selectedTag);

        this.identities.forEach((identity, index) => {
            const option = document.createElement('div');
            option.className = 'tag-option';

            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'identity_option';
            input.id = `identity-${index}`;
            const tagValue = identity.id;
            input.value = tagValue;
            input.dataset.prompt = identity.prompt || "";

            // Check if this is the selected tag
            if (normalizedSelected && normalizedSelected === tagValue) {
                input.checked = true;
                input.dataset.wasChecked = "true";
                // Lock system prompt if identity is selected
                if (dom.systemPromptInput) dom.systemPromptInput.disabled = true;
            } else {
                input.dataset.wasChecked = "false";
            }

            const label = document.createElement('label');
            label.htmlFor = `identity-${index}`;
            label.className = 'tag-label'; // Add styling class
            label.textContent = identity.name;
            if (identity.enabled === false) {
                const badge = document.createElement('span');
                badge.className = 'identity-tag-disabled';
                badge.textContent = '未启用';
                label.appendChild(badge);
            }

            // Click event for toggle logic and auto-fill
            input.onclick = (e) => {
                if (input.dataset.wasChecked === "true") {
                    input.checked = false;
                    input.dataset.wasChecked = "false";
                    this.updateTagsInput();
                    this.updateSystemPromptHintVisibility('');
                    if (dom.systemPromptInput) {
                        dom.systemPromptInput.disabled = false;
                        dom.systemPromptInput.value = '';
                    }
                } else {
                    // Uncheck others
                    const allRadios = container.querySelectorAll('input[type="radio"]');
                    allRadios.forEach(r => r.dataset.wasChecked = "false");

                    input.checked = true;
                    input.dataset.wasChecked = "true";
                    this.updateTagsInput();

                    // Auto-fill prompt
                    if (input.dataset.prompt) {
                        dom.systemPromptInput.value = input.dataset.prompt;
                    }
                    this.updateSystemPromptHintVisibility(input.value);
                    // Lock system prompt
                    if (dom.systemPromptInput) dom.systemPromptInput.disabled = true;
                }
            };

            option.appendChild(input);
            option.appendChild(label);
            container.appendChild(option);
        });
    }

    renderIdentityModalList() {
        const list = document.getElementById('identity-modal-list');
        if (!list) return;

        list.innerHTML = '';
        if (this.identities.length === 0) {
            list.innerHTML = '<div class="no-identities">暂无身份，请先添加</div>';
            return;
        }

        this.identities.forEach(identity => {
            const card = document.createElement('div');
            card.className = 'identity-card';

            const info = document.createElement('div');
            info.className = 'identity-info';
            const promptText = identity.prompt || '（未设置提示词）';
            const promptPreview = promptText.length > 100 ? `${promptText.slice(0, 100)}...` : promptText;
            const safeName = this.escapeHtml(identity.name);
            const safeId = this.escapeHtml(identity.id);
            const safePrompt = this.escapeHtml(promptPreview);
            const safePromptFull = this.escapeHtml(promptText);
            info.innerHTML = `
                <div class="identity-name">${safeName}</div>
                <div class="identity-meta">ID: ${safeId}</div>
                <div class="identity-prompt" title="${safePromptFull}">${safePrompt}</div>
            `;

            const actions = document.createElement('div');
            actions.className = 'identity-actions';

            const toggleBtn = document.createElement('button');
            toggleBtn.className = `identity-toggle ${identity.enabled ? 'active' : ''}`;
            toggleBtn.textContent = identity.enabled ? '已启用' : '未启用';
            toggleBtn.onclick = async () => {
                const targetState = !identity.enabled;
                toggleBtn.disabled = true;
                const currentSelection = dom.configTagsInput?.value || '';
                const success = await this.updateIdentity(identity.id, { enabled: targetState });
                toggleBtn.disabled = false;
                if (success) {
                    showToast(`身份「${identity.name}」已${targetState ? '启用' : '停用'}`, 'info');
                    await this.loadIdentities();
                    this.renderIdentityOptions(this.normalizeIdentityTag(currentSelection));
                }
            };

            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-secondary';
            editBtn.textContent = '编辑';
            editBtn.onclick = () => this.startIdentityEdit(identity.id);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger';
            deleteBtn.textContent = '删除';
            deleteBtn.onclick = async () => {
                const confirmDelete = confirm(`确定删除身份「${identity.name}」吗？`);
                if (!confirmDelete) return;
                const success = await this.deleteIdentity(identity.id);
                if (success) {
                    if (this.editingIdentityId === identity.id) {
                        this.resetIdentityForm();
                    }
                    const selectedTag = dom.configTagsInput?.value || '';
                    await this.loadIdentities();
                    this.renderIdentityOptions(this.normalizeIdentityTag(selectedTag));
                }
            };

            actions.appendChild(toggleBtn);
            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
            card.appendChild(info);
            card.appendChild(actions);
            list.appendChild(card);
        });
    }

    initIdentityManagementEvents() {
        if (this.identityEventsInitialized) return;
        this.identityEventsInitialized = true;

        domUtils.addEvent('identity-manager-btn', 'click', () => {
            this.openIdentityManager();
        });

        const closeModal = () => this.closeIdentityManager();
        domUtils.addEvent('identity-manager-close-btn', 'click', closeModal);
        const overlay = document.querySelector('#identity-manager-modal .modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', closeModal);
        }

        domUtils.addEvent('identity-modal-save', 'click', async () => {
            await this.handleIdentitySubmit();
        });
        domUtils.addEvent('identity-modal-reset', 'click', () => {
            this.resetIdentityForm();
        });
    }

    openIdentityManager() {
        if (!dom.identityManagerModal) return;
        dom.identityManagerModal.classList.add('active');
        this.resetIdentityForm({ keepValues: false });
        this.renderIdentityModalList();
    }

    closeIdentityManager() {
        if (!dom.identityManagerModal) return;
        dom.identityManagerModal.classList.remove('active');
        this.resetIdentityForm({ keepValues: true });
    }

    startIdentityEdit(identityId) {
        const identity = this.identities.find(i => i.id === identityId);
        if (!identity) return;
        this.editingIdentityId = identityId;
        if (dom.identityIdInput) {
            dom.identityIdInput.value = identity.id;
            dom.identityIdInput.disabled = true;
        }
        if (dom.identityNameInput) dom.identityNameInput.value = identity.name;
        if (dom.identityPromptInput) dom.identityPromptInput.value = identity.prompt || '';
        const saveBtn = document.getElementById('identity-modal-save');
        if (saveBtn) {
            saveBtn.textContent = '保存修改';
        }
    }

    resetIdentityForm(options = {}) {
        const { keepValues = false } = options;
        this.editingIdentityId = null;
        if (dom.identityIdInput) {
            dom.identityIdInput.disabled = false;
            if (!keepValues) dom.identityIdInput.value = '';
        }
        if (dom.identityNameInput && !keepValues) dom.identityNameInput.value = '';
        if (dom.identityPromptInput && !keepValues) dom.identityPromptInput.value = '';
        const saveBtn = document.getElementById('identity-modal-save');
        if (saveBtn) {
            saveBtn.textContent = '保存';
        }
    }

    async handleIdentitySubmit() {
        const rawId = dom.identityIdInput?.value || this.editingIdentityId || '';
        const normalizedId = this.normalizeIdentityTag(rawId);
        const name = (dom.identityNameInput?.value || '').trim();
        const prompt = (dom.identityPromptInput?.value || '').trim();

        if (!normalizedId) {
            showToast('请输入合法的身份ID（仅限字母、数字、下划线或连字符）', 'error');
            return;
        }
        if (!name) {
            showToast('请输入身份名称', 'error');
            return;
        }
        if (!prompt) {
            showToast('请输入身份提示词', 'error');
            return;
        }

        let success = false;
        if (this.editingIdentityId) {
            success = await this.updateIdentity(this.editingIdentityId, { name, prompt });
        } else {
            success = await this.createIdentity({
                id: normalizedId,
                name,
                prompt,
                enabled: true
            });
        }

        if (success) {
            const selectedTag = dom.configTagsInput?.value || '';
            await this.loadIdentities();
            this.renderIdentityOptions(this.normalizeIdentityTag(selectedTag));
            this.resetIdentityForm();
        }
    }

    async createIdentity(payload) {
        try {
            const response = await fetch('/api/identities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok || result.status !== 'success') {
                const message = result.detail || '创建身份失败';
                showToast(message, 'error');
                return false;
            }
            showToast('身份已创建', 'success');
            return true;
        } catch (error) {
            console.error('创建身份失败:', error);
            showToast('创建身份失败', 'error');
            return false;
        }
    }

    async updateIdentity(roleId, payload) {
        try {
            const response = await fetch(`/api/identities/${roleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok || result.status !== 'success') {
                const message = result.detail || '更新身份失败';
                showToast(message, 'error');
                return false;
            }
            return true;
        } catch (error) {
            console.error('更新身份失败:', error);
            showToast('更新身份失败', 'error');
            return false;
        }
    }

    async deleteIdentity(roleId) {
        try {
            const response = await fetch(`/api/identities/${roleId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                const message = result.detail || '删除身份失败';
                showToast(message, 'error');
                return false;
            }
            showToast('身份已删除', 'success');
            return true;
        } catch (error) {
            console.error('删除身份失败:', error);
            showToast('删除身份失败', 'error');
            return false;
        }
    }

    // 渲染配置列表
    renderConfigList() {
        if (!dom.configListDiv) return;

        dom.configListDiv.innerHTML = '';

        this.configs.forEach(c => {
            const item = document.createElement('div');
            const isCurrent = c.name === this.currentConfigName;
            const isEditing = c.name === this.editingConfigName;

            item.className = `config-item ${isEditing ? 'active' : ''} ${isCurrent ? 'is-current' : ''}`;
            item.title = isCurrent ? '当前生效模型' : '点击设置为当前模型';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'config-item-name';
            nameSpan.textContent = c.name;

            // 如果是当前模型，添加绿色标识
            if (isCurrent) {
                const indicator = document.createElement('div');
                indicator.className = 'current-indicator';
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
                    this.currentConfigName = c.name;
                    showToast(`已切换到模型: ${c.name}`, 'success');
                    await this.saveConfigs();
                    // 更新显示名称，确保身份标签生效
                    const isMulti = dom.multiLLMToggle?.classList.contains('active') || false;
                    await this.updateCurrentDisplayNameByToggle(isMulti);
                    this.renderConfigList();
                    this.selectConfigToEdit(c.name);
                };

                actionsDiv.appendChild(setCurrentBtn);
                item.appendChild(actionsDiv);
            }

            item.onclick = async (e) => {
                // 只加载配置到表单查看和编辑，不自动设置当前模型
                this.selectConfigToEdit(c.name);
            };

            dom.configListDiv.appendChild(item);
        });

        this.updateMultiLLMStatus();
    }

    // 保存配置
    async saveConfigs() {
        try {
            // Merge with existing configData to preserve other fields (agent_config, job_config, resume_config, etc.)
            const payload = {
                ...this.configData,
                configs: this.configs,
                current_config: this.currentConfigName,
                multi_llm_active_names: Array.from(this.multiLLMActiveNames),
                model_local: this.modelLocal || ["Qwen3-0.6B"]
            };

            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            // 保存成功后刷新智囊团显示
            this.loadThinkTankRoles();
            // 更新全局显示名称（重要：确保身份标签生效）
            const isMulti = dom.multiLLMToggle?.classList.contains('active') || false;
            await this.updateCurrentDisplayNameByToggle(isMulti);
            return true;
        } catch (e) {
            showToast('保存失败', 'error');
            return false;
        }
    }

    // 更新多模型状态
    updateMultiLLMStatus() {
        if (!dom.multiLLMCount) return;

        const count = this.multiLLMActiveNames.size;
        if (count === 0) {
            dom.multiLLMCount.textContent = '未启用';
            dom.multiLLMCount.style.color = 'var(--text-tertiary)';
            dom.multiLLMCount.style.background = 'transparent';
        } else {
            dom.multiLLMCount.textContent = `已启用 ${count} 个模型`;
            dom.multiLLMCount.style.color = 'var(--accent-primary)';
            dom.multiLLMCount.style.background = 'rgba(79, 70, 229, 0.1)';
        }
    }

    // 选择配置进行编辑
    selectConfigToEdit(name) {
        this.editingConfigName = name;
        const config = this.configs.find(c => c.name === name);

        if (config) {
            dom.configNameInput.value = config.name;
            dom.apiBaseInput.value = config.base_url;
            dom.apiKeyInput.value = config.api_key;
            dom.modelNameInput.value = config.model;

            // 加载身份到快速选择（支持旧身份兼容）
            let selectedTag = config.tags && config.tags.length > 0 ? config.tags[0] : '';
            selectedTag = this.normalizeIdentityTag(selectedTag);

            // Render identities with selection
            this.renderIdentityOptions(selectedTag);

            // Update hidden input
            dom.configTagsInput.value = selectedTag;

            dom.systemPromptInput.value = config.system_prompt || "";
            // 根据身份选择显示/隐藏提示
            this.updateSystemPromptHintVisibility(selectedTag);
            dom.deleteConfigBtn.style.display = 'block';
        }

        this.renderConfigList(); // Re-render to update active class
    }

    // 加载智囊团角色列表
    async loadThinkTankRoles() {
        const multiModelList = document.getElementById('multi-model-list');
        if (!multiModelList) return;

        try {
            multiModelList.innerHTML = '';

            let hasModelsWithTags = false;

            // 直接列出所有配置的模型，去掉角色分组
            this.configs.forEach(config => {
                // 如果模型没有身份标签，跳过
                if (!config.tags || config.tags.length === 0) return;

                hasModelsWithTags = true;

                const option = document.createElement('div');
                option.className = 'multi-model-option';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `multi-model-${config.name}`;
                checkbox.value = config.name;
                checkbox.checked = this.multiLLMActiveNames.has(config.name);
                checkbox.onchange = async (e) => {
                    if (checkbox.checked) {
                        this.multiLLMActiveNames.add(config.name);
                    } else {
                        this.multiLLMActiveNames.delete(config.name);
                    }
                    this.updateMultiLLMStatus();
                    await this.saveConfigs();
                };

                const label = document.createElement('label');
                label.htmlFor = `multi-model-${config.name}`;
                // 将英文标签转换为中文显示
                const chineseTags = config.tags.map(tag => {
                    // Check if it's one of our loaded identities
                    const identity = this.identities.find(i => i.name === tag);
                    if (identity) return identity.name;

                    const tagMap = {
                        'tech_assistant_tag': '技术辅助者',
                        'concise_assistant_tag': '精简辅助者',
                        'guide_tag': '引导者'
                    };
                    return tagMap[tag] || tag;
                });
                const displayTags = config.tags.map(tag => this.getIdentityDisplayName(tag));
                label.innerHTML = `
                    <span>${config.name}</span>
                    <span class="model-tag-small">${displayTags.join(', ')}</span>
                `;

                option.appendChild(checkbox);
                option.appendChild(label);
                multiModelList.appendChild(option);
            });

            // 如果没有配置任何模型，显示提示
            if (!hasModelsWithTags) {
                multiModelList.innerHTML = `
                    <div class="no-config-message">
                        <div class="no-config-icon">📝</div>
                        <div class="no-config-text">暂无可用的模型配置</div>
                        <div class="no-config-hint">请在左侧添加模型并设置身份标签</div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('加载智囊团角色失败:', error);
            multiModelList.innerHTML = '<div class="error-message">加载角色配置失败</div>';
        }
    }

    // 更新隐藏的身份输入框
    updateTagsInput() {
        const selectedRadio = document.querySelector('.tags-quick-select input[type="radio"]:checked');
        if (selectedRadio) {
            dom.configTagsInput.value = this.normalizeIdentityTag(selectedRadio.value);
        } else {
            dom.configTagsInput.value = '';
        }
    }

    // 清空配置表单
    clearConfigForm() {
        this.editingConfigName = null;
        dom.configNameInput.value = "";
        dom.apiBaseInput.value = "";
        dom.apiKeyInput.value = "";
        dom.modelNameInput.value = "";
        dom.configTagsInput.value = "";
        // 清除身份单选框
        // Reset identities
        this.renderIdentityOptions('');
        dom.systemPromptInput.value = "";
        // 隐藏 System Prompt 提示
        this.updateSystemPromptHintVisibility('');
        dom.deleteConfigBtn.style.display = 'none';
        this.renderConfigList();
    }

    // 保存配置表单
    async saveConfigForm(options = {}) {
        const { skipReload = false } = options || {};
        const name = dom.configNameInput.value.trim();
        if (!name) {
            showToast("请输入配置名称", 'error');
            return false;
        }

        // 获取并映射身份：旧身份 → 新身份
        let tags = dom.configTagsInput.value
            .split(',')
            .map(t => this.normalizeIdentityTag(t))
            .filter(t => t);

        // ===== 身份唯一性验证 =====
        // 检查新配置的身份是否与其他配置冲突
        if (tags.length > 0) {
            for (const tag of tags) {
                // 查找是否有其他配置使用了相同的身份
                const conflictConfig = this.configs.find(c =>
                    c.name !== this.editingConfigName && // 排除正在编辑的配置本身
                    c.tags && c.tags.includes(tag)
                );

                if (conflictConfig) {
                    const displayName = this.getIdentityDisplayName(tag);
                    showToast(
                        `身份 "${displayName}" 已被模型 "${conflictConfig.name}" 使用，每个身份只能绑定一个模型`,
                        'error'
                    );
                    return false;
                }
            }
        }

        const newConfig = {
            name: name,
            base_url: dom.apiBaseInput.value.trim(),
            api_key: dom.apiKeyInput.value.trim(),
            model: dom.modelNameInput.value.trim(),
            tags: tags,
            system_prompt: dom.systemPromptInput.value.trim()
        };

        if (this.editingConfigName) {
            // 编辑现有配置
            const idx = this.configs.findIndex(c => c.name === this.editingConfigName);
            if (idx >= 0) {
                // 如果改了名字，检查新名字是否冲突
                if (name !== this.editingConfigName && this.configs.some(c => c.name === name)) {
                    showToast(`配置名称 "${name}" 已存在`, 'error');
                    return false;
                }

                // 更新配置
                this.configs[idx] = newConfig;

                // 如果改了名字，需要更新相关引用
                if (name !== this.editingConfigName) {
                    // 更新当前配置引用
                    if (this.currentConfigName === this.editingConfigName) {
                        this.currentConfigName = name;
                        // 更新显示名称
                        const isMulti = dom.multiLLMToggle?.classList.contains('active') || false;
                        await this.updateCurrentDisplayNameByToggle(isMulti);
                    }
                    // 更新多模型激活集合
                    if (this.multiLLMActiveNames.has(this.editingConfigName)) {
                        this.multiLLMActiveNames.delete(this.editingConfigName);
                        this.multiLLMActiveNames.add(name);
                    }
                    // 更新编辑状态
                    this.editingConfigName = name;
                }
            } else {
                // 异常情况：编辑的配置找不到（可能被删了），当作新建
                if (this.configs.some(c => c.name === name)) {
                    showToast(`配置名称 "${name}" 已存在`, 'error');
                    return false;
                }
                this.configs.push(newConfig);
                this.editingConfigName = name;
            }
        } else {
            // 新建配置
            if (this.configs.some(c => c.name === name)) {
                showToast(`配置名称 "${name}" 已存在`, 'error');
                return false;
            }
            this.configs.push(newConfig);
            this.editingConfigName = name;
        }

        // 保存时自动设置为当前模型（如果是新建或者当前正在使用的模型被修改）
        if (name === this.currentConfigName || !this.currentConfigName) {
            this.currentConfigName = name;
            showToast(`配置已保存`, 'success');
            // 更新显示名称
            const isMulti = dom.multiLLMToggle?.classList.contains('active') || false;
            await this.updateCurrentDisplayNameByToggle(isMulti);
        } else {
            // 如果修改的不是当前模型，不自动切换，只提示保存成功
            showToast("配置已保存", 'success');
        }

        const success = await this.saveConfigs();
        if (success && !skipReload) {
            await this.loadConfigs();
        }
        return success;
    }

    // 删除配置
    async deleteConfig() {
        const name = dom.configNameInput.value.trim();
        if (!name || !confirm(`确定删除配置 "${name}" 吗?`)) return;

        this.configs = this.configs.filter(c => c.name !== name);
        this.multiLLMActiveNames.delete(name);

        if (this.currentConfigName === name) {
            this.currentConfigName = this.configs.length > 0 ? this.configs[0].name : "";
            // 更新显示名称
            const isMulti = dom.multiLLMToggle?.classList.contains('active') || false;
            await this.updateCurrentDisplayNameByToggle(isMulti);
        }

        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    configs: this.configs,
                    current_config: this.currentConfigName,
                    multi_llm_active_names: Array.from(this.multiLLMActiveNames),
                    model_local: this.modelLocal || ["Qwen3-0.6B"]
                })
            });
            showToast("配置已删除", 'success');
            await this.loadConfigs();
        } catch (e) {
            showToast("删除失败", 'error');
        }
    }

    // 测试连接
    async testConnection() {
        const data = {
            api_key: dom.apiKeyInput.value.trim(),
            base_url: dom.apiBaseInput.value.trim(),
            model: dom.modelNameInput.value.trim()
        };

        if (!data.api_key || !data.base_url || !data.model) {
            return showToast("请填写完整配置信息", 'error');
        }

        showToast("正在测试连接...", 'info');

        try {
            const res = await fetch('/api/test_connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await res.json();
            if (result.success) {
                showToast("连接成功! " + result.message, 'success');
            } else {
                showToast("连接失败: " + result.message, 'error');
            }
        } catch (e) {
            showToast("测试请求失败", 'error');
        }
    }

    // 初始化标签页
    initTabs() {
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

        // 初始加载智囊团内容
        this.loadThinkTankRoles();
    }

    // 切换标签页
    switchTab(tabName) {
        // 移除所有活动状态
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // 添加当前活动状态
        const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
        const activeContent = document.getElementById(`tab-${tabName}`);

        if (activeBtn) activeBtn.classList.add('active');
        if (activeContent) activeContent.classList.add('active');

        // 如果切换到多模型集群，刷新列表
        if (tabName === 'multi') {
            this.loadThinkTankRoles();
        }
    }

    // ===== 智能分析配置管理 =====

    // 加载智能分析配置
    async loadAgentConfig() {
        try {
            const response = await fetch('/api/agent/status');
            const data = await response.json();

            if (!data.available) {
                console.log('智能分析模块不可用');
                return;
            }

            // 保存配置到全局变量
            window.agentConfig = data.config || {};
            if (data.model_local) {
                this.modelLocal = data.model_local;
            }

            // 同步意图识别开关状态
            const intentEnabled = window.agentConfig.intent_recognition_enabled === true;
            window.intentRecognitionEnabled = intentEnabled;

            // 填充模型类型选择框
            dom.agentModelTypeSelect.innerHTML = `
                <option value="local">本地模型</option>
                <option value="api">API 模型</option>
            `;

            // 设置模型选择
            const agentConfig = window.agentConfig;
            if (agentConfig.model_type) {
                dom.agentModelTypeSelect.value = agentConfig.model_type;
            }

            // 设置思考模式
            if (dom.agentEnableThinkingBtn) {
                const isEnabled = agentConfig.enable_thinking === true;
                this.updateThinkingModeUI('agent', isEnabled);
            }

            // 触发类型切换处理
            this.handleModelTypeChange(dom.agentModelTypeSelect);

            // 如果是API模式，设置选中的模型
            if (agentConfig.model_type === 'api' && agentConfig.model_name) {
                dom.agentModelSelect.value = agentConfig.model_name;
            }

            // 设置其他参数
            if (agentConfig.min_chars_threshold) {
                dom.agentMinCharsInput.value = agentConfig.min_chars_threshold;
            }
            if (agentConfig.silence_threshold) {
                dom.agentSilenceThresholdInput.value = agentConfig.silence_threshold;
            }


        } catch (e) {
            console.error('加载智能分析配置失败:', e);
        }
    }

    // 切换思考模式UI状态
    toggleThinkingMode(type) {
        let btn;
        if (type === 'agent') btn = dom.agentEnableThinkingBtn;
        else if (type === 'intent') btn = dom.intentRecognitionEnableThinkingBtn;
        else if (type === 'job') btn = dom.jobEnableThinkingBtn;
        else if (type === 'resume') btn = dom.resumeEnableThinkingBtn;

        if (!btn) return;

        const willEnable = !btn.classList.contains('active');
        this.updateThinkingModeUI(type, willEnable);

        // Persist state for Job and Resume
        if (type === 'job' || type === 'resume') {
            if (!this.configData) this.configData = {};
            const configKey = type + '_config';
            if (!this.configData[configKey]) this.configData[configKey] = {};

            this.configData[configKey].thinking_mode = willEnable;
            this.saveConfigs();
        }
    }

    // 更新思考模式UI显示
    updateThinkingModeUI(type, isEnabled) {
        let btn;
        if (type === 'agent') btn = dom.agentEnableThinkingBtn;
        else if (type === 'intent') btn = dom.intentRecognitionEnableThinkingBtn;
        else if (type === 'job') btn = dom.jobEnableThinkingBtn;
        else if (type === 'resume') btn = dom.resumeEnableThinkingBtn;

        if (!btn) return;

        const badge = btn.querySelector('.status-badge');

        if (isEnabled) {
            btn.classList.add('active');
            if (badge) badge.textContent = 'ON';
        } else {
            btn.classList.remove('active');
            if (badge) badge.textContent = 'OFF';
        }
    }

    // 更新思考模式可见性
    updateThinkingModeVisibility(type, modelType) {
        let group;
        if (type === 'job') group = dom.jobThinkingModeGroup;
        else if (type === 'resume') group = dom.resumeThinkingModeGroup;

        if (!group) return;

        if (modelType === 'local') {
            group.style.display = 'block';
        } else {
            group.style.display = 'none';
            // Optional: reset to off when hiding?
            // this.updateThinkingModeUI(type, false);
        }
    }

    // 保存智能分析配置 (统一保存智能分析和意图识别配置)
    async saveAgentConfig() {
        try {
            // 1. 获取智能分析配置
            const modelType = dom.agentModelTypeSelect ? dom.agentModelTypeSelect.value : 'local';
            let modelName = '';

            if (modelType === 'local') {
                // 本地模式下，从下拉框获取选择的模型
                modelName = dom.agentModelSelect ? dom.agentModelSelect.value : '';
                if (!modelName) {
                    modelName = window.agentConfig?.model_name || (this.modelLocal && this.modelLocal[0]) || 'Qwen3-0.6B';
                }
            } else {
                modelName = dom.agentModelSelect ? dom.agentModelSelect.value : '';
                // 只有当该部分可见时才校验必填
                if (!modelName && dom.agentModelTypeSelect && dom.agentModelTypeSelect.offsetParent) {
                    showToast('请选择智能分析API模型', 'error');
                    return false;
                }
            }

            // 2. 获取意图识别配置
            const intentModelType = dom.intentRecognitionModelTypeSelect ? dom.intentRecognitionModelTypeSelect.value : 'local';
            let intentModelName = '';

            if (intentModelType === 'local') {
                // 本地模式下，从下拉框获取选择的模型
                intentModelName = dom.intentRecognitionModelSelect ? dom.intentRecognitionModelSelect.value : '';
                if (!intentModelName) {
                    intentModelName = window.intentRecognitionConfig?.model_name || (this.modelLocal && this.modelLocal[0]) || 'Qwen3-0.6B';
                }
            } else {
                intentModelName = dom.intentRecognitionModelSelect ? dom.intentRecognitionModelSelect.value : '';
                // 只有当该部分可见时才校验必填
                if (!intentModelName && dom.intentRecognitionModelTypeSelect && dom.intentRecognitionModelTypeSelect.offsetParent) {
                    showToast('请选择意图识别API模型', 'error');
                    return false;
                }
            }

            // 获取思考模式状态
            const agentThinkingEnabled = dom.agentEnableThinkingBtn ? dom.agentEnableThinkingBtn.classList.contains('active') : false;
            const intentThinkingEnabled = dom.intentRecognitionEnableThinkingBtn ? dom.intentRecognitionEnableThinkingBtn.classList.contains('active') : false;

            const config = {
                // 智能分析参数
                model_type: modelType,
                model_name: modelName,
                enable_thinking: agentThinkingEnabled,
                min_chars_threshold: parseInt(dom.agentMinCharsInput?.value) || 10,
                silence_threshold: parseFloat(dom.agentSilenceThresholdInput?.value) || 2.0,

                // 意图识别参数
                intent_model_type: intentModelType,
                intent_model_name: intentModelName,
                intent_enable_thinking: intentThinkingEnabled,
                // 保持当前的启用状态
                intent_recognition_enabled: window.intentRecognitionEnabled
            };

            const response = await fetch('/api/agent/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const result = await response.json();
            if (result.status === "success") {
                // 更新本地缓存的配置
                window.agentConfig = { ...window.agentConfig, ...config };
                window.intentRecognitionConfig = {
                    model_type: intentModelType,
                    model_name: intentModelName
                };
                return true;
            } else {
                return false;
            }
        } catch (e) {
            console.error('保存智能配置失败:', e);
            return false;
        }
    }

    // 更新意图识别启用状态
    async updateIntentRecognitionState(isEnabled) {
        try {
            const payload = { intent_recognition_enabled: !!isEnabled };
            const response = await fetch('/api/agent/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (result.status === 'success') {
                if (!window.agentConfig) {
                    window.agentConfig = {};
                }
                window.agentConfig.intent_recognition_enabled = payload.intent_recognition_enabled;
                window.intentRecognitionEnabled = payload.intent_recognition_enabled;
                return true;
            }
            return false;
        } catch (error) {
            console.error('同步意图识别状态失败:', error);
            return false;
        }
    }

    // 处理模型类型切换
    handleModelTypeChange(select) {
        const apiModelGroup = document.getElementById('api-model-select-group');
        const apiModelLabel = apiModelGroup.querySelector('label');
        const apiModelSelect = document.getElementById('agent-model-select');
        const hintText = apiModelGroup.querySelector('.form-hint');

        if (select.value === 'local') {
            // 本地模型模式 - 使用 model_local 列表
            const currentModel = window.agentConfig?.model_name || (this.modelLocal && this.modelLocal[0]) || 'Qwen3-0.6B';

            apiModelGroup.style.display = 'block';
            apiModelLabel.textContent = '本地模型';

            apiModelSelect.innerHTML = '';
            const localModels = this.modelLocal || ['Qwen3-0.6B'];
            localModels.forEach(m => {
                const option = document.createElement('option');
                option.value = m;
                option.textContent = m;
                if (m === currentModel) option.selected = true;
                apiModelSelect.appendChild(option);
            });

            apiModelSelect.disabled = false;
            hintText.textContent = `选择本地模型`;

            // 显示思考模式选项
            if (dom.agentEnableThinkingGroup) {
                dom.agentEnableThinkingGroup.style.display = 'block';
            }
        } else {
            // API 模型模式
            apiModelGroup.style.display = 'block';
            apiModelLabel.textContent = 'API 模型选择';
            apiModelSelect.innerHTML = '<option value="">-- 请选择 --</option>';
            apiModelSelect.disabled = false;

            // 加载配置列表中的所有模型
            this.configs.forEach(config => {
                const option = document.createElement('option');
                option.value = config.name;
                option.textContent = config.name;
                apiModelSelect.appendChild(option);
            });

            // 如果当前配置是API模式，尝试选中当前配置的模型
            const agentConfig = window.agentConfig || {};
            if (agentConfig.model_type === 'api' && agentConfig.model_name) {
                apiModelSelect.value = agentConfig.model_name;
            }

            hintText.textContent = '选择用于智能判定的小模型（建议使用轻量级模型）';

            // 隐藏思考模式选项
            if (dom.agentEnableThinkingGroup) {
                dom.agentEnableThinkingGroup.style.display = 'none';
            }
        }
    }

    // 获取当前配置状态
    getCurrentState() {
        return {
            configs: this.configs,
            currentConfigName: this.currentConfigName,
            multiLLMActiveNames: this.multiLLMActiveNames,
            editingConfigName: this.editingConfigName
        };
    }

    // 更新 System Prompt 提示的显示状态
    updateSystemPromptHintVisibility(selectedTag) {
        if (dom.systemPromptHint) {
            // 当选择身份标签时显示提示
            if (selectedTag) {
                dom.systemPromptHint.style.display = 'block';
            } else {
                dom.systemPromptHint.style.display = 'none';
            }
        }
    }

    // 获取当前配置的显示名称（根据智囊团状态决定）
    // 获取当前配置显示信息（标题和副标题）
    getCurrentDisplayInfo(isMultiOverride = null) {
        const isMultiActive = isMultiOverride !== null ? isMultiOverride : dom.multiLLMToggle?.classList.contains('active');

        if (isMultiActive) {
            return {
                title: THINK_TANK_DISPLAY_NAME,
                subtitle: ''
            };
        }

        const config = this.configs.find(c => c.name === this.currentConfigName);
        if (!config) {
            return {
                title: this.currentConfigName || '未选择模型',
                subtitle: ''
            };
        }

        // Check for identity tag
        if (config.tags && config.tags.length > 0) {
            const tag = this.normalizeIdentityTag(config.tags[0]);
            if (tag) {
                let displayTitle = tag;
                const identity = this.identities.find(i => i.id === tag);

                if (identity && identity.name) {
                    displayTitle = identity.name;
                }

                // Capitalize or format tag if it's raw
                if (displayTitle === tag) {
                    // Simple capitalization for niceness if it's just a raw tag
                    if (displayTitle.includes('_')) {
                        displayTitle = displayTitle.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    } else {
                        displayTitle = displayTitle.charAt(0).toUpperCase() + displayTitle.slice(1);
                    }
                }

                return {
                    title: displayTitle,
                    subtitle: config.name
                };
            }
        }

        return {
            title: config.name,
            subtitle: ''
        };
    }

    // 获取当前配置的显示名称（已废弃但保留用于兼容性，返回 Title）
    getCurrentDisplayName() {
        const info = this.getCurrentDisplayInfo();
        return info.title;
    }

    getConfigDisplayName(configName, preferIdentity = false) {
        if (!configName) return '';
        const config = this.configs.find(c => c.name === configName);
        if (!config) return configName;

        if (preferIdentity && config.tags && config.tags.length > 0) {
            const tag = this.normalizeIdentityTag(config.tags[0]);
            if (tag) {
                const identity = this.identities.find(i => i.id === tag);
                if (identity && identity.enabled !== false && identity.name) {
                    return identity.name;
                }
                return tag;
            }
        }

        return config.name;
    }

    // 更新全局显示名称（根据智囊团状态动态决定）
    updateCurrentDisplayName() {
        // 更新 window.currentDisplayName 为简单的标题名称 (for backward compatibility)
        const info = this.getCurrentDisplayInfo();
        window.currentDisplayName = info.title;
        window.currentDisplaySubtitle = info.subtitle; // New global

        // 返回显示名称，供调用者使用
        return info.title;
    }

    // 根据智囊团开关状态更新显示名称
    async updateCurrentDisplayNameByToggle(isMultiToggleActive) {
        // 确保身份数据已加载
        if (this.identities.length === 0) {
            try {
                await this.loadIdentities();
            } catch (error) {
                console.error('加载身份数据失败:', error);
            }
        }

        const info = this.getCurrentDisplayInfo(isMultiToggleActive);
        window.currentDisplayName = info.title;
        window.currentDisplaySubtitle = info.subtitle;
        window.currentConfigName = this.currentConfigName; // Sync global config name

        // 同时更新 UI 上的显示
        const displayElement = document.querySelector('.model-name-display');
        if (displayElement) {
            displayElement.textContent = info.title;
        }

        const subtitleElement = document.querySelector('.model-subtitle');
        if (subtitleElement) {
            if (info.subtitle) {
                subtitleElement.textContent = info.subtitle;
                subtitleElement.style.display = 'block';
            } else {
                subtitleElement.textContent = '';
                subtitleElement.style.display = 'none';
            }
        }

        // 返回显示名称
        return info.title;
    }

    // ===== 意图识别配置管理 =====

    // 加载意图识别配置
    async loadIntentRecognitionConfig() {
        try {
            // 从 /api/agent/status 加载智能分析配置，其中包含意图识别配置
            const response = await fetch('/api/agent/status');
            const data = await response.json();

            if (!data || !data.available) {
                console.log('智能分析模块不可用');
                return;
            }

            if (data.model_local) {
                this.modelLocal = data.model_local;
            }

            // 从 agent_config 中提取意图识别配置
            const agentConfig = data.config || {};
            window.intentRecognitionConfig = {
                model_type: agentConfig.intent_model_type || 'local',
                model_name: agentConfig.intent_model_name || 'Qwen3-0.6B',
                enable_thinking: agentConfig.intent_enable_thinking === true
            };

            // 填充模型类型选择框
            const typeSelect = document.getElementById('intent-recognition-model-type-select');
            if (typeSelect) {
                typeSelect.innerHTML = `
                    <option value="local">本地模型</option>
                    <option value="api">API 模型</option>
                `;

                // 设置模型选择
                const config = window.intentRecognitionConfig;
                if (config.model_type) {
                    typeSelect.value = config.model_type;
                }

                // 设置思考模式
                if (dom.intentRecognitionEnableThinkingBtn) {
                    const isEnabled = config.enable_thinking === true;
                    this.updateThinkingModeUI('intent', isEnabled);
                }

                // 触发类型切换处理
                this.handleIntentRecognitionModelTypeChange(typeSelect);

                // 如果是API模式，设置选中的模型
                if (config.model_type === 'api' && config.model_name) {
                    const modelSelect = document.getElementById('intent-recognition-model-select');
                    if (modelSelect) {
                        modelSelect.value = config.model_name;
                    }
                }
            }

        } catch (e) {
            console.error('加载意图识别配置失败:', e);
        }
    }

    // 处理意图识别模型类型切换
    handleIntentRecognitionModelTypeChange(select) {
        const apiModelGroup = document.getElementById('intent-recognition-api-model-select-group');
        if (!apiModelGroup) return;

        const apiModelLabel = apiModelGroup.querySelector('label');
        const apiModelSelect = document.getElementById('intent-recognition-model-select');
        const hintText = apiModelGroup.querySelector('.form-hint');

        if (select.value === 'local') {
            // 本地模型模式 - 使用 model_local 列表
            const config = window.intentRecognitionConfig || {};
            const currentModel = config.model_name || (this.modelLocal && this.modelLocal[0]) || 'Qwen3-0.6B';

            apiModelGroup.style.display = 'block';
            apiModelLabel.textContent = '本地模型';

            apiModelSelect.innerHTML = '';
            const localModels = this.modelLocal || ['Qwen3-0.6B'];
            localModels.forEach(m => {
                const option = document.createElement('option');
                option.value = m;
                option.textContent = m;
                if (m === currentModel) option.selected = true;
                apiModelSelect.appendChild(option);
            });

            apiModelSelect.disabled = false;
            hintText.textContent = `选择本地模型`;

            // 显示思考模式选项
            if (dom.intentRecognitionEnableThinkingGroup) {
                dom.intentRecognitionEnableThinkingGroup.style.display = 'block';
            }
        } else {
            // API 模型模式
            apiModelGroup.style.display = 'block';
            apiModelLabel.textContent = 'API 模型选择';
            apiModelSelect.innerHTML = '<option value="">-- 请选择 --</option>';
            apiModelSelect.disabled = false;

            // 加载配置列表中的所有模型
            this.configs.forEach(config => {
                const option = document.createElement('option');
                option.value = config.name;
                option.textContent = config.name;
                apiModelSelect.appendChild(option);
            });

            // 如果当前配置是API模式，尝试选中当前配置的模型
            const config = window.intentRecognitionConfig || {};
            if (config.model_type === 'api' && config.model_name) {
                apiModelSelect.value = config.model_name;
            }

            hintText.textContent = '选择用于意图识别的小模型（建议使用轻量级模型）';

            // 隐藏思考模式选项
            if (dom.intentRecognitionEnableThinkingGroup) {
                dom.intentRecognitionEnableThinkingGroup.style.display = 'none';
            }
        }
    }
}
