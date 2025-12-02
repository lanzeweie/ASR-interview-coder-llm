# 编码规范和约定

## Python代码风格

### 基本规范

#### 命名约定

1. **类名**: 使用PascalCase（首字母大写）
   ```python
   class RealTimeASR_SV:  # ✅ 正确
   class chatManager:      # ❌ 错误
   ```

2. **函数名和方法名**: 使用snake_case（全部小写，下划线分隔）
   ```python
   def load_voiceprints(self):  # ✅ 正确
   def LoadVoiceprints(self):   # ❌ 错误
   ```

3. **变量名**: 使用snake_case
   ```python
   speaker_name = "张三"  # ✅ 正确
   speakerName = "张三"    # ❌ 错误（驼峰命名）
   ```

4. **常量**: 使用UPPER_SNAKE_CASE
   ```python
   MAX_HISTORY = 50  # ✅ 正确
   max_history = 50  # ❌ 错误
   ```

5. **私有属性**: 使用单下划线前缀
   ```python
   def __init__(self):
       self._private_var = 1  # 私有属性
   ```

#### 文件结构

1. **导入顺序**:
   ```python
   # 标准库
   import os
   import time
   
   # 第三方库
   import numpy as np
   from fastapi import FastAPI
   
   # 本地模块
   from llm_client import LLMClient
   from chat_manager import ChatManager
   ```

2. **模块级文档字符串**:
   ```python
   """
   智能分析 Agent 模块
   
   基于底层小模型判定是否需要让AI帮助分析
   支持本地模型和云端API两种方式
   """
   ```

#### 代码格式

1. **行长度**: 建议不超过120字符
2. **缩进**: 使用4个空格（不使用Tab）
3. **空行**: 类和方法之间用两个空行分隔
4. **引号**: 优先使用双引号

### 注释规范

#### 函数/方法注释

```python
def load_voiceprints(self):
    """加载 voiceprints 文件夹下的所有声纹嵌入数据
    
    该方法会扫描voiceprints目录下的所有.wav文件，
    尝试加载预计算的.npy嵌入文件，如果不存在则计算并保存。
    
    Returns:
        None
    """
    # 实现代码
```

#### 行内注释

```python
# 好的注释
self.sv_pipeline = pipeline(  # 加载CAM++声纹模型
    task='speaker-verification',
    model='speech_campplus_sv_zh-cn_16k-common',
)

# 避免的注释（冗余）
self.sv_pipeline = pipeline()  # 创建pipeline对象
```

#### TODO和FIXME标记

```python
# TODO: 实现更好的错误处理
# FIXME: 修复声纹识别准确率问题
```

### 类型注解

#### 推荐使用类型注解

```python
from typing import List, Dict, Optional, Tuple, Callable

def load_voiceprints(self) -> None:
    """加载声纹"""
    ...

def analyze(
    self, 
    messages: List[Dict], 
    speaker_name: str
) -> Dict:
    """分析对话并返回结果"""
    ...

def cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
    """计算余弦相似度"""
    ...
```

### 异常处理

#### 推荐模式

```python
# ✅ 良好的异常处理
try:
    result = self.sv_pipeline([enroll_path, audio_path])
    score = result.get('score', 0)
except Exception as e:
    print(f"声纹比对出错 ({name}): {e}")
    return "未知用户"

# ❌ 过于宽泛的异常处理
try:
    # 大量代码
except:
    pass
```

#### 自定义异常

```python
class ASRException(Exception):
    """ASR相关异常"""
    pass

class AgentException(Exception):
    """智能分析相关异常"""
    pass
```

### 异步编程规范

#### 异步函数命名和注释

```python
async def analyze_conversation(
    self, 
    messages: List[Dict], 
    speaker_name: str, 
    agent_name: str = None
) -> Dict:
    """异步分析对话
    
    Args:
        messages: 对话消息列表
        speaker_name: 主人公姓名
        agent_name: Agent名称（可选）
    
    Returns:
        分析结果字典
    """
    # 实现
```

#### async/await使用

```python
# ✅ 正确使用
async def process_message(self, message: Dict):
    result = await self.analyze_conversation(messages, speaker_name)
    return result

# ❌ 避免忘记await
result = self.analyze_conversation(messages, speaker_name)  # 缺少await
```

### 日志记录

#### 使用Python logging模块

```python
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# 在代码中使用
logger.info(f"正在加载模型: {model_name}")
logger.error(f"加载失败: {e}")
```

#### 调试信息

```python
# ✅ 有用的调试信息
print(f"[智能分析] 处理消息: {speaker_name} - {text[:20]}...")
print(f"[调试] API响应: {response.status}")

# ❌ 无用的调试信息
print("开始处理")
print("处理中")
print("处理完成")
```

### 配置管理

#### 配置文件格式

```python
# config.py - 配置常量
AUDIO_RATE = 16000
AUDIO_CHANNELS = 1
CHUNK = 1024
VAD_MODE = 3
SV_THRESHOLD = 0.35
OUTPUT_DIR = "./output"
VOICEPRINT_DIR = "./voiceprints"
```

#### 环境变量使用

```python
import os

# ✅ 好的做法
API_KEY = os.getenv("LLM_API_KEY", "")
BASE_URL = os.getenv("LLM_BASE_URL", "")

# ❌ 避免硬编码
API_KEY = "sk-1234567890abcdef"  # 不要在代码中硬编码
```

### 性能优化

#### 循环优化

```python
# ✅ 使用列表推导式
active_configs = [c for c in configs if c["name"] in active_names]

# ✅ 使用生成器表达式
for item in (x for x in items if condition()):
    # 处理
```

#### 缓存使用

```python
from functools import lru_cache

@lru_cache(maxsize=128)
def expensive_function(arg1, arg2):
    # 昂贵的计算
    return result
```

### 代码组织

#### 模块职责划分

```
main.py          - ASR核心处理逻辑
server.py        - Web服务器和API
llm_client.py    - LLM API客户端
chat_manager.py  - 聊天会话管理
intelligent_agent.py - 智能分析Agent
trigger_manager.py - 触发机制管理
```

#### 类设计原则

1. **单一职责原则**: 每个类只负责一个功能
2. **开闭原则**: 对扩展开放，对修改关闭
3. **依赖注入**: 避免硬编码依赖

```python
# ✅ 好的设计
class ChatManager:
    def __init__(self, storage_path: str):
        self.storage_path = storage_path

# ❌ 避免硬编码
class ChatManager:
    def __init__(self):
        self.storage_path = "data/chat_history.json"  # 硬编码
```

### 测试规范

#### 测试文件命名

```
test_chat_manager.py
test_llm_client.py
test_asr_integration.py
```

#### 测试函数命名

```python
def test_load_voiceprints():
    """测试声纹加载功能"""
    ...

def test_cosine_similarity():
    """测试余弦相似度计算"""
    ...
```

### 文档字符串格式

使用Google风格docstring：

```python
def load_voiceprints(self, directory: str) -> Dict[str, Dict]:
    """加载指定目录下的声纹文件
    
    Args:
        directory: 声纹文件目录路径
        
    Returns:
        包含所有声纹信息的字典，格式为 {
            speaker_name: {
                'embedding': np.ndarray,
                'path': str
            }
        }
        
    Raises:
        FileNotFoundError: 当目录不存在时抛出
        
    Example:
        >>> manager = RealTimeASR_SV()
        >>> voiceprints = manager.load_voiceprints("./voiceprints")
        >>> print(len(voiceprints))
        3
    """
```

### Git提交信息格式

使用conventional commits格式：

```
feat: 添加智能分析触发机制
fix: 修复声纹识别阈值问题
docs: 更新API文档
refactor: 重构触发管理器代码
test: 添加Agent测试用例
```

### 导入优化

#### 使用相对导入

```python
# ✅ 在同一包内
from .llm_client import LLMClient
from ..utils import helper_function

# ✅ 在不同包内
from llm_client import LLMClient
from modelscope.pipelines import pipeline
```

### 工具使用

#### Black代码格式化

```bash
# 格式化所有Python文件
black *.py

# 检查格式但不修改
black --check *.py
```

#### isort导入排序

```bash
# 自动排序导入
isort *.py
```

#### flake8代码检查

```bash
# 检查代码质量
flake8 *.py --max-line-length=120 --ignore=E501,W503
```