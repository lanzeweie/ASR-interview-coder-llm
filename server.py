import threading
import asyncio
import json
import os
import argparse
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse

# Conditional imports for optional features
try:
    from main import RealTimeASR_SV
    ASR_AVAILABLE = True
except ImportError:
    ASR_AVAILABLE = False
    print("Warning: ASR module not available. Use --no-asr to suppress this warning.")

from llm_client import LLMClient

from chat_manager import ChatManager

# Intelligent Agent imports
try:
    from intelligent_agent import agent_manager
    from trigger_manager import trigger_manager
    AGENT_AVAILABLE = True
except ImportError:
    AGENT_AVAILABLE = False
    print("Warning: Intelligent Agent module not available.")

# Parse command line arguments
parser = argparse.ArgumentParser(description='AST Real-time ASR and LLM Chat Server')
parser.add_argument('--no-asr', '--no', action='store_true', help='Skip ASR model initialization (skip audio and ASR)')
parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to bind (default: 0.0.0.0)')
parser.add_argument('--port', type=int, default=8000, help='Port to bind (default: 8000)')
args = parser.parse_args()

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- Config Management ---
CONFIG_FILE = "api_config.json"

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"configs": [], "current_config": ""}

def save_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=4)

# Initialize LLM Client
config_data = load_config()
current_config_name = config_data.get("current_config")
current_config = next((c for c in config_data.get("configs", []) if c["name"] == current_config_name), None)

if current_config:
    llm_client = LLMClient(
        api_key=current_config.get("api_key"),
        base_url=current_config.get("base_url"),
        model=current_config.get("model")
    )
else:
    # Initialize with empty values if no config found
    llm_client = LLMClient(api_key="", base_url="", model="")

# Initialize Chat Manager
chat_manager = ChatManager()

# --- Connection Manager for ASR ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Error sending message: {e}")

manager = ConnectionManager()

# ASR Instance
asr_system = None

def asr_callback(message):
    """Callback function to be called by ASR system when a message is ready"""
    print(f"Callback received: {message}")
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
             asyncio.run_coroutine_threadsafe(manager.broadcast(message), loop)
        else:
             pass
    except RuntimeError:
        pass

# We need a reference to the main event loop to schedule tasks from the ASR thread
main_event_loop = None

# --- 智能分析回调处理 ---
async def agent_analysis_callback(result, messages, speaker_name):
    """智能分析完成回调"""
    try:
        is_needed = result.get('is', False)

        if is_needed:
            print(f"[智能分析] 检测到需要多模型建议，主人公: {speaker_name}")

            # 获取当前聊天 ID
            current_chat_id = chat_manager.get_current_chat_id()

            # 如果没有当前聊天，创建一个
            if not current_chat_id:
                new_chat = chat_manager.create_chat(f"智能分析 - {speaker_name}")
                current_chat_id = new_chat['id']

            # 准备消息上下文（最近的 10 条消息）
            recent_messages = messages[-10:] if len(messages) > 10 else messages

            # 添加系统提示
            formatted_messages = [
                {"role": "system", "content": f"你是AI助手，帮助{speaker_name}分析以下对话。{speaker_name}是主人公。"}
            ]

            # 添加对话历史
            for msg in recent_messages:
                role = 'user' if msg.get('speaker') else 'assistant'
                formatted_messages.append({
                    "role": role,
                    "content": msg.get('content', '')
                })

            # 推送到所有 LLM WebSocket 客户端
            await llm_manager.broadcast({
                "type": "agent_triggered",
                "reason": result.get('reason', '智能分析建议'),
                "speaker": speaker_name,
                "messages": formatted_messages,
                "chat_id": current_chat_id,
                "is_multi_llm": True
            })

            print(f"[智能分析] 多模型共话已触发")

    except Exception as e:
        print(f"[智能分析] 回调处理失败: {e}")

# --- LLM 连接管理器 ---
class LLMConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"LLM 广播失败: {e}")

llm_manager = LLMConnectionManager()

# --- 多模型请求处理函数 ---
async def handle_multi_llm_request(websocket: WebSocket, messages: list, chat_id: str):
    """处理多模型共话请求"""
    config_data = load_config()
    active_names = config_data.get("multi_llm_active_names", [])
    configs = config_data.get("configs", [])

    active_configs = [c for c in configs if c["name"] in active_names]

    if not active_configs:
        await websocket.send_json({"type": "error", "content": "未选择任何模型加入集群 (请在设置中勾选)"})
        return

    # 发送触发通知
    await websocket.send_json({
        "type": "agent_notification",
        "content": f"🤖 智能分析已启动，将同时调用 {len(active_configs)} 个模型为您提供建议"
    })

    # Prepare tasks
    async def stream_one(conf):
        name = conf["name"]
        try:
            client = LLMClient(conf["api_key"], conf["base_url"], conf["model"])

            # Handle separate system prompt
            current_messages = [m.copy() for m in messages]
            config_prompt = conf.get("system_prompt", "")

            if config_prompt:
                # Replace or insert system prompt
                sys_idx = next((i for i, m in enumerate(current_messages) if m["role"] == "system"), -1)
                if sys_idx != -1:
                    current_messages[sys_idx]["content"] = config_prompt
                else:
                    current_messages.insert(0, {"role": "system", "content": config_prompt})

            full_resp = ""
            async for chunk in client.chat_stream(current_messages):
                await websocket.send_json({
                    "type": "chunk",
                    "model": name,
                    "content": chunk
                })
                full_resp += chunk

            await websocket.send_json({"type": "done_one", "model": name})
            return name, full_resp
        except Exception as e:
            err_msg = f"Error: {str(e)}"
            await websocket.send_json({"type": "error", "content": f"[{name}] {err_msg}"})
            return name, f"[Error] {err_msg}"

    # Run all concurrently
    tasks = [stream_one(c) for c in active_configs]
    results = await asyncio.gather(*tasks)

    await websocket.send_json({"type": "done_all"})

    # Save to history
    if chat_id:
        # Append all responses
        for name, text in results:
            messages.append({"role": "assistant", "content": f"**{name}**:\n{text}"})
        chat_manager.update_chat_messages(chat_id, messages)

@app.on_event("startup")
async def startup_event():
    global asr_system, main_event_loop
    main_event_loop = asyncio.get_running_loop()

    # Initialize ASR system only if not skipped
    if not args.no_asr and ASR_AVAILABLE:
        print("[初始化] 启动 ASR 系统...")
        asr_system_initialized = False

        def thread_safe_callback(message):
            # Send to WebSocket clients
            if main_event_loop and main_event_loop.is_running():
                asyncio.run_coroutine_threadsafe(manager.broadcast(message), main_event_loop)

            # Send to trigger manager
            if AGENT_AVAILABLE:
                try:
                    trigger_manager.add_message(message)
                except Exception as e:
                    print(f"[触发机制] 处理消息失败: {e}")

        try:
            asr_system = RealTimeASR_SV(on_message_callback=thread_safe_callback)
            # Run ASR in a separate thread so it doesn't block FastAPI
            thread = threading.Thread(target=asr_system.run, daemon=True)
            thread.start()
            asr_system_initialized = True
            print("[成功] ASR 系统已在后台线程启动")
        except Exception as e:
            print(f"[错误] ASR 系统初始化失败: {e}")
            print("[提示] 使用 --no-asr 参数跳过 ASR 初始化")
    else:
        if args.no_asr:
            print("[配置] 已跳过 ASR 系统初始化 (--no-asr)")
        else:
            print("[配置] ASR 系统不可用")

    # Initialize Intelligent Agent
    if AGENT_AVAILABLE:
        try:
            # Load agent from config
            config_data = load_config()
            agent_config = config_data.get("agent_config", {})
            agent_model_name = agent_config.get("model_name")

            if agent_model_name:
                # Find agent model config
                model_config = next(
                    (c for c in config_data.get("configs", []) if c["name"] == agent_model_name),
                    None
                )

                if model_config:
                    # Add model_type to config
                    model_config['model_type'] = 'api'
                    agent_manager.load_agent(agent_config, model_config)
                    print(f"[成功] 智能 Agent 已加载: {agent_model_name}")
                else:
                    print(f"[警告] 未找到 Agent 模型配置: {agent_model_name}")
            else:
                print("[配置] 未配置智能 Agent 模型")

            # 注册智能分析回调
            trigger_manager.add_callback(agent_analysis_callback)
            print("[成功] 智能分析回调已注册")

        except Exception as e:
            print(f"[错误] 智能 Agent 初始化失败: {e}")
    else:
        print("[配置] 智能 Agent 模块不可用")

@app.get("/")
async def get():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# --- LLM Endpoints ---

@app.get("/api/config")
async def get_config():
    return load_config()

@app.post("/api/config")
async def update_config(data: dict = Body(...)):
    """
    Update configuration. 
    Expected data: { "configs": [...], "current_config": "Name" }
    """
    save_config(data)
    
    # Reload LLM Client if current config changed
    new_current_name = data.get("current_config")
    new_config = next((c for c in data.get("configs", []) if c["name"] == new_current_name), None)
    
    if new_config:
        llm_client.update_config(
            api_key=new_config.get("api_key"),
            base_url=new_config.get("base_url"),
            model=new_config.get("model")
        )
    
    return {"status": "success", "message": "Configuration updated"}

@app.post("/api/test_connection")
async def test_connection_endpoint(data: dict = Body(...)):
    """
    Test connection with provided config.
    """
    api_key = data.get("api_key")
    base_url = data.get("base_url")
    model = data.get("model")
    
    if not all([api_key, base_url, model]):
        return {"success": False, "message": "Missing required fields"}
        
    client = LLMClient(api_key=api_key, base_url=base_url, model=model)
    success, message = await client.test_connection()
    return {"success": success, "message": message}

# --- Chat Management Endpoints ---

@app.get("/api/chats")
async def get_chats():
    return {
        "current_chat_id": chat_manager.get_current_chat_id(),
        "chats": chat_manager.get_all_chats()
    }

@app.post("/api/chats")
async def create_chat(data: dict = Body(...)):
    title = data.get("title", "New Chat")
    new_chat = chat_manager.create_chat(title)
    return new_chat

@app.get("/api/chats/{chat_id}")
async def get_chat(chat_id: str):
    chat = chat_manager.get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    success = chat_manager.delete_chat(chat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"status": "success"}

@app.post("/api/chats/{chat_id}/clear")
async def clear_chat(chat_id: str):
    success = chat_manager.clear_chat_messages(chat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"status": "success"}

# --- Intelligent Agent Endpoints ---

@app.get("/api/agent/status")
async def get_agent_status():
    """获取智能 Agent 状态"""
    if not AGENT_AVAILABLE:
        return {"available": False, "message": "智能 Agent 模块不可用"}

    config_data = load_config()
    agent_config = config_data.get("agent_config", {})

    return {
        "available": True,
        "enabled": agent_manager.enabled,
        "auto_trigger": agent_manager.auto_trigger,
        "status": trigger_manager.get_status(),
        "config": agent_config
    }

@app.post("/api/agent/enable")
async def enable_agent(data: dict = Body(...)):
    """启用/禁用智能 Agent"""
    if not AGENT_AVAILABLE:
        raise HTTPException(status_code=503, detail="智能 Agent 模块不可用")

    enabled = data.get("enabled", True)
    auto_trigger = data.get("auto_trigger", True)

    agent_manager.enabled = enabled
    agent_manager.auto_trigger = auto_trigger
    trigger_manager.set_enabled(enabled)

    # Update config
    config_data = load_config()
    agent_config = config_data.get("agent_config", {})
    agent_config["enabled"] = enabled
    agent_config["auto_trigger"] = auto_trigger
    config_data["agent_config"] = agent_config
    save_config(config_data)

    return {
        "status": "success",
        "enabled": enabled,
        "auto_trigger": auto_trigger
    }

@app.post("/api/agent/config")
async def update_agent_config(data: dict = Body(...)):
    """更新智能 Agent 配置"""
    if not AGENT_AVAILABLE:
        raise HTTPException(status_code=503, detail="智能 Agent 模块不可用")

    min_characters = data.get("min_characters", 10)
    silence_threshold = data.get("silence_threshold", 2)
    model_name = data.get("model_name")

    # Update thresholds
    trigger_manager.set_thresholds(min_characters, silence_threshold)

    # Update config file
    config_data = load_config()
    agent_config = config_data.get("agent_config", {})
    agent_config.update({
        "min_characters": min_characters,
        "silence_threshold": silence_threshold,
        "model_name": model_name
    })
    config_data["agent_config"] = agent_config
    save_config(config_data)

    # Reload agent if model changed
    if model_name and AGENT_AVAILABLE:
        model_config = next(
            (c for c in config_data.get("configs", []) if c["name"] == model_name),
            None
        )
        if model_config:
            model_config['model_type'] = 'api'
            agent_manager.load_agent(agent_config, model_config)

    return {"status": "success", "config": agent_config}

@app.post("/api/agent/analyze")
async def manual_analyze(data: dict = Body(...)):
    """手动触发智能分析"""
    if not AGENT_AVAILABLE:
        raise HTTPException(status_code=503, detail="智能 Agent 模块不可用")

    messages = data.get("messages", [])
    speaker_name = data.get("speaker_name", "用户")

    result = await agent_manager.analyze_conversation(messages, speaker_name)
    return result

@app.post("/api/agent/trigger")
async def trigger_multi_llm(data: dict = Body(...)):
    """手动触发多模型共话"""
    messages = data.get("messages", [])
    chat_id = data.get("chat_id")

    # This will be handled by the WebSocket endpoint
    return {
        "status": "triggered",
        "message": "多模型共话已触发",
        "messages": messages,
        "chat_id": chat_id
    }

@app.websocket("/ws/llm")
async def llm_websocket(websocket: WebSocket):
    await llm_manager.connect(websocket)

    # Reload config on connection to ensure we have the latest
    current_data = load_config()
    curr_name = current_data.get("current_config")
    curr_conf = next((c for c in current_data.get("configs", []) if c["name"] == curr_name), None)

    if curr_conf:
        llm_client.update_config(
            api_key=curr_conf.get("api_key"),
            base_url=curr_conf.get("base_url"),
            model=curr_conf.get("model")
        )

    try:
        while True:
            data = await websocket.receive_json()

            # 处理智能分析触发消息
            if data.get("type") == "agent_triggered":
                print(f"[智能分析] WebSocket 收到触发消息")
                messages = data.get("messages", [])
                chat_id = data.get("chat_id")
                is_multi_llm = True

                # 直接处理多模型模式
                await handle_multi_llm_request(websocket, messages, chat_id)
                continue

            # data format: { "messages": [...], "chat_id": "...", "is_multi_llm": bool }
            messages = data.get("messages", [])
            chat_id = data.get("chat_id")
            is_multi_llm = data.get("is_multi_llm", False)

            # Add system prompt if not present or just ensure it's there
            if not messages or messages[0].get("role") != "system":
                 messages.insert(0, {"role": "system", "content": "你是一个Ai助手帮助用户，并且分析聊天记录"})

            if is_multi_llm:
                # --- Multi-LLM Mode ---
                config_data = load_config()
                active_names = config_data.get("multi_llm_active_names", [])
                configs = config_data.get("configs", [])
                
                active_configs = [c for c in configs if c["name"] in active_names]
                
                if not active_configs:
                     await websocket.send_json({"type": "error", "content": "未选择任何模型加入集群 (请在设置中勾选)"})
                     continue
                
                # Prepare tasks
                async def stream_one(conf):
                    name = conf["name"]
                    try:
                        client = LLMClient(conf["api_key"], conf["base_url"], conf["model"])
                        
                        # Handle separate system prompt
                        current_messages = [m.copy() for m in messages] # Deep copyish
                        config_prompt = conf.get("system_prompt", "")
                        
                        if config_prompt:
                            # Replace or insert system prompt
                            sys_idx = next((i for i, m in enumerate(current_messages) if m["role"] == "system"), -1)
                            if sys_idx != -1:
                                current_messages[sys_idx]["content"] = config_prompt
                            else:
                                current_messages.insert(0, {"role": "system", "content": config_prompt})
                        
                        full_resp = ""
                        async for chunk in client.chat_stream(current_messages):
                            await websocket.send_json({
                                "type": "chunk",
                                "model": name,
                                "content": chunk
                            })
                            full_resp += chunk
                        
                        await websocket.send_json({"type": "done_one", "model": name})
                        return name, full_resp
                    except Exception as e:
                        err_msg = f"Error: {str(e)}"
                        await websocket.send_json({"type": "error", "content": f"[{name}] {err_msg}"})
                        return name, f"[Error] {err_msg}"

                # Run all concurrently
                tasks = [stream_one(c) for c in active_configs]
                results = await asyncio.gather(*tasks)
                
                await websocket.send_json({"type": "done_all"})
                
                # Save to history
                if chat_id:
                    # Append all responses
                    for name, text in results:
                        messages.append({"role": "assistant", "content": f"**{name}**:\n{text}"})
                    chat_manager.update_chat_messages(chat_id, messages)

            else:
                # --- Single LLM Mode (Original Logic) ---
                response_text = ""
                try:
                    # Check if client is ready
                    if not llm_client.client:
                         await websocket.send_json({"type": "error", "content": "LLM Client not initialized. Please check settings."})
                         continue
    
                    async for chunk in llm_client.chat_stream(messages):
                        await websocket.send_json({"type": "chunk", "content": chunk})
                        response_text += chunk
    
                    await websocket.send_json({"type": "done", "full_text": response_text})
    
                    # Save to chat history if chat_id is provided
                    if chat_id:
                        messages.append({"role": "assistant", "content": response_text})
                        chat_manager.update_chat_messages(chat_id, messages)
    
                except Exception as e:
                    print(f"LLM Stream Error: {e}")
                    await websocket.send_json({"type": "error", "content": f"Stream Error: {str(e)}"})

    except WebSocketDisconnect:
        print("LLM WebSocket disconnected")
        llm_manager.disconnect(websocket)
    except Exception as e:
        print(f"LLM WebSocket Fatal Error: {e}")
        traceback.print_exc()
        llm_manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn

    # Print startup banner
    print("=" * 60)
    print("🚀 AST 实时语音转文本与大模型分析系统")
    print("=" * 60)
    print(f"[配置] ASR 系统: {'✅ 启用' if not args.no_asr else '❌ 禁用 (--no-asr)'}")
    print(f"[配置] LLM 客户端: ✅ 启用")
    print(f"[配置] 服务地址: http://{args.host}:{args.port}")
    print("=" * 60)
    print("")

    uvicorn.run(app, host=args.host, port=args.port)
