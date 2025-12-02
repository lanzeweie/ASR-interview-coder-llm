# 开发命令指南

## 启动命令

### 完整系统启动（推荐）
```bash
python server.py
```
- 启动完整的Web服务器和ASR系统
- 包含所有功能：语音转文本、声纹识别、智能分析、智囊团
- 访问 http://localhost:8000 查看Web界面

### 跳过模型初始化（开发调试用）
```bash
python server.py --no
```
- 跳过所有AI模型初始化
- 快速启动Web服务器，用于前端开发或API调试

### 指定端口和主机
```bash
python server.py --host 127.0.0.1 --port 8080
```
- 自定义服务地址和端口
- 默认地址: 0.0.0.0:8000

### 纯ASR模式
```bash
python main.py
```
- 仅运行语音转文本功能
- 控制台模式，无Web界面
- 适合纯语音识别测试

## API测试

### LLM连接测试
```bash
python llm_client.py
```
- 测试当前配置的LLM连接
- 验证API密钥和接口配置
- 输出详细的调试信息

## 依赖管理

### 安装核心依赖
```bash
pip install funasr modelscope webrtcvad pyaudio librosa soundfile numpy fastapi uvicorn websockets openai transformers torch
```

### GPU加速支持（可选）
- 确保已安装CUDA和PyTorch
- ASR模型会自动检测并使用GPU设备

## 文件操作

### 查看声纹库
```bash
ls voiceprints/
```
- 查看已录入的声纹文件

### 查看临时音频
```bash
ls output/
```
- 查看ASR生成的临时音频文件

### 清理临时文件
```bash
rm output/temp_speech.wav
```
- 清理临时音频文件

## 调试命令

### 启用详细日志
```bash
python server.py 2>&1 | tee server.log
```
- 启动服务器并保存日志到文件
- 便于分析运行状态和错误信息

### 测试智能分析
```bash
# 发送测试请求到智能分析接口
curl -X POST http://localhost:8000/api/agent/analyze \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"content":"这个Python异步编程有什么最佳实践？"}], "speaker_name":"张三"}'
```

### 查看API配置
```bash
# 获取当前LLM配置
curl http://localhost:8000/api/config
```

## 配置管理

### 编辑LLM API配置
```bash
nano api_config.json
# 或
notepad api_config.json
```

### 查看聊天历史
```bash
cat data/chat_history.json | jq .
```
- 使用jq格式化输出JSON

### 查看智能Agent状态
```bash
curl http://localhost:8000/api/agent/status
```

## 开发工具

### 项目结构查看
```bash
tree /f  # Windows
find . -type f -name "*.py" | head -20  # 查看Python文件
```

### 符号搜索（使用Serena）
```bash
# 在Serena中使用
find_symbol("class RealTimeASR_SV")
find_referencing_symbols("LLMClient", "llm_client.py")
search_for_pattern("def.*asr")
```

### 批量文件操作
```bash
# 批量查找文件中的内容
grep -r "TODO" --include="*.py" .
grep -r "FIXME" --include="*.py" .
```

## 性能优化

### 内存监控
```bash
# Windows任务管理器
# 查看Python进程内存使用

# Python代码中监控
import psutil
print(f"内存使用率: {psutil.virtual_memory().percent}%")
```

### GPU状态监控
```bash
nvidia-smi
```
- 查看GPU使用状态（需要NVIDIA显卡）

## 故障排除

### 常见问题解决

#### 音频设备问题
```bash
# 检查麦克风设备
python -c "import pyaudio; p=pyaudio.PyAudio(); [print(f'{i}: {p.get_device_info_by_index(i)}') for i in range(p.get_device_count())]"
```

#### 模型下载问题
```bash
# 清理模型缓存
rm -rf ~/.cache/modelscope/
rm -rf ~/.cache/torch/
```

#### 端口占用
```bash
# 查看端口占用
netstat -ano | findstr :8000
# 杀死进程
taskkill /PID <PID> /F
```

## 项目维护

### 更新智囊团角色
```bash
# 编辑data/agent.json添加新角色
notepad data/agent.json
```

### 备份重要数据
```bash
# 备份声纹库
cp -r voiceprints/ voiceprints_backup/
# 备份聊天历史
cp data/chat_history.json data/chat_history_backup.json
```

### 代码质量检查
```bash
# 安装代码检查工具
pip install flake8 black

# 运行代码格式化
black *.py

# 运行代码检查
flake8 *.py --max-line-length=120 --ignore=E501,W503
```