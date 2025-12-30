# 基于AST与多Agent辅助的程序员面试工具

市面上的面试辅助工具，吃相可怕，功能也不是那么好。  
做了一个基于ASR、CAM+、Multi-LLM的面试辅助工具   

---



## 项目概览

ASR实时转语音，支持录入声纹即说话人识别与多个不同的智能体共同协作。   
浏览器作为原生客户端。Python作为服务端。仅支持1对1   
支持添加本地模型与不同服务商的api  

**分为四层**
```text
第一层是 智能分析或用户手动发送消息    
第二层是 意图识别 （off/on）  
第三层是 用户个性化 （off/on）
第四层是 智囊团或直接回答     
```

### 核心功能

- **实时语音转文本（ASR）**: 基于 SenseVoice Small 模型，支持多语言识别
- **说话人识别**: 基于 CAM++ 模型，支持声纹库管理和实时说话人识别
- **语音活动检测（VAD）**: 基于 WebRTC VAD，准确检测语音片段
- **大模型对话**: 集成多种 LLM API（OpenAI 兼容），支持流式对话
- **智能分析助手**: 根据ASR结果智能判定是否需要启动智囊团
- **智囊团模式**: 多个不同 LLM 同时给出提议，辅助主人公回复
- **意图识别**: 自动提取对话中的核心问题和讨论大纲，发送给
- **简历个性化**: 基于简历内容的个性化回答和建议
- **目标岗位分析**: 智能分析职位描述（JD），提取技术栈、考察重点和面试要点
- **Web 界面**: 响应式界面，支持实时显示转录结果和 LLM 对话
- **多会话管理**: 支持聊天历史、会话切换等功能

---

## 系统架构

### 架构总览

[核心模块流程图](README\Mermaid.md)

### 技术栈

| 类别 | 技术/框架 | 版本/说明 |
|------|-----------|-----------|
| **ASR 模型** | [SenseVoice Small](https://www.modelscope.cn/models/iic/SenseVoiceSmall) | FunASR |
| **说话人识别** | [CAM++](https://www.modelscope.cn/models/iic/speech_campplus_sv_zh-cn_16k-common) | ModelScope |
| **VAD** | WebRTC VAD | webrtcvad |
| **音频处理** | librosa, soundfile, numpy | 音频加载/处理 |
| **录音** | PyAudio | 实时音频采集 |
| **Web 框架** | FastAPI | 后端 API 服务 |
| **前端** | HTML + JavaScript + CSS | 原生实现 |
| **LLM 客户端** | OpenAI Python SDK | 兼容多厂商 API |
| **配置管理** | JSON | 轻量级配置存储 |

---
项目结构 (Path Notation)
```
|-- api_config.json  // 配置: LLM API 配置信息
|-- main.py          // 核心模块: ASR 实时处理核心 (语音转文本、声纹识别、VAD 检测)
|-- server.py        // 核心模块: Web 服务 (FastAPI, WebSocket, REST API, 线程管理)
|-- llm_client.py    // 核心模块: 客户端 (LLM API 集成, 流式响应)
|-- chat_manager.py  // 核心模块: 管理器 (聊天会话管理, 历史存储)
|-- resume_manager.py// 核心模块: 管理器 (简历解析管理, PDF 解析)
|-- job_manager.py   // 核心模块: 管理器 (岗位分析管理, JD 分析, 技术栈提取)
|-- intelligent_agent.py // 核心模块: 智能体 (智能分析核心, 意图识别, 分发)
|-- trigger_manager.py // 核心模块: 管理器 (触发机制管理, 字数/静音检测)
|
|-- data/             // 配置与数据目录
|   |-- agent.json    // 配置: 智囊团角色配置
|   |-- ui_state.json // 数据: 前端界面状态
|
|-- static/           // 前端资源目录
|   |-- index.html    // UI 页面: 主界面布局
|   |-- css/          // 样式: UI 样式定义
|   |-- js/           // 脚本: 前端交互逻辑
|
|-- voiceprints/      // 数据目录: 声纹库 (用户音频样本)
|
|-- output/           // 数据目录: 临时音频文件输出
|
|-- resumes/          // 数据目录: 简历数据和分析结果
``` 

## 快速开始

### 环境依赖

```bash
# 核心依赖
uv pip sync requirements.lock.txt
或  
pip install requirements.lock.txt

# 可选：CUDA 支持（用于 GPU 加速）
# 确保已安装 CUDA 和 PyTorch
```

或使用简化依赖（不含 torch）：

```bash
pip install -r requirements_notourch.txt
```



### 模型下载

系统会自动下载以下模型：
- [**SenseVoiceSmall**](https://www.modelscope.cn/models/iic/SenseVoiceSmall): 约 200MB，用于语音识别 
- [**CAM++**](https://www.modelscope.cn/models/iic/speech_campplus_sv_zh-cn_16k-common): 约 50MB，用于说话人识别

> 首次运行时会自动从 ModelScope 下载    
可以自行配置路径`main.py`  
```python
        self.model_asr = AutoModel(
            model="SenseVoiceSmall",   # 当前目录文件夹
            trust_remote_code=True,
            device="cuda" 
        )

        print("正在加载 CAM++ 模型 (声纹识别)...")
        # 使用你找到的正确 SV 模型 ID
        self.sv_pipeline = pipeline(
            task='speaker-verification',
            model='speech_campplus_sv_zh-cn_16k-common', # 当前目录文件夹
            model_revision='v1.0.0'
        )
```

### 配置 LLM API

**配置原理**：
- **前端可配**：大部分配置通过 Web 界面设置即可
- **必须手动**：本地模型列表需手动修改配置文件

**快速配置**：

1. **配置**：访问 http://localhost:8000 ，在设置面板中添加 API 配置
2. **本地模型配置**：编辑 `api_config.json`

```json
{
    // 本地模型列表（定义前端下拉框选项） 等同于路径，我是配在当前目录中，只实测过以下模型
    // 来源：https://www.modelscope.cn/
    "model_local": [
        "Qwen3-0.6B",  //https://www.modelscope.cn/models/Qwen/Qwen3-0.6B   有思考模式
        "Qwen2.5-0.5B-Instruct", //https://www.modelscope.cn/models/Qwen/Qwen2.5-0.5B-Instruct 
    ],
}
```

**操作步骤**：
1. **前端配置**：打开 Web 界面 → 设置 → 添加/编辑 LLM 配置
2. **手动补充**：编辑 `api_config.json`，添加 `model_local` 本地模型列表
3. **核心逻辑**：如需自定义子智能体逻辑，编辑 `data/agent.json` 的 `sub_agents` 字段

> 详细配置说明请参考：[README/操作手册.md](README/操作手册.md)

控制台实时显示转录结果

---

## API 文档

详细 API 文档请参考：[backend_api_documentation.md](README/backend_api_documentation.md)

---

# 预览图
![主界面](README\PNG\主界面.png)
![配置设置](README\PNG\配置设计.png)
![岗位分析](README\PNG\岗位分析.png)
![声纹管理](README\PNG\声纹管理.png)
![简历分析](README\PNG\简历分析.png)

This project is licensed under the MIT License.
See https://opensource.org/license/mit/ for details.