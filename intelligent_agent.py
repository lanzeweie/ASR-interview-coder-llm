"""
智能分析 Agent 模块

基于底层小模型判定是否需要启动多模型共话
支持本地模型和云端 API 两种方式
"""

import json
import asyncio
import re
from typing import List, Dict, Optional, Tuple
from llm_client import LLMClient

# 尝试导入主模块以使用本地模型
try:
    from main import RealTimeASR_SV
    MAIN_MODULE_AVAILABLE = True
except ImportError:
    MAIN_MODULE_AVAILABLE = False
    print("[智能分析] 主模块不可用，本地模型功能不可用")


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

        # 初始化客户端
        if config.get('model_type') == 'api':
            self.client = LLMClient(
                api_key=config.get('api_key', ''),
                base_url=config.get('base_url', ''),
                model=config.get('model', '')
            )

        print(f"[智能分析] Agent 已初始化，阈值: {self.threshold} 字，静音: {self.silence_seconds}秒")

    def build_analysis_prompt(self, messages: List[Dict], speaker_name: str) -> str:
        """
        构建分析 Prompt

        Args:
            messages: 对话消息列表
            speaker_name: 主人公姓名

        Returns:
            格式化后的分析 Prompt
        """
        # 格式化对话内容
        message_texts = []
        for msg in messages:
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            speaker = msg.get('speaker', '')
            message_texts.append(f"[{speaker}] {content}")

        dialogue = "\n".join(message_texts)

        prompt = f"""请你分析以下对话：

{dialogue}

注意：{speaker_name} 是主人公。

请分析以下内容：
1. 是否包含技术问题或专业讨论？
2. 是否需要专业建议或解决方案？
3. 是否涉及复杂决策或需要多方面思考？
4. 排除问候语、家乡、姓名等日常对话

请返回严格的 JSON 格式，不要包含任何其他内容：
{{"is": true/false}}

- true: 需要启动多模型共话，主人公可以从多个角度获得建议
- false: 普通对话，无需 AI 介入"""

        return prompt

    def validate_response(self, response: str) -> Tuple[bool, Optional[dict]]:
        """
        验证响应格式

        Args:
            response: 小模型返回的原始响应

        Returns:
            (is_valid, parsed_json)
        """
        try:
            # 尝试解析 JSON
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                result = json.loads(json_str)

                # 检查是否包含 is 字段
                if 'is' in result and isinstance(result['is'], bool):
                    return True, result
        except Exception as e:
            print(f"[智能分析] JSON 解析失败: {e}")

        return False, None

    async def analyze(self, messages: List[Dict], speaker_name: str) -> Dict:
        """
        分析对话并判定是否需要启动多模型共话

        Args:
            messages: 对话消息列表
            speaker_name: 主人公姓名

        Returns:
            分析结果 {'is': bool, 'confidence': float, 'reason': str}
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

                print(f"[智能分析] 小模型响应: {response_text[:100]}...")

                # 验证响应
                is_valid, result = self.validate_response(response_text)

                if is_valid and result:
                    is_needed = result['is']
                    reason = "检测到技术讨论，建议启动多模型共话" if is_needed else "普通对话，无需 AI 介入"

                    print(f"[智能分析] 判定结果: {is_needed}")

                    return {
                        'is': is_needed,
                        'confidence': 0.95,
                        'reason': reason,
                        'raw_response': response_text
                    }

            elif model_type == 'local' and MAIN_MODULE_AVAILABLE:
                # 本地模式 - 使用main模块的本地模型
                try:
                    # 创建ASR实例（不启动录音，仅使用本地模型）
                    asr_instance = RealTimeASR_SV()

                    # 检查本地模型是否可用
                    if not asr_instance.local_model or not asr_instance.local_tokenizer:
                        print("[智能分析] 本地模型未加载")
                        return {
                            'is': False,
                            'confidence': 0.0,
                            'reason': '本地模型未加载，请检查Qwen2.5-1.5B-Instruct是否正确安装',
                            'raw_response': ''
                        }

                    # 调用本地模型进行分析
                    result = await asr_instance.analyze_with_local_model(messages, speaker_name)
                    print(f"[智能分析] 本地模型判定结果: {result.get('is')}")

                    return result

                except Exception as e:
                    print(f"[智能分析] 本地模型调用失败: {e}")
                    return {
                        'is': False,
                        'confidence': 0.0,
                        'reason': f'本地模型调用失败: {str(e)}',
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
