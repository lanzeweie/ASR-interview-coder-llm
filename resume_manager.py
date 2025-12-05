import os
import json
import asyncio
import PyPDF2
from typing import Optional, Dict
from llm_client import LLMClient

class ResumeManager:
    def __init__(self, upload_dir: str = "resumes", llm_client: Optional[LLMClient] = None):
        self.upload_dir = upload_dir
        self.llm_client = llm_client
        self.resume_xml_path = os.path.join(upload_dir, "resume.xml")
        self.resume_md_path = os.path.join(upload_dir, "resume.md")
        
        if not os.path.exists(upload_dir):
            os.makedirs(upload_dir)
            
        self.config = {
            "model_type": "api",
            "model_name": "default"
        }
        
        self.processing_status = {
            "state": "idle",  # idle, processing, completed, error
            "step": "",       # extracting, analyzing_xml, analyzing_markdown
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
            print(f"[ResumeManager] PDF extraction error: {e}")
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
                    print(f"[ResumeManager] Deleted PDF: {pdf_path}")
            except Exception as e:
                print(f"[ResumeManager] Failed to delete PDF: {e}")

            # 3. Analyze XML
            self.update_status("processing", "analyzing_xml", "正在生成 AI 分析数据 (XML)...")
            xml_content = await self.analyze_resume_xml(text, config_data)
            
            if xml_content:
                self.save_xml(xml_content)
            else:
                self.update_status("error", error="XML 分析失败")
                return

            # 4. Analyze Markdown (using XML)
            self.update_status("processing", "analyzing_markdown", "正在生成用户预览报告 (Markdown)...")
            # Use the generated XML as input for Markdown generation
            md_content = await self.analyze_resume_markdown(xml_content, config_data)
            
            if md_content:
                self.save_markdown(md_content)
            
            self.update_status("completed", message="简历分析完成")

        except asyncio.CancelledError:
            self.update_status("idle", message="任务已取消")
            raise
        except Exception as e:
            print(f"[ResumeManager] Process error: {e}")
            self.update_status("error", error=str(e))

    async def analyze_resume_xml(self, text: str, config_data: Optional[Dict] = None) -> Optional[str]:
        """Convert resume text to XML using LLM."""
        client_to_use = self._get_client(config_data)
        if not client_to_use:
            return None

        prompt = f"""
        System Prompt: Candidate Resume Parsing & Profile Builder Agent 你的任务：从用户提供的文本 {text} 中抽取可供面试系统长期调用的“候选人核心画像数据”， 构建 AI 可直接使用、可索引、可推理的结构化 XML。 【原则要求】 1. 严禁推测、补全或捏造未出现在 {text} 的信息。 2. 所有技术类词汇必须保持原文，不得改写或归纳成其他表达。 3. 输出必须为结构化 XML，严格遵守字段，便于其他 Agents 消费。 4. 内容必须面向 AI，可用于：面试问答生成、能力匹配、项目追问、经验推理等。 5. 输出不得包含 XML 以外的自然语言。 --------------------------------------------------- 【XML 输出结构定义】 <root> <!-- ① 候选人基础画像（面试系统最常用） --> <basic_info> <identity_summary></identity_summary> <!-- 候选人是谁（基于工作背景） --> <work_years></work_years> <!-- 明确工作年限 --> <current_status></current_status> <!-- 在职、求职、学生 --> <primary_industry></primary_industry> <role_positioning></role_positioning> <!-- 在行业中扮演的典型角色 --> <work_style></work_style> <!-- 简历体现的性格、风格、习惯 --> <interest_tags></interest_tags> <!-- 如 AI、自动化、架构、数据、产品 --> </basic_info> <!-- ② 职业目标（便于面试官提问） --> <career_target> <desired_role></desired_role> <desired_industry></desired_industry> <upskilling_focus></upskilling_focus> <career_motivation></career_motivation> </career_target> <!-- ③ 核心技能（用于能力判断与面试提问） --> <core_skills> <skill></skill> <skill></skill> <skill></skill> <skill></skill> <skill></skill> </core_skills> <!-- ④ 工作经历（压缩后的结构化版本） --> <experience_summary> <experience> <company></company> <position></position> <scope_summary></scope_summary> <!-- 职责定位：一句话说明候选人负责什么 --> <achievements> <achievement></achievement> <!-- 关键成果，尽量可量化 --> <achievement></achievement> </achievements> </experience> </experience_summary> <!-- ⑤ 项目（面试追问的主要来源） --> <projects> <project> <project_goal></project_goal> <candidate_role></candidate_role> <project_impact></project_impact> <!-- 最关键的影响或成果 --> </project> </projects> <!-- ⑥ 技术栈原文数据（供技术面直接索引） --> <tech_stack_raw> <programming_languages></programming_languages> <frameworks></frameworks> <databases></databases> <cloud_devops></cloud_devops> <tools></tools> <others></others> </tech_stack_raw> <!-- ⑦ 成长与发展方向（用于职业动机/潜力判断） --> <growth_plan> <skills_to_improve></skills_to_improve> <target_tracks></target_tracks> <current_limitations></current_limitations> </growth_plan> </root> --------------------------------------------------- 【解析流程】 1. 基于 {text} 逐段解析，不推测不补全。 2. 抽取与面试任务相关的所有事实性信息。 3. 用 AI 友好的语言进行概括（但不得脱离文本事实）。 4. 所有信息写入 XML 对应字段。缺失字段留空。 5. 最终输出仅包含 XML。
        """

        messages = [
            {"role": "system", "content": "你是一个精确的简历分析助手，只输出 XML。"},
            {"role": "user", "content": prompt}
        ]

        try:
            response_text = ""
            async for chunk in client_to_use.chat_stream(messages):
                response_text += chunk
            
            clean_text = response_text.replace("```xml", "").replace("```", "").strip()
            return clean_text
        except Exception as e:
            print(f"[ResumeManager] LLM XML analysis error: {e}")
            return None

    async def analyze_resume_markdown(self, xml_content: str, config_data: Optional[Dict] = None) -> Optional[str]:
        """Convert resume XML to Markdown summary using LLM."""
        client_to_use = self._get_client(config_data)
        if not client_to_use:
            return None

        prompt = f"""
        System Prompt: Candidate Resume Parsing & Human-readable Profile Builder Agent（中文版）

        你的任务：基于以下结构化的 XML 简历数据，生成**适合人类阅读的中文 Markdown 候选人画像**。

        XML 数据：
        {xml_content}

        该画像主要面向：面试官 / HR / 招聘方，用于快速了解候选人背景、能力与发展方向。

        ---------------------------------------------------
        【核心原则】

        1. 严禁推测、补全或捏造未出现在 XML 中的任何信息。
        2. 所有技术类词汇（如编程语言、框架、工具、数据库、云服务等）必须保持原文，不得改写或替换为近义词。
        3. 输出仅允许使用 **Markdown 结构化内容**，不得在 Markdown 之外增加解释性自然语言。
        4. 内容虽然是给人类看的，但必须完全基于 XML 数据，可以做轻度概括与整理，但不能脱离或超出文本事实。
        5. 所有你不确定、或 XML 中没有明确提到的信息，一律留空对应字段，不要自行猜测。
        6. 如果某项信息在 XML 中不存在，保留字段及标题，但内容留空。
        7. 输出语言统一为**简体中文**。

        ---------------------------------------------------
        【Markdown 输出结构定义】

        你必须严格按照以下 Markdown 结构输出（标题 & 字段名保持不变）：

        # 候选人画像

        ## 一、基本信息
        - **姓名：**  
        - **工作年限：**  
        - **当前状态：**（在职/离职/求职/学生等，仅从 XML 中提取）  
        - **所在行业：**  
        - **职业定位：**  
        - **工作风格：**  
        - **兴趣方向：**  

        ---

        ## 二、职业目标
        - **期望职位：**  
        - **期望行业：**  
        - **技能提升方向：**  
        - **职业动机：**  

        ---

        ## 三、核心技能
        - **专业技能亮点：**
        - 
        - 
        - 
        - 
        - 

        ---

        ## 四、工作经历概览
        ### 工作经历 1
        - **公司名称：**  
        - **担任职位：**  
        - **职责概述：**  <!-- 用一句话概括主要负责的方向或范围，必须来源于 XML -->
        - **关键成果：**
        -  
        -  

        <!-- 如 XML 中有多段工作经历，可在需要时增加「工作经历 2」「工作经历 3」，结构相同 -->

        ---

        ## 五、代表项目
        ### 项目 1
        - **项目目标：**  
        - **个人角色：**  
        - **项目成果 / 影响：**  

        <!-- 如 XML 中有多个项目，可在需要时增加「项目 2」「项目 3」，结构相同 -->

        ---

        ## 六、技术栈（原文保留）
        - **编程语言：**  
        - **框架 / 平台：**  
        - **数据库：**  
        - **云 / DevOps：**  
        - **工具：**  
        - **其他：**  

        ---

        ## 七、成长与发展方向
        - **需要提升的技能：**  
        - **未来发展路径：**  
        - **当前限制与挑战：**  

        ---------------------------------------------------
        【解析与生成流程】

        1. 阅读 XML 数据，提取与候选人背景、技能、项目、职业目标、成长方向相关的所有事实性信息。
        2. 将同一类信息进行整理、归组，填入对应的 Markdown 区块与字段中。
        3. 对于「职责概述」「关键成果」「项目成果 / 影响」等，可将原文多句信息压缩成一两句中文描述，但不得加入 XML 中没有的结论。
        4. 技术栈中的内容必须保持原文术语，不做翻译、不做改写、不做合并抽象。
        5. 缺失信息字段不可删除，保留字段名，内容留空。
        6. 最终回复中 **只能输出上述结构的 Markdown 内容**，不得添加任何额外说明或解释。

        """

        messages = [
            {"role": "system", "content": "你是一个精确的简历分析助手，只输出 Markdown。"},
            {"role": "user", "content": prompt}
        ]

        try:
            response_text = ""
            async for chunk in client_to_use.chat_stream(messages):
                response_text += chunk
            return response_text
        except Exception as e:
            print(f"[ResumeManager] LLM Markdown analysis error: {e}")
            return None

    def _get_client(self, config_data: Optional[Dict]) -> Optional[LLMClient]:
        client_to_use = self.llm_client
        if self.config.get("model_type") == "api" and self.config.get("model_name") != "default" and config_data:
            model_name = self.config.get("model_name")
            model_conf = next((c for c in config_data.get("configs", []) if c["name"] == model_name), None)
            if model_conf:
                try:
                    client_to_use = LLMClient(
                        api_key=model_conf.get("api_key"),
                        base_url=model_conf.get("base_url"),
                        model=model_conf.get("model")
                    )
                except Exception as e:
                    print(f"[ResumeManager] Failed to create specific client: {e}")
        return client_to_use

    def save_xml(self, xml_content: str):
        with open(self.resume_xml_path, "w", encoding="utf-8") as f:
            f.write(xml_content)

    def save_markdown(self, md_content: str):
        with open(self.resume_md_path, "w", encoding="utf-8") as f:
            f.write(md_content)

    def get_resume_xml(self) -> Optional[str]:
        if os.path.exists(self.resume_xml_path):
            try:
                with open(self.resume_xml_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                print(f"[ResumeManager] Error reading XML: {e}")
                return None
        return None

    def get_resume_markdown(self) -> Optional[str]:
        if os.path.exists(self.resume_md_path):
            try:
                with open(self.resume_md_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                print(f"[ResumeManager] Error reading Markdown: {e}")
                return None
        return None

    def get_status(self) -> Dict:
        """Get current resume status."""
        has_xml = os.path.exists(self.resume_xml_path)
        has_md = os.path.exists(self.resume_md_path)
        
        status = self.processing_status.copy()
        status["has_resume"] = has_xml
        status["has_markdown"] = has_md
        
        # If idle but files exist, we can say it's ready
        if status["state"] == "idle" and has_xml:
            status["state"] = "completed"
            
        return status
