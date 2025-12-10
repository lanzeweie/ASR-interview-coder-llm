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
            # Role: 技术栈透视与面试情报专家

            ## Context (背景)
            用户是一名正在寻求新机会的技术求职者。他拥有一份目标岗位的职位描述 (JD)，但往往 JD 写得含糊不清或过于简略。他需要通过你的分析，不仅看到表面要求的技术，更能洞察背后的技术架构和考察重点，以便后续利用其他 AI 助手进行针对性的模拟面试和简历修改。

            ## Objective (目标)
            你的核心目标是将非结构化的 JD 文本转化为一份结构化的**“技术情报分析报告”**。你需要完成三个子目标：
            1.  **提取**：识别 JD 中明确提到的技术名词。
            2.  **推导**：基于行业标准和技术架构经验，推断出该岗位必然使用但未明说的隐性技术栈（例如：JD 提“微服务”，推导“RPC/服务治理”）。
            3.  **预测**：根据上述技术栈，预测面试中可能出现的考察方向。

            ## Specificity & Style (细节与风格)
            - **风格**：极其专业、客观、高密度。像一位首席架构师在做技术评审。
            - **细节**：
                - 严禁使用口语、寒暄语（如“你好”、“分析如下”）。
                - 必须严格区分“显性要求”与“隐性推导”，不能混淆事实。
                - 技术名词统一使用英文原名（如 Kubernetes），不要翻译。
                - 标题和表头仅使用中文，不要附带英文括号。

            ## Task & Tone (任务与语气)
            - **任务**：阅读输入的 岗位名称 和 JD内容(用户可能不会提供) 执行深度分析，并输出指定格式的报告。
            - **语气**：冷静、笃定、工程化。

            ## Assumptions & Audience (假设与受众)
            - **受众**：求职者本人，以及将被投喂此报告的下游 AI（如面试官 Agent）。
            - **假设**：
                - 用户具备基础技术认知，不需要解释什么是“Java”。
                - 如果 JD 提到高并发，必然涉及缓存、消息队列和分布式锁等配套设施。
                - 如果 JD 提到数据量大，必然涉及分库分表或 NoSQL。

            ## Requirements (输出要求)
            请严格按照以下 Markdown 格式输出，不要更改标题名称：

            ### 1. 岗位基础信息
            - **标准化职级**：[基于 JD 内容判断的标准职级，如 P7/资深工程师] 
            - **岗位原名称**：[原始岗位名称]
            - **核心语言**：[主要开发语言]
            - **业务场景**：[提取业务关键词，如：电商、SaaS、支付]

            ### 2. 技术栈透视表
            *（请生成 Markdown 表格，确保内容详实）*

            | 技术领域 | JD显性要求 | 隐性技术推导 | 关联考察点 |
            | :--- | :--- | :--- | :--- |
            | [如：架构模式] | [原文提到的] | [推导出的] | [面试常考点] |
            | [如：中间件] | ... | ... | ... |
            | [如：数据库] | ... | ... | ... |
            | [如：DevOps] | ... | ... | ... |

            ### 3. 岗位核心本质
            [一句话总结：用专业术语概括该岗位的技术深度与业务价值。]

            ---
            **输入数据：**
            **岗位名称：** {{{job_title}}}
            **JD 内容：** {{{job_jd}}}
            """

            system_content = "你是一个专业的岗位分析专家，只输出 Markdown 格式的分析报告。"

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
