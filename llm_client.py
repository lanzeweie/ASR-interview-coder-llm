import os
from openai import AsyncOpenAI
import json
import traceback
import asyncio
import httpx
from logger_config import setup_logger

logger = setup_logger(__name__)

class LLMClient:
    def __init__(self, api_key, base_url, model):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.client = None
        self.init_client()

    def init_client(self):
        if self.api_key and self.base_url:
            try:
                clean_url = self.base_url.strip().rstrip('/')
                if not clean_url.endswith("/v1"):
                    self.base_url = clean_url + "/v1"
                else:
                    self.base_url = clean_url
                # 创建自定义的 httpx 客户端，避免代理问题
                timeout = httpx.Timeout(60.0, connect=10.0)
                http_client = httpx.AsyncClient(
                    timeout=timeout,
                    follow_redirects=True
                )

                # 创建 OpenAI 客户端，使用自定义的 http_client
                self.client = AsyncOpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url,
                    http_client=http_client
                )
                logger.info(f"[系统] LLM 客户端初始化成功。")
            except Exception as e:
                logger.error(f"[错误] 初始化 LLM 客户端失败: {e}")
                logger.error(f"[错误类型] {type(e).__name__}")
                # 打印详细错误信息用于调试
                logger.exception("初始化异常详情:")
                self.client = None
        else:
            logger.error("[错误] LLM 客户端未初始化: 缺少 API Key 或 Base URL")
            self.client = None

    def update_config(self, api_key, base_url, model):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.init_client()

    async def chat_stream(self, messages, stream=True):
            """
            请求 LLM 响应 (Async - 支持流式和非流式)
            """
            if not self.client:
                yield "错误: LLM 客户端未初始化，请检查配置。"
                return

            try:
                logger.debug(f"[调试] 正在发送请求到模型: {self.model} (Stream={stream})...")
                
                # 发起请求
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    stream=stream,
                    # 某些中转商如果遇到不支持的参数会报错，这里保持最简参数
                    temperature=0.7 
                )
                logger.debug("[调试] 请求连接建立成功...")
                
                if stream:
                    chunk_count = 0
                    async for chunk in response:
                        chunk_count += 1
                        
                        # --- 🔍 深度调试：打印前3个包的原始数据，看看服务器到底回了什么 ---
                        if chunk_count <= 3:
                            logger.debug(f"[底层数据 Chunk {chunk_count}] {chunk.model_dump_json()}")
                        # -----------------------------------------------------------

                        if chunk.choices and len(chunk.choices) > 0:
                            delta = chunk.choices[0].delta
                            
                            # 检查 delta 里到底有什么
                            if chunk_count == 1 and not delta.content:
                                logger.debug(f"[调试] 第一个包内容为空，Role: {getattr(delta, 'role', 'Unknown')}")

                            if hasattr(delta, 'content') and delta.content is not None:
                                content = delta.content
                                if content: 
                                    yield content
                                else:
                                    # 这是一个空字符串 ""，有些模型会发空字符串保活
                                    pass 
                    
                    if chunk_count == 0:
                        yield "\n[警告] 连接建立成功，但流是空的 (Stream Empty)。\n可能原因：API Key额度不足、模型名称拼写错误 (尝试改为 gpt-3.5-turbo 或 deepseek-chat 测试)。"
                    
                    logger.debug(f"[调试] 流接收完毕，共收到 {chunk_count} 个数据包。")
                else:
                    # 非流式处理
                    if response.choices and len(response.choices) > 0:
                        content = response.choices[0].message.content
                        yield content
                    else:
                         yield "\n[警告] 未收到有效响应内容。"

            except Exception as e:
                logger.error(f"[严重错误] 请求过程中发生异常:")
                logger.exception("请求异常详情:")
                yield f"请求错误: {str(e)}"

    async def test_connection(self):
        """
        测试连接是否有效
        """
        if not self.client:
            return False, "客户端未初始化"
        
        try:
            # 尝试发送一个极简的请求
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "你好"}],
                max_tokens=1
            )
            return True, "连接成功"
        except Exception as e:
            return False, f"连接失败: {str(e)}"
    def __repr__(self):
        status = "已连接" if self.client is not None else "未连接"
        return f"LLMClient(模型='{self.model}', 地址='{self.base_url}', 状态={status})"

async def main():
    # --- 测试部分 ---
    CONFIG_FILE = "api_config.json"
    
    logger.info("--- 开始测试 LLM 客户端 (Async) ---")
    
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            config_data = json.load(f)
            
        current_config_name = config_data.get("current_config")
        current_config = next((c for c in config_data.get("configs", []) if c["name"] == current_config_name), None)
        
        if current_config:
            logger.info(f"正在加载配置: {current_config_name}")
            
            raw_key = current_config.get("api_key", "")
            masked_key = raw_key[:6] + "******" + raw_key[-4:] if len(raw_key) > 10 else "******"
            logger.info(f"API Key (脱敏): {masked_key}")

            client = LLMClient(
                api_key=raw_key,
                base_url=current_config.get("base_url"),
                model=current_config.get("model")
            )
            
            logger.info(f"客户端状态: {client}")
            
            test_messages = [
                {"role": "system", "content": "你是一个超级精简测试体，你只能回复极少量文字表示你通过测试了。"},
                {"role": "user", "content": "你好！如果能收到消息请回复'测试成功'。"}
            ]
            
            logger.info("\n[操作] 发送测试消息中...")
            logger.info("-" * 30)
            
            received_content = False
            async for chunk in client.chat_stream(test_messages):
                print(chunk, end="", flush=True) # Keep print for accurate streaming visualization in CLI test
                received_content = True
            
            logger.info("\n" + "-" * 30)
            
            if not received_content:
                logger.warning("\n[结果] 未收到任何回复内容。")
            else:
                logger.info("\n[结果] 测试结束。")
            
        else:
            logger.error(f"[错误] 在 {CONFIG_FILE} 中未找到配置 '{current_config_name}'")
    else:
        logger.error(f"[错误] 找不到文件 {CONFIG_FILE}，请确保它在同一目录下。")

if __name__ == "__main__":
    asyncio.run(main())