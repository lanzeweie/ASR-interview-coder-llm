"""
智能分析 Agent 模块

基于底层小模型判定是否需要让AI帮助分析
支持本地模型和云端 API 两种方式
按职责拆分为【智能分析】【意图识别】【智囊团】三类Agent，可组合也可独立启用。
"""

import asyncio
import copy
import json
import re
import time
from html import escape
from typing import Dict, List, Optional, Tuple

from llm_client import LLMClient

# 尝试导入 transformers 和 torch
try:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    print("[智能Agent] 未安装 transformers/torch，本地模型功能不可用")

LEGACY_IDENTITY_MAP = {
    "思考": "tech_assistant",
    "快速": "concise_assistant",
    "引导": "guide",
    "技术辅助者": "tech_assistant",
    "精简辅助者": "concise_assistant",
    "资深求职着": "guide"
}


def normalize_identity_identifier(value: Optional[str]) -> str:
    if not value:
        return ""
    identifier = value.strip()
    if not identifier:
        return ""
    identifier = re.sub(r"\s+", "_", identifier)
    mapped = LEGACY_IDENTITY_MAP.get(identifier)
    if mapped:
        return mapped
    identifier = identifier.lower()
    mapped = LEGACY_IDENTITY_MAP.get(identifier)
    if mapped:
        return mapped
    if identifier.endswith("_tag"):
        identifier = identifier[:-4]
    return identifier


def sanitize_role_definition(role: Optional[Dict]) -> Optional[Dict]:
    if not isinstance(role, dict):
        return None

    normalized_id = normalize_identity_identifier(role.get("id") or role.get("tag_key"))
    if not normalized_id:
        return None

    name = (role.get("name") or "").strip() or normalized_id
    prompt = (role.get("prompt") or "").strip()
    enabled = bool(role.get("enabled", True))

    return {
        "id": normalized_id,
        "name": name,
        "prompt": prompt,
        "enabled": enabled
    }


def get_sub_agent_system(agent_config_path: str = "data/agent.json", use_intent: bool = False, use_resume: bool = False) -> str:
    """
    根据开关状态获取对应的 sub-agent system prompt
    
    Args:
        agent_config_path: agent配置文件路径
        use_intent: 是否启用意图识别
        use_resume: 是否启用简历个性化
    
    Returns:
        对应场景的system prompt字符串
    """
    try:
        with open(agent_config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        sub_agents = data.get('sub_agents', {})
        
        # 根据功能组合选择对应的 sub-agent
        if use_intent and use_resume:
            agent_key = 'full_featured'
        elif use_intent:
            agent_key = 'with_intent'
        elif use_resume:
            agent_key = 'with_resume'
        else:
            agent_key = 'direct_chat'
        
        agent_config = sub_agents.get(agent_key, {})
        system_prompt = agent_config.get('system', '')
        
        if system_prompt:
            print(f"[Sub-Agent] 加载系统提示词: {agent_config.get('name', agent_key)}")
        else:
            print(f"[Sub-Agent] 警告: 未找到 {agent_key} 的系统提示词，使用默认")
            system_prompt = "你是一名资深 Python 技术专家，正在参加高级工程师面试。"
        
        return system_prompt
    except Exception as exc:
        print(f"[Sub-Agent] 加载配置失败: {exc}")
        return "你是一名资深 Python 技术专家，正在参加高级工程师面试。"


def format_messages_compact(messages: List[Dict]) -> str:
    """将消息压缩为XML格式，减少token消耗"""
    xml_lines = ['<conversation>']

    for msg in messages:
        role = msg.get('role', 'u')
        content = msg.get('content', '').strip()
        speaker = msg.get('speaker', '')

        if ' (' in speaker:
            speaker = speaker.split(' (')[0]
        elif '(' in speaker:
            speaker = speaker.split('(')[0]

        timestamp = msg.get('timestamp', 0)
        if isinstance(timestamp, (int, float)) and timestamp > 0:
            relative_time = int(timestamp % 3600)
            timestamp_str = f' t="{relative_time}"'
        else:
            timestamp_str = ''

        xml_lines.append(
            f'  <msg r="{role[0]}" sp="{speaker}"{timestamp_str}>{content}</msg>'
        )

    xml_lines.append('</conversation>')
    result = '\n'.join(xml_lines)
    print(f"[格式化] 原始消息数: {len(messages)}, 格式化后长度: {len(result)} 字符")
    return result


class BaseLLMAgent:
    """封装本地/云端模型加载与推理的基础Agent"""

    def __init__(self, agent_label: str, config: dict):
        self.agent_label = agent_label
        self.config = config
        self.model_type = config.get('model_type', 'api')
        self.generation_params = config.get('generation_params', {})
        self.client = None
        self.local_model = None
        self.local_tokenizer = None
        self._init_backend()

    def _init_backend(self):
        if self.model_type == 'api':
            self.client = LLMClient(
                api_key=self.config.get('api_key', ''),
                base_url=self.config.get('base_url', ''),
                model=self.config.get('model', '')
            )
            print(f"[{self.agent_label}] API客户端已初始化")
        elif self.model_type == 'local':
            model_name = self.config.get('model_name', 'Qwen/Qwen2-0.5B-Instruct')
            if TRANSFORMERS_AVAILABLE:
                self._load_local_model(model_name)
            else:
                print(f"[{self.agent_label}] 缺少本地推理依赖，无法加载 {model_name}")

    def _load_local_model(self, model_name: str) -> bool:
        print(f"[{self.agent_label}] 正在加载本地模型: {model_name}")
        try:
            self.local_tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.local_model = AutoModelForCausalLM.from_pretrained(
                model_name,
                dtype=torch.float16,
                device_map="auto"
            )
            self.local_model.eval()
            print(f"[{self.agent_label}] ✅ 本地模型加载成功: {model_name}")
            return True
        except Exception as exc:
            print(f"[{self.agent_label}] ❌ 本地模型加载失败: {exc}")
            self.local_model = None
            self.local_tokenizer = None
            return False

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

    async def _run_chat(self, messages: List[Dict]) -> str:
        if self.model_type == 'api':
            if not self.client:
                raise RuntimeError(f"API客户端未初始化 ({self.agent_label})")
            response_text = ""
            async for chunk in self.client.chat_stream(messages):
                response_text += chunk
        elif self.model_type == 'local':
            if not (self.local_model and self.local_tokenizer):
                raise RuntimeError(f"本地模型未加载 ({self.agent_label})")
            
            enable_thinking = self.generation_params.get("enable_thinking", False)
            if self.config.get("enable_thinking"):
                enable_thinking = True
                
            text = self.local_tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=enable_thinking
            )
            inputs = self.local_tokenizer([text], return_tensors="pt").to(self.local_model.device)
            with torch.no_grad():
                outputs = self.local_model.generate(
                    inputs.input_ids,
                    attention_mask=inputs.attention_mask,
                    **self._get_local_generation_kwargs()
                )
            response_text = self.local_tokenizer.decode(
                outputs[0][inputs.input_ids.shape[1]:],
                skip_special_tokens=True
            ).strip()
        else:
            raise RuntimeError(f"未知的模型类型: {self.model_type}")

        print(f"[{self.agent_label}] 模型完整响应内容:")
        print("=" * 80)
        print(response_text)
        print("=" * 80)
        print(f"[{self.agent_label}] 响应长度: {len(response_text)} 字符")
        return response_text


class SmartAnalysisAgent(BaseLLMAgent):
    """负责阶段1智能分析的Agent"""

    def __init__(self, config: dict):
        super().__init__("智能分析", config)
        self.threshold = config.get('threshold', 10)
        self.silence_seconds = config.get('silence_seconds', 2)
        self.last_message_time = 0
        self.current_speaker = None
        self.accumulated_text = ""
        self.silence_timer = None
        self.silence_detection_started = False
        self.last_analysis_time = 0
        self.force_trigger_threshold = self.threshold * 3
        self._pending_trigger_message = None
        print(f"[智能分析] Agent 初始化，阈值:{self.threshold} 字，静音:{self.silence_seconds} 秒")

    def build_analysis_prompt(self, messages: List[Dict], speaker_name: str) -> str:
        dialogue = format_messages_compact(messages)
        print(f"[智能分析] 构建Prompt，消息数: {len(messages)}，长度: {len(dialogue)}")
        prompt = f"""
        你是一个软件工程对话分析器，专门用于判断语音转文字后的对话片段是否明确涉及相关技术内容。请严格遵循以下规则，并仅输出一个标准 JSON 对象，不得包含任何额外文本、解释、格式符号或换行。

        输入：
        {dialogue}

        处理原则：

        主人公为 {speaker_name}。不存则在无视
        语音转文字可能存在术语截断、错别字或不完整表达（如“Dock”、“调接口超时”、“React 的 useE”），你可基于上下文合理推测其指代的常见软件工程术语（如 Docker、API、useEffect）。
        但必须采取激进策略：只要有证据表明对话明确涉及咨询/询问/问答技术主题时，才返回 {{"is": true}}：
        例如：
        • 编程语言、框架或库的具体使用问题（如 Python 装包失败、React 状态管理、TensorFlow 模型加载）
        • 调试、错误排查、性能瓶颈分析
        • 系统架构设计、API 规范、数据库 schema 或查询优化
        • 开发工具链操作（如 Git 分支冲突、Docker 镜像构建、CI/CD 流水线配置）
        • 算法实现、数据结构选择、代码可读性或审查反馈
        • 软件工程实践（如单元测试覆盖、部署回滚、日志监控）
        以下情况一律返回 {{"is": false}}

        话题属于非软件领域（如硬件、生物、金融），即使含代码片段
        仅泛泛提及“写代码”“搞开发”而无具体技术细节
        表达模糊、缺乏可识别技术关键词，或推测依据不足
        日常寒暄、情绪表达、非技术性计划讨论
        输出要求：

        严格输出：{{"is": true}} 或 {{"is": false}}
        必须是合法 JSON，不包裹在 Markdown、反引号、代码块或任何额外字符中
        """
        return prompt

    @staticmethod
    def validate_response(response: str) -> Tuple[bool, Optional[dict]]:
        try:
            match = re.search(r'\{\s*"is"\s*:\s*(true|false)\s*\}', response, re.IGNORECASE)
            if match:
                is_true = match.group(1).lower() == 'true'
                print(f"[智能分析] 判定结果: {is_true}")
                return True, {'is': is_true}
        except Exception as exc:
            print(f"[智能分析] 响应解析出错: {exc}")
        return False, None

    async def analyze(self, messages: List[Dict], speaker_name: str) -> Dict:
        model_name = self.config.get('model_name') or self.config.get('model') or '未知模型'
        try:
            prompt = self.build_analysis_prompt(messages, speaker_name)
            print(f"[智能分析] 开始分析，主人公: {speaker_name}")
            if self.model_type == 'local':
                chat_messages = [
                    {
                        "role": "system",
                        "content": "你是一个严谨的格式化输出工具。你的唯一任务是接收对话分析指令并输出JSON。严禁输出任何其他解释性文字。"
                    },
                    {"role": "user", "content": prompt}
                ]
            else:
                chat_messages = [{"role": "user", "content": prompt}]
            print(chat_messages)
            response_text = await self._run_chat(chat_messages)
            
            # 去除 <think> 标签内容
            response_text = re.sub(r'<think>.*?</think>', '', response_text, flags=re.DOTALL)
            
            clean_text = response_text.replace("```json", "").replace("```", "").strip()
            is_valid, result = self.validate_response(clean_text)
            if is_valid and result:
                is_needed = result['is']
                reason = "检测到需要AI帮助分析" if is_needed else "普通对话，无需 AI 介入"
                return {
                    'is': is_needed,
                    'reason': reason,
                    'raw_response': response_text,
                    'model_name': model_name
                }
            return {
                'is': False,
                'reason': '模型响应无效',
                'raw_response': response_text,
                'model_name': model_name
            }
        except RuntimeError as exc:
            return {
                'is': False,
                'reason': f'分析失败: {str(exc)}',
                'raw_response': '',
                'model_name': model_name
            }
        except Exception as exc:
            print(f"[智能分析] 分析过程出错: {exc}")
            return {
                'is': False,
                'reason': f'分析失败: {str(exc)}',
                'raw_response': '',
                'model_name': model_name
            }

    def process_message(self, message: Dict, conversation_history: List[Dict]) -> Tuple[bool, Optional[str]]:
        text = message.get('text', '').strip()
        if len(text) < 3:
            print(f"[智能分析] 消息长度不足3字符，忽略: {len(text)} 字符")
            return False, None

        current_time = time.time()
        self.last_message_time = current_time

        speaker_info = message.get('speaker', '')
        speaker_name = speaker_info.split(' (')[0] if '(' in speaker_info else speaker_info
        print(f"[智能分析] 处理消息: {speaker_name} - {text[:20]}... (长度: {len(text)})")

        if self.current_speaker is None:
            self.current_speaker = speaker_name
            self.accumulated_text = text
        elif self.current_speaker == speaker_name:
            self.accumulated_text += text
            print(f"[智能分析] 同一说话人累积，长度: {len(self.accumulated_text)}")
        else:
            print(f"[智能分析] 说话人变更: {self.current_speaker} -> {speaker_name}")
            self.current_speaker = speaker_name
            self.accumulated_text = text

        if len(self.accumulated_text) < self.threshold:
            print(f"[智能分析] 累积字符不足: {len(self.accumulated_text)}/{self.threshold}")
            return False, None

        if not self.silence_detection_started:
            self.silence_detection_started = True
            if self.silence_timer:
                self.silence_timer.cancel()
            self.silence_timer = asyncio.create_task(self._monitor_silence())
            print(f"[智能分析] 已启动静音检测，阈值: {self.silence_seconds}秒")
            return False, None
        else:
            triggered = self._check_trigger_conditions(text)
            if triggered:
                enriched_message = copy.deepcopy(message)
                accumulated = self.accumulated_text.strip()
                if accumulated:
                    enriched_message['text'] = accumulated
                    if 'content' in enriched_message:
                        enriched_message['content'] = accumulated
                self._pending_trigger_message = enriched_message
                self.accumulated_text = ""
                self.current_speaker = None
                self.silence_detection_started = False
                if self.silence_timer:
                    self.silence_timer.cancel()
                    self.silence_timer = None
            return triggered, "满足触发条件"

    def prepare_analysis_messages(self, messages: List[Dict]) -> List[Dict]:
        if not self._pending_trigger_message:
            return messages
        
        # 确保pending消息被包含
        # 注意：这里我们比较引用，如果需要在内容上判重可能需要调整
        if self._pending_trigger_message not in messages:
            messages = [*messages, self._pending_trigger_message]
            print(f"[智能分析] 已追加触发消息: {self._pending_trigger_message.get('text', '')[:20]}...")
        
        self._pending_trigger_message = None
        return messages

    async def _monitor_silence(self):
        try:
            await asyncio.sleep(self.silence_seconds)
            print(f"[智能分析] 静音超时，触发分析")
            self.silence_detection_started = False
            self.silence_timer = None
        except asyncio.CancelledError:
            print(f"[智能分析] 静音检测被取消")

    def _check_trigger_conditions(self, current_text: str) -> bool:
        current_time = time.time()
        silence_duration = current_time - self.last_message_time
        print(f"[智能分析] 静音时长: {silence_duration:.2f}秒")

        if silence_duration >= self.silence_seconds:
            print(f"[智能分析] 条件1满足：静音 ≥ {self.silence_seconds}")
            return True

        current_length = len(self.accumulated_text)
        if current_length >= self.force_trigger_threshold:
            print(f"[智能分析] 条件2满足：累积 ≥ 3倍阈值 ({current_length})")
            return True

        double_threshold = self.silence_seconds * 2
        if silence_duration >= double_threshold:
            print(f"[智能分析] 条件3满足：静音 ≥ {double_threshold}")
            return True

        print(f"[智能分析] 条件不足，继续等待")
        return False

    def reset_state(self):
        self.last_message_time = 0
        self.current_speaker = None
        self.accumulated_text = ""
        self.silence_detection_started = False
        if self.silence_timer:
            self.silence_timer.cancel()
            self.silence_timer = None
        self.last_analysis_time = 0
        self._pending_trigger_message = None
        print(f"[智能分析] 状态已重置")


class IntentRecognitionAgent(BaseLLMAgent):
    """负责阶段2意图识别的Agent"""

    def __init__(self, config: dict):
        super().__init__("意图识别", config)

    def build_prompt(self, messages: List[Dict], speaker_name: str) -> str:
        dialogue = format_messages_compact(messages)
        return f'''
        你是一名面试场景专用的技术意图分析专家。请严格按以下规则处理输入：

        🔹 处理逻辑：
        1. 从对话末尾向前扫描整个对话，提取“最后出现的技术问题句子”（即：找到距离对话尾部最近、且属于编程/调试/架构/运维/工具/算法等领域的明确技术提问；不再限制于连续消息块）。
        - 若对话中后部出现的消息为闲聊、生活内容、情绪表达等，则继续向前扫描，直到找到最近的一条技术类问题。
        - 若对话全程均无技术问题，则视为“无技术问题”。

        2. 判断该技术问题是否存在：
        - 若找到技术问题 → 进入步骤 4
        - 若未找到任何技术问题 → 输出固定结构：
            <leader_analysis><summary>未检测到技术问题</summary><true_question></true_question><steps></steps></leader_analysis>

        3. 如无技术问题 → 按上方固定结构输出（保持不变）

        4. 如有技术问题 → 输出结构如下，且必须满足：
        - <summary>：用15~30字精准概括意图，禁止超字数

        🔹 示例（供你理解风格，不要复制）：
        输入对话：
        候选人A：装饰器那个@符号我老是搞不懂什么时候加括号。
        面试官：你是说带参数和不带参数的区别？
        候选人A：对，还有它怎么影响原函数的。

        应输出：
        <leader_analysis>
            <summary>困惑装饰器语法与参数传递机制</summary>
        </leader_analysis>

        🔹 输出规范：
        - 仅输出 XML，前后无任何字符、空行、注释
        - 不使用 Markdown、不编号、不加粗
        - 所有字段必须闭合，即使为空
            
        # 现在是实际内容：
        🔹 输入对话：
        {dialogue}
        '''
    @staticmethod
    def _extract_xml(text: str) -> str:
        match = re.search(r'<leader_analysis[\s\S]*?</leader_analysis>', text, re.IGNORECASE)
        if match:
            return match.group(0).strip()
        import html
        content = text.strip() or "未检测到技术问题"
        escaped = html.escape(content)
        return (
            "<leader_analysis>"
            f"<summary>{escaped}</summary>"
            "<true_question></true_question>"
            "<steps></steps>"
            "</leader_analysis>"
        )

    async def analyze(self, messages: List[Dict], speaker_name: str) -> Dict:
        prompt = self.build_prompt(messages, speaker_name)
        try:
            print(
                f"[意图识别] 开始分析，主人公: {speaker_name}, 消息数: {len(messages)}, "
                f"模型类型: {self.model_type}, 模型: {self.config.get('model_name') or self.config.get('model')}"
            )
            print("[意图识别][调试] 完整 Prompt 内容:")
            print("=" * 80)
            print(prompt)
            print("=" * 80)
            if self.model_type == 'local':
                chat_messages = [
                    {"role": "system", "content": "你是意图识别Agent，只能输出严格的XML分析结果。"},
                    {"role": "user", "content": prompt}
                ]
            else:
                chat_messages = [{"role": "user", "content": prompt}]

            response_text = await self._run_chat(chat_messages)
            
            # 去除 <think> 标签内容
            response_text = re.sub(r'<think>.*?</think>', '', response_text, flags=re.DOTALL)
            
            xml_content = self._extract_xml(response_text)
            print("[意图识别] XML结果: ")
            print(xml_content)
            return {
                'success': True,
                'summary_xml': xml_content,
                'raw_response': response_text,
                'model_name': self.config.get('model_name') or self.config.get('model')
            }
        except RuntimeError as exc:
            return {'success': False, 'error': str(exc)}
        except Exception as exc:
            print(f"[意图识别] 分析失败: {exc}")
            return {'success': False, 'error': str(exc)}

def format_intent_analysis(intent_result: Optional[Dict]) -> str:
    if not intent_result:
        return ""
    if intent_result.get("success") and intent_result.get("summary_xml"):
        return intent_result["summary_xml"]
    error = intent_result.get("error")
    if error:
        safe_error = escape(str(error))
        return (
            "<leader_analysis>"
            f"<summary>{safe_error}</summary>"
            "<true_question></true_question>"
            "<steps></steps>"
            "</leader_analysis>"
        )
    return ""


class ThinkTankAgent:
    """负责阶段3智囊团分发逻辑的Agent"""

    def __init__(self, agent_config_path: str = "api_config.json", role_config_path: str = "data/agent.json"):
        self.agent_config_path = agent_config_path
        self.role_config_path = role_config_path

    def _safe_load_json(self, path: str) -> dict:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            print(f"[智囊团] 加载 {path} 失败: {exc}")
            return {}

    def get_system_prompt(self, use_intent: bool = False, use_resume: bool = False) -> str:
        """
        获取当前场景对应的system prompt
        
        Args:
            use_intent: 是否启用意图识别
            use_resume: 是否启用简历个性化
        
        Returns:
            对应场景的system prompt
        """
        return get_sub_agent_system(
            agent_config_path=self.role_config_path,
            use_intent=use_intent,
            use_resume=use_resume
        )

    def prepare_distribution(
        self,
        messages: List[Dict],
        phase1_result: Optional[Dict],
        intent_result: Optional[Dict] = None,
        force: bool = False,
        use_intent: bool = False,
        use_resume: bool = False
    ) -> Dict:
        phase1_is_positive = bool(phase1_result and phase1_result.get('is'))
        if not force and not phase1_is_positive:
            print(f"[智囊团] 阶段1判定无需AI，直接返回默认模式")
            return {
                'mode': 'default',
                'targets': [],
                'intent': intent_result,
                'system_prompt': self.get_system_prompt(use_intent, use_resume)
            }

        role_data = self._safe_load_json(self.role_config_path)
        raw_roles = role_data.get('think_tank_roles', [])
        roles = []
        for role in raw_roles:
            sanitized = sanitize_role_definition(role)
            if sanitized:
                roles.append(sanitized)

        config_data = self._safe_load_json(self.agent_config_path)
        active_names = set(config_data.get('multi_llm_active_names', []))
        configs = config_data.get('configs', [])
        config_tag_map = {
            c['name']: [
                normalize_identity_identifier(tag)
                for tag in c.get('tags', []) if tag
            ]
            for c in configs
        }

        role_targets = {}
        for role in roles:
            if not role.get("enabled", True):
                continue
            role_id = role.get('id')
            matching_configs = [
                name for name, tags in config_tag_map.items()
                if name in active_names and role_id in tags
            ]
            if matching_configs:
                role_targets[role_id] = matching_configs[0]

        # 获取当前场景对应的system prompt
        system_prompt = self.get_system_prompt(use_intent, use_resume)

        if role_targets:
            print(f"[智囊团] 匹配到 {len(role_targets)} 个角色目标")
            return {
                'mode': 'think_tank',
                'targets': role_targets,
                'intent': intent_result,
                'system_prompt': system_prompt
            }

        default_targets = list(active_names)[:1]
        print(f"[智囊团] 未匹配到角色，使用默认目标: {default_targets}")
        return {
            'mode': 'default',
            'targets': default_targets,
            'intent': intent_result,
            'system_prompt': system_prompt
        }


class AgentManager:
    """组合三个Agent并提供统一接口"""

    def __init__(self):
        self.agents: Dict[str, SmartAnalysisAgent] = {}
        self.intent_agent: Optional[IntentRecognitionAgent] = None
        self.think_tank_agent = ThinkTankAgent()
        self.enabled = False
        self.auto_trigger = True
        print("[智能分析] Agent 管理器已初始化")

    def _build_llm_runtime_config(self, overrides: dict, model_config: Optional[dict], fallback_model_name: str) -> dict:
        runtime = {
            'model_type': overrides.get('model_type') or (model_config.get('model_type') if model_config else 'api'),
            'model_name': overrides.get('model_name') or (model_config.get('model_name') if model_config else fallback_model_name),
            'api_key': overrides.get('api_key', ''),
            'base_url': overrides.get('base_url', ''),
            'model': overrides.get('model', ''),
            'generation_params': overrides.get('generation_params', {})
        }
        
        # 将 enable_thinking 放入 generation_params
        if overrides.get('enable_thinking'):
             runtime['generation_params']['enable_thinking'] = True
        elif model_config and model_config.get('enable_thinking'):
             runtime['generation_params']['enable_thinking'] = True
             
        if runtime['model_type'] == 'api' and model_config:
            runtime['api_key'] = model_config.get('api_key', runtime['api_key'])
            runtime['base_url'] = model_config.get('base_url', runtime['base_url'])
            runtime['model'] = model_config.get('model', runtime['model'])
            runtime['generation_params'] = model_config.get('generation_params', runtime['generation_params'])
        return runtime

    def load_agent(self, config: dict, model_config: dict) -> bool:
        try:
            model_name = model_config.get('model_name', config.get('model_name', 'Qwen/Qwen2-0.5B-Instruct'))
            overrides = {
                'model_type': model_config.get('model_type', config.get('model_type', 'api')),
                'model_name': model_name,
                'enable_thinking': config.get('enable_thinking', False)
            }
            agent_config = self._build_llm_runtime_config(overrides, model_config, model_name)
            agent_config.update({
                'threshold': config.get('min_characters', 10),
                'silence_seconds': config.get('silence_threshold', 2)
            })
            agent = SmartAnalysisAgent(agent_config)
            self.agents[model_name] = agent
            self.enabled = config.get('enabled', False)
            self.auto_trigger = config.get('auto_trigger', True)
            print(f"[智能分析] 已加载 Agent: {model_name}, 启用: {self.enabled}")
            return True
        except Exception as exc:
            print(f"[智能分析] 加载 Agent 失败: {exc}")
            return False

    def configure_intent_agent(self, config: dict, model_config: Optional[dict]) -> bool:
        try:
            fallback = config.get('model_name', 'Qwen3-0.6B')
            overrides = {
                'model_type': config.get('model_type', 'local'),
                'model_name': fallback,
                'enable_thinking': config.get('intent_enable_thinking', False)
            }
            agent_config = self._build_llm_runtime_config(overrides, model_config, fallback)
            self.intent_agent = IntentRecognitionAgent(agent_config)
            print(f"[意图识别] 已配置: {agent_config.get('model_name')}")
            return True
        except Exception as exc:
            print(f"[意图识别] 配置失败: {exc}")
            self.intent_agent = None
            return False

    def _get_primary_agent(self) -> Optional[SmartAnalysisAgent]:
        return next(iter(self.agents.values()), None)

    async def analyze_conversation(
        self,
        messages: List[Dict],
        speaker_name: str,
        agent_name: Optional[str] = None,
        bypass_enabled: bool = False
    ) -> Dict:
        if not self.enabled and not bypass_enabled:
            return {'is': False, 'reason': '智能分析已关闭'}

        agent = None
        if agent_name and agent_name in self.agents:
            agent = self.agents[agent_name]
        elif self.agents:
            agent = self._get_primary_agent()

        if not agent:
            return {'is': False, 'reason': '未配置智能 Agent'}

        prepared_messages = agent.prepare_analysis_messages(messages)
        return await agent.analyze(prepared_messages, speaker_name)

    async def run_pipeline(
        self,
        messages: List[Dict],
        speaker_name: str,
        *,
        use_analysis: bool = True,
        use_intent: bool = False,
        use_resume: bool = False,
        use_think_tank: bool = True,
        bypass_enabled: bool = False,
        force_modules: bool = False
    ) -> Dict:
        print(
            "[智能分析] run_pipeline -> "
            f"analysis={use_analysis}, intent={use_intent}, resume={use_resume}, "
            f"think_tank={use_think_tank}, bypass={bypass_enabled}, force={force_modules}"
        )
        if use_analysis:
            phase1_result = await self.analyze_conversation(
                messages,
                speaker_name,
                bypass_enabled=bypass_enabled
            )
        else:
            phase1_result = {
                'is': False,
                'reason': '智能分析模块未启用',
                'confidence': 0.0,
                'raw_response': '',
                'skipped': True
            }

        phase1_success = bool(phase1_result.get('is')) if isinstance(phase1_result, dict) else False
        should_halt = use_analysis and not force_modules and not phase1_success

        intent_result = None
        if use_intent and not should_halt:
            print("[意图识别] 模块启用，即将运行 IntentRecognitionAgent")
            intent_result = await self.run_intent_recognition(messages, speaker_name)

        distribution_result = None
        if use_think_tank:
            if should_halt:
                distribution_result = {
                    'mode': 'default',
                    'targets': [],
                    'intent': intent_result,
                    'system_prompt': self.think_tank_agent.get_system_prompt(use_intent, use_resume)
                }
            else:
                distribution_result = self.think_tank_agent.prepare_distribution(
                    messages,
                    phase1_result,
                    intent_result,
                    force=force_modules or not use_analysis,
                    use_intent=use_intent,
                    use_resume=use_resume
                )
        else:
            distribution_result = {
                'mode': 'skipped',
                'targets': [],
                'intent': intent_result,
                'system_prompt': self.think_tank_agent.get_system_prompt(use_intent, use_resume)
            }

        return {
            'phase1': phase1_result,
            'phase2': intent_result,
            'distribution': distribution_result
        }

    async def run_intelligent_analysis(
        self,
        messages: List[Dict],
        speaker_name: str,
        intent_recognition: bool = False,
        resume_personalization: bool = False
    ) -> Dict:
        print(f"[智能分析] 开始三阶段分析，意图识别: {intent_recognition}, 简历个性化: {resume_personalization}")
        result = await self.run_pipeline(
            messages,
            speaker_name,
            use_analysis=True,
            use_intent=intent_recognition,
            use_resume=resume_personalization,
            use_think_tank=True,
            bypass_enabled=True,
            force_modules=False
        )
        phase2_result = result.get('phase2')
        if phase2_result is not None:
            print(f"[智能分析] 阶段2完成: {phase2_result.get('success', False)}")
        distribution_result = result.get('distribution', {})
        print(f"[智能分析] 阶段3完成: mode={distribution_result.get('mode')}")
        print(f"[智能分析] 使用的系统提示词模式: {distribution_result.get('system_prompt', '未设置')[:50]}...")
        return result

    async def run_intent_recognition(self, messages: List[Dict], speaker_name: str) -> Dict:
        agent = self.intent_agent
        if not agent:
            primary = self._get_primary_agent()
            if primary:
                print("[意图识别] 未单独配置，复用主Agent模型参数")
                agent_config = dict(primary.config)
                agent = IntentRecognitionAgent(agent_config)
            else:
                return {'success': False, 'error': '无可用的意图识别模型'}

        return await agent.analyze(messages, speaker_name)

    async def should_analyze(self, message: Dict, conversation_history: List[Dict]) -> Tuple[bool, Optional[str]]:
        if not self.enabled:
            return False, "智能分析已关闭"
        if not self.auto_trigger:
            return False, "自动触发已关闭"
        if not self.agents:
            return False, "未配置Agent"
        agent = self._get_primary_agent()
        return agent.process_message(message, conversation_history)


# 全局Agent管理器实例
agent_manager = AgentManager()
