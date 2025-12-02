# 开发工作流程

## 项目初始化流程

### 1. 环境准备

#### 安装Python 3.8+
```bash
# 检查Python版本
python --version

# 如果版本过低，从官网下载安装
# https://www.python.org/downloads/
```

#### 创建虚拟环境（推荐）
```bash
# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate
```

#### 安装依赖
```bash
# 核心依赖
pip install funasr modelscope webrtcvad pyaudio librosa soundfile numpy fastapi uvicorn websockets openai

# 本地模型支持（可选）
pip install transformers torch

# 开发工具（推荐）
pip install black flake8 isort
```

### 2. 项目配置

#### 配置LLM API
```bash
# 编辑 api_config.json
{
  "configs": [
    {
      "name": "DeepSeek-V3",
      "base_url": "https://api.deepseek.com/v1",
      "api_key": "your-api-key",
      "model": "deepseek-chat",
      "system_prompt": "",
      "tags": [],
      "generation_params": {}
    }
  ],
  "current_config": "DeepSeek-V3",
  "multi_llm_active_names": [],
  "agent_config": {
    "enabled": false,
    "model_name": "",
    "auto_trigger": true,
    "min_characters": 10,
    "silence_threshold": 2,
    "max_messages": 50,
    "intent_recognition_enabled": false
  },
  "protagonist": ""
}
```

#### 创建必要目录
```bash
# Windows
mkdir data voiceprints output

# 或运行server.py自动创建
python server.py --no
```

## 日常开发流程

### 启动开发服务器

#### 完整模式（推荐用于功能开发）
```bash
python server.py
```
- 启动ASR系统（需要GPU或CPU性能）
- 完整Web服务
- 所有功能可用
- 访问: http://localhost:8000

#### 快速模式（推荐用于前端开发）
```bash
python server.py --no
```
- 跳过模型初始化
- 快速启动
- 适合前端调试和API测试
- 访问: http://localhost:8000

#### 指定端口
```bash
python server.py --port 8080
```

### 代码编辑流程

#### 1. 使用Serena工具

##### 查找符号
```bash
# 查找类定义
find_symbol("class RealTimeASR_SV")

# 查找函数
find_symbol("def process_audio")

# 查找引用
find_referencing_symbols("LLMClient", "llm_client.py")

# 搜索文件内容
search_for_pattern("async def.*analyze")
```

##### 阅读代码
```bash
# 获取文件符号概览
get_symbols_overview("main.py")

# 读取完整文件
read_file("server.py")

# 读取多个文件
read_file("intelligent_agent.py")
read_file("trigger_manager.py")
```

#### 2. 使用IDE

**推荐的IDE**:
- **VS Code**: 轻量级，Python插件
- **PyCharm**: 专业，功能全面
- **Vim/Neovim**: 极客首选

**VS Code推荐插件**:
- Python
- Pylance
- Python Debugger
- autoDocstring
- Black Formatter

### 代码修改流程

#### 修改现有功能

1. **理解现有代码**
   ```bash
   # 查看函数定义
   find_symbol("def load_voiceprints", include_body=True)
   
   # 查看调用位置
   find_referencing_symbols("load_voiceprints", "main.py")
   ```

2. **编写修改**
   ```python
   # 示例：修改声纹阈值
   # 在main.py第23行
   self.SV_THRESHOLD = 0.4  # 从0.35改为0.4
   ```

3. **测试修改**
   ```bash
   # 重启服务器
   # Ctrl+C 停止，然后
   python server.py
   ```

4. **验证功能**
   - 测试声纹识别准确性
   - 检查阈值变化效果

#### 添加新功能

1. **规划功能**
   - 确定模块位置
   - 设计接口
   - 考虑依赖

2. **实现代码**
   ```python
   # 示例：添加新方法
   def new_feature(self, param: str) -> bool:
       """新功能说明"""
       try:
           # 实现逻辑
           return True
       except Exception as e:
           logger.error(f"新功能失败: {e}")
           return False
   ```

3. **更新接口**
   ```python
   # 在server.py中添加API端点
   @app.post("/api/new-feature")
   async def new_feature_endpoint(data: dict = Body(...)):
       result = asr_system.new_feature(data.get('param'))
       return {"status": "success", "result": result}
   ```

4. **前端支持**
   ```javascript
   // 在static/script.js中添加调用
   async function callNewFeature() {
       const response = await fetch('/api/new-feature', {
           method: 'POST',
           headers: {'Content-Type': 'application/json'},
           body: JSON.stringify({param: 'value'})
       });
       const result = await response.json();
       console.log(result);
   }
   ```

### 测试流程

#### 单元测试

**测试文件命名**: `test_<模块名>.py`

**示例测试**:
```python
import unittest
from main import RealTimeASR_SV

class TestASR(unittest.TestCase):
    def setUp(self):
        """测试前准备"""
        self.asr = RealTimeASR_SV()
    
    def test_cosine_similarity(self):
        """测试余弦相似度计算"""
        import numpy as np
        a = np.array([1, 2, 3])
        b = np.array([1, 2, 3])
        result = self.asr.cosine_similarity(a, b)
        self.assertAlmostEqual(result, 1.0, places=5)
    
    def tearDown(self):
        """测试后清理"""
        self.asr = None

if __name__ == '__main__':
    unittest.main()
```

**运行测试**:
```bash
python -m unittest test_main.py
python -m unittest discover  # 运行所有测试
```

#### 集成测试

**API测试**:
```bash
# 测试聊天接口
curl http://localhost:8000/api/chats

# 测试配置接口
curl -X POST http://localhost:8000/api/config \
  -H "Content-Type: application/json" \
  -d '{"configs":[], "current_config":""}'

# 测试LLM连接
curl -X POST http://localhost:8000/api/test_connection \
  -H "Content-Type: application/json" \
  -d '{"api_key":"test","base_url":"test","model":"test"}'
```

#### 手动测试

**ASR功能测试**:
1. 启动服务器: `python server.py`
2. 打开浏览器: http://localhost:8000
3. 允许麦克风权限
4. 说话测试转录
5. 检查声纹识别

**智能分析测试**:
1. 配置Agent: 在前端设置中启用
2. 设置主人公姓名
3. 连续说话累积10字
4. 等待2秒静音
5. 观察是否触发分析

### 调试流程

#### 1. 使用日志

**查看实时日志**:
```bash
# 启动时显示所有日志
python server.py 2>&1 | tee debug.log

# 或启动后查看
python server.py
```

**关键日志位置**:
- `[智能分析]` - 智能分析相关信息
- `[调试]` - 详细调试信息
- `[错误]` - 错误和异常
- `[触发机制]` - 触发器状态

#### 2. 使用Python调试器

**pdb调试**:
```python
# 在代码中添加断点
import pdb; pdb.set_trace()

# 或者使用更强大的ipdb
import ipdb; ipdb.set_trace()
```

**IDE调试**:
- VS Code: 设置断点 → F5启动调试
- PyCharm: 点击行号设置断点 → Debug运行

#### 3. 使用Serena分析

**查找问题**:
```bash
# 查找错误处理
search_for_pattern("except.*Exception")

# 查找日志记录
search_for_pattern("logger\.(error|warning|info)")

# 查找TODO项目
search_for_pattern("TODO|FIXME")
```

#### 4. 前端调试

**浏览器开发者工具**:
- F12打开开发者工具
- Console选项卡：查看JavaScript错误
- Network选项卡：查看API请求
- WebSocket选项卡：查看实时消息

### 优化流程

#### 性能分析

**Python性能分析**:
```python
# 使用cProfile
import cProfile
cProfile.run('your_function()')

# 使用line_profiler
@profile
def your_function():
    pass

# 安装: pip install line_profiler
# 运行: kernprof -l -v your_script.py
```

**内存分析**:
```python
# 使用tracemalloc
import tracemalloc
tracemalloc.start()

# 你的代码

snapshot = tracemalloc.take_snapshot()
top_stats = snapshot.statistics('lineno')
for stat in top_stats[:10]:
    print(stat)
```

#### 优化步骤

1. **识别瓶颈**
   - CPU使用率：模型推理
   - 内存使用：音频缓冲
   - 网络延迟：API调用
   - 磁盘I/O：文件读写

2. **优化策略**
   - ASR: GPU加速，批量处理
   - VAD: 参数调优
   - LLM: 连接池，并发控制
   - 智能分析: 增量分析，模型缓存

3. **验证优化**
   ```bash
   # 基准测试
   time python server.py
   
   # 内存监控
   # Windows任务管理器
   ```

### 部署流程

#### 本地部署

1. **生产配置**
   ```bash
   # 使用nginx反向代理（可选）
   # 或直接运行
   nohup python server.py > app.log 2>&1 &
   ```

2. **系统服务（Linux）**
   ```ini
   # /etc/systemd/system/ast.service
   [Unit]
   Description=AST Real-time ASR System
   After=network.target
   
   [Service]
   Type=simple
   User=ast
   WorkingDirectory=/path/to/ast
   ExecStart=/path/to/venv/bin/python server.py
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   ```

3. **启动服务**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable ast
   sudo systemctl start ast
   sudo systemctl status ast
   ```

#### Docker部署

**Dockerfile**:
```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "server.py"]
```

**构建和运行**:
```bash
# 构建镜像
docker build -t ast-asr .

# 运行容器
docker run -d -p 8000:8000 \
  -v $(pwd)/voiceprints:/app/voiceprints \
  -v $(pwd)/data:/app/data \
  ast-asr
```

### 代码质量检查

#### 代码格式化

**使用Black**:
```bash
# 安装
pip install black

# 格式化所有文件
black *.py

# 检查格式（不修改）
black --check *.py
```

**使用isort**:
```bash
# 安装
pip install isort

# 排序导入
isort *.py
```

#### 代码检查

**使用flake8**:
```bash
# 安装
pip install flake8

# 检查代码
flake8 *.py --max-line-length=120 --ignore=E501,W503

# 排除某些目录
flake8 *.py --exclude=venv,.git,__pycache__
```

#### 预提交钩子

**安装pre-commit**:
```bash
pip install pre-commit

# 创建 .pre-commit-config.yaml
cat > .pre-commit-config.yaml << EOF
repos:
  - repo: https://github.com/psf/black
    rev: 23.3.0
    hooks:
      - id: black
  - repo: https://github.com/pycqa/isort
    rev: 5.12.0
    hooks:
      - id: isort
  - repo: https://github.com/pycqa/flake8
    rev: 6.0.0
    hooks:
      - id: flake8
EOF

# 安装钩子
pre-commit install
```

### 版本控制

#### Git工作流

**初始化仓库**:
```bash
git init
git add .
git commit -m "初始提交"
```

**提交规范**:
```bash
# feat: 新功能
git commit -m "feat: 添加智囊团多模型支持"

# fix: 修复bug
git commit -m "fix: 修复声纹识别阈值问题"

# docs: 文档更新
git commit -m "docs: 更新API文档"

# refactor: 重构
git commit -m "refactor: 重构触发管理器代码"

# test: 测试
git commit -m "test: 添加智能分析单元测试"
```

**分支策略**:
- `main`: 主分支，稳定版本
- `dev`: 开发分支，功能集成
- `feature/*`: 功能分支
- `hotfix/*`: 紧急修复

**工作流**:
```bash
# 创建功能分支
git checkout -b feature/new-feature

# 开发
git add .
git commit -m "feat: 新功能描述"

# 合并到开发分支
git checkout dev
git merge feature/new-feature

# 删除分支
git branch -d feature/new-feature
```

### 故障排除

#### 常见问题

**1. 音频设备问题**
```
错误: OSError: No Default Input Device Available
解决:
  - 检查麦克风是否连接
  - 安装/更新音频驱动
  - Windows: 检查隐私设置中的麦克风权限
```

**2. 模型下载失败**
```
错误: ConnectionError: Failed to download model
解决:
  - 检查网络连接
  - 使用镜像源: export HF_ENDPOINT=https://hf-mirror.com
  - 手动下载模型到本地
```

**3. GPU内存不足**
```
错误: CUDA out of memory
解决:
  - 减少批处理大小
  - 使用CPU模式: device="cpu"
  - 关闭其他GPU进程
```

**4. LLM API连接失败**
```
错误: 401 Unauthorized
解决:
  - 检查API密钥是否正确
  - 验证Base URL格式（应以/v1结尾）
  - 检查API额度是否充足
```

**5. 端口占用**
```
错误: OSError: [WinError 10048] 通常每个套接字地址(协议/网络地址/端口)只允许使用一次
解决:
  # 查找占用进程
  netstat -ano | findstr :8000
  # 杀死进程
  taskkill /PID <PID> /F
```

#### 调试命令

**检查系统资源**:
```bash
# Windows
# 查看CPU和内存
tasklist | findstr python

# 查看GPU状态
nvidia-smi

# 查看磁盘空间
dir
```

**检查依赖**:
```bash
# 检查Python包
pip list

# 检查特定包版本
pip show funasr
pip show modelscope
```

**网络测试**:
```bash
# 测试API连接
curl -v https://api.deepseek.com/v1/models

# 测试本地服务
curl http://localhost:8000/api/config
```

### 维护流程

#### 定期任务

**每日**:
- 检查错误日志
- 监控API使用量
- 清理临时文件

**每周**:
- 更新依赖包
- 备份聊天历史和声纹
- 性能分析

**每月**:
- 代码重构和优化
- 文档更新
- 安全审计

#### 备份策略

**重要文件备份**:
```bash
# 备份声纹库
cp -r voiceprints/ voiceprints_$(date +%Y%m%d)/

# 备份聊天历史
cp data/chat_history.json data/chat_history_$(date +%Y%m%d).json

# 备份配置
cp api_config.json api_config_$(date +%Y%m%d).json
```

**自动化备份脚本**:
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p backups/$DATE

cp -r voiceprints backups/$DATE/
cp data/chat_history.json backups/$DATE/
cp api_config.json backups/$DATE/

echo "备份完成: backups/$DATE"
```

### 团队协作

#### 代码评审

**提交前检查清单**:
- [ ] 代码格式化（black, isort）
- [ ] 代码检查通过（flake8）
- [ ] 单元测试通过
- [ ] 文档更新
- [ ] 日志级别合适
- [ ] 异常处理完整

**评审要点**:
- 代码风格一致性
- 逻辑正确性
- 性能影响
- 安全考虑
- 兼容性

#### 文档更新

**需要更新的文档**:
- API文档（新增/修改接口）
- 代码注释（复杂逻辑）
- README（功能变更）
- 配置说明（新参数）
- 流程图（架构变化）

#### 知识分享

**团队分享**:
- 新技术引入
- 最佳实践
- 问题解决方案
- 性能优化经验
- 架构演进思路