# AST 实时语音转文本与大模型分析系统 - 后端 API 文档

> 文档生成时间: 2025-12-06
> 项目版本: v1.1.0
> 基础URL: `http://localhost:8000`

---

## 📚 目录

1. [系统概览](#-系统概览)
2. [REST API 接口](#-rest-api-接口)
    - [配置管理](#1-配置管理)
    - [身份管理（智囊团）](#2-身份管理智囊团)
    - [聊天管理](#3-聊天管理)
    - [智能分析](#4-智能分析)
    - [声纹管理](#5-声纹管理)
    - [简历管理](#6-简历管理)
    - [目标岗位分析](#7-目标岗位分析)
    - [UI 状态管理](#8-ui-状态管理)
3. [WebSocket 接口](#-websocket-接口)
4. [数据模型](#-数据模型)
5. [错误处理](#-错误处理)

---

## 🎯 系统概览

### 核心功能

AST 系统是一个集成多种 AI 能力的实时语音处理平台，提供：

- **实时语音转文本（ASR）**: 基于 SenseVoice Small 模型
- **说话人识别**: 基于 CAM++ 模型
- **大模型对话**: 支持 OpenAI 兼容 API
- **智能分析**: 自动判定是否需要 AI 介入，支持多阶段分析（初步分析 -> 意图识别 -> 分发）
- **智囊团**: 多模型协作提供建议
- **简历个性化**: 基于简历内容的个性化回答
- **全局 UI 状态保存**: 记忆前端界面状态

### 架构特点

- **FastAPI** 后端框架
- **WebSocket** 实时通信
- **模块化设计**：TriggerManager, AgentManager, ResumeManager 等独立模块协作
- **多模型支持**：同时支持本地模型（通过 transformers）和云端 API

---

## 🌐 REST API 接口

### 1. 配置管理

#### 1.1 获取配置信息
**GET** `/api/config`

获取当前 LLM API 配置和智能分析配置。

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
        "max_messages": 50,
        "intent_recognition_enabled": true
    },
    "protagonist": "张三"
}
```

#### 1.2 更新配置
**POST** `/api/config`

更新 API 配置。

**请求体:**
```json
{
    "configs": [...],
    "current_config": "DeepSeek-V3",
    "multi_llm_active_names": ["DeepSeek-V3"]
}
```

#### 1.3 测试连接
**POST** `/api/test_connection`

测试 LLM API 连接是否有效。

**请求体:**
```json
{
    "api_key": "sk-*****",
    "base_url": "https://...",
    "model": "model-name"
}
```

---

### 2. 身份管理（智囊团）

#### 2.1 获取所有身份
**GET** `/api/identities`

获取已配置的所有智囊团身份。

#### 2.2 创建身份
**POST** `/api/identities`

**请求体:**
```json
{
    "id": "new_identity",
    "name": "新身份",
    "prompt": "提示词...",
    "enabled": true
}
```

#### 2.3 更新身份
**PUT** `/api/identities/{role_id}`

#### 2.4 删除身份
**DELETE** `/api/identities/{role_id}`

---

### 3. 聊天管理

#### 3.1 获取所有聊天
**GET** `/api/chats`

#### 3.2 创建聊天
**POST** `/api/chats`

#### 3.3 获取聊天详情
**GET** `/api/chats/{chat_id}`

#### 3.4 删除聊天
**DELETE** `/api/chats/{chat_id}`

#### 3.5 清空聊天记录
**POST** `/api/chats/{chat_id}/clear`

---

### 4. 智能分析

#### 4.1 获取智能分析状态
**GET** `/api/agent/status`

获取智能分析 Agent 的运行状态、配置信息及可用模型。

**响应示例:**
```json
{
    "available": true,
    "enabled": true,
    "auto_trigger": true,
    "status": {
        "enabled": true,
        "accumulated_chars": 5,
        "threshold": 10,
        "silence_threshold": 2,
        "last_message_time": 1701234567.0
    },
    "config": { ... },
    "model_local": ["Qwen3-0.6B"]
}
```

#### 4.2 获取智囊团角色配置
**GET** `/api/agent/roles`

#### 4.3 启用/禁用智能分析
**POST** `/api/agent/enable`

**请求体:**
```json
{ "enabled": true, "auto_trigger": true }
```

#### 4.4 更新智能分析配置
**POST** `/api/agent/config`

**请求体:**
```json
{
    "min_characters": 10,
    "silence_threshold": 2,
    "max_messages": 50,
    "model_name": "SmartAgent",
    "model_type": "api",
    "intent_recognition_enabled": true,
    "intent_model_name": "Qwen3-0.6B",
    "intent_model_type": "local"
}
```

#### 4.5 手动触发智能分析/意图识别
**POST** `/api/agent/analyze`

手动触发分析流程，支持指定分析模块。

**请求体:**
```json
{
    "messages": [...],
    "speaker_name": "张三",
    "request_type": "agent_analysis",
    "modules": ["analysis", "intent", "think_tank"],
    "intent_recognition_config": {
        "model_type": "local",
        "model_name": "Qwen3-0.6B"
    }
}
```
- `modules`: 指定要运行的模块 pipeline。可选值：`analysis` (初步判定), `intent` (意图识别), `think_tank` (智囊团分发)。

**响应:** 返回 `AnalysisResult` 对象 (详见数据模型章节)。

#### 4.6 获取/设置主人公
**GET** `/api/protagonist`
**POST** `/api/protagonist`

---

### 5. 声纹管理

#### 5.1 获取声纹库
**GET** `/api/voiceprints`

#### 5.2 创建声纹
**POST** `/api/voiceprints`

**请求体:**
```json
{
    "name": "张三",
    "audio_data": "data:audio/wav;base64,..."
}
```

#### 5.3 删除声纹
**DELETE** `/api/voiceprints/{name}`

#### 5.4 重新计算声纹嵌入
**POST** `/api/voiceprints/rebuild`

#### 5.5 获取声纹音频
**GET** `/api/voiceprint/audio/{name}`

---

### 6. 简历管理

#### 6.1 上传简历
**POST** `/api/resume/upload`

上传并解析 PDF 简历。

**请求（Multipart Form）:**
- `file`: PDF 文件

#### 6.2 停止处理
**POST** `/api/resume/stop`

停止当前的简历解析任务。

#### 6.3 获取状态
**GET** `/api/resume/status`

获取简历解析状态和个性化配置。

**响应:**
```json
{
    "state": "completed", 
    "progress": 100,
    "message": "解析完成",
    "personalization_enabled": true
}
```

#### 6.4 切换简历个性化
**POST** `/api/resume/toggle`

开启或关闭基于简历的个性化回答。

**请求体:**
```json
{ "enabled": true }
```

#### 6.5 获取简历内容
**GET** `/api/resume/xml` (XML 格式)
**GET** `/api/resume/markdown` (Markdown 格式)

---

### 7. 目标岗位分析

目标岗位分析功能允许用户输入职位描述（JD），系统会自动分析该岗位的技术栈、考察重点、面试要点等，为后续的面试准备和简历优化提供针对性建议。

#### 7.1 生成岗位分析
**POST** `/api/job/generate`

生成指定岗位的分析报告。

**请求体:**
```json
{
    "title": "高级 Python 开发工程师",
    "jd": "岗位职责：负责后端系统开发，要求熟悉 Python、MySQL、Redis 等技术...",
    "thinking_mode": true  // 可选，是否启用思考模式
}
```

**响应:**
```json
{
    "status": "success",
    "message": "已开始职位分析生成"
}
```

#### 7.2 获取分析状态
**GET** `/api/job/status`

获取当前岗位分析的进度和状态。

**响应:**
```json
{
    "status": {
        "state": "completed",  // idle, processing, completed, error
        "message": "分析完成",
        "error": null
    },
    "info": {
        "title": "高级 Python 开发工程师",
        "jd_preview": "岗位职责：负责后端系统开发..."
    },
    "has_analysis": true
}
```

#### 7.3 获取分析内容
**GET** `/api/job/content`

获取完整的岗位分析报告内容。

**响应:**
```json
{
    "content": "# 岗位分析报告\n\n## 技术栈透视\n..."
}
```

#### 7.4 清空分析
**POST** `/api/job/clear`

清空当前的岗位分析数据。

**响应:**
```json
{
    "status": "success",
    "message": "职位分析已清空"
}
```

---

### 8. UI 状态管理

#### 8.1 获取 UI 状态
**GET** `/api/ui_state`

获取前端保存的界面状态（如侧边栏宽度、展开状态等）。

#### 8.2 更新 UI 状态
**POST** `/api/ui_state`

增量更新 UI 状态。

**请求体:** 任意 JSON 对象，将与现有状态合并。

---

## 🔌 WebSocket 接口

### 1. ASR 实时数据推送
**连接地址:** `/ws`

推送内容：
- ASR 实时转写结果
- 智能分析状态（初步判定结果）
- 系统通知

消息格式与之前版本基本一致，新增 `intent_info` 字段用于传递意图识别摘要。

### 2. LLM 对话和智囊团
**连接地址:** `/ws/llm`

#### 发送消息
```json
{
    "messages": [...],
    "chat_id": "...",
    "is_multi_llm": false
}
```
*注：系统会自动注入 System Prompt 和简历上下文（如果启用）。*

#### 接收消息 (新增字段)
**智能分析触发:**
```json
{
    "type": "agent_triggered",
    "reason": "...",
    "messages": [...],
    "intent_recognition": true,
    "intent_data": { 
        "success": true, 
        "summary_xml": "...",
        "model_name": "..."
    }
}
```

---

## 📊 数据模型

### AnalysisResult (分析结果)
```typescript
interface AnalysisResult {
    phase1: {
        is: boolean;               // 是否需要 AI 介入
        reason: string;            // 原因
        model_name?: string;
        intent_only?: boolean;     // 是否仅进行了意图识别（跳过 Phase1）
    };
    phase2?: {                     // 意图识别结果
        success: boolean;
        summary_xml?: string;      // XML 格式结果
        error?: string;
        model_name?: string;
    };
    distribution: {                // 分发策略
        mode: "default" | "think_tank" | "skipped" | "halt";
        targets: string[];         // 目标身份/模型 ID
        intent?: any;
        system_prompt?: string;    // 动态生成的 System Prompt
    };
}
```

### AgentConfig (智能分析配置)
```typescript
interface AgentConfig {
    enabled: boolean;
    model_name: string;
    model_type: "api" | "local";
    auto_trigger: boolean;
    min_characters: number;
    silence_threshold: number;
    max_messages: number;
    intent_recognition_enabled: boolean;   // 新增
    intent_model_name?: string;            // 新增
    intent_model_type?: "api" | "local";   // 新增
}
```

### ResumeStatus (简历状态)
```typescript
interface ResumeStatus {
    state: "idle" | "processing" | "completed" | "error";
    progress: number;
    message: string;
    error?: string;
    filename?: string;
    personalization_enabled: boolean;
}
```

### JobStatus (岗位分析状态)
```typescript
interface JobStatus {
    state: "idle" | "processing" | "completed" | "error";
    message: string;
    error?: string;
}
```

## ⚠️ 错误处理

标准 HTTP 状态码：
- `200`: 成功
- `400`: 参数错误
- `404`: 资源不存在
- `503`: 服务不可用 (如 Agent 模块未加载)
- `500`: 服务器内部错误
