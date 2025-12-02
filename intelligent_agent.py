"""
智能分析 Agent 模块

基于底层小模型判定是否需要让AI帮助分析
支持本地模型和云端 API 两种方式
"""

import json
import asyncio
import re
import time
from typing import List, Dict, Optional, Tuple
from llm_client import LLMClient

# 尝试导入 transformers 和 torch
try:
    from transformers import AutoModelForCausalLM, AutoTokenizer
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    print("[智能分析] 未安装 transformers/torch，本地模型功能不可用")


class IntelligentAgent:
    """智能分析 Agent"""

    def __init__(self, config: dict):
        """
        初始化智能 Agent

        Args:
            config: Agent 配置
                - model_name: 小模型名称
                - model_type: 'local' | 'api'
                - api_key: API 密钥（云端模式）
                - base_url: API 地址（云端模式）
                - model: 模型标识（云端模式）
                - threshold: 字数阈值，默认 10
                - silence_seconds: 静音秒数，默认 2
        """
        self.config = config
        self.threshold = config.get('threshold', 10)
        self.silence_seconds = config.get('silence_seconds', 2)
        self.client = None
        self.local_model = None
        self.local_tokenizer = None
        self.last_message_time = 0  # 最后消息时间
        self.current_speaker = None  # 当前说话人
        self.accumulated_text = ""  # 累积文本
        self.silence_timer = None  # 静音计时器
        self.silence_detection_started = False  # 是否已启动静音检测
        self.last_analysis_time = 0  # 上次分析时间
        self.force_trigger_threshold = self.threshold * 3  # 强制触发阈值（3倍）
        self.generation_params = config.get('generation_params', {})

        model_type = config.get('model_type', 'api')

        # 初始化客户端或本地模型
        if model_type == 'api':
            self.client = LLMClient(
                api_key=config.get('api_key', ''),
                base_url=config.get('base_url', ''),
                model=config.get('model', '')
            )
        elif model_type == 'local':
            if TRANSFORMERS_AVAILABLE:
                model_name = config.get('model_name', 'Qwen/Qwen2-0.5B-Instruct')
                success = self._load_local_model(model_name)
                if not success:
                    print(f"[智能分析] 模型 {model_name} 加载失败，请检查:")
                    print(f"  1. 模型名称是否正确")
                    print(f"  2. 网络连接是否正常（需要下载模型）")
                    print(f"  3. 磁盘空间是否充足")
            else:
                print("[智能分析] 缺少依赖，无法加载本地模型")

        print(f"[智能分析] Agent 已初始化，阈值: {self.threshold} 字，静音: {self.silence_seconds}秒")

    def _load_local_model(self, model_name: str):
        """加载本地模型"""
        print(f"[智能分析] 正在加载本地模型: {model_name}")
        print(f"[智能分析] 检查依赖: TRANSFORMERS_AVAILABLE={TRANSFORMERS_AVAILABLE}")
        try:
            print(f"[智能分析] 步骤1: 加载tokenizer...")
            self.local_tokenizer = AutoTokenizer.from_pretrained(model_name)
            print(f"[智能分析] ✅ Tokenizer加载成功")

            print(f"[智能分析] 步骤2: 加载模型...")
            self.local_model = AutoModelForCausalLM.from_pretrained(
                model_name,
                dtype=torch.float16,
                device_map="auto"
            )
            print(f"[智能分析] ✅ 模型加载成功")

            self.local_model.eval()
            print(f"[智能分析] ✅ 本地模型完全加载成功: {model_name}")
            print(f"[智能分析] 模型设备: {self.local_model.device}")
            return True
        except Exception as e:
            print(f"[智能分析] ⚠️❌ 本地模型加载失败")
            print(f"[智能分析] 错误类型: {type(e).__name__}")
            print(f"[智能分析] 错误信息: {e}")
            self.local_model = None
            self.local_tokenizer = None
            return False

    def build_analysis_prompt(self, messages: List[Dict], speaker_name: str) -> str:
        """
        构建分析 Prompt
        """
        # 使用紧凑格式化的对话内容
        dialogue = self.format_messages_compact(messages)

        print(f"[智能分析] 构建Prompt，消息数: {len(messages)}")
        print(f"[智能分析] 格式化对话长度: {len(dialogue)} 字符")
        print(f"[智能分析] 对话内容预览: {dialogue[:2000]}...")

        prompt = """
        你是一个软件工程对话分析器。请严格根据以下规则分析提供的对话内容，并仅输出一个标准 JSON 对象，不得包含任何额外文本、解释、格式符号或换行。
        **输入：**
        {dialogue}
        **判断规则：**
        1. {speaker_name} 是对话中的主人公。
        2. 仅当对话中明确涉及 **软件开发相关** 的以下任一内容时，返回 {{"is": true}}：
        - 编程语言、框架、库的使用问题（如 Python、React、TensorFlow）
        - 调试、报错排查、性能优化
        - 系统架构、API 设计、数据库设计
        - 开发工具链（如 Git、Docker、CI/CD）
        - 算法、数据结构、代码审查
        - 软件工程实践（如测试、部署、DevOps）
        3. 以下情况**一律返回 {{"is": false}}**：
        - 非软件类技术话题（如电路设计、生物信息学、量化金融——即使有代码也不算）
        - 日常聊天、问候、情感表达
        - 泛泛而谈的科技观点（如"AI 会取代程序员吗？"无具体技术细节）
        - 仅提及"写代码"但无实质技术内容
        - 使用自然语言描述非编程任务（如"帮我写个 Excel 公式"不属于软件开发）

        **输出要求：**
        - 严格输出：{{"is": true}} 或 {{"is": false}}
        - 必须是合法 JSON，不包裹在 Markdown、反引号或代码块中

        **示例：**
        {{"is": true}}
        {{"is": false}}
        """.format(dialogue=dialogue, speaker_name=speaker_name)
        return prompt

    def format_messages_compact(self, messages: List[Dict]) -> str:
        """
        将消息格式化为紧凑的XML格式，大幅减少token消耗

        Args:
            messages: 消息列表，每个消息包含 role、content、speaker、timestamp

        Returns:
            格式化的XML字符串
        """
        xml_lines = ['<conversation>']

        for msg in messages:
            role = msg.get('role', 'u')  # 默认为user
            content = msg.get('content', '').strip()
            speaker = msg.get('speaker', '')

            # 提取说话人姓名（去掉置信度）
            if ' (' in speaker:
                speaker = speaker.split(' (')[0]
            elif '(' in speaker:
                speaker = speaker.split('(')[0]

            # 获取时间戳（如果存在）
            timestamp = msg.get('timestamp', 0)
            if isinstance(timestamp, (int, float)) and timestamp > 0:
                # 转换为相对时间（秒），节省字符
                relative_time = int(timestamp % 3600)  # 只保留小时内的秒数
                timestamp_str = f' t="{relative_time}"'
            else:
                timestamp_str = ''

            # 生成紧凑的XML标签
            # r=role, sp=speaker, t=timestamp（可选）
            xml_lines.append(
                f'  <msg r="{role[0]}" sp="{speaker}"{timestamp_str}>{content}</msg>'
            )

        xml_lines.append('</conversation>')

        result = '\n'.join(xml_lines)
        print(f"[格式化] 原始消息数: {len(messages)}, 格式化后长度: {len(result)} 字符")

        return result

    def validate_response(self, response: str) -> Tuple[bool, Optional[dict]]:
        """简单验证响应格式（模型返回稳定）"""
        try:
            # 使用正则匹配 {"is": true} 格式
            match = re.search(r'\{\s*"is"\s*:\s*(true|false)\s*\}', response, re.IGNORECASE)
            if match:
                is_true = match.group(1).lower() == 'true'
                print(f"[智能分析] 简单判定结果: {is_true}")
                return True, {'is': is_true}
        except Exception as e:
            print(f"[智能分析] 响应解析出错: {e}")
        return False, None

    def _get_local_generation_kwargs(self) -> Dict:
        defaults = {
            "max_new_tokens": 512,
            "do_sample": False,
        }
        params = {**defaults, **self.generation_params}
        if self.local_tokenizer:
            params.setdefault("pad_token_id", self.local_tokenizer.eos_token_id)
            params.setdefault("eos_token_id", self.local_tokenizer.eos_token_id)
        return params

    async def analyze(self, messages: List[Dict], speaker_name: str) -> Dict:
        """
        分析对话并判定是否需要Ai辅助
        """
        try:
            # 构建 Prompt
            prompt = self.build_analysis_prompt(messages, speaker_name)

            print(f"[智能分析] 开始分析，主人公: {speaker_name}，消息数: {len(messages)}")

            # 调用小模型
            model_type = self.config.get('model_type', 'api')
            if model_type == 'api':
                if not self.client:
                    print("[智能分析] ❌ API模式，但客户端未初始化")
                    return {
                        'is': False,
                        'confidence': 0.0,
                        'reason': f'API客户端未初始化 (model_type={model_type})',
                        'raw_response': ''
                    }
                # API 模式
                print(f"[智能分析] 📡 使用API模式调用，模型: {self.config.get('model', 'unknown')}")
                response_text = ""
                async for chunk in self.client.chat_stream([
                    {"role": "user", "content": prompt}
                ]):
                    response_text += chunk

                print(f"[智能分析] API模型完整响应内容:")
                print("=" * 80)
                print(response_text)
                print("=" * 80)
                print(f"[智能分析] 响应长度: {len(response_text)} 字符")
                is_valid, result = self.validate_response(response_text)

                if is_valid and result:
                    is_needed = result['is']
                    reason = "检测到需要AI帮助分析" if is_needed else "普通对话，无需 AI 介入"
                    print(f"[智能分析] 判定结果: {is_needed}")
                    return {
                        'is': is_needed,
                        'confidence': 0.95,
                        'reason': reason,
                        'raw_response': response_text
                    }
                else:
                    print(f"[智能分析] ❌ API响应无效")
                    return {
                        'is': False,
                        'confidence': 0.0,
                        'reason': 'API响应无效',
                        'raw_response': response_text
                    }

            elif model_type == 'local':
                if not self.local_model:
                    print("[智能分析] ❌ 本地模式，但模型未加载")
                    return {
                        'is': False,
                        'confidence': 0.0,
                        'reason': f'本地模型未加载 (model_type={model_type})',
                        'raw_response': ''
                    }
                # 本地模式
                try:
                    messages = [
                        {
                            "role": "system", 
                            "content": "你是一个严谨的格式化输出工具。你的唯一任务是接收对话分析指令并输出JSON。严禁输出任何其他解释性文字。"
                        },
                        {
                            "role": "user", 
                            "content": prompt 
                        }
                    ]
                    text = self.local_tokenizer.apply_chat_template(
                        messages,
                        tokenize=False,
                        add_generation_prompt=True
                    )
                    inputs = self.local_tokenizer([text], return_tensors="pt").to(self.local_model.device)
                    # 4. 生成响应
                    with torch.no_grad():
                        outputs = self.local_model.generate(
                            inputs.input_ids,
                            attention_mask=inputs.attention_mask, # 显式传入 mask，消除警告
                            **self._get_local_generation_kwargs()
                        )
                    response_text = self.local_tokenizer.decode(
                        outputs[0][inputs.input_ids.shape[1]:],
                        skip_special_tokens=True
                    ).strip()


                    print(f"[智能分析] 本地模型完整响应内容:")
                    print("=" * 80)
                    print(response_text)
                    print("=" * 80)
                    print(f"[智能分析] 响应长度: {len(response_text)} 字符")
                    
                    # 尝试清理可能残留的 Markdown 标记 (0.5B 有时会顽固地输出 ```json)
                    clean_text = response_text.replace("```json", "").replace("```", "").strip()
                    
                    is_valid, result = self.validate_response(clean_text)

                    if is_valid and result:
                        is_needed = result['is']
                        reason = "检测到需要AI帮助分析" if is_needed else "普通对话，无需 AI 介入"
                        print(f"[智能分析] 本地模型判定结果: {is_needed}")
                        return {
                            'is': is_needed,
                            'confidence': 0.95,
                            'reason': reason,
                            'raw_response': response_text
                        }
                except Exception as e:
                    print(f"[智能分析] 本地模型推理失败: {e}")
                    import traceback
                    traceback.print_exc()
                    return {
                        'is': False,
                        'confidence': 0.0,
                        'reason': f'本地模型推理失败: {str(e)}',
                        'raw_response': ''
                    }

            # 如果没有客户端或验证失败，返回默认结果
            print(f"[智能分析] ❌ 未满足任何条件:")
            print(f"  - model_type: {model_type}")
            print(f"  - API条件: model_type=='api' and self.client: {model_type == 'api' and self.client is not None}")
            print(f"  - 本地条件: model_type=='local' and self.local_model: {model_type == 'local' and self.local_model is not None}")
            print(f"[智能分析] 返回默认结果")
            return {
                'is': False,
                'confidence': 0.0,
                'reason': f'模型未正确配置 (model_type={model_type}, client={self.client}, local_model={self.local_model})',
                'raw_response': ''
            }

        except Exception as e:
            print(f"[智能分析] 分析过程出错: {e}")
            return {
                'is': False,
                'confidence': 0.0,
                'reason': f'分析失败: {str(e)}',
                'raw_response': ''
            }

    def process_message(self, message: Dict, conversation_history: List[Dict]) -> Tuple[bool, Optional[str]]:
        """
        按照流程图处理ASR消息，检查是否应该触发智能分析

        Args:
            message: 当前消息，包含text和speaker信息
            conversation_history: 对话历史

        Returns:
            (是否应该触发, 触发原因)
        """
        # Step 1: 检查长度是否≥3字符
        text = message.get('text', '').strip()
        if len(text) < 3:
            print(f"[智能分析] 消息长度不足3字符，忽略: {len(text)}字符")
            return False, None

        # Step 2: 更新最后消息时间
        current_time = time.time()
        self.last_message_time = current_time

        # Step 3: 提取说话人信息
        speaker_info = message.get('speaker', '')
        # 从speaker中提取姓名（格式如"张三 (置信度:0.85)"）
        speaker_name = speaker_info.split(' (')[0] if '(' in speaker_info else speaker_info

        print(f"[智能分析] 处理消息: {speaker_name} - {text[:20]}... (长度: {len(text)})")

        # Step 4 & 5: 检查是否为同一说话人并处理累积
        if self.current_speaker is None:
            # 首次接收消息
            self.current_speaker = speaker_name
            self.accumulated_text = text
            print(f"[智能分析] 首次接收消息，说话人: {speaker_name}")
        elif self.current_speaker == speaker_name:
            # 同一说话人，累积文本
            self.accumulated_text += text
            print(f"[智能分析] 同一说话人累积，累积长度: {len(self.accumulated_text)}")
        else:
            # 不同说话人，重置累积并更新说话人
            print(f"[智能分析] 说话人变更: {self.current_speaker} -> {speaker_name}")
            print(f"[智能分析] 重置累积 (原长度: {len(self.accumulated_text)})")
            self.current_speaker = speaker_name
            self.accumulated_text = text

        # Step 6: 检查累积字符是否≥最小值（默认10）
        if len(self.accumulated_text) < self.threshold:
            print(f"[智能分析] 累积字符不足: {len(self.accumulated_text)}/{self.threshold}，等待更多音频")
            return False, None

        # Step 7: 达到阈值，启动或检查静音检测
        if not self.silence_detection_started:
            # 首次达到阈值，启动静音检测
            self.silence_detection_started = True
            # 重置静音计时器
            if self.silence_timer:
                self.silence_timer.cancel()
            self.silence_timer = asyncio.create_task(self._monitor_silence())
            print(f"[智能分析] 已启动静音检测，静音阈值: {self.silence_seconds}秒")
            return False, None
        else:
            # 已在静音检测中，检查条件
            print(f"[智能分析] 静音检测中...")
            return self._check_trigger_conditions(text), "满足触发条件"

    async def _monitor_silence(self):
        """监听静音状态，超时后自动触发分析"""
        try:
            await asyncio.sleep(self.silence_seconds)
            print(f"[智能分析] 静音超时，触发分析")
            # 重置静音检测状态
            self.silence_detection_started = False
            self.silence_timer = None
        except asyncio.CancelledError:
            # 静音检测被取消（收到新消息）
            print(f"[智能分析] 静音检测被取消")
            pass

    def _check_trigger_conditions(self, current_text: str) -> bool:
        """
        检查是否满足触发条件（按照流程图的逻辑）

        Args:
            current_text: 当前文本

        Returns:
            是否应该触发
        """
        current_time = time.time()
        silence_duration = current_time - self.last_message_time

        print(f"[智能分析] 静音时长: {silence_duration:.2f}秒")

        # Step 8: 检查静音是否≥阈值（2秒）
        if silence_duration >= self.silence_seconds:
            print(f"[智能分析] 条件1: 静音 ≥ 阈值 ({silence_duration:.2f}s ≥ {self.silence_seconds}s)")
            return True

        # Step 9: 检查文本是否≥3倍阈值（强制触发）
        current_length = len(self.accumulated_text)
        if current_length >= self.force_trigger_threshold:
            print(f"[智能分析] 条件2: 累积文本 ≥ 3倍阈值 ({current_length} ≥ {self.force_trigger_threshold})")
            return True

        # Step 10: 检查静音是否≥2倍阈值
        double_threshold = self.silence_seconds * 2
        if silence_duration >= double_threshold:
            print(f"[智能分析] 条件3: 静音 ≥ 2倍阈值 ({silence_duration:.2f}s ≥ {double_threshold}s)")
            return True

        print(f"[智能分析] 条件不满足，继续等待")
        return False

    def reset_state(self):
        """重置Agent状态"""
        self.last_message_time = 0
        self.current_speaker = None
        self.accumulated_text = ""
        self.silence_detection_started = False
        if self.silence_timer:
            self.silence_timer.cancel()
            self.silence_timer = None
        self.last_analysis_time = 0
        print(f"[智能分析] 状态已重置")


class AgentManager:
    """智能 Agent 管理器"""

    def __init__(self):
        self.agents: Dict[str, IntelligentAgent] = {}
        self.enabled = False
        self.auto_trigger = True
        print("[智能分析] Agent 管理器已初始化")

    def load_agent(self, config: dict, model_config: dict) -> bool:
        """
        加载智能 Agent

        Args:
            config: Agent 配置
            model_config: 模型配置（API 配置）

        Returns:
            是否加载成功
        """
        try:
            # 对于本地模式，model_name 应该从 model_config 获取（或者使用默认值）
            # 优先级：model_config.model_name > config.model_name > 默认值
            model_name = model_config.get('model_name', config.get('model_name', 'Qwen/Qwen2-0.5B-Instruct'))

            # 合并配置
            agent_config = {
                'model_type': model_config.get('model_type', 'api'),
                'api_key': model_config.get('api_key', ''),
                'base_url': model_config.get('base_url', ''),
                'model': model_config.get('model', ''),
                'model_name': model_name,  # 添加 model_name 到 agent_config
                'threshold': config.get('min_characters', 10),
                'silence_seconds': config.get('silence_threshold', 2),
                'generation_params': model_config.get('generation_params', {})
            }

            # 创建 Agent
            self.agents[model_name] = IntelligentAgent(agent_config)
            self.enabled = config.get('enabled', False)
            self.auto_trigger = config.get('auto_trigger', True)

            print(f"[智能分析] 已加载 Agent: {model_name}, 启用状态: {self.enabled}")
            return True

        except Exception as e:
            print(f"[智能分析] 加载 Agent 失败: {e}")
            return False

    async def analyze_conversation(self, messages: List[Dict], speaker_name: str, agent_name: str = None) -> Dict:
        """
        分析对话

        Args:
            messages: 对话消息列表
            speaker_name: 主人公姓名
            agent_name: Agent 名称（可选）

        Returns:
            分析结果
        """
        if not self.enabled:
            return {'is': False, 'reason': '智能分析已关闭'}

        # 选择 Agent
        agent = None
        if agent_name and agent_name in self.agents:
            agent = self.agents[agent_name]
        elif self.agents:
            agent = list(self.agents.values())[0]

        if not agent:
            return {'is': False, 'reason': '未配置智能 Agent'}

        return await agent.analyze(messages, speaker_name)

    async def run_intelligent_analysis(self, messages: List[Dict], speaker_name: str, intent_recognition: bool = False) -> Dict:
        """
        运行三阶段智能分析流程

        Args:
            messages: 对话消息列表
            speaker_name: 主人公姓名
            intent_recognition: 是否启用意图识别

        Returns:
            包含分析结果和分发信息的字典
        """
        print(f"[智能分析] 开始三阶段分析，启用意图识别: {intent_recognition}")

        # 阶段1：现有分析（保持不变）
        phase1_result = await self.analyze_conversation(messages, speaker_name)
        print(f"[智能分析] 阶段1完成: {phase1_result}")

        # 检查阶段1是否成功（分析失败或模型未配置）
        reason = phase1_result.get('reason', '')
        confidence = phase1_result.get('confidence', 0.0)
        if confidence == 0.0 and ('分析失败' in reason or '未配置' in reason or '无效' in reason):
            print(f"[智能分析] ⚠️ 阶段1失败，跳过后续阶段，原因: {reason}")
            return {
                'phase1': phase1_result,
                'phase2': None,
                'distribution': {'mode': 'default', 'targets': []}
            }

        # 修复：如果阶段1判断不需要AI帮助，直接返回，不执行后续阶段
        if not phase1_result.get('is', False):
            print(f"[智能分析] ⚠️ 阶段1判断无需AI帮助，跳过阶段2和阶段3，原因: {reason}")
            return {
                'phase1': phase1_result,
                'phase2': None,
                'distribution': {'mode': 'default', 'targets': []}
            }

        # 阶段2：意图识别（如果启用）
        intent_result = None
        if intent_recognition:
            print("[智能分析] 进入阶段2：意图识别")
            intent_result = await self._recognize_intent(messages, speaker_name)
            print(f"[智能分析] 阶段2完成: 意图识别结果")

        # 阶段3：最终分发
        distribution_result = self._prepare_distribution(messages, phase1_result, intent_result)
        print(f"[智能分析] 阶段3完成: 准备分发到 {distribution_result.get('targets', [])}")

        return {
            'phase1': phase1_result,
            'phase2': intent_result,
            'distribution': distribution_result
        }

    async def _recognize_intent(self, messages: List[Dict], speaker_name: str) -> Dict:
        """
        阶段2：意图识别和上下文提取

        Args:
            messages: 对话消息列表
            speaker_name: 主人公姓名

        Returns:
            意图识别结果
        """
        # 获取第一个可用的agent进行格式化
        agent = list(self.agents.values())[0]
        dialogue = agent.format_messages_compact(messages)

        intent_prompt = (
            "你是一名专业的意图识别Agent，请阅读下方对话并提炼核心问题与讨论大纲。\n\n"
            f"{speaker_name} 是对话中的主人公。\n\n"
            f"{dialogue}\n\n"
            "请仅输出以下XML结构：\n"
            "<analysis>\n"
            "  <core>核心问题</core>\n"
            "  <outline>\n"
            "    <item>要点1</item>\n"
            "    <item>要点2</item>\n"
            "  </outline>\n"
            "</analysis>\n"
            "要求：\n"
            "1. 核心问题精炼为一句话。\n"
            "2. 大纲列出2-5个要点，按重要性排序。\n"
            "3. 禁止输出XML结构之外的任何文本。"
        )

        def _extract_xml(text: str) -> str:
            match = re.search(r'<analysis[\s\S]*?</analysis>', text, re.IGNORECASE)
            return match.group(0).strip() if match else text.strip()

        agent_type = agent.config.get('model_type', 'api')

        if agent_type == 'api' and agent.client:
            response_text = ""
            async for chunk in agent.client.chat_stream([
                {"role": "user", "content": intent_prompt}
            ]):
                response_text += chunk
            xml_content = _extract_xml(response_text)
            return {
                'success': True,
                'summary_xml': xml_content,
                'raw_response': response_text
            }

        elif agent_type == 'local' and agent.local_model and agent.local_tokenizer:
            try:
                chat_messages = [
                    {
                        "role": "system",
                        "content": "你是意图识别Agent，只能输出严格的XML分析结果。"
                    },
                    {"role": "user", "content": intent_prompt}
                ]
                text = agent.local_tokenizer.apply_chat_template(
                    chat_messages,
                    tokenize=False,
                    add_generation_prompt=True
                )
                inputs = agent.local_tokenizer([text], return_tensors="pt").to(agent.local_model.device)
                with torch.no_grad():
                    outputs = agent.local_model.generate(
                        inputs.input_ids,
                        attention_mask=inputs.attention_mask,
                        **agent._get_local_generation_kwargs()
                    )
                response_text = agent.local_tokenizer.decode(
                    outputs[0][inputs.input_ids.shape[1]:],
                    skip_special_tokens=True
                ).strip()
                xml_content = _extract_xml(response_text)
                return {
                    'success': True,
                    'summary_xml': xml_content,
                    'raw_response': response_text
                }
            except Exception as e:
                print(f"[智能分析] 意图识别失败: {e}")
                return {'success': False, 'error': f'本地意图识别失败: {str(e)}'}

        return {'success': False, 'error': '无可用的Agent进行意图识别'}

    def _prepare_distribution(self, messages: List[Dict], phase1_result: Dict, intent_result: Dict = None) -> Dict:
        """
        阶段3：准备分发到智囊团角色

        Args:
            messages: 对话消息列表
            phase1_result: 阶段1的分析结果
            intent_result: 阶段2的意图识别结果

        Returns:
            分发配置
        """
        # 修复：首先检查阶段1是否判断需要AI帮助
        if not phase1_result.get('is', False):
            print(f"[智能分析] 阶段1判断无需AI帮助，不准备分发配置")
            return {
                'mode': 'default',
                'targets': [],
                'intent': intent_result
            }

        # 加载智囊团角色配置
        try:
            import json
            with open("data/agent.json", "r", encoding="utf-8") as f:
                agent_data = json.load(f)
                roles = agent_data.get('think_tank_roles', [])
        except Exception as e:
            print(f"[智能分析] 加载角色配置失败: {e}")
            roles = []

        # 加载当前配置
        try:
            with open("api_config.json", "r", encoding="utf-8") as f:
                config_data = json.load(f)
                active_names = config_data.get('multi_llm_active_names', [])
                configs = config_data.get('configs', [])
        except Exception as e:
            print(f"[智能分析] 加载API配置失败: {e}")
            return {'targets': [], 'mode': 'default'}

        # 根据角色标签匹配模型
        role_targets = {}
        for role in roles:
            role_id = role.get('id')
            tag_key = role.get('tag_key')

            # 查找匹配该角色标签的模型
            matching_configs = [
                c for c in configs
                if c['name'] in active_names
                and c.get('tags', [])
                and tag_key in c['tags']
            ]

            if matching_configs:
                # 选择第一个匹配的模型
                role_targets[role_id] = matching_configs[0]['name']

        # 如果有角色匹配，使用智囊团模式
        if role_targets:
            return {
                'mode': 'think_tank',
                'targets': role_targets,
                'intent': intent_result
            }
        else:
            # 否则使用默认模式（单模型）
            return {
                'mode': 'default',
                'targets': active_names[:1] if active_names else [],
                'intent': intent_result
            }

    async def should_analyze(self, message: Dict, conversation_history: List[Dict]) -> Tuple[bool, Optional[str]]:
        """
        异步检查是否需要分析（按照流程图逻辑）

        Args:
            message: 当前消息
            conversation_history: 对话历史

        Returns:
            (是否需要分析, 触发原因)
        """
        if not self.enabled:
            return False, "智能分析已关闭"

        if not self.auto_trigger:
            return False, "自动触发已关闭"

        # 检查是否有 Agent
        if not self.agents:
            return False, "未配置Agent"

        # 选择第一个 Agent 检查触发条件
        agent = list(self.agents.values())[0]
        should_trigger, reason = agent.process_message(message, conversation_history)
        return should_trigger, reason


# 全局 Agent 管理器实例
agent_manager = AgentManager()
