"""
智能分析 Agent 模块

基于底层小模型判定是否需要让AI帮助分析
支持本地模型和云端 API 两种方式
"""

import json
import asyncio
import re
from typing import List, Dict, Optional, Tuple
from llm_client import LLMClient

import json
import asyncio
import re
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
                self._load_local_model(config.get('model_name', 'Qwen3-0.6B'))
            else:
                print("[智能分析] 缺少依赖，无法加载本地模型")

        print(f"[智能分析] Agent 已初始化，阈值: {self.threshold} 字，静音: {self.silence_seconds}秒")

    def _load_local_model(self, model_name: str):
        """加载本地模型"""
        print(f"[智能分析] 正在加载本地模型: {model_name}")
        try:
            self.local_tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.local_model = AutoModelForCausalLM.from_pretrained(
                model_name,
                dtype=torch.float16,
                device_map="auto"
            )
            self.local_model.eval()
            print(f"[智能分析] ✅ 本地模型加载成功: {model_name}")
        except Exception as e:
            print(f"[智能分析] ⚠️ 本地模型加载失败: {e}")
            self.local_model = None
            self.local_tokenizer = None

    def build_analysis_prompt(self, messages: List[Dict], speaker_name: str) -> str:
        """
        构建分析 Prompt
        """
        # 格式化对话内容
        message_texts = []
        for msg in messages:
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            speaker = msg.get('speaker', '')
            message_texts.append(f"[{speaker}] {content}")

        dialogue = "\n".join(message_texts)

        print(f"[智能分析] 构建Prompt，消息数: {len(messages)}")
        print(f"[智能分析] 对话内容预览: {dialogue[:200]}...")

        prompt = f"""请根据对话内容进行判断，只需要给出最终结果。

对话内容：
{dialogue}

判断标准：
- {speaker_name} 是主人公
- 仅当对话包含技术问题、专业讨论或需要专业建议时，才返回 true
- 普通问候、日常聊天、闲聊等返回 false

只输出一个 JSON 对象，不要输出任何其他内容：
{{"is": true}} 或 {{"is": false}}"""

        return prompt

    def validate_response(self, response: str) -> Tuple[bool, Optional[dict]]:
        """验证响应格式，返回最后一个有效结果（最终决定）"""
        try:
            # 收集所有有效的JSON结果
            valid_results = []

            # 1. 尝试正则匹配，收集所有匹配结果
            matches = re.finditer(r'\{[\s"\']*is[\s"\']*:\s*[\"\']?(true|false)[\"\']?\s*\}', response, re.IGNORECASE)
            for match in matches:
                is_true = match.group(1).lower() == 'true'
                valid_results.append({'is': is_true, 'match': match})

            # 2. 使用 JSONDecoder 解析所有可能的 JSON 对象
            decoder = json.JSONDecoder()
            pos = 0
            while pos < len(response):
                # 查找下一个可能的 JSON 起始点
                start = response.find('{', pos)
                if start == -1:
                    break

                try:
                    obj, end = decoder.raw_decode(response, idx=start)
                    # 检查是否是我们需要的对象
                    if isinstance(obj, dict) and 'is' in obj:
                        val = obj['is']
                        # 处理字符串类型的 "true"/"false"
                        if isinstance(val, str):
                            if val.lower() in ['true', 'false']:
                                valid_results.append({'is': val.lower() == 'true', 'pos': start})
                        elif isinstance(val, bool):
                            valid_results.append({'is': val, 'pos': start})

                    # 继续搜索下一个
                    pos = end
                except json.JSONDecodeError:
                    # 当前位置解析失败，尝试下一个字符
                    pos = start + 1

            # 如果有多个结果，返回最后一个（最终决定）
            if valid_results:
                print(f"[智能分析] 找到 {len(valid_results)} 个判定结果，使用最后一个: {valid_results[-1]['is']}")
                return True, {'is': valid_results[-1]['is']}

        except Exception as e:
            print(f"[智能分析] 响应解析出错: {e}")

        return False, None

    async def analyze(self, messages: List[Dict], speaker_name: str) -> Dict:
        """
        分析对话并判定是否需要启动多模型共话
        """
        try:
            # 构建 Prompt
            prompt = self.build_analysis_prompt(messages, speaker_name)

            print(f"[智能分析] 开始分析，主人公: {speaker_name}，消息数: {len(messages)}")

            # 调用小模型
            model_type = self.config.get('model_type', 'api')

            if model_type == 'api' and self.client:
                # API 模式
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

            elif model_type == 'local' and self.local_model:
                # 本地模式
                try:
                    # 准备输入
                    inputs = self.local_tokenizer(prompt, return_tensors="pt").to(self.local_model.device)

                    # 生成响应 - 限制token数量，避免过度推理
                    with torch.no_grad():
                        outputs = self.local_model.generate(
                            **inputs,
                            max_new_tokens=50,  # 减少到50，降低冗余推理
                            temperature=0.0,    # 降到0，完全确定性
                            do_sample=False,
                            pad_token_id=self.local_tokenizer.eos_token_id,
                            eos_token_id=self.local_tokenizer.eos_token_id
                        )

                    response_text = self.local_tokenizer.decode(
                        outputs[0][inputs['input_ids'].shape[1]:],
                        skip_special_tokens=True
                    ).strip()

                    print(f"[智能分析] 本地模型完整响应内容:")
                    print("=" * 80)
                    print(response_text)
                    print("=" * 80)
                    print(f"[智能分析] 响应长度: {len(response_text)} 字符")
                    is_valid, result = self.validate_response(response_text)

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
                    return {
                        'is': False,
                        'confidence': 0.0,
                        'reason': f'本地模型推理失败: {str(e)}',
                        'raw_response': ''
                    }

            # 如果没有客户端或验证失败，返回默认结果
            print("[智能分析] 未配置小模型或响应无效，默认返回 false")
            return {
                'is': False,
                'confidence': 0.0,
                'reason': '小模型未配置或响应无效',
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

    def should_trigger(self, message: Dict, conversation_history: List[Dict]) -> bool:
        """
        检查是否应该触发智能分析

        Args:
            message: 当前消息
            conversation_history: 对话历史

        Returns:
            是否应该触发
        """
        # 检查字数阈值
        text = message.get('text', '')
        if len(text) < self.threshold:
            print(f"[智能分析] 字数不足: {len(text)}/{self.threshold}")
            return False

        # 检查是否是新消息
        if conversation_history and text == conversation_history[-1].get('text', ''):
            return False

        print(f"[智能分析] 满足触发条件，字数: {len(text)}")
        return True


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
            model_name = config.get('model_name', 'default')

            # 合并配置
            agent_config = {
                'model_type': model_config.get('model_type', 'api'),
                'api_key': model_config.get('api_key', ''),
                'base_url': model_config.get('base_url', ''),
                'model': model_config.get('model', ''),
                'threshold': config.get('min_characters', 10),
                'silence_seconds': config.get('silence_threshold', 2)
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

        # 阶段2：意图识别（如果启用）
        intent_result = None
        if intent_recognition and phase1_result.get('is', False):
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
        # 构建意图识别Prompt
        message_texts = []
        for msg in messages:
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            speaker = msg.get('speaker', '')
            message_texts.append(f"[{speaker}] {content}")

        dialogue = "\n".join(message_texts)

        intent_prompt = f"""请分析以下对话，提取核心问题和讨论轮廓：

{dialogue}

注意：{speaker_name} 是主人公。

请返回JSON格式：
{{
    "core_question": "核心问题描述",
    "outline": ["要点1", "要点2", "要点3"]
}}

要求：
1. 识别对话中的核心问题或讨论主题
2. 提取关键要点和子话题
3. 保持客观中立，不要添加建议"""

        try:
            # 获取第一个可用的agent进行意图识别
            agent = list(self.agents.values())[0]
            agent_type = agent.config.get('model_type', 'api')

            if agent_type == 'api' and agent.client:
                response_text = ""
                async for chunk in agent.client.chat_stream([
                    {"role": "user", "content": intent_prompt}
                ]):
                    response_text += chunk

                # 尝试解析JSON响应
                import re
                match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if match:
                    import json
                    try:
                        result = json.loads(match.group())
                        return {
                            'success': True,
                            'core_question': result.get('core_question', ''),
                            'outline': result.get('outline', []),
                            'raw_response': response_text
                        }
                    except json.JSONDecodeError:
                        pass

                return {
                    'success': False,
                    'error': 'JSON解析失败',
                    'raw_response': response_text
                }

            elif agent_type == 'local' and agent.local_model:
                # 本地模型实现（简化版）
                return {
                    'success': True,
                    'core_question': '检测到需要多模型分析的场景',
                    'outline': ['技术讨论', '需要专业建议', '涉及复杂决策']
                }

            return {'success': False, 'error': '无可用的Agent进行意图识别'}

        except Exception as e:
            print(f"[智能分析] 意图识别失败: {e}")
            return {'success': False, 'error': str(e)}

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

    def should_analyze(self, message: Dict, conversation_history: List[Dict]) -> bool:
        """
        检查是否需要分析

        Args:
            message: 当前消息
            conversation_history: 对话历史

        Returns:
            是否需要分析
        """
        if not self.enabled:
            return False

        if not self.auto_trigger:
            return False

        # 检查是否有 Agent
        if not self.agents:
            return False

        # 选择第一个 Agent 检查触发条件
        agent = list(self.agents.values())[0]
        return agent.should_trigger(message, conversation_history)


# 全局 Agent 管理器实例
agent_manager = AgentManager()
