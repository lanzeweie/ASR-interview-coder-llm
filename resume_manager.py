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
        
        if not os.path.exists(upload_dir):
            os.makedirs(upload_dir)
            
        self.config = {
            "model_type": "api",
            "model_name": "default"
        }

    def set_llm_client(self, client: LLMClient):
        self.llm_client = client

    def update_config(self, config: Dict):
        """Update resume agent configuration."""
        self.config.update(config)

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
            with open(pdf_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                if reader.is_encrypted:
                    # Try to decrypt with empty password
                    try:
                        reader.decrypt("")
                    except:
                        return None
                
                for page in reader.pages:
                    text += page.extract_text() + "\n"
            return text.strip()
        except Exception as e:
            print(f"[ResumeManager] PDF extraction error: {e}")
            return None

    async def analyze_resume(self, text: str, config_data: Optional[Dict] = None) -> Optional[str]:
        """Convert resume text to XML using LLM."""
        
        # Determine which client to use
        client_to_use = self.llm_client
        
        # If we have specific config, try to create a specific client
        # This logic mimics how AgentManager selects models
        if self.config.get("model_type") == "api" and self.config.get("model_name") != "default" and config_data:
            # Find config in config_data
            model_name = self.config.get("model_name")
            model_conf = next((c for c in config_data.get("configs", []) if c["name"] == model_name), None)
            
            if model_conf:
                # Create a temporary client for this request
                try:
                    client_to_use = LLMClient(
                        api_key=model_conf.get("api_key"),
                        base_url=model_conf.get("base_url"),
                        model=model_conf.get("model")
                    )
                    print(f"[ResumeManager] Using specific model: {model_name}")
                except Exception as e:
                    print(f"[ResumeManager] Failed to create specific client, falling back to default: {e}")

        if not client_to_use:
            print("[ResumeManager] LLM client not set")
            return None

        prompt = f"""
        你是一个专业的简历分析师。请将以下简历文本转换为结构化的 XML 格式。
        
        简历文本：
        {text}

        要求：
        1. XML 根节点为 <resume>
        2. 包含 <basic_info> (姓名, 联系方式等), <education>, <experience>, <skills>, <projects> 等节点。
        3. 如果某些信息缺失，可以留空。
        4. 只输出 XML 内容，不要包含 markdown 代码块标记或其他解释性文字。
        5. 确保 XML 格式合法。
        """

        messages = [
            {"role": "system", "content": "你是一个精确的简历分析助手，只输出 XML。"},
            {"role": "user", "content": prompt}
        ]

        try:
            response_text = ""
            async for chunk in client_to_use.chat_stream(messages):
                response_text += chunk
            
            # Clean up response if it contains markdown code blocks
            clean_text = response_text.replace("```xml", "").replace("```", "").strip()
            return clean_text
        except Exception as e:
            print(f"[ResumeManager] LLM analysis error: {e}")
            return None

    def save_xml(self, xml_content: str):
        """Save the generated XML to file."""
        with open(self.resume_xml_path, "w", encoding="utf-8") as f:
            f.write(xml_content)

    def get_resume_xml(self) -> Optional[str]:
        """Retrieve the stored XML content."""
        if os.path.exists(self.resume_xml_path):
            try:
                with open(self.resume_xml_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                print(f"[ResumeManager] Error reading XML: {e}")
                return None
        return None

    def get_status(self) -> Dict:
        """Get current resume status."""
        has_xml = os.path.exists(self.resume_xml_path)
        return {
            "has_resume": has_xml,
            "status": "ready" if has_xml else "missing"
        }
