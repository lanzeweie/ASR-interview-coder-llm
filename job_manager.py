import os
import json
import asyncio
from typing import Optional, Dict
from llm_client import LLMClient

class JobManager:
    def __init__(self, data_dir: str = "resumes", llm_client: Optional[LLMClient] = None):
        self.data_dir = data_dir
        self.llm_client = llm_client
        self.job_analysis_path = os.path.join(data_dir, "job_analysis.md")
        self.job_metadata_path = os.path.join(data_dir, "job_metadata.json")
        
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
            
        self.config = {
            "model_type": "api",
            "model_name": "default"
        }
        
        self.processing_status = {
            "state": "idle",  # idle, processing, completed, error
            "message": "",
            "error": None
        }
        self.current_task = None

    def set_llm_client(self, client: LLMClient):
        self.llm_client = client

    def update_config(self, config: Dict):
        """Update job agent configuration."""
        self.config.update(config)

    def update_status(self, state: str, message: str = "", error: Optional[str] = None):
        self.processing_status = {
            "state": state,
            "message": message,
            "error": error
        }

    async def get_analysis_content(self) -> Optional[str]:
        if os.path.exists(self.job_analysis_path):
            try:
                with open(self.job_analysis_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                print(f"[JobManager] Error reading analysis: {e}")
                return None
        return None
    
    def get_job_info(self) -> Dict:
        """Get stored job title and basic info."""
        if os.path.exists(self.job_metadata_path):
            try:
                with open(self.job_metadata_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                pass
        return {}

    def clear_analysis(self):
        """Delete generated files."""
        try:
            if os.path.exists(self.job_analysis_path):
                os.remove(self.job_analysis_path)
            if os.path.exists(self.job_metadata_path):
                os.remove(self.job_metadata_path)
            self.update_status("idle", "已清空")
            return True
        except Exception as e:
            print(f"[JobManager] Clear error: {e}")
            return False

    async def generate_analysis(self, job_title: str, job_jd: str = "", config_data: Optional[Dict] = None):
        """Background task to generate job analysis."""
        self.current_task = asyncio.create_task(self._process_generation(job_title, job_jd, config_data))
        return self.current_task

    async def _process_generation(self, job_title: str, job_jd: str, config_data: Optional[Dict]):
        try:
            self.update_status("processing", "正在生成岗位分析...")
            
            # Save metadata first
            with open(self.job_metadata_path, 'w', encoding='utf-8') as f:
                json.dump({"title": job_title, "jd_preview": job_jd[:100] + "..."}, f, ensure_ascii=False)

            client_to_use = self._get_client(config_data)
            if not client_to_use:
                self.update_status("error", error="无可用模型配置")
                return

            prompt = f"""
            System Prompt: Professional Job Analysis Agent (中文版)
            
            你的任务：根据提供的【岗位名称】和【岗位描述(JD)】，生成一份深度的、结构化的岗位分析报告。
            这份报告将被用作后续 AI 助手（智囊团）的全局上下文，帮助它们更好地扮演面试官、求职顾问或技术专家的角色。
            
            ---------------------------------------------------
            【输入信息】
            岗位名称：{job_title}
            岗位 JD：
            {job_jd}
            ---------------------------------------------------
            
            【输出要求】
            1. **格式严格**：必须使用标准的 Markdown 格式。
            2. **语言风格**：专业、客观、精炼。多用行业术语，拒绝废话和通用套话。
            3. **内容深度**：不要简单复述 JD，要学会“扩展”和“推演”。例如，根据 JD 提到的技术栈推测可能遇到的面试题或项目场景。
            4. **结构清晰**：请按照以下大纲生成（可根据实际情况微调，但保持逻辑性）：
               - **# {job_title} - 岗位核心画像**
               - **## 核心职责 (Key Responsibilities)**：提炼 JD 中的核心工作内容。
               - **## 技术栈与能力要求 (Tech Stack & Skills)**：分类列出硬性要求（Hard Skills）和软性要求（Soft Skills）。
               - **## 关键挑战与痛点 (Challenges & Pain Points)**：推测该岗位在实际工作中可能遇到的难点（AI 需基于行业知识进行扩展）。
               - **## 面试考察重点 (Interview Focus)**：预测面试官可能会重点考察的领域（如并发处理、系统设计、特定框架源码等）。
               - **## 职位发展潜力 (Career Path)**：该岗位在行业中的定位及未来发展方向。
            
            5. **重要**：只输出 Markdown 内容，不要包含 "好的，这是由于..." 等客套话。
            """

            system_content = "你是一个专业的岗位分析专家，只输出 Markdown 格式的分析报告。"
            
            # Inject Thinking Mode instruction if enabled
            if self._is_thinking_mode(config_data):
                system_content += "\n\n[Thinking Mode]\nPlease engage in deep thinking and reasoning before providing your final answer. Structure your thought process within <think>...</think> tags if possible, or just elaborate on your reasoning."

            messages = [
                {"role": "system", "content": system_content},
                {"role": "user", "content": prompt}
            ]

            response_text = ""
            async for chunk in client_to_use.chat_stream(messages):
                response_text += chunk
            
            # Save result
            with open(self.job_analysis_path, "w", encoding="utf-8") as f:
                f.write(response_text)
                
            self.update_status("completed", "生成完成")

        except Exception as e:
            print(f"[JobManager] Generation error: {e}")
            self.update_status("error", error=str(e))

    def _get_client(self, config_data: Optional[Dict]) -> Optional[LLMClient]:
        client_to_use = self.llm_client
        
        # Check config source: passed config_data (transient) or self.config (stored)
        # Note: server.py passes config_data with "job_config" merged if from API
        
        target_config = {}
        # 1. Try config_data
        if config_data:
             if "job_config" in config_data:
                 target_config = config_data["job_config"]
             elif "resume_config" in config_data: # Fallback or shared
                 pass
        
        # 2. Fallback to self.config if empty (though generate_analysis updates self.config usually? No, it uses passed config)
        if not target_config and self.config:
             target_config = self.config

        # Check model type
        model_type = target_config.get("model_type", self.config.get("model_type", "api"))
        model_name = target_config.get("model_name", self.config.get("model_name", "default"))

        if model_type == "api" and model_name != "default" and config_data:
             # Try to find config in loaded configs
             model_conf = next((c for c in config_data.get("configs", []) if c["name"] == model_name), None)
             if model_conf:
                 try:
                     client_to_use = LLMClient(
                         api_key=model_conf.get("api_key"),
                         base_url=model_conf.get("base_url"),
                         model=model_conf.get("model")
                     )
                 except Exception as e:
                     print(f"[JobManager] Failed to create specific client: {e}")
        
        return client_to_use

    def _is_thinking_mode(self, config_data: Optional[Dict]) -> bool:
        """Check if thinking mode is enabled in config."""
        if not config_data:
            return False
        
        # Check job_config
        if "job_config" in config_data and config_data["job_config"].get("thinking_mode"):
            return True
        
        return False
