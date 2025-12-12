"""
触发机制管理器

负责监控字数积累和静音检测，触发智能分析
"""

import time
import asyncio
import json
import os
import uuid
from typing import List, Dict, Optional, Callable
from dataclasses import dataclass
from intelligent_agent import agent_manager

# 配置文件路径
CONFIG_FILE = "api_config.json"


def load_config():
    """加载配置文件"""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"configs": [], "current_config": ""}


@dataclass
class TriggerState:
    """触发状态"""
    last_message_time: float = 0.0
    accumulated_text: str = ""
    last_speaker: str = ""
    pending_analysis: bool = False
    silence_start_time: Optional[float] = None
    last_analysis_index: int = -1  # 记录上次分析的消息索引位置
    current_analysis_id: Optional[str] = None  # 当前分析批次ID
    last_analysis_meta: Optional[Dict] = None  # 最近一次分析的元数据


class TriggerManager:
    """触发机制管理器"""

    def __init__(self):
        self.state = TriggerState()
        self.conversation_history: List[Dict] = []
        self.callbacks: List[Callable] = []
        
        # --- 核心触发阈值 (可调优) ---
        self.min_characters = 10         # 最小触发字数：累积多少个字符才开始考虑触发
        self.silence_threshold = 2.0     # 静音检测阈值：说话停顿多少秒才触发
        
        # --- 分析窗口设置 (可调优) ---
        self.max_increment_messages = 15 # 增量分析窗口大小：每次分析最多包含多少条最新消息
                                         # 此参数决定了意图识别能看到多长的最近对话
                                         
        self.event_loop = None           # 保存主event loop引用
        self.protagonist = None          # 主人公姓名
        self.broadcast_callback = None   # 用于发送WebSocket消息的回调
        
        # 启动后台监控任务
        self.monitor_task = None
        self._start_background_monitor()
        print("[触发机制] 管理器已初始化 (含后台轮询)")
    
    def _start_background_monitor(self):
        """启动后台静音检测线程/任务"""
        import threading
        
        def _monitor_loop():
            while True:
                time.sleep(0.5)  # 每0.5秒检查一次
                try:
                    if not agent_manager.enabled:
                        continue
                        
                    current_time = time.time()
                    
                    # 检查是否静音超时
                    if self.state.silence_start_time and not self.state.pending_analysis:
                        silence_duration = current_time - self.state.silence_start_time
                        if silence_duration >= self.silence_threshold:
                            print(f"[触发机制(后台)] 静音超时 {silence_duration:.1f}秒，自动触发分析")
                            
                            # 需要在event loop中执行触发逻辑，确保线程安全（虽然这里主要是状态更新）
                            # 但最好保持一致性。如果直接调用 _trigger_analysis，它会通过 run_coroutine_threadsafe 提交任务，是安全的。
                            self._trigger_analysis()
                            
                except Exception as e:
                    print(f"[触发机制] 后台监控出错: {e}")
                    
        # 使用守护线程运行监控
        self.monitor_thread = threading.Thread(target=_monitor_loop, daemon=True)
        self.monitor_thread.start()

    def set_thresholds(self, min_chars: int, silence_secs: float):
        """设置触发阈值"""
        self.min_characters = min_chars
        self.silence_threshold = silence_secs
        print(f"[触发机制] 阈值已更新: {min_chars}字, {silence_secs}秒静音")

    def set_event_loop(self, loop):
        """设置主event loop引用"""
        self.event_loop = loop
        print("[触发机制] 已设置event loop引用")

    def set_broadcast_callback(self, callback):
        """设置广播回调函数，用于发送WebSocket消息"""
        self.broadcast_callback = callback
        print("[触发机制] 已设置广播回调")

    def set_protagonist(self, name: str):
        """设置主人公姓名"""
        self.protagonist = name
        print(f"[触发机制] 主人公已设置: {name}")

    def add_message(self, message: Dict) -> bool:
        """
        添加新消息到会话历史

        Args:
            message: ASR 消息 {time, speaker, text}

        Returns:
            是否触发了分析
        """
        # 修复：首先检查智能分析是否启用，如果没有启用，直接返回不处理
        if not agent_manager.enabled:
            return False

        current_time = time.time()
        text = message.get('text', '').strip()
        speaker = message.get('speaker', '未知用户')

        # 过滤空消息和过短消息
        if not text or len(text) < 3:
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

        # 检查当前累积文本是否达到阈值
        # 如果没有启动静音检测，且累积文本达到阈值，则启动
        if self.state.silence_start_time is None and len(self.state.accumulated_text) >= self.min_characters:
            self.state.silence_start_time = current_time
            print(f"[触发机制] 达到字数阈值 {self.min_characters}，启动静音检测...")

        # 如果已启动静音检测，检查是否需要立即触发（字数过多）
        if self.state.silence_start_time is not None and not self.state.pending_analysis:
            # 如果累积文本超过阈值的3倍，强制触发（避免累积过长）
            if len(self.state.accumulated_text) >= self.min_characters * 3:
                print(f"[触发机制] 累积文本过长（{len(self.state.accumulated_text)}字），强制触发分析")
                self._trigger_analysis()

        # 检查是否超时自动触发
        self._check_silence_timeout(current_time)

        return False  # 触发逻辑在 _check_trigger 中处理

    def _check_trigger(self, current_time: float):
        """检查是否需要触发智能分析"""
        # 首先检查智能分析是否启用
        if not agent_manager.enabled:
            return

        # 如果正在分析中，跳过触发检查
        if self.state.pending_analysis:
            return

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
        # 首先检查智能分析是否启用
        if not agent_manager.enabled:
            return

        if self.state.silence_start_time and not self.state.pending_analysis:
            silence_duration = current_time - self.state.silence_start_time
            if silence_duration >= self.silence_threshold * 2:
                print(f"[触发机制] 静音超时 {silence_duration:.1f}秒，强制触发")
                self._trigger_analysis()

    def _trigger_analysis(self):
        """触发智能分析"""
        # 首先检查智能分析是否启用
        if not agent_manager.enabled:
            print("[触发机制] ⚠️ 智能分析未启用，重置触发状态")
            # 重置所有状态
            self.state.pending_analysis = False
            self.state.silence_start_time = None
            self.state.accumulated_text = ""
            return

        self.state.pending_analysis = True
        self.state.silence_start_time = None
        analysis_id = str(uuid.uuid4())
        self.state.current_analysis_id = analysis_id

        # 准备分析上下文 - 增量分析：从上次触发位置到现在的消息
        # 计算分析范围：上次分析结束 -> 现在
        start_index = self.state.last_analysis_index + 1
        if start_index < 0:
            start_index = 0

        # 取增量消息，但限制最大条数（避免一次分析太多）
        end_index = min(start_index + self.max_increment_messages, len(self.conversation_history))
        messages = self.conversation_history[start_index:end_index]

        if messages:
            analysis_meta = self._build_analysis_metadata(messages)
            self.state.last_analysis_meta = analysis_meta

            if self.broadcast_callback:
                import time
                try:
                    self.broadcast_callback({
                        "time": time.strftime("%H:%M:%S"),
                        "speaker": "智能分析",
                        "text": f"{analysis_meta.get('analysis_summary', '🤔 智能分析')} · 分析中",
                        "analysis_status": "in_progress",
                        "analysis_need_ai": False,
                        "analysis_id": analysis_id,
                        **analysis_meta
                    })
                except Exception as e:
                    print(f"[触发机制] 发送分析开始消息失败: {e}")

            # 使用配置的主人公，如果没有配置则从消息中提取
            if self.protagonist:
                speaker_name = self.protagonist
                print(f"[触发机制] 📤 使用配置的主人公: {speaker_name}, 增量消息数={len(messages)} [{start_index}-{end_index-1}]/总{len(self.conversation_history)}")
            else:
                last_message = messages[-1]
                speaker_name = last_message.get('speaker', '').split(' (')[0]  # 提取说话人姓名
                print(f"[触发机制] 📤 未配置主人公，使用最后说话人: {speaker_name}, 增量消息数={len(messages)} [{start_index}-{end_index-1}]/总{len(self.conversation_history)}")

            # 异步执行分析 - 使用保存的event loop
            if self.event_loop and self.event_loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self._run_analysis(messages, speaker_name, start_index, analysis_id, analysis_meta),
                    self.event_loop
                )
                print("[触发机制] ✅ 分析任务已提交到主event loop")
            else:
                print("[触发机制] ⚠️ Event loop未设置或未运行，分析任务未启动")
                print("[触发机制] 💡 提示: 请在server启动时调用trigger_manager.set_event_loop(loop)")
                self.state.pending_analysis = False

    async def _run_analysis(
        self,
        messages: List[Dict],
        speaker_name: str,
        start_index: int,
        analysis_id: Optional[str] = None,
        analysis_meta: Optional[Dict] = None
    ):
        """运行智能分析"""
        try:
            print(f"[触发机制] 🤖 开始调用本地模型分析...")

            # 加载配置以检查是否启用意图识别
            config_data = load_config()
            agent_config = config_data.get("agent_config", {})
            intent_recognition_enabled = agent_config.get("intent_recognition_enabled", False)

            # 定义进度回调
            async def progress_callback(stage: str, data: Dict):
                if self.broadcast_callback:
                    import time
                    cur_analysis_id = analysis_id or self.state.current_analysis_id
                    
                    if stage == "intent_started":
                        model = data.get("model", "Unknown")
                        print(f"[触发机制] 📡 发送意图识别开始广播: {model}")
                        try:
                            await self.broadcast_callback({
                                "time": time.strftime("%H:%M:%S"),
                                "speaker": "智能分析",
                                "analysis_id": cur_analysis_id,
                                "analysis_status": "intent_started",
                                "analysis_summary": analysis_meta.get("analysis_summary", "[智能分析]") if analysis_meta else "[智能分析]",
                                "intent_model": model,
                                "text": f"正在进行意图识别..."
                            })
                        except Exception as e:
                            print(f"[触发机制] ❌ 广播失败: {e}")

            # 运行完整的三阶段智能分析
            result = await agent_manager.run_intelligent_analysis(
                messages,
                speaker_name,
                intent_recognition=intent_recognition_enabled,
                status_callback=progress_callback
            )
            result['analysis_id'] = analysis_id or self.state.current_analysis_id
            if analysis_meta:
                result.update(analysis_meta)
            elif self.state.last_analysis_meta:
                result.update(self.state.last_analysis_meta)

            # 从三阶段结果中提取阶段1的结果
            phase1_result = result.get('phase1', {})
            is_needed = phase1_result.get('is', False)
            reason = phase1_result.get('reason', '')
            confidence = phase1_result.get('confidence', 0.0)

            if is_needed:
                print(f"[触发机制] ✅ 智能分析结果: 需要让AI帮助分析 (置信度: {confidence:.0%})")
                print(f"[触发机制] 📋 原因: {reason}")

                # 输出阶段2和阶段3的结果
                phase2_result = result.get('phase2')
                if phase2_result:
                    print(f"[触发机制] 📊 意图识别: {'完成' if phase2_result.get('success') else '跳过'}")
                    if phase2_result.get('success'):
                        print(f"[触发机制] 🎯 核心问题: {phase2_result.get('core_question', '')[:50]}...")

                distribution_result = result.get('distribution', {})
                distribution_mode = distribution_result.get('mode', 'unknown')
                targets = distribution_result.get('targets', [])
                print(f"[触发机制] 🎭 分发模式: {distribution_mode}, 目标数量: {len(targets)}")
            else:
                print(f"[触发机制] ❌ 智能分析结果: 普通对话，无需AI介入")
                print(f"[触发机制] 📋 原因: {reason}")

            # 触发回调
            if self.callbacks:
                print(f"[触发机制] 📢 触发{len(self.callbacks)}个回调函数...")
                for callback in self.callbacks:
                    try:
                        await callback(result, messages, speaker_name)
                    except Exception as e:
                        print(f"[触发机制] ❌ 回调执行失败: {e}")
            else:
                print(f"[触发机制] ⚠️ 没有注册回调函数")

        except Exception as e:
            print(f"[触发机制] ❌ 分析过程出错: {e}")
            import traceback
            traceback.print_exc()
        finally:
            # 更新分析位置：指向这次分析的最后一条消息
            if messages:
                self.state.last_analysis_index = start_index + len(messages) - 1
                print(f"[触发机制] 📍 更新分析位置: {self.state.last_analysis_index} (下次从 {self.state.last_analysis_index + 1} 开始)")

            # 重置累积文本
            self.state.accumulated_text = ""
            self.state.pending_analysis = False
            self.state.current_analysis_id = None
            self.state.last_analysis_meta = None
            print(f"[触发机制] 🔄 已重置触发状态")

    def add_callback(self, callback: Callable):
        """添加分析完成回调"""
        self.callbacks.append(callback)

    def clear_history(self):
        """清空对话历史"""
        self.conversation_history = []
        # 保留配置参数，只重置状态
        old_min_chars = self.min_characters
        old_silence_threshold = self.silence_threshold
        old_protagonist = self.protagonist

        self.state = TriggerState()

        # 恢复配置参数
        self.min_characters = old_min_chars
        self.silence_threshold = old_silence_threshold
        self.protagonist = old_protagonist

        print("[触发机制] 已清空对话历史")

    def reset_analysis_position(self):
        """重置分析位置，下次分析从头开始"""
        self.state.last_analysis_index = -1
        print("[触发机制] 🔄 已重置分析位置，下次将从头分析")

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
            'last_analysis_index': self.state.last_analysis_index,
            'history_count': len(self.conversation_history),
            'next_analysis_start': self.state.last_analysis_index + 1
        }

    def _build_analysis_metadata(self, messages: List[Dict]) -> Dict:
        count = len(messages)
        summary = f"[{count}条]" if count else "[分析触发]"

        preview = ""
        if messages:
            preview = messages[-1].get('content', '').strip()
            if len(preview) > 80:
                preview = preview[:77] + "..."

        return {
            "analysis_summary": summary,
            "analysis_count": count,
            "analysis_preview": preview
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
