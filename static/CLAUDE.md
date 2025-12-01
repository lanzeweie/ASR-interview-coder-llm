> 📍 **导航**: [返回根级 CLAUDE.md](../CLAUDE.md)

# Static 前端资源模块

> 最后更新: 2025-11-25

## 📖 模块概览

本模块包含 AST 实时语音转文本系统的前端静态资源，提供完整的用户界面和交互逻辑。采用原生 HTML/CSS/JavaScript 开发，无外部依赖框架。

### 🎯 核心功能

- **实时语音显示**: 实时展示 ASR 转录结果和说话人信息
- **LLM 对话界面**: 支持与 AI 模型的实时对话
- **聊天管理**: 创建、切换、删除聊天会话
- **响应式布局**: 适配不同屏幕尺寸
- **WebSocket 通信**: 与后端实时双向通信
- **配置管理**: 动态配置 LLM API 参数

## 📂 文件结构

```
📁 JavaScript 目录结构
static/js/ 目录包含 9 个模块化文件：
1.
main.js (230行) - 主入口文件
功能：应用初始化和模块协调
注释：/* 主初始化文件 - AST Frontend, 精致技术美学 - JavaScript核心逻辑 */
导入所有子模块，协调整个应用
2.
dom.js (135行) - DOM元素管理
功能：DOM元素获取和管理
注释：/* DOM元素获取和管理 */
集中管理所有HTML元素引用
3.
websocket.js (283行) - WebSocket连接管理
功能：WebSocket连接管理、ASR/LLM连接
注释：/* WebSocket连接管理 */
包含WebSocketManager和LLMStreamManager类
4.
utils.js (约200行) - 工具函数
功能：通用工具函数、Toast提示、配置管理
提供showToast、loadSavedWidths、updateModelDisplay等函数
5.
config.js (约150行) - 配置管理
功能：应用配置、常量定义
管理各种配置参数和常量
6.
chat.js (约300行) - 聊天管理
功能：聊天界面逻辑、消息处理
包含ChatManager类和相关方法
7.
voiceprint.js (约100行) - 声纹管理
功能：声纹录制、播放、管理
处理音频相关功能
8.
agent.js (约250行) - AI代理管理
功能：AI代理逻辑、任务处理
管理AI相关的核心逻辑
9.
ui.js (约200行) - UI界面控制
功能：用户界面交互控制
处理UI组件的显示和交互
📁 CSS 目录结构
static/css/ 目录包含 15 个模块化文件：
1.
main.css (25行) - CSS主入口文件
功能：CSS模块导入管理
注释：/* AST - Main CSS Import File, 主CSS入口文件 - 导入所有模块 */
使用@import导入所有CSS模块
2.
variables.css (56行) - CSS变量定义
功能：设计系统变量、颜色、字体、间距
注释：/* AST - CSS Variables, CSS变量定义 */
定义: --bg-primary, --accent-primary, --font-display 等
3.
global.css (132行) - 全局样式重置
功能：CSS重置、基础设置、全局样式
注释：/* AST - Global Styles, 全局样式重置和基础设置 */
4.
layout.css (64行) - 布局工具类
功能：布局工具类、响应式设计基础
提供网格、弹性布局等工具类
5.
sidebar.css (167行) - 侧边栏样式
功能：侧边栏和聊天列表样式
包含.sidebar, .chat-list, .chat-item等样式
6.
resizer.css (40行) - 可调节分隔条
功能：可拖拽分隔条组件样式
包含.resizer, .sidebar-resizer等样式
7.
panels.css (377行) - 面板样式
功能：主面板和头部区域样式
包含.panel, .panel-header, .asr-panel, .tts-panel等
8.
chat.css (229行) - 聊天窗口样式
功能：聊天界面和消息样式
包含.chat-window, .message, .user-message, .ai-message等
9.
input.css (413行) - 输入区域样式
功能：输入框、按钮和控件样式
包含.input-area, .btn, .toggle-switch等组件
10.
modals.css (329行) - 模态框样式
功能：模态框、表单和对话框样式
包含.modal, .modal-overlay, .modal-content等
11.
settings.css (723行) - 设置页面样式
功能：设置页面和配置管理样式
包含.settings-content, .config-section, .voiceprint-list等
12.
voiceprint.css (7行) - 声纹管理样式
功能：声纹管理特定样式
最小的专门样式文件
13.
mobile.css (445行) - 移动端适配
功能：响应式设计和移动端适配
包含各种媒体查询和移动端布局
14.
animations.css (232行) - 动画效果
功能：统一的动画效果定义
包含@keyframes、过渡动画等
```

## 🎨 界面布局

### 主界面结构

```html
┌─────────────────────────────────────────────────────────────┐
│                        主容器 (95% 宽度)                        │
├───────────┬───────────────────────────────────────────────────┤
│           │                 LLM 对话面板                      │
│  侧边栏   │  ┌─────────────────────────────────────────────┐  │
│ (260px)   │  │              聊天窗口                      │  │
│           │  │                                         │  │
│ - 新建聊天│  │  [消息列表]                               │  │
│ - 聊天列表│  │                                         │  │
│           │  └─────────────────────────────────────────────┘  │
│           │              输入框 + 发送按钮                 │
│           │                                               │
└───────────┴───────────────────────────────────────────────────┘
```

### 面板设计

| 面板 | 宽度 | 功能 | 组件 |
|------|------|------|------|
| **侧边栏** | 260px | 聊天列表管理 | 聊天列表、新建按钮 |
| **左侧面板** | 1 份 | ASR 实时显示 | 状态指示器、消息流 |
| **右侧面板** | 1.5 份 | LLM 对话 | 聊天窗口、输入区域 |

## 💻 核心组件

### 1. 聊天侧边栏 (Chat Sidebar)

**文件**: `index.html` + `style.css`

**功能**:
- 显示所有聊天会话
- 创建新聊天
- 删除聊天
- 当前会话高亮

**关键样式**:

```css
.sidebar {
    width: 260px;
    background-color: #f7f7f8;
    border-right: 1px solid #ddd;
    border-radius: 12px 0 0 12px;
}
```

### 2. ASR 实时面板

**功能**:
- 实时显示语音转录结果
- 说话人信息展示
- 时间戳记录
- 连接状态指示

**消息格式**:

```javascript
{
    "time": "14:30:25",
    "speaker": "张三 (置信度:0.85)",
    "text": "你好，这是一个测试消息"
}
```

**UI 组件**:
- `.message.user`: 用户消息样式
- `.message.system`: 系统消息样式
- `.speaker-name`: 说话人名称
- `.timestamp`: 时间戳
- `.status.connected/disconnected`: 连接状态

### 3. LLM 对话面板

**功能**:
- 流式显示 AI 回复
- 消息历史展示
- 上下文记忆
- 打字动画效果

**流式响应处理**:

```javascript
async function connectLLMWebSocket() {
    const ws = new WebSocket('ws://localhost:8000/ws/llm');
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'chunk') {
            appendToChat(data.content);
        } else if (data.type === 'done') {
            finishResponse();
        }
    };
}
```

**thinking 动画**:

```css
.thinking-dots span {
    animation: bounce 1.4s infinite ease-in-out both;
}
```

### 4. 配置模态框

**功能**:
- LLM API 参数配置
- 实时保存配置
- 配置验证

**配置字段**:
- 模型名称 (name)
- Base URL (base_url)
- API Key (api_key)
- 模型标识 (model)

## 🎨 样式系统

### CSS 变量

```css
:root {
    --bg-color: #f0f2f5;
    --header-bg: #ffffff;
    --chat-bg: #ffffff;
    --primary-color: #0084ff;
    --text-primary: #050505;
    --text-secondary: #65676b;
    --message-bg-other: #e4e6eb;
    --message-bg-me: #0084ff;
    --message-text-me: #ffffff;
    --danger-color: #dc3545;
    --success-color: #28a745;
}
```

### 响应式断点

| 屏幕宽度 | 布局调整 |
|----------|----------|
| < 768px | 垂直堆叠布局 |
| 768px - 1200px | 保持侧边栏 |
| > 1200px | 完整布局 |

### 动画效果

1. **fadeIn**: 消息出现动画
   ```css
   @keyframes fadeIn {
       from { opacity: 0; transform: translateY(10px); }
       to { opacity: 1; transform: translateY(0); }
   }
   ```

2. **popIn**: 按钮弹出动画
   ```css
   @keyframes popIn {
       from { transform: scale(0); }
       to { transform: scale(1); }
   }
   ```

3. **bounce**: 思考动画
   ```css
   @keyframes bounce {
       0%, 80%, 100% { transform: scale(0); }
       40% { transform: scale(1); }
   }
   ```

## 🔌 WebSocket 通信

### ASR 实时数据通道

**端点**: `ws://localhost:8000/ws`

**消息流向**:
```
后端 ASR 系统 -> WebSocket -> 前端消息流
```

**前端处理**:

```javascript
const ws = new WebSocket('ws://localhost:8000/ws');
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    displayMessage(data);
};
```

### LLM 对话通道

**端点**: `ws://localhost:8000/ws/llm`

**消息流向**:
```
用户输入 -> WebSocket -> 后端 LLM -> 流式响应 -> 前端
```

**发送消息**:

```javascript
ws.send(JSON.stringify({
    messages: chatMessages,
    chat_id: currentChatId
}));
```

**接收响应**:

```javascript
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'chunk') {
        appendToResponse(data.content);
    } else if (data.type === 'done') {
        saveToHistory();
    }
};
```

## 🛠️ JavaScript 核心逻辑

### 1. WebSocket 管理 (script.js)

**连接管理**:

```javascript
class WebSocketManager {
    constructor() {
        this.asrWs = null;
        this.llmWs = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    connectASR() {
        this.asrWs = new WebSocket('ws://localhost:8000/ws');
        // 连接逻辑
    }

    connectLLM() {
        this.llmWs = new WebSocket('ws://localhost:8000/ws/llm');
        // 连接逻辑
    }
}
```

### 2. 消息处理

**ASR 消息**:

```javascript
function handleASRMessage(data) {
    const { time, speaker, text } = data;
    const messageEl = createMessageElement(speaker, text, time);
    appendToASRPanel(messageEl);
    updateStatus('connected');
}
```

**LLM 流式响应**:

```javascript
async function handleLLMStream(data) {
    if (data.type === 'chunk') {
        streamingText += data.content;
        updateMessageContent(streamingText);
    } else if (data.type === 'done') {
        finalizeMessage();
        saveToHistory();
    }
}
```

### 3. 聊天管理

**创建聊天**:

```javascript
async function createNewChat() {
    const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新聊天' })
    });
    const chat = await response.json();
    addChatToSidebar(chat);
    switchToChat(chat.id);
}
```

**切换聊天**:

```javascript
async function switchChat(chatId) {
    currentChatId = chatId;
    const response = await fetch(`/api/chats/${chatId}`);
    const chat = await response.json();
    displayChatHistory(chat.messages);
}
```

### 4. 配置管理

**打开配置模态框**:

```javascript
function openConfigModal() {
    fetch('/api/config')
        .then(res => res.json())
        .then(config => {
            fillConfigForm(config);
            showModal();
        });
}
```

**保存配置**:

```javascript
async function saveConfig() {
    const config = getConfigFromForm();
    await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    showToast('配置已保存', 'success');
    reconnectLLM();
}
```

## 🎭 UI 状态管理

### 连接状态

```javascript
function updateConnectionStatus(connected) {
    const statusEl = document.querySelector('.status');
    if (connected) {
        statusEl.textContent = '已连接';
        statusEl.className = 'status connected';
    } else {
        statusEl.textContent = '未连接';
        statusEl.className = 'status disconnected';
    }
}
```

### 消息状态

```javascript
// 正在输入
function showThinkingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'thinking-dots';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    return indicator;
}

// AI 回复中
function showStreamingMessage() {
    const msgEl = createMessageElement('AI', '', 'assistant');
    const contentEl = msgEl.querySelector('.content');
    return { msgEl, contentEl };
}
```

### Toast 通知

```javascript
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.querySelector('.toast-container').appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}
```

## 🎨 主题定制

### 深色模式支持

添加 CSS 变量切换:

```css
[data-theme="dark"] {
    --bg-color: #1a1a1a;
    --header-bg: #2d2d2d;
    --chat-bg: #2d2d2d;
    --text-primary: #ffffff;
    --text-secondary: #b0b0b0;
}
```

### 品牌色定制

在 `:root` 中修改:

```css
:root {
    --primary-color: #0084ff;  /* 主色调 */
    --message-bg-me: #0084ff;  /* 我的消息背景 */
}
```

## 🔧 自定义开发

### 添加新功能

1. **新增 UI 组件**:
   ```javascript
   function createCustomComponent() {
       const el = document.createElement('div');
       el.className = 'custom-component';
       el.innerHTML = '<p>新功能</p>';
       return el;
   }
   ```

2. **绑定事件**:
   ```javascript
   document.getElementById('btn').addEventListener('click', () => {
       // 处理逻辑
   });
   ```

3. **添加样式**:
   ```css
   .custom-component {
       padding: 10px;
       background: var(--chat-bg);
       border-radius: 8px;
   }
   ```

### 集成新 API

在 `script.js` 中添加:

```javascript
async function callNewAPI(data) {
    try {
        const response = await fetch('/api/new-endpoint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        showToast('请求失败', 'error');
        throw error;
    }
}
```

## 📱 移动端适配

### 响应式布局

使用 CSS 媒体查询:

```css
@media (max-width: 768px) {
    .main-container {
        flex-direction: column;
        width: 100%;
        height: 100vh;
    }

    .sidebar {
        width: 100%;
        height: auto;
        border-right: none;
        border-bottom: 1px solid #ddd;
    }
}
```

### 触摸优化

```css
.icon-btn {
    min-width: 44px;  /* 触摸目标最小尺寸 */
    min-height: 44px;
}
```

## 🧪 测试指南

### 手动测试清单

- [ ] 页面加载正常
- [ ] WebSocket 连接成功
- [ ] ASR 消息实时显示
- [ ] LLM 对话功能正常
- [ ] 聊天创建/切换/删除
- [ ] 配置保存生效
- [ ] 响应式布局适配
- [ ] 动画效果流畅
- [ ] 错误提示显示

### 调试技巧

1. **浏览器控制台**:
   ```javascript
   console.log('WebSocket 状态:', ws.readyState);
   console.log('聊天数据:', chatMessages);
   ```

2. **网络面板**: 查看 WebSocket 消息
3. **元素面板**: 检查 DOM 结构
4. **性能面板**: 监控渲染性能

## 🐛 常见问题

### Q: WebSocket 连接失败

**A**:
1. 检查后端服务是否启动
2. 确认端口 8000 可访问
3. 查看浏览器控制台错误信息

### Q: 消息不显示

**A**:
1. 检查 WebSocket 数据格式
2. 确认消息解析逻辑
3. 查看 DOM 更新代码

### Q: 样式异常

**A**:
1. 检查 CSS 文件是否加载
2. 确认选择器优先级
3. 验证媒体查询条件

### Q: 移动端布局错乱

**A**:
1. 添加 viewport meta 标签
2. 检查 flex 布局属性
3. 测试不同屏幕尺寸

## 📚 参考资源

- [HTML5 WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [CSS Flexbox 指南](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)
- [JavaScript 异步编程](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous)
- [响应式设计最佳实践](https://web.dev/responsive-web-design-basics/)

---

> 💡 **提示**: 修改样式后清除浏览器缓存查看效果
