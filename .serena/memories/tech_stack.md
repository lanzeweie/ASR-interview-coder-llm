# 技术栈详解

## 核心技术

### 语音处理

#### ASR模型 - SenseVoice Small
- **框架**: FunASR
- **模型ID**: "SenseVoiceSmall"
- **功能**: 实时语音转文本
- **特点**: 
  - 支持多语言识别（中文、英文、日文等）
  - 轻量级模型（约200MB）
  - 高准确率，适合实时场景
- **配置参数**:
  - device: "cuda" 或 "cpu"
  - trust_remote_code: True
- **使用方式**:
  ```python
  from funasr import AutoModel
  
  self.model_asr = AutoModel(
      model="SenseVoiceSmall",
      trust_remote_code=True,
      device="cuda"
  )
  ```

#### 声纹识别 - CAM++
- **框架**: ModelScope
- **模型ID**: "speech_campplus_sv_zh-cn_16k-common"
- **功能**: 说话人识别和声纹比对
- **特点**:
  - 基于CAM++架构
  - 支持中文声纹识别
  - 预计算嵌入向量，提高比对效率
- **配置参数**:
  - model_revision: "v1.0.0"
- **使用方式**:
  ```python
  from modelscope.pipelines import pipeline
  
  self.sv_pipeline = pipeline(
      task='speaker-verification',
      model='speech_campplus_sv_zh-cn_16k-common',
      model_revision='v1.0.0'
  )
  ```

#### 语音活动检测 - WebRTC VAD
- **库**: webrtcvad
- **功能**: 检测音频中的语音活动
- **特点**:
  - 高效的实时VAD算法
  - 支持多种敏感度模式（0-3）
- **配置**:
  - VAD_MODE: 3（最敏感，适合中文语音）
  - 采样率: 16000Hz
- **使用方式**:
  ```python
  import webrtcvad
  
  self.vad = webrtcvad.Vad()
  self.vad.set_mode(3)
  
  # 检测语音
  is_active = self.vad.is_speech(frame, self.AUDIO_RATE)
  ```

### 音频处理

#### PyAudio
- **功能**: 实时音频采集和播放
- **用途**: 麦克风录音
- **配置**:
  - 格式: paInt16
  - 采样率: 16000Hz
  - 通道数: 1（单声道）
  - 块大小: 1024
- **使用方式**:
  ```python
  import pyaudio
  
  p = pyaudio.PyAudio()
  stream = p.open(
      format=pyaudio.paInt16,
      channels=1,
      rate=16000,
      input=True,
      frames_per_buffer=1024
  )
  ```

#### librosa
- **功能**: 音频加载和处理
- **用途**: 
  - 音频重采样
  - 特征提取
  - 音频格式转换
- **使用方式**:
  ```python
  import librosa
  
  # 加载音频并重采样
  y, sr = librosa.load(audio_path, sr=16000)
  ```

#### soundfile
- **功能**: 音频文件读写
- **用途**: 保存临时WAV文件
- **支持格式**: WAV、FLAC、OGG等
- **使用方式**:
  ```python
  import soundfile as sf
  
  # 写入音频
  sf.write(file_path, audio_data, samplerate)
  
  # 读取音频信息
  info = sf.info(file_path)
  duration = info.duration
  ```

### Web框架

#### FastAPI
- **版本**: 现代Python Web框架
- **功能**: 
  - RESTful API服务
  - WebSocket支持
  - 自动文档生成
- **特点**:
  - 高性能（基于Starlette和Pydantic）
  - 类型安全
  - 自动API文档（Swagger UI）
- **主要端点**:
  - `/` - 前端页面
  - `/ws` - ASR实时数据推送
  - `/ws/llm` - LLM对话流
  - `/api/chats` - 聊天管理
  - `/api/config` - 配置管理
- **使用方式**:
  ```python
  from fastapi import FastAPI
  
  app = FastAPI()
  
  @app.get("/api/config")
  async def get_config():
      return load_config()
  ```

#### Uvicorn
- **功能**: ASGI服务器
- **用途**: 运行FastAPI应用
- **配置**:
  - host: "0.0.0.0"
  - port: 8000
- **使用方式**:
  ```python
  import uvicorn
  
  uvicorn.run(app, host="0.0.0.0", port=8000)
  ```

### LLM集成

#### OpenAI Python SDK
- **版本**: 兼容OpenAI API
- **功能**: 
  - 聊天对话
  - 流式响应
  - 多厂商API支持
- **特点**:
  - 统一的API接口
  - 支持所有OpenAI兼容的服务商
- **使用方式**:
  ```python
  from openai import AsyncOpenAI
  
  client = AsyncOpenAI(
      api_key=api_key,
      base_url=base_url
  )
  
  async for chunk in client.chat.completions.create(
      model=model,
      messages=messages,
      stream=True
  ):
      # 处理流式响应
      pass
  ```

#### 支持的LLM提供商

1. **OpenAI** (OpenAI GPT系列)
2. **DeepSeek** (DeepSeek系列模型)
3. **智谱AI** (GLM系列)
4. **通义千问** (Qwen系列)
5. **其他OpenAI兼容API**

### 前端技术

#### 原生HTML/CSS/JavaScript
- **HTML5**: 页面结构
- **CSS3**: 响应式布局，样式美化
- **JavaScript (ES6+)**: 
  - WebSocket客户端
  - 实时数据渲染
  - 用户交互处理
- **WebSocket API**:
  - 连接管理
  - 消息接收和发送
  - 实时UI更新

### 数据存储

#### JSON
- **用途**: 
  - 聊天历史存储 (`data/chat_history.json`)
  - API配置管理 (`api_config.json`)
  - 智囊团角色配置 (`data/agent.json`)
- **特点**: 
  - 轻量级
  - 人类可读
  - 易于编辑

#### 文件存储
- **voiceprints/**: 声纹库目录
  - WAV文件: 原始音频
  - NPY文件: 预计算的嵌入向量
- **output/**: 临时文件目录
  - temp_speech.wav: 临时音频片段
- **data/**: 数据文件目录
  - chat_history.json: 聊天历史
  - agent.json: 智囊团配置

### 开发工具

#### Serena MCP工具
- **版本**: 0.1.4
- **功能**: 
  - 代码符号分析
  - 文件搜索和编辑
  - 项目记忆管理
- **可用工具**:
  - `find_symbol` - 查找符号
  - `find_referencing_symbols` - 查找引用
  - `search_for_pattern` - 搜索模式
  - `read_file` / `write_file` - 文件读写
  - `replace_regex` - 正则替换

### 机器学习框架

#### Transformers (可选)
- **库**: HuggingFace Transformers
- **用途**: 本地小模型推理
- **支持模型**: 
  - Qwen系列
  - BERT系列
  - 其他Causal LM模型
- **特点**:
  - 轻量级模型（0.5B-7B参数）
  - 离线推理
  - 低延迟
- **使用方式**:
  ```python
  from transformers import AutoModelForCausalLM, AutoTokenizer
  
  tokenizer = AutoTokenizer.from_pretrained(model_name)
  model = AutoModelForCausalLM.from_pretrained(
      model_name,
      dtype=torch.float16,
      device_map="auto"
  )
  ```

#### PyTorch
- **版本**: 兼容CUDA
- **用途**: 
  - 深度学习模型推理
  - 张量计算
- **配置**:
  - 自动设备检测（CPU/GPU）
  - 混合精度（float16）支持

### 第三方库依赖

#### 核心依赖列表
```
funasr>=1.0.0          # 语音识别框架
modelscope>=1.0.0      # 模型库
webrtcvad>=2.0.0       # 语音活动检测
pyaudio>=0.2.0         # 音频I/O
librosa>=0.10.0        # 音频处理
soundfile>=0.12.0      # 音频文件读写
numpy>=1.21.0          # 数值计算
fastapi>=0.100.0       # Web框架
uvicorn>=0.20.0        # ASGI服务器
websockets>=11.0.0     # WebSocket支持
openai>=1.0.0          # LLM客户端
transformers>=4.30.0   # 本地模型（可选）
torch>=2.0.0           # PyTorch（可选）
httpx>=0.24.0          # HTTP客户端
asyncio-mqtt>=0.11.0   # 异步MQTT（可选）
```

### 系统架构模式

#### 事件驱动架构
- **特点**: 基于事件和回调
- **应用场景**: 
  - ASR消息处理
  - WebSocket消息推送
  - 智能分析触发

#### 生产者-消费者模式
- **生产者**: ASR录音线程
- **消费者**: 
  - 文本处理
  - 声纹识别
  - 智能分析
- **队列**: 内存中的消息队列

#### 观察者模式
- **应用**: 
  - 触发器监听ASR消息
  - WebSocket监听分析结果
- **优势**: 松耦合，事件通知机制

### 性能优化策略

#### 模型优化
1. **GPU加速**: 自动检测并使用CUDA
2. **混合精度**: float16减少显存占用
3. **批处理**: 支持批量推理
4. **模型缓存**: 预加载模型减少冷启动

#### 并发优化
1. **异步I/O**: async/await处理网络请求
2. **多线程**: ASR录音在独立线程
3. **线程池**: 处理计算密集型任务
4. **连接池**: WebSocket连接管理

#### 内存优化
1. **对象池**: 复用音频缓冲区
2. **垃圾回收**: 及时清理临时对象
3. **缓存策略**: LRU缓存常用数据
4. **内存映射**: 大文件使用mmap

### 错误处理

#### 异常分类
1. **配置错误**: API密钥缺失、配置文件错误
2. **网络错误**: API请求失败、超时
3. **模型错误**: 模型加载失败、推理错误
4. **音频错误**: 设备不可用、格式错误
5. **文件系统错误**: 权限不足、磁盘空间不足

#### 错误恢复策略
1. **重试机制**: 网络请求指数退避重试
2. **降级处理**: 模型失败时回退到备用方案
3. **资源清理**: 异常时释放资源
4. **日志记录**: 完整错误信息记录

### 安全考虑

#### API密钥管理
- **原则**: 不在代码中硬编码
- **方法**: 环境变量或配置文件
- **注意**: 配置文件不要提交到版本控制

#### 数据隐私
- **临时文件**: 处理完成后及时清理
- **内存数据**: 敏感数据不持久化
- **日志**: 避免记录敏感信息

#### 网络安全
- **HTTPS**: 生产环境使用HTTPS
- **CORS**: 正确配置跨域策略
- **速率限制**: 防止API滥用（可选）

### 部署方案

#### 本地部署
- **Python环境**: Python 3.8+
- **依赖安装**: pip install -r requirements.txt
- **模型下载**: 自动从HuggingFace/ModelScope下载
- **端口**: 默认8000

#### Docker部署（可选）
```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "server.py"]
```

#### 云端部署（可选）
- **云服务**: AWS、阿里云、腾讯云
- **容器平台**: Docker、Kubernetes
- **API网关**: 负载均衡、证书管理

### 监控和调试

#### 日志系统
- **级别**: DEBUG、INFO、WARNING、ERROR
- **输出**: 控制台、文件
- **格式**: 时间戳 - 模块名 - 级别 - 消息

#### 性能监控
- **CPU使用率**: 监控模型推理性能
- **内存使用**: 监控内存泄漏
- **GPU使用**: 监控GPU利用率
- **网络延迟**: 监控API响应时间

#### 调试工具
- **断点调试**: IDE调试器
- **日志分析**: 实时日志查看
- **性能分析**: cProfile、line_profiler
- **内存检查**: memory_profiler、tracemalloc