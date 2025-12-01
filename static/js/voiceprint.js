/* ========================================
   声纹管理功能
   ======================================== */

import { dom, domUtils } from './dom.js';
import { showToast, convertToWav, formatTime, formatDuration } from './utils.js';

// ===== 声纹管理类 =====
export class VoiceprintManager {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordingStartTime = 0;
        this.recordingTimer = null;
        this.currentRecordingBlob = null;
        this.isRecordingActive = false; // 标记录音是否处于活动状态
        
        // 音量波浪显示相关
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.visualizerTimer = null;
    }

    // 打开声纹管理模态框
    openVoiceprintModal() {
        if (dom.voiceprintModal) {
            dom.voiceprintModal.classList.add('active');
        }
        this.loadVoiceprintList();
        this.resetRecordingState();
    }

    // 关闭声纹管理模态框
    closeVoiceprintModal() {
        if (dom.voiceprintModal) {
            dom.voiceprintModal.classList.remove('active');
        }
        
        // 只停止录音，不计算时长（避免重复显示Toast）
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        this.pauseAudioVisualization();
        
        if (dom.stopRecordBtn) {
            dom.stopRecordBtn.style.display = 'none';
        }
        
        this.resetRecordingState();
    }

    // 重置录音状态
    resetRecordingState() {
        if (dom.startRecordBtn) dom.startRecordBtn.style.display = 'inline-flex';
        if (dom.stopRecordBtn) dom.stopRecordBtn.style.display = 'none';
        if (dom.saveRecordBtn) dom.saveRecordBtn.style.display = 'none';
        if (dom.discardRecordBtn) dom.discardRecordBtn.style.display = 'none';
        if (dom.recordingStatus) dom.recordingStatus.style.display = 'none';
        if (dom.audioPreview) dom.audioPreview.style.display = 'none';
        if (dom.progressFill) dom.progressFill.style.width = '0%';
        
        this.currentRecordingBlob = null;
        
        // 重置录音开始时间和状态标志
        this.recordingStartTime = 0;
        this.isRecordingActive = false;
        
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
        
        // 隐藏朗读提示
        const promptEl = document.getElementById('recording-prompt');
        if (promptEl) {
            promptEl.style.display = 'none';
        }
    }

    // 开始录音
    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                }
            });

            this.recordedChunks = [];
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                this.currentRecordingBlob = blob;

                // 显示音频预览
                const audioUrl = URL.createObjectURL(blob);
                if (dom.audioPlayer) {
                    dom.audioPlayer.src = audioUrl;
                }
                if (dom.audioPreview) {
                    dom.audioPreview.style.display = 'block';
                }

                // 隐藏朗读提示和音量波浪（录音完成后）
                const promptEl = document.getElementById('recording-prompt');
                if (promptEl) {
                    promptEl.style.display = 'none';
                }
                this.stopAudioVisualization();

                showToast('录音完成，请检查预览后保存', 'success');
            };

            this.mediaRecorder.start();
            this.recordingStartTime = Date.now();
            this.isRecordingActive = true; // 标记录音开始
            
            if (dom.recordingStatus) dom.recordingStatus.style.display = 'block';
            if (dom.startRecordBtn) dom.startRecordBtn.style.display = 'none';
            if (dom.stopRecordBtn) dom.stopRecordBtn.style.display = 'inline-flex';
            if (dom.saveRecordBtn) dom.saveRecordBtn.style.display = 'none';
            if (dom.discardRecordBtn) dom.discardRecordBtn.style.display = 'inline-flex';

            // 显示朗读提示（集成在recording-status中）
            const promptEl = document.getElementById('recording-prompt');
            if (promptEl) {
                promptEl.style.display = 'flex';
            }

            // 启动音量波浪显示
            this.startAudioVisualization(stream);

            // 启动计时器
            this.recordingTimer = setInterval(() => this.updateRecordingTimer(), 100);

            showToast('开始录音，请清晰说话', 'info');

        } catch (error) {
            console.error('录音失败:', error);
            showToast('无法访问麦克风，请检查权限设置', 'error');
        }
    }

    // 停止录音
    stopRecording() {
        // 检查是否真正处于录音状态
        if (!this.isRecordingActive) {
            console.log('[录音] 录音已停止或未开始，无需重复处理');
            return;
        }

        // 清除计时器（优先执行）
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }

        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();

            // 停止所有音频轨道
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }

        if (dom.stopRecordBtn) {
            dom.stopRecordBtn.style.display = 'none';
        }

        // 暂停音量波浪显示（保持显示但不更新）
        this.pauseAudioVisualization();

        // 检查时长，如果 >= 10秒才显示保存按钮
        const elapsed = (Date.now() - this.recordingStartTime) / 1000;
        if (elapsed >= 10) {
            if (dom.saveRecordBtn) dom.saveRecordBtn.style.display = 'inline-flex';
            if (dom.discardRecordBtn) dom.discardRecordBtn.style.display = 'inline-flex';
            showToast(`录音完成，时长：${elapsed.toFixed(1)}秒`, 'success');
        } else {
            // 时间太短，丢弃录音
            showToast(`录制时长太短（${elapsed.toFixed(1)}秒），至少需要 10 秒`, 'error');
            this.discardRecording();
        }

        // 标记录音已停止
        this.isRecordingActive = false;
    }

    // 更新录音计时器
    updateRecordingTimer() {
        // 只有在录音活动时才更新时间显示
        if (!this.isRecordingActive) {
            return;
        }

        const elapsed = (Date.now() - this.recordingStartTime) / 1000;
        
        if (dom.recordingDuration) {
            dom.recordingDuration.textContent = elapsed.toFixed(1);
        }

        // 更新进度条 (0-40秒)
        const maxDuration = 40;
        const progress = Math.min((elapsed / maxDuration) * 100, 100);
        
        if (dom.progressFill) {
            dom.progressFill.style.width = `${progress}%`;
        }

        // 40秒后自动停止
        if (elapsed >= maxDuration) {
            // 强制停止录音，但 **不** 显示保存按钮
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }

            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }

            // 只隐藏停止按钮，不显示保存按钮
            if (dom.stopRecordBtn) {
                dom.stopRecordBtn.style.display = 'none';
            }

            showToast('已达到最大录制时长（40秒），请手动停止录音', 'warning');

            // 标记录音已停止
            this.isRecordingActive = false;
        }
    }

    // 保存声纹
    async saveVoiceprint() {
        if (!this.currentRecordingBlob) {
            showToast('没有录音数据，请先录音', 'error');
            return;
        }

        // 检查录制时长
        const elapsed = (Date.now() - this.recordingStartTime) / 1000;
        if (elapsed < 10) {
            showToast(`录制时长不足（${elapsed.toFixed(1)}秒），至少需要 10 秒`, 'error');
            return;
        }

        if (elapsed > 40) {
            showToast(`录制时长超过限制（${elapsed.toFixed(1)}秒），最多 40 秒`, 'error');
            return;
        }

        // 通过弹窗提示用户输入姓名
        const speakerName = prompt('请输入说话人姓名：');
        if (!speakerName || !speakerName.trim()) {
            showToast('未输入姓名，声纹保存已取消', 'info');
            return;
        }

        try {
            // 转换为 WAV 格式
            const wavBlob = await convertToWav(this.currentRecordingBlob);

            // 转换为 base64
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Audio = reader.result;

                try {
                    const response = await fetch('/api/voiceprints', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: speakerName,
                            audio_data: base64Audio
                        })
                    });

                    const result = await response.json();

                    if (response.ok) {
                        showToast(`声纹保存成功: ${speakerName}`, 'success');
                        this.loadVoiceprintList();
                        this.resetRecordingState();
                    } else {
                        showToast(`保存失败: ${result.detail}`, 'error');
                    }
                } catch (error) {
                    console.error('保存声纹失败:', error);
                    showToast('保存声纹失败，请重试', 'error');
                }
            };
            reader.readAsDataURL(wavBlob);

        } catch (error) {
            console.error('转换音频失败:', error);
            showToast('音频转换失败', 'error');
        }
    }

    // 丢弃录音
    discardRecording() {
        this.stopAudioVisualization();
        this.resetRecordingState();
        showToast('录音已丢弃', 'info');
    }

    // ===== 音量波浪显示功能 =====

    // 启动音量波浪显示
    startAudioVisualization(stream) {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);

            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);

            const visualizer = document.getElementById('recording-pulse');
            if (visualizer) {
                visualizer.classList.add('active');
                visualizer.classList.remove('paused');
            }

            this.animateBars();
        } catch (error) {
            console.error('音量波浪启动失败:', error);
        }
    }

    // 停止音量波浪显示
    stopAudioVisualization() {
        if (this.visualizerTimer) {
            clearInterval(this.visualizerTimer);
            this.visualizerTimer = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.analyser = null;
        this.dataArray = null;

        const visualizer = document.getElementById('recording-pulse');
        if (visualizer) {
            visualizer.classList.remove('active');
            visualizer.classList.add('paused');
        }
    }

    // 暂停音量波浪显示（用于停止录音但未保存时）
    pauseAudioVisualization() {
        const visualizer = document.getElementById('recording-pulse');
        if (visualizer) {
            visualizer.classList.add('paused');
        }
    }

    // 动画循环 - 更新音量条并添加流动效果
    animateBars() {
        if (!this.analyser || !this.dataArray) return;

        this.analyser.getByteFrequencyData(this.dataArray);
        const bars = document.querySelectorAll('.audio-level-bar');
        const visualizer = document.getElementById('recording-pulse');

        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / this.dataArray.length;

        const maxHeight = 20;  /* 减小高度，更优雅 */
        const minHeight = 3;   /* 减小最小高度 */

        const barCount = bars.length;
        for (let i = 0; i < barCount; i++) {
            const bar = bars[i];
            const index = Math.floor((i / barCount) * this.dataArray.length);
            const barVolume = (this.dataArray[index] / 255) * (maxHeight - minHeight) + minHeight;
            const height = Math.min(barVolume, maxHeight);

            bar.style.height = `${height}px`;

            // 使用与进度条一致的颜色主题
            const intensity = height / maxHeight;
            if (intensity > 0.7) {
                bar.style.backgroundColor = '#0d6efd'; /* 高音量 - 深蓝色（主色调） */
                bar.style.boxShadow = '0 0 4px rgba(13, 110, 253, 0.6)'; /* 添加发光效果 */
            } else if (intensity > 0.4) {
                bar.style.backgroundColor = '#6c757d'; /* 中音量 - 灰色 */
                bar.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
            } else {
                bar.style.backgroundColor = 'var(--accent-secondary)'; /* 低音量 - 默认次要色 */
                bar.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
            }

            // 添加流动效果 - 每个条有微妙的延迟动画
            bar.style.animation = `wave-flow 2s ease-in-out ${i * 0.05}s infinite alternate`;
        }

        // 只有在激活状态时才继续动画
        if (visualizer && visualizer.classList.contains('active')) {
            this.visualizerTimer = requestAnimationFrame(() => this.animateBars());
        }
    }

    // ===== 主人公管理 =====

    // 获取当前主人公
    async loadProtagonist() {
        try {
            const response = await fetch('/api/protagonist');
            if (response.ok) {
                const data = await response.json();
                return data.protagonist || '';
            }
        } catch (error) {
            console.error('获取主人公失败:', error);
        }
        return '';
    }

    // 设置主人公
    async setProtagonist(name) {
        try {
            const response = await fetch('/api/protagonist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ protagonist: name })
            });

            if (response.ok) {
                showToast(`已设置主人公: ${name}`, 'success');
                await this.loadVoiceprintList(); // 刷新列表以更新高亮
            } else {
                showToast('设置失败', 'error');
            }
        } catch (error) {
            console.error('设置主人公失败:', error);
            showToast('设置失败', 'error');
        }
    }

    // 加载声纹列表
    async loadVoiceprintList() {
        try {
            const response = await fetch('/api/voiceprints');
            const data = await response.json();
            this.renderVoiceprintList(data.voiceprints || []);
            this.checkProtagonistPrompt(data.voiceprints || []);
        } catch (error) {
            console.error('加载声纹列表失败:', error);
            showToast('加载声纹列表失败', 'error');
        }
    }

    // 检查是否需要显示主人公提示
    async checkProtagonistPrompt(voiceprints) {
        const promptEl = document.getElementById('protagonist-prompt');
        const setBtn = document.getElementById('set-protagonist-btn');

        if (!promptEl) return;

        // 如果有声纹数据
        if (voiceprints.length > 0) {
            // 获取当前主人公
            const protagonist = await this.loadProtagonist();

            // 如果没有设置主人公，显示提示
            if (!protagonist) {
                promptEl.style.display = 'flex';
                // 点击设置按钮时，选择第一个声纹设为主人公
                if (setBtn) {
                    setBtn.onclick = async () => {
                        if (voiceprints.length > 0) {
                            await this.setProtagonist(voiceprints[0].name);
                            promptEl.style.display = 'none';
                        }
                    };
                }
            } else {
                promptEl.style.display = 'none';
            }
        } else {
            promptEl.style.display = 'none';
        }
    }

    // 更新播放按钮图标
    updatePlayButton(btn, isPlaying) {
        if (!btn) return;
        if (isPlaying) {
            // 显示暂停图标
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 3H6V13H4V3ZM10 3H12V13H10V3Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            `;
            btn.title = "暂停";
        } else {
            // 显示播放图标
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 2L13 8L3 14V2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                </svg>
            `;
            btn.title = "播放";
        }
    }

    // 重置所有播放按钮
    resetAllPlayButtons() {
        const btns = document.querySelectorAll('.play-btn');
        btns.forEach(btn => this.updatePlayButton(btn, false));
    }

    // 渲染声纹列表
    async renderVoiceprintList(voiceprints) {
        if (!dom.voiceprintList) return;
        
        dom.voiceprintList.innerHTML = '';

        if (voiceprints.length === 0) {
            dom.voiceprintList.innerHTML = '<div class="empty-message">暂无声纹数据</div>';
            return;
        }

        // 获取当前主人公
        const currentProtagonist = await this.loadProtagonist();

        voiceprints.forEach(vp => {
            const item = document.createElement('div');
            item.className = 'voiceprint-item';

            // 如果是主人公，添加特殊class
            if (vp.name === currentProtagonist) {
                item.classList.add('is-protagonist');
            }

            const duration = vp.duration ? `${vp.duration}秒` : '未知';
            const createdDate = formatTime(vp.created_time);

            item.innerHTML = `
                <div class="voiceprint-info">
                    <div class="voiceprint-name">${vp.name}</div>
                    <div class="voiceprint-meta">
                        <span class="meta-item">时长: ${duration}</span>
                        <span class="meta-item">嵌入: ${vp.has_embedding ? '✓' : '✗'}</span>
                        <span class="meta-item">大小: ${(vp.wav_size / 1024).toFixed(1)}KB</span>
                    </div>
                    <div class="voiceprint-date">${createdDate}</div>
                </div>
                <div class="voiceprint-actions">
                    <button class="protagonist-btn" title="设为主人公">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 2L10 6L14 6.5L11 10L12 14L8 12L4 14L5 10L2 6.5L6 6L8 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button class="play-btn" title="播放" data-name="${vp.name}">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M3 2L13 8L3 14V2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button class="delete-btn" title="删除">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M4 4H12M6 4V2H10V4M3 4V14H13V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            `;

            // 绑定设为主人公事件
            const protagonistBtn = item.querySelector('.protagonist-btn');
            protagonistBtn.onclick = async () => {
                await this.setProtagonist(vp.name);
            };

            // 绑定播放事件
            const playBtn = item.querySelector('.play-btn');
            playBtn.onclick = () => {
                const audioUrl = `/api/voiceprint/audio/${vp.name}`;

                // 检查是否是当前正在播放的音频
                if (dom.audioPlayer && (dom.audioPlayer.src.includes(encodeURIComponent(vp.name)) || dom.audioPlayer.src.endsWith(audioUrl))) {
                    if (dom.audioPlayer.paused) {
                        dom.audioPlayer.play();
                        this.updatePlayButton(playBtn, true);
                    } else {
                        dom.audioPlayer.pause();
                        this.updatePlayButton(playBtn, false);
                    }
                } else {
                    // 播放新的音频
                    this.resetAllPlayButtons();
                    if (dom.audioPlayer) {
                        dom.audioPlayer.src = audioUrl;
                        dom.audioPlayer.play();
                    }
                    this.updatePlayButton(playBtn, true);
                }
            };

            // 绑定删除事件
            const deleteBtn = item.querySelector('.delete-btn');
            deleteBtn.onclick = async () => {
                if (confirm(`确定删除声纹 "${vp.name}" 吗？`)) {
                    await this.deleteVoiceprint(vp.name);
                }
            };

            dom.voiceprintList.appendChild(item);
        });
    }

    // 删除声纹
    async deleteVoiceprint(name) {
        try {
            const response = await fetch(`/api/voiceprints/${encodeURIComponent(name)}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok) {
                showToast(`声纹已删除: ${name}`, 'success');
                this.loadVoiceprintList();
            } else {
                showToast(`删除失败: ${result.detail}`, 'error');
            }
        } catch (error) {
            console.error('删除声纹失败:', error);
            showToast('删除声纹失败，请重试', 'error');
        }
    }

    // 重建声纹嵌入
    async rebuildVoiceprints() {
        try {
            const response = await fetch('/api/voiceprints/rebuild', {
                method: 'POST'
            });

            const result = await response.json();

            if (response.ok) {
                showToast(result.message, 'success');
                this.loadVoiceprintList();
            } else {
                showToast(`重建失败: ${result.detail}`, 'error');
            }
        } catch (error) {
            console.error('重建声纹失败:', error);
            showToast('重建声纹失败，请重试', 'error');
        }
    }

    // 初始化音频播放器事件监听
    initAudioPlayerEvents() {
        if (!dom.audioPlayer) return;

        // 监听音频播放结束
        dom.audioPlayer.addEventListener('ended', () => {
            this.resetAllPlayButtons();
        });

        // 监听音频暂停
        dom.audioPlayer.addEventListener('pause', () => {
            const currentSrc = dom.audioPlayer.src;
            if (currentSrc) {
                const btns = document.querySelectorAll('.play-btn');
                btns.forEach(btn => {
                    const name = btn.getAttribute('data-name');
                    // 检查 URL 是否匹配（处理编码问题）
                    if (name && (currentSrc.includes(encodeURIComponent(name)) || currentSrc.endsWith(name))) {
                        this.updatePlayButton(btn, false);
                    }
                });
            }
        });

        // 监听音频播放
        dom.audioPlayer.addEventListener('play', () => {
            const currentSrc = dom.audioPlayer.src;
            if (currentSrc) {
                const btns = document.querySelectorAll('.play-btn');
                btns.forEach(btn => {
                    const name = btn.getAttribute('data-name');
                    if (name && (currentSrc.includes(encodeURIComponent(name)) || currentSrc.endsWith(name))) {
                        this.updatePlayButton(btn, true);
                    }
                });
            }
        });
    }
}