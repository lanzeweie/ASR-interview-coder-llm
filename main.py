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

    def extract_embedding(self, audio_path):
        """
        从音频文件中提取声纹嵌入向量
        使用 ModelScope pipeline 的底层接口获取嵌入
        """
        try:
            # 加载音频
            waveform, sample_rate = librosa.load(audio_path, sr=self.AUDIO_RATE)
            # 转换为 numpy 数组
            waveform_np = waveform.astype(np.float32)

            # 使用 pipeline 获取嵌入（如果 pipeline 有 embed 方法）
            # 尝试多种方式获取嵌入
            if hasattr(self.sv_pipeline, 'embeddings'):
                # 如果有 embeddings 属性
                embeddings = self.sv_pipeline.embeddings(waveform_np, sample_rate)
                return embeddings
            elif hasattr(self.sv_pipeline, 'model'):
                # 如果有 model 属性，尝试使用模型直接推理
                import torch
                waveform_tensor = torch.from_numpy(waveform_np).unsqueeze(0)
                if hasattr(self.sv_pipeline.model, 'cpu'):
                    waveform_tensor = waveform_tensor.cpu()
                with torch.no_grad():
                    embedding = self.sv_pipeline.model(waveform_tensor)
                    if isinstance(embedding, tuple):
                        embedding = embedding[0]
                    return embedding.cpu().numpy().flatten()
            else:
                # 备用方案：使用 pipeline 的 generate 方法获取分数，然后提取嵌入
                # 这可能不准确，但作为后备方案
                print(f"⚠️ 无法直接提取嵌入，使用备用方案: {audio_path}")
                # 创建一个很短的参考音频用于比对
                dummy_ref = audio_path  # 使用自己作为参考
                result = self.sv_pipeline([dummy_ref, audio_path])
                # 尝试从结果中提取 embedding 信息
                # 注意：这是后备方案，可能不准确
                return None

        except Exception as e:
            print(f"⚠️ 嵌入提取失败: {e}")
            return None

    def cosine_similarity(self, a, b):
        """计算两个向量的余弦相似度"""
        try:
            # 确保输入是 numpy 数组
            if not isinstance(a, np.ndarray):
                a = np.array(a)
            if not isinstance(b, np.ndarray):
                b = np.array(b)

            # 展平向量
            a = a.flatten()
            b = b.flatten()

            # 计算余弦相似度
            dot_product = np.dot(a, b)
            norm_a = np.linalg.norm(a)
            norm_b = np.linalg.norm(b)

            if norm_a == 0 or norm_b == 0:
                return 0.0

            return dot_product / (norm_a * norm_b)
        except Exception as e:
            print(f"⚠️ 相似度计算失败: {e}")
            return 0.0

    def load_voiceprints(self):
        """加载 voiceprints 文件夹下的所有声纹嵌入数据"""
        self.speakers = {}  # 存储 {name: {'embedding': array, 'path': str}}
        print(f"正在扫描声纹库: {self.VOICEPRINT_DIR} ...")
        if not os.path.exists(self.VOICEPRINT_DIR):
            return

        wav_files = [f for f in os.listdir(self.VOICEPRINT_DIR) if f.lower().endswith('.wav')]
        if not wav_files:
            print("  [警告] 声纹库为空，所有人都将被识别为 '未知用户'")
            return

        for wav_filename in wav_files:
            name = os.path.splitext(wav_filename)[0]
            wav_path = os.path.join(self.VOICEPRINT_DIR, wav_filename)
            npy_path = os.path.join(self.VOICEPRINT_DIR, f"{name}.npy")

            # 检查并转换音频格式
            self.check_and_convert_audio(wav_path)

            # 尝试加载预计算的嵌入
            if os.path.exists(npy_path):
                try:
                    embedding = np.load(npy_path)
                    self.speakers[name] = {
                        'embedding': embedding,
                        'path': wav_path
                    }
                    print(f"  - 已加载声纹: {name} (嵌入数据)")
                    continue
                except Exception as e:
                    print(f"  ⚠️ 加载嵌入失败 {name}: {e}")

            # 如果嵌入文件不存在，则计算并保存
            print(f"  🔄 计算并保存嵌入: {name}")
            try:
                embedding = self.extract_embedding(wav_path)
                if embedding is not None:
                    np.save(npy_path, embedding)
                    self.speakers[name] = {
                        'embedding': embedding,
                        'path': wav_path
                    }
                    print(f"  ✅ 已保存声纹: {name}")
                else:
                    print(f"  ❌ 嵌入提取失败: {name}")
            except Exception as e:
                print(f"  ❌ 处理失败 {name}: {e}")

        if not self.speakers:
            print("  [警告] 声纹库为空，所有人都将被识别为 '未知用户'")

    def identify_speaker(self, audio_path):
        """将音频与声纹库比对 - 使用预计算的嵌入数据"""
        if not self.speakers:
            return "未知用户 (库空)"

        best_score = -1.0
        best_speaker = "未知用户"

        # 提取查询音频的嵌入
        query_embedding = self.extract_embedding(audio_path)
        if query_embedding is None:
            print("⚠️ 无法提取查询音频的嵌入，使用备用方案")
            # 备用方案：回退到原始的 pipeline 比对
            return self._identify_speaker_fallback(audio_path)

        # 与声纹库中的所有嵌入进行对比
        for name, speaker_data in self.speakers.items():
            enroll_embedding = speaker_data['embedding']
            try:
                score = self.cosine_similarity(enroll_embedding, query_embedding)
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

    def _identify_speaker_fallback(self, audio_path):
        """备用比对方案：使用原始的 pipeline 比对"""
        if not self.speakers:
            return "未知用户 (库空)"

        best_score = -1.0
        best_speaker = "未知用户"

        # 使用保存的路径进行比对
        for name, speaker_data in self.speakers.items():
            try:
                enroll_path = speaker_data['path']
                result = self.sv_pipeline([enroll_path, audio_path])
                score = result.get('score', 0)

                if score > best_score:
                    best_score = score
                    best_speaker = name
            except Exception as e:
                print(f"备用比对出错 ({name}): {e}")

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
            if len(text) < 3:
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

if __name__ == "__main__":
    app = RealTimeASR_SV()
    app.run()