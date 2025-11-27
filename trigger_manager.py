"""
触发机制管理器

负责监控字数积累和静音检测，触发智能分析
"""

import time
import asyncio
from typing import List, Dict, Optional, Callable
from dataclasses import dataclass
from intelligent_agent import agent_manager


@dataclass
class TriggerState:
    """触发状态"""
    last_message_time: float = 0.0
    accumulated_text: str = ""
    last_speaker: str = ""
    pending_analysis: bool = False
    silence_start_time: Optional[float] = None


class TriggerManager:
    """触发机制管理器"""

    def __init__(self):
        self.state = TriggerState()
        self.conversation_history: List[Dict] = []
        self.callbacks: List[Callable] = []
        self.min_characters = 10
        self.silence_threshold = 2.0  # 秒
        self.max_history = 50  # 最大历史记录数
        print("[触发机制] 管理器已初始化")

    def set_thresholds(self, min_chars: int, silence_secs: float):
        """设置触发阈值"""
        self.min_characters = min_chars
        self.silence_threshold = silence_secs
        print(f"[触发机制] 阈值已更新: {min_chars}字, {silence_secs}秒静音")

    def add_message(self, message: Dict) -> bool:
        """
        添加新消息到会话历史

        Args:
            message: ASR 消息 {time, speaker, text}

        Returns:
            是否触发了分析
        """
        current_time = time.time()
        text = message.get('text', '').strip()
        speaker = message.get('speaker', '未知用户')

        # 过滤空消息和过短消息
        if not text or len(text) < 4:
            return False

        print(f"[触发机制] 收到消息: {speaker[:20]} - {text[:30]}...")

        # 更新最后消息时间
        self.state.last_message_time = current_time

        # 检查是否为同一说话人
        if speaker == self.state.last_speaker:
            # 同一说话人，累积文本
            self.state.accumulated_text += " " + text
        else:
            # 换人了，检查是否需要分析
            if self.state.accumulated_text:
                self._check_trigger(current_time)

            # 重置累积文本
            self.state.accumulated_text = text
            self.state.last_speaker = speaker

        # 添加到历史
        self.conversation_history.append({
            'role': 'user',
            'content': text,
            'speaker': speaker,
            'timestamp': current_time
        })

        # 限制历史长度
        if len(self.conversation_history) > self.max_history:
            self.conversation_history = self.conversation_history[-self.max_history:]

        # 检查当前累积文本是否达到阈值
        if len(self.state.accumulated_text) >= self.min_characters:
            # 启动静音定时器
            if self.state.silence_start_time is None:
                self.state.silence_start_time = current_time
                print(f"[触发机制] 达到字数阈值 {self.min_characters}，启动静音检测...")

        # 检查是否超时自动触发
        self._check_silence_timeout(current_time)

        return False  # 触发逻辑在 _check_trigger 中处理

    def _check_trigger(self, current_time: float):
        """检查是否需要触发智能分析"""
        # 检查是否有累积文本
        if not self.state.accumulated_text or len(self.state.accumulated_text) < self.min_characters:
            return

        # 检查是否超时
        if self.state.silence_start_time:
            silence_duration = current_time - self.state.silence_start_time
            if silence_duration >= self.silence_threshold:
                print(f"[触发机制] 静音 {silence_duration:.1f}秒，触发智能分析")
                self._trigger_analysis()
        else:
            # 没有启动静音检测，直接触发（如果字数足够）
            if len(self.state.accumulated_text) >= self.min_characters * 2:
                print("[触发机制] 字数充足，触发智能分析")
                self._trigger_analysis()

    def _check_silence_timeout(self, current_time: float):
        """检查静音超时"""
        if self.state.silence_start_time and not self.state.pending_analysis:
            silence_duration = current_time - self.state.silence_start_time
            if silence_duration >= self.silence_threshold * 2:
                print(f"[触发机制] 静音超时 {silence_duration:.1f}秒，强制触发")
                self._trigger_analysis()

    def _trigger_analysis(self):
        """触发智能分析"""
        self.state.pending_analysis = True
        self.state.silence_start_time = None

        # 准备分析上下文
        messages = self.conversation_history[-10:]  # 取最近10条消息
        if messages:
            last_message = messages[-1]
            speaker_name = last_message.get('speaker', '').split(' (')[0]  # 提取说话人姓名

            # 异步执行分析
            asyncio.create_task(self._run_analysis(messages, speaker_name))

    async def _run_analysis(self, messages: List[Dict], speaker_name: str):
        """运行智能分析"""
        try:
            result = await agent_manager.analyze_conversation(messages, speaker_name)

            print(f"[触发机制] 智能分析完成: {result.get('is')}")

            # 触发回调
            for callback in self.callbacks:
                try:
                    await callback(result, messages, speaker_name)
                except Exception as e:
                    print(f"[触发机制] 回调执行失败: {e}")

        except Exception as e:
            print(f"[触发机制] 分析过程出错: {e}")
        finally:
            # 重置累积文本
            self.state.accumulated_text = ""
            self.state.pending_analysis = False

    def add_callback(self, callback: Callable):
        """添加分析完成回调"""
        self.callbacks.append(callback)

    def clear_history(self):
        """清空对话历史"""
        self.conversation_history = []
        self.state = TriggerState()
        print("[触发机制] 已清空对话历史")

    def get_status(self) -> dict:
        """获取当前状态"""
        return {
            'enabled': agent_manager.enabled,
            'accumulated_chars': len(self.state.accumulated_text),
            'threshold': self.min_characters,
            'silence_threshold': self.silence_threshold,
            'last_message_time': self.state.last_message_time,
            'pending_analysis': self.state.pending_analysis,
            'last_speaker': self.state.last_speaker,
            'history_count': len(self.conversation_history)
        }

    def set_enabled(self, enabled: bool):
        """启用/禁用触发机制"""
        agent_manager.enabled = enabled
        if not enabled:
            # 清空累积状态
            self.state = TriggerState()
        print(f"[触发机制] 已{'启用' if enabled else '禁用'}")


# 全局触发管理器实例
trigger_manager = TriggerManager()
