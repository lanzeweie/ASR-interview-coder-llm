import os
import time
import wave
import threading
import pyaudio
import webrtcvad
import numpy as np
import librosa
import soundfile as sf
import re
from funasr import AutoModel
from modelscope.pipelines import pipeline

# --- 配置 HuggingFace 国内镜像 (可选) ---
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

class RealTimeASR_SV:
    def __init__(self, on_message_callback=None):
        # --- 参数配置 ---
        self.AUDIO_RATE = 16000
        self.AUDIO_CHANNELS = 1
        self.CHUNK = 1024
        self.VAD_MODE = 3  # 0-3，3最敏感
        self.OUTPUT_DIR = "./output"
        self.VOICEPRINT_DIR = "./voiceprints"
        self.SV_THRESHOLD = 0.35  # 声纹识别阈值
        self.on_message_callback = on_message_callback
        
        # 初始化目录
        os.makedirs(self.OUTPUT_DIR, exist_ok=True)
        os.makedirs(self.VOICEPRINT_DIR, exist_ok=True)

        # --- 加载模型 ---
        print("正在加载 SenseVoice 模型 (ASR)...")
        # 建议使用本地绝对路径，例如: r"G:\Code\ASR\SenseVoiceSmall"
        self.model_asr = AutoModel(
            model="SenseVoiceSmall", 
            trust_remote_code=True,
            device="cuda" 
        )

        print("正在加载 CAM++ 模型 (声纹识别)...")
        # 使用你找到的正确 SV 模型 ID
        self.sv_pipeline = pipeline(
            task='speaker-verification',
            model='speech_campplus_sv_zh-cn_16k-common',
            model_revision='v1.0.0'
        )

        # --- 加载本地智能分析模型 ---
        print("正在加载本地智能分析模型 (Qwen2.5-1.5B-Instruct)...")
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
            import torch

            # 加载本地模型（开发阶段可能需要 --no-asr 参数跳过 ASR）
            model_name = "Qwen/Qwen2.5-1.5B-Instruct"
            self.local_model_name = model_name
            self.local_tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.local_model = AutoModelForCausalLM.from_pretrained(
                model_name,
                torch_dtype=torch.float16,
                device_map="auto"
            )
            self.local_model.eval()
            print("✅ 本地智能分析模型加载成功")
        except ImportError:
            print("⚠️ 未安装 transformers，本地模型功能不可用")
            self.local_tokenizer = None
            self.local_model = None
            self.local_model_name = None
        except Exception as e:
            print(f"⚠️ 本地模型加载失败: {e}")
            self.local_tokenizer = None
            self.local_model = None
            self.local_model_name = None

        # --- 加载声纹库 ---
        self.speakers = {} 
        self.load_voiceprints()

        # --- VAD 初始化 ---
        self.vad = webrtcvad.Vad()
        self.vad.set_mode(self.VAD_MODE)
        
        self.running = True

    def check_and_convert_audio(self, file_path):
        """
        检查音频采样率，如果不是 16000Hz 则自动转换并覆盖保存。
        解决 Windows 下 torchaudio sox_effects 报错问题。
        """
        try:
            # 快速读取元数据
            info = sf.info(file_path)
            if info.samplerate != self.AUDIO_RATE:
                print(f"🔄 检测到采样率不匹配 ({info.samplerate}Hz)，正在转换为 {self.AUDIO_RATE}Hz: {os.path.basename(file_path)}")
                # 加载并重采样
                y, sr = librosa.load(file_path, sr=self.AUDIO_RATE)
                # 覆盖保存
                sf.write(file_path, y, self.AUDIO_RATE)
                print(f"✅ 转换完成: {os.path.basename(file_path)}")
        except Exception as e:
            print(f"⚠️ 音频检查失败: {file_path}, 错误: {e}")

    def load_voiceprints(self):
        """加载 voiceprints 文件夹下的所有 wav 文件"""
        self.speakers = {}
        print(f"正在扫描声纹库: {self.VOICEPRINT_DIR} ...")
        if not os.path.exists(self.VOICEPRINT_DIR):
            return

        for filename in os.listdir(self.VOICEPRINT_DIR):
            if filename.lower().endswith('.wav'):
                path = os.path.join(self.VOICEPRINT_DIR, filename)
                
                # --- 新增步骤：加载前先自动修复音频格式 ---
                self.check_and_convert_audio(path)
                
                name = os.path.splitext(filename)[0]
                self.speakers[name] = path
                print(f"  - 已加载说话人: {name}")
        
        if not self.speakers:
            print("  [警告] 声纹库为空，所有人都将被识别为 '未知用户'")

    def identify_speaker(self, audio_path):
        """将音频与声纹库比对"""
        if not self.speakers:
            return "未知用户 (库空)"

        best_score = -1.0
        best_speaker = "未知用户"

        # 确保录制的临时文件也是 16k (虽然麦克风录制通常设置了，但双保险)
        # self.check_and_convert_audio(audio_path) 

        for name, enroll_path in self.speakers.items():
            try:
                result = self.sv_pipeline([enroll_path, audio_path])
                score = result.get('score', 0)
                
                # print(f"  >>> 比对 {name}: {score:.4f}") 

                if score > best_score:
                    best_score = score
                    best_speaker = name
            except Exception as e:
                print(f"声纹比对出错 ({name}): {e}")

        if best_score >= self.SV_THRESHOLD:
            return f"{best_speaker} (置信度:{best_score:.2f})"
        else:
            return "未知用户"

    def transcribe(self, audio_path):
        """使用 SenseVoice 进行语音转文字"""
        try:
            res = self.model_asr.generate(
                input=audio_path,
                cache={},
                language="auto",
                use_itn=False,
            )
            text = res[0]['text']
            clean_text = text.split(">")[-1].strip()
            return clean_text
        except Exception as e:
            print(f"ASR 出错: {e}")
            return ""

    def process_audio(self, audio_file):
        """处理音频片段"""
        print("-" * 30)
        speaker_info = self.identify_speaker(audio_file)
        text = self.transcribe(audio_file)
        
        # Filter empty or short messages
        if not text:
            return

        # Check for Chinese characters
        is_chinese = bool(re.search(r'[\u4e00-\u9fff]', text))
        
        if is_chinese:
            if len(text) < 4:
                print(f"⚠️ 忽略过短中文: {text}")
                return
        else:
            if len(text) < 2:
                print(f"⚠️ 忽略过短文本: {text}")
                return
        
        current_time = time.strftime("%H:%M:%S", time.localtime())
        print(f"[{current_time}] 🗣️  {speaker_info}: {text}")
        print("-" * 30)

        if self.on_message_callback:
            self.on_message_callback({
                "time": current_time,
                "speaker": speaker_info,
                "text": text
            })

    def run(self):
        """主循环：录音 + VAD 检测"""
        p = pyaudio.PyAudio()
        stream = p.open(format=pyaudio.paInt16,
                        channels=self.AUDIO_CHANNELS,
                        rate=self.AUDIO_RATE,
                        input=True,
                        frames_per_buffer=self.CHUNK)

        print("\n=== 系统已启动，正在监听... (按 Ctrl+C 停止) ===\n")
        
        audio_buffer = []
        is_speaking = False
        silence_counter = 0
        silence_threshold = int(1.0 * self.AUDIO_RATE / self.CHUNK) 

        try:
            while self.running:
                data = stream.read(self.CHUNK, exception_on_overflow=False)
                
                is_active = self.check_vad(data)

                if is_active:
                    if not is_speaking:
                        print("Detected speech...", end="\r")
                        is_speaking = True
                    silence_counter = 0
                    audio_buffer.append(data)
                else:
                    if is_speaking:
                        silence_counter += 1
                        audio_buffer.append(data)
                        
                        if silence_counter > silence_threshold:
                            temp_file = os.path.join(self.OUTPUT_DIR, "temp_speech.wav")
                            self.save_wav(audio_buffer, temp_file)
                            
                            t = threading.Thread(target=self.process_audio, args=(temp_file,))
                            t.start()

                            is_speaking = False
                            silence_counter = 0
                            audio_buffer = []
                            print("Waiting for speech...   ", end="\r")

        except KeyboardInterrupt:
            print("\n停止录制...")
        finally:
            stream.stop_stream()
            stream.close()
            p.terminate()

    def check_vad(self, chunk_data):
        """VAD 检测"""
        step = 480 * 2 
        active_frames = 0
        total_frames = 0
        
        for i in range(0, len(chunk_data) - step, step):
            frame = chunk_data[i:i+step]
            if self.vad.is_speech(frame, self.AUDIO_RATE):
                active_frames += 1
            total_frames += 1
        
        if total_frames == 0: return False
        return (active_frames / total_frames) > 0.3

    def save_wav(self, frames, filename):
        wf = wave.open(filename, 'wb')
        wf.setnchannels(self.AUDIO_CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(self.AUDIO_RATE)
        wf.writeframes(b''.join(frames))
        wf.close()

    async def analyze_with_local_model(self, messages, speaker_name):
        """
        使用本地模型进行智能分析判定

        Args:
            messages: 对话消息列表
            speaker_name: 主人公姓名

        Returns:
            dict: {'is': bool, 'reason': str, 'confidence': float}
        """
        if not self.local_model or not self.local_tokenizer:
            return {
                'is': False,
                'confidence': 0.0,
                'reason': '本地模型未加载',
                'raw_response': ''
            }

        try:
            # 构建分析 Prompt
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

            # 准备输入
            inputs = self.local_tokenizer(prompt, return_tensors="pt").to(self.local_model.device)

            # 生成响应
            with torch.no_grad():
                outputs = self.local_model.generate(
                    **inputs,
                    max_new_tokens=100,
                    temperature=0.1,
                    do_sample=False,
                    pad_token_id=self.local_tokenizer.eos_token_id
                )

            response = self.local_tokenizer.decode(
                outputs[0][inputs['input_ids'].shape[1]:],
                skip_special_tokens=True
            ).strip()

            # 解析响应
            import re
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                try:
                    result = json.loads(json_match.group())
                    if 'is' in result and isinstance(result['is'], bool):
                        reason = "检测到技术讨论，建议启动多模型共话" if result['is'] else "普通对话，无需 AI 介入"
                        return {
                            'is': result['is'],
                            'confidence': 0.95,
                            'reason': reason,
                            'raw_response': response
                        }
                except json.JSONDecodeError:
                    pass

            # 如果解析失败，返回默认值
            return {
                'is': False,
                'confidence': 0.0,
                'reason': '响应格式无效',
                'raw_response': response
            }

        except Exception as e:
            print(f"[本地模型分析] 出错: {e}")
            return {
                'is': False,
                'confidence': 0.0,
                'reason': f'分析失败: {str(e)}',
                'raw_response': ''
            }

if __name__ == "__main__":
    app = RealTimeASR_SV()
    app.run()