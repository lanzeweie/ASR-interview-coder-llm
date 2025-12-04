# AST 实时语音转文本与大模型分析系统 - 后端 API 文档

> 文档生成时间: 2025-12-04
> 项目版本: v1.0.0
> 基础URL: `http://localhost:8000`

---

## 📚 目录

1. [系统概览](#-系统概览)
2. [REST API 接口](#-rest-api-接口)
3. [WebSocket 接口](#-websocket-接口)
4. [数据模型](#-数据模型)
5. [错误处理](#-错误处理)
6. [示例代码](#-示例代码)

---

## 🎯 系统概览

### 核心功能

AST 系统是一个集成多种 AI 能力的实时语音处理平台，提供：

- **实时语音转文本（ASR）**: 基于 SenseVoice Small 模型
- **说话人识别**: 基于 CAM++ 模型
- **大模型对话**: 支持 OpenAI 兼容 API
- **智能分析**: 自动判定是否需要 AI 介入
- **智囊团**: 多模型协作提供建议
- **聊天管理**: 多会话、历史记录管理

### 架构特点

- **FastAPI** 后端框架，支持自动文档生成
- **WebSocket** 实时通信
- **模块化设计**，各组件独立可配置
- **多模型支持**，兼容各种 OpenAI 兼容 API

---

## 🌐 REST API 接口

### 1. 基础信息

#### 1.1 根路径
**GET** `/`

返回系统主页面（HTML 页面）

**响应:**
- `200`: HTML 页面内容

---

### 2. 配置管理

#### 2.1 获取配置信息
**GET** `/api/config`

获取当前 LLM API 配置和智能分析配置

**响应示例:**
```json
{
    "configs": [
        {
            "name": "DeepSeek-V3",
            "base_url": "https://api.deepseek.com/v1",
            "api_key": "sk-*****",
            "model": "deepseek-chat",
            "system_prompt": "",
            "tags": ["tech_assistant"]
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
        "max_messages": 50
    },
    "protagonist": "张三"
}
```

#### 2.2 更新配置
**POST** `/api/config`

更新 API 配置

**请求体:**
```json
{
    "configs": [
        {
            "name": "DeepSeek-V3",
            "base_url": "https://api.deepseek.com/v1",
            "api_key": "sk-*****",
            "model": "deepseek-chat",
            "system_prompt": "",
            "tags": ["tech_assistant"]
        }
    ],
    "current_config": "DeepSeek-V3",
    "multi_llm_active_names": ["DeepSeek-V3"]
}
```

**响应:**
```json
{
    "status": "success",
    "message": "Configuration updated"
}
```

#### 2.3 测试连接
**POST** `/api/test_connection`

测试 LLM API 连接是否有效

**请求体:**
```json
{
    "api_key": "sk-*****",
    "base_url": "https://api.deepseek.com/v1",
    "model": "deepseek-chat"
}
```

**响应:**
```json
{
    "success": true,
    "message": "连接成功"
}
```

---

### 3. 身份管理（智囊团角色）

#### 3.1 获取所有身份
**GET** `/api/identities`

获取已配置的所有智囊团身份

**响应示例:**
```json
[
    {
        "id": "tech_assistant",
        "name": "技术助手",
        "prompt": "你是一个专业的技术顾问...",
        "enabled": true
    }
]
```

#### 3.2 创建身份
**POST** `/api/identities`

创建新的智囊团身份

**请求体:**
```json
{
    "id": "new_identity",
    "name": "新身份名称",
    "prompt": "身份描述和行为准则...",
    "enabled": true
}
```

**响应:**
```json
{
    "status": "success",
    "role": {
        "id": "new_identity",
        "name": "新身份名称",
        "prompt": "身份描述和行为准则...",
        "enabled": true
    }
}
```

#### 3.3 更新身份
**PUT** `/api/identities/{role_id}`

更新指定身份的信息

**路径参数:**
- `role_id`: 身份 ID

**请求体:**
```json
{
    "name": "更新的名称",
    "prompt": "更新的提示词",
    "enabled": false
}
```

**响应:**
```json
{
    "status": "success",
    "role": {
        "id": "new_identity",
        "name": "更新的名称",
        "prompt": "更新的提示词",
        "enabled": false
    }
}
```

#### 3.4 删除身份
**DELETE** `/api/identities/{role_id}`

删除指定身份

**路径参数:**
- `role_id`: 身份 ID

**响应:**
```json
{
    "status": "success",
    "removed": {
        "id": "new_identity",
        "name": "新身份名称",
        "prompt": "身份描述和行为准则...",
        "enabled": true
    }
}
```

---

### 4. 聊天管理

#### 4.1 获取所有聊天
**GET** `/api/chats`

获取所有聊天会话列表和当前活跃聊天

**响应示例:**
```json
{
    "current_chat_id": "550e8400-e29b-41d4-a716-446655440000",
    "chats": [
        {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "title": "新聊天",
            "created_at": "2025-12-04T14:30:00",
            "updated_at": "2025-12-04T14:35:00",
            "messages": [
                {
                    "role": "user",
                    "content": "你好",
                    "speaker": "张三"
                }
            ]
        }
    ]
}
```

#### 4.2 创建聊天
**POST** `/api/chats`

创建新的聊天会话

**请求体:**
```json
{
    "title": "新聊天标题"
}
```

**响应:**
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "新聊天标题",
    "created_at": "2025-12-04T14:30:00",
    "updated_at": "2025-12-04T14:30:00",
    "messages": []
}
```

#### 4.3 获取聊天详情
**GET** `/api/chats/{chat_id}`

获取指定聊天的详细信息

**路径参数:**
- `chat_id`: 聊天会话 ID

**响应:**
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "聊天标题",
    "created_at": "2025-12-04T14:30:00",
    "updated_at": "2025-12-04T14:35:00",
    "messages": [
        {
            "role": "user",
            "content": "你好",
            "speaker": "张三"
        }
    ]
}
```

#### 4.4 删除聊天
**DELETE** `/api/chats/{chat_id}`

删除指定聊天会话

**路径参数:**
- `chat_id`: 聊天会话 ID

**响应:**
```json
{
    "status": "success"
}
```

#### 4.5 清空聊天记录
**POST** `/api/chats/{chat_id}/clear`

清空指定聊天的消息记录

**路径参数:**
- `chat_id`: 聊天会话 ID

**响应:**
```json
{
    "status": "success"
}
```

---

### 5. 智能分析

#### 5.1 获取智能分析状态
**GET** `/api/agent/status`

获取智能分析 Agent 的当前状态

**响应示例:**
```json
{
    "available": true,
    "enabled": true,
    "auto_trigger": true,
    "status": {
        "enabled": true,
        "accumulated_chars": 0,
        "threshold": 10,
        "silence_threshold": 2,
        "last_message_time": 0,
        "pending_analysis": false,
        "last_speaker": "",
        "last_analysis_index": -1,
        "history_count": 0,
        "next_analysis_start": 0
    },
    "config": {
        "enabled": true,
        "model_name": "SmartAgent",
        "auto_trigger": true,
        "min_characters": 10,
        "silence_threshold": 2,
        "max_messages": 50,
        "intent_recognition_enabled": false,
        "intent_model_name": "Qwen3-0.6B",
        "intent_model_type": "local"
    }
}
```

#### 5.2 获取智囊团角色配置
**GET** `/api/agent/roles`

获取智囊团角色配置文件内容

**响应示例:**
```json
{
    "think_tank_roles": [
        {
            "id": "tech_assistant",
            "name": "技术助手",
            "prompt": "你是一个专业的技术顾问...",
            "enabled": true
        }
    ]
}
```

#### 5.3 启用/禁用智能分析
**POST** `/api/agent/enable`

启用或禁用智能分析功能

**请求体:**
```json
{
    "enabled": true,
    "auto_trigger": true
}
```

**响应:**
```json
{
    "status": "success",
    "enabled": true,
    "auto_trigger": true
}
```

#### 5.4 更新智能分析配置
**POST** `/api/agent/config`

更新智能分析的配置参数

**请求体:**
```json
{
    "min_characters": 10,
    "silence_threshold": 2,
    "max_messages": 50,
    "model_name": "SmartAgent",
    "model_type": "api",
    "intent_recognition_enabled": false,
    "intent_model_name": "Qwen3-0.6B",
    "intent_model_type": "local"
}
```

**响应:**
```json
{
    "status": "success",
    "config": {
        "min_characters": 10,
        "silence_threshold": 2,
        "max_messages": 50,
        "model_name": "SmartAgent",
        "model_type": "api",
        "intent_recognition_enabled": false,
        "intent_model_name": "Qwen3-0.6B",
        "intent_model_type": "local"
    }
}
```

#### 5.5 手动触发智能分析
**POST** `/api/agent/analyze`

手动触发智能分析或意图识别

**请求体:**
```json
{
    "messages": [
        {
            "role": "user",
            "content": "如何优化Python异步代码的性能？",
            "speaker": "张三"
        }
    ],
    "speaker_name": "张三",
    "request_type": "agent_analysis",
    "modules": ["analysis", "intent"]
}
```

**响应示例:**
```json
{
    "phase1": {
        "is": true,
        "reason": "检测到技术问题讨论",
        "model_name": "SmartAgent"
    },
    "phase2": {
        "success": true,
        "summary_xml": "<leader_analysis><summary>询问Python异步优化方法</summary></leader_analysis>"
    },
    "distribution": {
        "mode": "think_tank",
        "targets": ["tech_assistant"],
        "intent": {
            "success": true,
            "summary_xml": "..."
        }
    },
    "analysis_id": "550e8400-e29b-41d4-a716-446655440000",
    "analysis_summary": "[3条]",
    "analysis_count": 3,
    "analysis_preview": "如何优化Python异步代码的性能？"
}
```

#### 5.6 获取主人公配置
**GET** `/api/protagonist`

获取当前配置的主人公姓名

**响应:**
```json
{
    "protagonist": "张三"
}
```

#### 5.7 设置主人公
**POST** `/api/protagonist`

设置系统的主人公（用于智能分析）

**请求体:**
```json
{
    "protagonist": "张三"
}
```

**响应:**
```json
{
    "status": "success",
    "protagonist": "张三"
}
```

#### 5.8 手动触发智囊团
**POST** `/api/agent/trigger`

手动触发智囊团模式（通常由 WebSocket 自动处理）

**请求体:**
```json
{
    "messages": [
        {
            "role": "user",
            "content": "如何设计微服务架构？",
            "speaker": "张三"
        }
    ],
    "chat_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**响应:**
```json
{
    "status": "triggered",
    "message": "智囊团已触发",
    "messages": [...],
    "chat_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### 6. 声纹管理

#### 6.1 获取声纹库列表
**GET** `/api/voiceprints`

获取所有已保存的声纹信息

**响应示例:**
```json
{
    "voiceprints": [
        {
            "name": "张三",
            "wav_file": "张三.wav",
            "wav_size": 512000,
            "has_embedding": true,
            "embedding_size": 4096,
            "duration": 15.5,
            "created_time": 1701234567.0
        }
    ]
}
```

#### 6.2 创建声纹
**POST** `/api/voiceprints`

录制并保存新的声纹样本

**请求体:**
```json
{
    "name": "张三",
    "audio_data": "data:audio/wav;base64,UklGRiQAAABXQVZFZm10..."
}
```

**注意:** `audio_data` 应该是 base64 编码的 WAV 音频文件

**响应:**
```json
{
    "status": "success",
    "message": "声纹已保存: 张三",
    "name": "张三",
    "duration": 15.5,
    "embedding_saved": true
}
```

#### 6.3 删除声纹
**DELETE** `/api/voiceprints/{name}`

删除指定说话人的声纹

**路径参数:**
- `name`: 说话人姓名（URL 编码）

**响应:**
```json
{
    "status": "success",
    "message": "已删除声纹: 张三",
    "deleted_files": ["张三.wav", "张三.npy"]
}
```

#### 6.4 重新计算声纹嵌入
**POST** `/api/voiceprints/rebuild`

重新计算所有声纹的嵌入向量（用于修复损坏的嵌入文件）

**响应:**
```json
{
    "status": "success",
    "message": "声纹嵌入重新计算完成",
    "count": 5
}
```

#### 6.5 获取声纹音频文件
**GET** `/api/voiceprint/audio/{name}`

下载指定说话人的原始音频文件

**路径参数:**
- `name`: 说话人姓名（URL 编码）

**响应:**
- 音频文件 (WAV 格式)

---

## 🔌 WebSocket 接口

### 1. ASR 实时数据推送

**连接地址:** `/ws`

此 WebSocket 连接用于推送实时语音转文本结果、说话人识别信息和智能分析状态。

#### 连接示例:
```javascript
const ws = new WebSocket('ws://localhost:8000/ws');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('收到消息:', data);
};
```

#### 消息格式:

**ASR 转录结果:**
```json
{
    "time": "14:30:25",
    "speaker": "张三 (置信度:0.85)",
    "text": "你好，这是一个测试消息"
}
```

**智能分析状态:**
```json
{
    "time": "14:30:25",
    "speaker": "智能分析",
    "text": "检测到技术问题 · 分析中",
    "analysis_status": "in_progress",
    "analysis_need_ai": false,
    "analysis_id": "550e8400-e29b-41d4-a716-446655440000",
    "analysis_summary": "[5条]",
    "analysis_count": 5,
    "analysis_preview": "如何优化Python异步代码？"
}
```

**智能分析完成:**
```json
{
    "time": "14:30:30",
    "speaker": "智能分析",
    "text": "检测到技术问题 · 助手介入",
    "analysis_status": "completed",
    "analysis_need_ai": true,
    "analysis_id": "550e8400-e29b-41d4-a716-446655440000",
    "analysis_reason": "检测到技术问题讨论",
    "analysis_summary": "[5条]",
    "analysis_count": 5,
    "analysis_preview": "如何优化Python异步代码？",
    "analysis_model": "SmartAgent"
}
```

**ASR 系统状态:**
```json
{
    "time": "00:00:00",
    "speaker": "系统",
    "text": "ASR 系统已就绪",
    "asr_status": {
        "initialized": true,
        "message": "实时语音转写功能已启用"
    }
}
```

---

### 2. LLM 对话和智囊团

**连接地址:** `/ws/llm`

此 WebSocket 连接用于处理 LLM 对话请求，支持单模型和智囊团（多模型）模式。

#### 连接示例:
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/llm');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('收到消息:', data);
};
```

#### 发送消息格式:

**普通对话请求:**
```json
{
    "messages": [
        {
            "role": "system",
            "content": "你是一个有用的助手"
        },
        {
            "role": "user",
            "content": "你好，请介绍一下Python"
        }
    ],
    "chat_id": "550e8400-e29b-41d4-a716-446655440000",
    "is_multi_llm": false
}
```

**智囊团模式:**
```json
{
    "messages": [
        {
            "role": "system",
            "content": "你是一个专业的技术顾问"
        },
        {
            "role": "user",
            "content": "如何设计微服务架构？"
        }
    ],
    "chat_id": "550e8400-e29b-41d4-a716-446655440000",
    "is_multi_llm": true
}
```

**智能分析触发:**
```json
{
    "type": "agent_triggered",
    "reason": "检测到技术问题讨论，已启动智囊团",
    "speaker": "张三",
    "messages": [
        {
            "role": "system",
            "content": "你是AI助手，帮助张三分析以下对话。"
        },
        {
            "role": "user",
            "content": "如何优化Python异步代码？"
        }
    ],
    "chat_id": "550e8400-e29b-41d4-a716-446655440000",
    "is_multi_llm": true,
    "intent_recognition": true,
    "intent_data": {
        "success": true,
        "summary_xml": "..."
    }
}
```

#### 接收消息格式:

**流式响应片段 (单模型):**
```json
{
    "type": "chunk",
    "content": "Python是一种高级编程语言..."
}
```

**流式响应片段 (智囊团):**
```json
{
    "type": "chunk",
    "model": "DeepSeek-V3",
    "content": "Python是一种高级编程语言..."
}
```

**单模型完成:**
```json
{
    "type": "done",
    "full_text": "Python是一种高级编程语言，它具有简洁的语法..."
}
```

**智囊团单个模型完成:**
```json
{
    "type": "done_one",
    "model": "DeepSeek-V3"
}
```

**智囊团全部完成:**
```json
{
    "type": "done_all"
}
```

**通知消息:**
```json
{
    "type": "agent_notification",
    "content": "🤖 智能分析已启动，将为您提供专业建议"
}
```

**错误消息:**
```json
{
    "type": "error",
    "content": "流式响应错误: API Key无效"
}
```

---

## 📊 数据模型

### 1. Chat (聊天会话)

```typescript
interface Chat {
    id: string;                    // 聊天会话唯一 ID
    title: string;                 // 聊天标题
    created_at: string;            // 创建时间 (ISO 8601)
    updated_at: string;            // 最后更新时间 (ISO 8601)
    messages: Message[];           // 消息列表
}
```

### 2. Message (消息)

```typescript
interface Message {
    role: "user" | "assistant" | "system";
    content: string;
    speaker?: string;              // 说话人 (用于 ASR 结果)
    timestamp?: number;            // 时间戳
}
```

### 3. Voiceprint (声纹)

```typescript
interface Voiceprint {
    name: string;                  // 说话人姓名
    wav_file: string;              // WAV 文件名
    wav_size: number;              // 文件大小 (字节)
    has_embedding: boolean;        // 是否已有嵌入向量
    embedding_size: number;        // 嵌入文件大小
    duration: number;              // 音频时长 (秒)
    created_time: number;          // 创建时间戳
}
```

### 4. Identity (智囊团身份)

```typescript
interface Identity {
    id: string;                    // 身份唯一 ID
    name: string;                  // 身份名称
    prompt: string;                // 身份提示词
    enabled: boolean;              // 是否启用
}
```

### 5. AgentConfig (智能分析配置)

```typescript
interface AgentConfig {
    enabled: boolean;                          // 是否启用智能分析
    model_name: string;                        // 智能分析模型名称
    model_type: "api" | "local";              // 模型类型
    auto_trigger: boolean;                     // 是否自动触发
    min_characters: number;                    // 字数阈值
    silence_threshold: number;                 // 静音检测时长 (秒)
    max_messages: number;                      // 消息历史上限
    intent_recognition_enabled: boolean;       // 是否启用意图识别
    intent_model_name?: string;                // 意图识别模型名称
    intent_model_type?: "api" | "local";      // 意图识别模型类型
}
```

### 6. LLMConfig (LLM 配置)

```typescript
interface LLMConfig {
    name: string;                  // 配置名称
    base_url: string;              // API 基础 URL
    api_key: string;               // API 密钥
    model: string;                 // 模型名称
    system_prompt?: string;        // 系统提示词
    tags?: string[];               // 身份标签
}
```

### 7. AnalysisResult (智能分析结果)

```typescript
interface AnalysisResult {
    phase1: {
        is: boolean;               // 是否需要 AI 介入
        reason: string;            // 分析原因
        confidence?: number;       // 置信度
        model_name?: string;       // 使用的模型
        raw_response?: string;     // 原始响应
    };
    phase2?: {
        success: boolean;          // 意图识别是否成功
        summary_xml?: string;      // 意图识别结果 (XML)
        error?: string;            // 错误信息
        raw_response?: string;     // 原始响应
    };
    distribution: {
        mode: string;              // 分发模式 (think_tank/default/skipped)
        targets: string[];         // 目标模型列表
        intent?: any;              // 意图结果
    };
    analysis_id?: string;          // 分析批次 ID
    analysis_summary?: string;     // 分析摘要
    analysis_count?: number;       // 分析消息数量
    analysis_preview?: string;     // 分析预览
}
```

---

## ⚠️ 错误处理

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |

### 错误响应格式

```json
{
    "detail": "错误描述信息"
}
```

### 常见错误

#### 1. 聊天未找到 (404)
```json
{
    "detail": "Chat not found"
}
```

#### 2. 身份不存在 (404)
```json
{
    "detail": "身份不存在"
}
```

#### 3. 声纹不存在 (404)
```json
{
    "detail": "未找到声纹文件: 张三"
}
```

#### 4. 智能分析模块不可用 (503)
```json
{
    "detail": "智能 Agent 模块不可用"
}
```

---

## 💻 示例代码

### 1. Python 客户端示例

#### 获取聊天列表
```python
import requests

response = requests.get('http://localhost:8000/api/chats')
data = response.json()
print(f"当前聊天: {data['current_chat_id']}")
print(f"聊天数量: {len(data['chats'])}")
```

#### 创建新聊天
```python
import requests

response = requests.post(
    'http://localhost:8000/api/chats',
    json={"title": "新项目讨论"}
)
chat = response.json()
print(f"创建聊天: {chat['id']}")
```

#### 配置智能分析
```python
import requests

response = requests.post(
    'http://localhost:8000/api/agent/config',
    json={
        "enabled": True,
        "min_characters": 15,
        "silence_threshold": 3,
        "model_name": "SmartAgent",
        "model_type": "api"
    }
)
result = response.json()
print(f"配置更新: {result['status']}")
```

#### 测试 LLM 连接
```python
import asyncio
import websockets
import json

async def test_llm():
    uri = "ws://localhost:8000/ws/llm"
    async with websockets.connect(uri) as websocket:
        # 发送测试消息
        await websocket.send(json.dumps({
            "messages": [
                {"role": "user", "content": "Hello"}
            ],
            "chat_id": "test-123",
            "is_multi_llm": False
        }))

        # 接收响应
        async for message in websocket:
            data = json.loads(message)
            print(f"收到: {data}")

# 运行测试
asyncio.run(test_llm())
```

### 2. JavaScript 客户端示例

#### WebSocket 连接 (ASR)
```javascript
const ws = new WebSocket('ws://localhost:8000/ws');

ws.onopen = () => {
    console.log('ASR WebSocket 已连接');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // 处理 ASR 结果
    if (data.speaker && data.text) {
        console.log(`[${data.time}] ${data.speaker}: ${data.text}`);
    }

    // 处理智能分析状态
    if (data.analysis_status) {
        console.log(`分析状态: ${data.analysis_status}`);
        if (data.analysis_need_ai) {
            console.log('需要 AI 介入');
        }
    }
};

ws.onerror = (error) => {
    console.error('WebSocket 错误:', error);
};
```

#### WebSocket 连接 (LLM)
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/llm');

ws.onopen = () => {
    console.log('LLM WebSocket 已连接');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch(data.type) {
        case 'chunk':
            // 流式响应片段
            process.stdout.write(data.content);
            break;
        case 'done':
            // 单模型完成
            console.log('\n✅ 回答完成');
            break;
        case 'done_one':
            // 智囊团单个模型完成
            console.log(`✅ ${data.model} 完成回答`);
            break;
        case 'done_all':
            // 智囊团全部完成
            console.log('✅ 所有模型回答完成');
            break;
        case 'error':
            // 错误
            console.error('❌ 错误:', data.content);
            break;
    }
};

// 发送消息
function sendMessage(messages, isMultiLLM = false) {
    ws.send(JSON.stringify({
        messages: messages,
        chat_id: 'current-chat-id',
        is_multi_llm: isMultiLLM
    }));
}

// 使用示例
sendMessage([
    {role: 'user', content: '请介绍一下微服务架构'}
], true); // 使用智囊团模式
```

### 3. cURL 示例

#### 获取所有配置
```bash
curl -X GET http://localhost:8000/api/config
```

#### 更新 LLM 配置
```bash
curl -X POST http://localhost:8000/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "configs": [
      {
        "name": "DeepSeek-V3",
        "base_url": "https://api.deepseek.com/v1",
        "api_key": "sk-your-key",
        "model": "deepseek-chat"
      }
    ],
    "current_config": "DeepSeek-V3"
  }'
```

#### 创建声纹
```bash
curl -X POST http://localhost:8000/api/voiceprints \
  -H "Content-Type: application/json" \
  -d '{
    "name": "张三",
    "audio_data": "data:audio/wav;base64,Base64EncodedAudioData..."
  }'
```

#### 手动触发智能分析
```bash
curl -X POST http://localhost:8000/api/agent/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "如何优化数据库查询性能？",
        "speaker": "张三"
      }
    ],
    "speaker_name": "张三",
    "request_type": "agent_analysis"
  }'
```

---

## 🔐 认证说明

当前系统未实现认证机制，所有 API 接口均可直接访问。

**生产环境建议:**
- 添加 API Key 认证
- 使用 HTTPS 加密传输
- 实施请求频率限制
- 添加 CORS 配置

---

## 📝 更新日志

### v1.0.0 (2025-12-04)
- 初始版本发布
- 支持基础 REST API 和 WebSocket 接口
- 实现智能分析和智囊团功能
- 完整的声纹管理功能

---

## 📞 支持与反馈

如有问题或建议，请通过以下方式联系:

- 项目仓库: [GitHub Issue](https://github.com/your-repo/issues)
- 文档反馈: [GitHub Discussion](https://github.com/your-repo/discussions)

---

**文档版本:** v1.0.0
**最后更新:** 2025-12-04
