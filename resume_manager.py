import os
import json
import asyncio
import PyPDF2
from typing import Optional, Dict
from llm_client import LLMClient
from logger_config import setup_logger

logger = setup_logger(__name__)

class ResumeManager:
    def __init__(self, upload_dir: str = "resumes", llm_client: Optional[LLMClient] = None):
        if not os.path.isabs(upload_dir):
            upload_dir = os.path.abspath(upload_dir)
        self.upload_dir = upload_dir
        self.llm_client = llm_client
        self.resume_Markdown_path = os.path.join(upload_dir, "resume.md")
        self.resume_md_path = os.path.join(upload_dir, "resume.md")
        
        if not os.path.exists(upload_dir):
            os.makedirs(upload_dir)
            
        self.config = {
            "model_type": "api",
            "model_name": "default"
        }
        
        self.processing_status = {
            "state": "idle", 
            "step": "",      
            "message": "",
            "error": None
        }
        self.current_task = None

    def set_llm_client(self, client: LLMClient):
        self.llm_client = client

    def update_config(self, config: Dict):
        """Update resume agent configuration."""
        self.config.update(config)

    def update_status(self, state: str, step: str = "", message: str = "", error: Optional[str] = None):
        self.processing_status = {
            "state": state,
            "step": step,
            "message": message,
            "error": error
        }

    async def stop_processing(self):
        """Stop current processing task."""
        if self.current_task and not self.current_task.done():
            self.current_task.cancel()
            try:
                await self.current_task
            except asyncio.CancelledError:
                pass
            self.update_status("idle", message="Processing stopped by user")

    async def save_pdf(self, file_content: bytes, filename: str) -> str:
        """Save uploaded PDF to disk."""
        file_path = os.path.join(self.upload_dir, filename)
        with open(file_path, "wb") as f:
            f.write(file_content)
        return file_path

    async def extract_text(self, pdf_path: str) -> Optional[str]:
        """Extract text from PDF using PyPDF2."""
        try:
            text = ""
            # Run in executor to avoid blocking
            loop = asyncio.get_event_loop()
            
            def _read_pdf():
                local_text = ""
                with open(pdf_path, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    if reader.is_encrypted:
                        try:
                            reader.decrypt("")
                        except:
                            return None
                    for page in reader.pages:
                        local_text += page.extract_text() + "\n"
                return local_text.strip()

            text = await loop.run_in_executor(None, _read_pdf)
            return text
        except Exception as e:
            logger.error(f"[ResumeManager] PDF 提取错误: {e}")
            return None

    async def process_resume_task(self, pdf_path: str, config_data: Optional[Dict] = None):
        """Background task to process resume."""
        try:
            # 1. Extract Text
            self.update_status("processing", "extracting", "正在识别 PDF 内容...")
            text = await self.extract_text(pdf_path)
            
            if not text:
                self.update_status("error", error="无法提取 PDF 文本或文件已加密")
                return

            # 2. Delete PDF
            try:
                if os.path.exists(pdf_path):
                    os.remove(pdf_path)
                    logger.info(f"[ResumeManager] Deleted PDF: {pdf_path}")
            except Exception as e:
                logger.warning(f"[ResumeManager] 删除 PDF 失败: {e}")

            # 3. Analyze Markdown
            self.update_status("processing", "analyzing_Markdown", "正在生成 AI 分析数据 (Markdown)...")
            Markdown_content = await self.analyze_resume_Markdown(text, config_data)
            
            if Markdown_content:
                self.save_Markdown(Markdown_content)
            else:
                self.update_status("error", error="Markdown 分析失败")
                return

            self.update_status("completed", message="简历分析完成")
        except asyncio.CancelledError:
            self.update_status("idle", message="任务已取消")
            raise
        except Exception as e:
            logger.error(f"[ResumeManager] Process error: {e}")
            self.update_status("error", error=str(e))

    async def analyze_resume_Markdown(self, text: str, config_data: Optional[Dict] = None) -> Optional[str]:
        """Convert resume text to Markdown using LLM."""
        client_to_use = self._get_client(config_data)
        if not client_to_use:
            return None

        prompt = f"""
        # Role: 高密度简历解析器

        ## 核心任务
        读取简历文本，提取核心事实数据。
        输出必须极度精炼、客观，专为下游 Agent 数据索引设计。

        ## 核心原则
        1.  **极简主义**：拒绝大白话。能用词组不用短句，能用短句不用长句。
        2.  **无则隐**：若字段在原文中未提及或无法推断，**直接不输出该行**，严禁臆造或输出 "N/A"，包括大标题子项。
        3.  **纯净中文标题**：标题和内容严禁出现 `中文 (English)` 格式。**不要**对任何词汇（包括标题）进行括号翻译。
        4.  **融合结构**：将“职业经历”与“项目经验”合并，以时间线为轴。
        5.  **原文直出**：技术栈、专有名词（如 Java, AWS）保留原文，不翻译。

        ## 输出结构

        ### 1. 核心全息画像
        *指令：仅提取原文明确存在的内容。用短语或标签形式。*
        * **身份摘要**: [一句话定性]
        * **工作年限**: [数字]
        * **当前状态**: [在职/求职/离职/学生]
        * **所属行业**: [核心领域]
        * **角色定位**: [如：技术负责人]
        * **工作风格**: [如：数据驱动]
        * **兴趣标签**: [如：AI / 开源]
        * **期望职位**: [内容]
        * **期望行业**: [内容]
        * **目标赛道**: [内容]
        * **当前局限**: [仅在原文有迹可循时提取]

        ### 2. 技术锚点
        *指令：仅列出硬技能名词，按熟练度或领域分类。*
        - **[领域/分类]**: [技术1], [技术2]...

        ### 3. 实战履历
        *指令：按时间倒序。项目内嵌于职位中。只留【动作+结果】。*

        #### [时间段] | [公司名] | [职位]
        - **职责**: [关键词极简概括]
        - **产出**: [量化数据] / [核心成果]
        - **关键项目**:
            - **[项目名]**: [一行概括难点与方案]

        ### 4. 教育背景
        *指令：单行显示。*
        - [时间] | [学校] | [专业] | [学历]

        ---
        ## 待处理简历文本
        {text}"""

        system_content = "你是一个精确的简历分析助手。"
        # 思考模式仅作为本地模型的运行参数，不再通过提示词追加
        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": prompt}
        ]

        try:
            response_text = ""
            async for chunk in client_to_use.chat_stream(messages):
                response_text += chunk
            
            clean_text = response_text.replace("```Markdown", "").replace("```", "").strip()
            return clean_text
        except Exception as e:
            logger.error(f"[ResumeManager] LLM Markdown 分析错误: {e}")
            return None

    
    def _is_thinking_mode(self, config_data: Optional[Dict]) -> bool:
        if not config_data:
            return False
        if "resume_config" in config_data and config_data["resume_config"].get("thinking_mode"):
            return True
        return False

    def _get_client(self, config_data: Optional[Dict]) -> Optional[LLMClient]:
        client_to_use = self.llm_client
        
        target_config = {}
        if config_data:
             if "resume_config" in config_data:
                 target_config = config_data["resume_config"]
        
        if not target_config and self.config:
             target_config = self.config

        model_type = target_config.get("model_type", self.config.get("model_type", "api"))
        model_name = target_config.get("model_name", self.config.get("model_name", "default"))
        
        if model_type == "api" and model_name != "default" and config_data:
            model_conf = next((c for c in config_data.get("configs", []) if c["name"] == model_name), None)
            if model_conf:
                try:
                    client_to_use = LLMClient(
                        api_key=model_conf.get("api_key"),
                        base_url=model_conf.get("base_url"),
                        model=model_conf.get("model")
                    )
                except Exception as e:
                    logger.error(f"[ResumeManager] 创建特定客户端失败: {e}")
        return client_to_use

    def save_Markdown(self, Markdown_content: str):
        with open(self.resume_Markdown_path, "w", encoding="utf-8") as f:
            f.write(Markdown_content)

    def save_markdown(self, md_content: str):
        with open(self.resume_md_path, "w", encoding="utf-8") as f:
            f.write(md_content)

    def get_resume_Markdown(self) -> Optional[str]:
        if os.path.exists(self.resume_Markdown_path):
            try:
                with open(self.resume_Markdown_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                logger.error(f"[ResumeManager] 读取 Markdown 错误: {e}")
                return None
        return None

    def get_resume_markdown(self) -> Optional[str]:
        if os.path.exists(self.resume_md_path):
            try:
                with open(self.resume_md_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                print(f"[ResumeManager] 读取 Markdown 错误: {e}")
                return None
        return None

    def get_resume_xml(self) -> Optional[str]:
        """Identity alias for backward compatibility. Returns markdown."""
        return self.get_resume_markdown()

    def get_status(self) -> Dict:
        """Get current resume status."""
        has_Markdown = os.path.exists(self.resume_Markdown_path)
        has_md = os.path.exists(self.resume_md_path)
        
        status = self.processing_status.copy()
        status["has_resume"] = has_Markdown
        status["has_markdown"] = has_md

        if status["state"] == "idle" and has_Markdown:
            status["state"] = "completed"
            
        return status
