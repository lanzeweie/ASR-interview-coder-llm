# 代码库结构详解

## 项目目录结构

```
E:\Code\AST\
│
├── 📄 main.py                     # 核心模块：ASR语音转文本处理
├── 📄 server.py                   # Web服务器：FastAPI服务和API端点
├── 📄 llm_client.py               # LLM客户端：多厂商API集成
├── 📄 chat_manager.py             # 聊天管理：会话历史管理
├── 📄 intelligent_agent.py        # 智能分析：小模型Agent
├── 📄 trigger_manager.py          # 触发机制：字数和静音检测
│
├── 📁 static/                     # 前端静态资源目录
│   ├── 📄 index.html              # 主页面HTML
│   ├── 📄 script.js               # 前端JavaScript逻辑
│   ├── 📄 style.css               # 页面样式
│   └── 📄 CLAUDE.md               # 前端开发文档
│
├── 📁 data/                       # 数据存储目录
│   ├── 📄 chat_history.json       # 聊天历史记录
│   └── 📄 agent.json              # 智囊团角色配置
│
├── 📁 voiceprints/                # 声纹库目录
│   ├── 📄 user_1.wav              # 用户1的声纹音频
│   ├── 📄 user_1.npy              # 用户1的声纹嵌入向量
│   ├── 📄 user_2.wav              # 用户2的声纹音频
│   ├── 📄 user_2.npy              # 用户2的声纹嵌入向量
│   └── ...                        # 其他用户声纹
│
├── 📁 output/                     # 临时文件目录
│   └── 📄 temp_speech.wav         # 临时音频片段
│
├── 📁 .serena/                    # Serena工具配置目录
│   ├── 📄 project.yml             # Serena项目配置
│   └── 📄 project.json            # Serena项目状态
│
├── 📄 CLAUDE.md                   # 项目总文档
├── 📄 README.md                   # 项目说明和流程图
├── 📄 api_config.json             # LLM API配置文件
│
└── 其他文件...
```

## 核心模块详解

### 1. main.py - ASR核心处理

**功能**: 实时语音转文本和声纹识别

**主要类和函数**:
```python
class RealTimeASR_SV:
    """实时语音转文本和声纹识别系统"""
    
    def __init__(self, on_message_callback=None)
    """初始化ASR系统"""
    
    def load_voiceprints(self)
    """加载声纹库"""
    
    def extract_embedding(self, audio_path)
    """提取声纹嵌入向量"""
    
    def identify_speaker(self, audio_path)
    """识别说话人身份"""
    
    def transcribe(self, audio_path)
    """语音转文本"""
    
    def process_audio(self, audio_file)
    """处理音频片段"""
    
    def run(self)
    """主循环：录音 + VAD检测"""
```

**关键字段**:
- `AUDIO_RATE = 16000` - 音频采样率
- `CHUNK = 1024` - 音频块大小
- `VAD_MODE = 3` - VAD敏感度
- `SV_THRESHOLD = 0.35` - 声纹识别阈值

**核心流程**:
1. PyAudio实时录音
2. WebRTC VAD检测语音活动
3. 检测到静音时保存音频片段
4. 并行处理：
   - SenseVoice进行ASR
   - CAM++进行声纹识别
5. 回调通知WebSocket客户端

### 2. server.py - Web服务器

**功能**: FastAPI Web服务和API管理

**主要组件**:
```python
# Web应用实例
app = FastAPI()

# 连接管理器
class ConnectionManager:
    """ASR WebSocket连接管理"""
    
class LLMConnectionManager:
    """LLM WebSocket连接管理"""

# 全局实例
asr_system = None           # ASR系统实例
chat_manager = ChatManager() # 聊天管理器
llm_client = LLMClient      # LLM客户端
```

**主要API端点**:

| 端点 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 返回前端页面 |
| `/ws` | WebSocket | ASR实时数据推送 |
| `/ws/llm` | WebSocket | LLM对话流 |
| `/api/chats` | GET/POST | 聊天管理 |
| `/api/chats/{id}` | GET/DELETE | 聊天CRUD |
| `/api/config` | GET/POST | 配置管理 |
| `/api/agent/status` | GET | Agent状态 |
| `/api/voiceprints` | GET/POST | 声纹管理 |
| `/api/test_connection` | POST | 测试API连接 |

**智能分析流程**:
1. ASR消息 → 触发机制
2. 字数累积检测
3. 静音检测
4. 触发智能分析（`agent_manager.analyze`）
5. 三阶段分析：
   - 阶段1：小模型判定
   - 阶段2：意图识别（可选）
   - 阶段3：分发准备
6. 广播结果到前端

### 3. llm_client.py - LLM客户端

**功能**: 多厂商LLM API集成

**主要类**:
```python
class LLMClient:
    """OpenAI兼容的LLM客户端"""
    
    def __init__(self, api_key, base_url, model)
    def init_client(self)
    def update_config(self, api_key, base_url, model)
    async def chat_stream(self, messages, stream=True)
    async def test_connection(self)
```

**支持的厂商**:
- OpenAI (GPT-4, GPT-3.5)
- DeepSeek (DeepSeek-V3)
- 通义千问 (Qwen系列)
- 智谱AI (GLM系列)
- 其他OpenAI兼容API

**流式响应处理**:
```python
async for chunk in client.chat_stream(messages):
    # 处理每个流式块
    await websocket.send_json({
        "type": "chunk",
        "content": chunk
    })
```

### 4. chat_manager.py - 聊天管理

**功能**: 聊天会话和历史记录管理

**主要类**:
```python
class ChatManager:
    """聊天会话管理器"""
    
    def create_chat(self, title="New Chat")
    def get_chat(self, chat_id)
    def get_all_chats(self)
    def update_chat_messages(self, chat_id, messages)
    def delete_chat(self, chat_id)
    def clear_chat_messages(self, chat_id)
```

**数据结构**:
```json
{
  "current_chat_id": "uuid-字符串",
  "chats": {
    "chat-id-1": {
      "id": "chat-id-1",
      "title": "聊天标题",
      "created_at": "ISO时间戳",
      "updated_at": "ISO时间戳",
      "messages": [
        {
          "role": "user/assistant",
          "content": "消息内容"
        }
      ]
    }
  }
}
```

### 5. intelligent_agent.py - 智能分析

**功能**: 基于小模型的智能分析和判定

**主要类**:
```python
class IntelligentAgent:
    """智能分析Agent"""
    
    def __init__(self, config)
    def build_analysis_prompt(self, messages, speaker_name)
    def format_messages_compact(self, messages)
    def validate_response(self, response)
    async def analyze(self, messages, speaker_name)

class AgentManager:
    """Agent管理器"""
    
    def load_agent(self, config, model_config)
    async def analyze_conversation(self, messages, speaker_name)
    async def run_intelligent_analysis(self, messages, speaker_name)
```

**分析流程**:
1. 格式化对话消息（XML紧凑格式）
2. 构建分析Prompt
3. 调用小模型（本地或API）
4. 验证响应（JSON格式）
5. 返回判定结果

**本地模型支持**:
- Qwen/Qwen2-0.5B-Instruct
- 其他Transformers兼容模型
- 设备自动映射（CPU/GPU）
- 混合精度推理（float16）

### 6. trigger_manager.py - 触发机制

**功能**: 监控字数累积和静音检测

**主要类**:
```python
class TriggerManager:
    """触发机制管理器"""
    
    def add_message(self, message)
    def set_thresholds(self, min_chars, silence_secs)
    def set_protagonist(self, name)
    def add_callback(self, callback)
    def get_status(self)
```

**触发逻辑**:
1. 接收ASR消息
2. 检查消息长度（≥3字符）
3. 检查说话人（累积文本）
4. 检查累积字符（≥最小阈值10）
5. 启动静音检测
6. 条件触发：
   - 静音≥2秒
   - 文本≥3倍阈值（30字符）
   - 静音≥4秒
7. 运行智能分析
8. 回调通知

**状态管理**:
```python
@dataclass
class TriggerState:
    last_message_time: float = 0.0
    accumulated_text: str = ""
    last_speaker: str = ""
    pending_analysis: bool = False
    silence_start_time: Optional[float] = None
    last_analysis_index: int = -1
```

## 配置文件详解

### api_config.json - LLM配置

```json
{
  "configs": [
    {
      "name": "DeepSeek-V3",
      "base_url": "https://api.deepseek.com/v1",
      "api_key": "sk-...",
      "model": "deepseek-chat",
      "system_prompt": "系统提示词（可选）",
      "tags": ["tech_assistant_tag"],
      "generation_params": {
        "temperature": 0.7,
        "max_tokens": 2000
      }
    }
  ],
  "current_config": "DeepSeek-V3",
  "multi_llm_active_names": ["DeepSeek-V3"],
  "agent_config": {
    "enabled": true,
    "model_name": "SmartAgent",
    "auto_trigger": true,
    "min_characters": 10,
    "silence_threshold": 2,
    "max_messages": 50,
    "intent_recognition_enabled": false
  },
  "protagonist": "张三"
}
```

### data/agent.json - 智囊团角色

```json
{
  "think_tank_roles": [
    {
      "id": "tech_assistant",
      "name": "技术辅助者",
      "tag_key": "tech_assistant_tag",
      "prompt": "你是一个技术辅助者，专注于帮助用户解决编程问题"
    },
    {
      "id": "concise_assistant",
      "name": "精简辅助者",
      "tag_key": "concise_assistant_tag",
      "prompt": "精简回答"
    }
  ]
}
```

## 前端静态文件

### static/index.html
- **结构**: 单页应用（SPA）
- **区域**:
  - ASR面板：显示实时转录
  - LLM聊天区：显示AI回复
  - 设置面板：配置管理
  - 声纹管理：录入和删除声纹
- **组件**:
  - WebSocket客户端
  - 消息渲染器
  - 设置表单
  - 录音控制

### static/script.js
- **功能**:
  - WebSocket连接管理
  - 消息发送和接收
  - 实时UI更新
  - 事件处理
- **关键函数**:
  ```javascript
  connectASR()          // 连接ASR WebSocket
  connectLLM()          // 连接LLM WebSocket
  sendMessage()         // 发送聊天消息
  updateUI()            // 更新界面
  saveConfig()          // 保存配置
  ```

### static/style.css
- **特点**:
  - 响应式布局
  - 深色主题
  - 卡片式设计
  - 平滑动画

## 数据流架构

### ASR数据流
```
麦克风 → PyAudio → VAD检测 → 音频片段 → ASR + 声纹识别 → WebSocket推送
                                                        ↓
前端UI ←──────────── 实时显示结果 ←────────────────────┘
```

### 智能分析数据流
```
ASR消息 → 触发机制 → 字数累积 → 静音检测 → 智能分析 → 三阶段处理 → 分发/单模型
                                                                      ↓
前端UI ←─────── 广播结果 ←────────────────────── WebSocket ←─────────┘
```

### LLM对话数据流
```
前端输入 → WebSocket → LLM客户端 → API请求 → 流式响应 → WebSocket → 前端渲染
                              ↓
数据存储 ←─────── 聊天历史 ←─────── ChatManager ←─────────────────────┘
```

## 模块依赖关系

```
main.py (ASR)
  ↑
  │ 回调通知
  ↓
server.py (Web服务器)
  ├── llm_client.py (LLM客户端)
  ├── chat_manager.py (聊天管理)
  ├── intelligent_agent.py (智能分析)
  │     ↑
  │     │ 使用
  │     ↓
  └── trigger_manager.py (触发机制)
```

## 线程模型

### 主线程
- FastAPI事件循环
- WebSocket连接管理
- HTTP请求处理

### ASR后台线程
- 音频录音
- VAD检测
- 音频处理
- 消息回调

### 异步任务
- LLM API调用
- 智能分析
- 文件I/O

## 错误处理层次

### ASR层（main.py）
- 音频设备错误
- 模型加载错误
- VAD检测错误

### Web服务层（server.py）
- WebSocket连接错误
- API请求错误
- 配置错误

### LLM层（llm_client.py）
- API连接错误
- 请求超时
- 响应解析错误

### 智能分析层（intelligent_agent.py）
- 模型加载错误
- 推理错误
- 响应验证错误

### 触发机制层（trigger_manager.py）
- 配置错误
- 状态管理错误

## 性能优化点

### ASR优化
- GPU加速（CUDA）
- 音频块大小调优
- VAD参数优化
- 声纹预计算缓存

### Web服务优化
- 连接池
- 异步I/O
- 消息队列
- WebSocket心跳

### LLM优化
- 连接重用
- 流式处理
- 并发请求
- 超时控制

### 智能分析优化
- 模型缓存
- 阈值调优
- 增量分析
- 并发处理

## 扩展点

### 新增模型
1. 修改main.py中的模型加载
2. 更新配置文件
3. 添加测试用例

### 新增API端点
1. 在server.py中添加路由
2. 实现处理函数
3. 更新前端调用

### 新增触发条件
1. 修改trigger_manager.py
2. 添加新的阈值参数
3. 更新前端设置

### 新增智囊团角色
1. 编辑data/agent.json
2. 配置模型标签
3. 测试分发逻辑

## 调试要点

### 常见问题定位
1. **ASR不工作**: 检查麦克风权限、音频设备
2. **声纹识别失败**: 检查声纹库文件、阈值设置
3. **LLM连接失败**: 检查API密钥、Base URL
4. **智能分析未触发**: 检查阈值、主人公设置
5. **WebSocket断开**: 检查网络、防火墙

### 日志位置
- 控制台输出：主要调试信息
- 浏览器控制台：前端错误
- server.log：服务器日志（如果配置）

### 调试工具
- Serena符号搜索
- Python调试器（pdb）
- Chrome开发者工具
- Wireshark（网络抓包）
- 性能分析器（cProfile）