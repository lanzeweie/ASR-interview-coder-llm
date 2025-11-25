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

@app.on_event("startup")
async def startup_event():
    global asr_system, main_event_loop
    main_event_loop = asyncio.get_running_loop()

    # Initialize ASR system only if not skipped
    if not args.no_asr and ASR_AVAILABLE:
        print("[初始化] 启动 ASR 系统...")
        asr_system_initialized = False

        def thread_safe_callback(message):
            if main_event_loop and main_event_loop.is_running():
                asyncio.run_coroutine_threadsafe(manager.broadcast(message), main_event_loop)

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

@app.websocket("/ws/llm")
async def llm_websocket(websocket: WebSocket):
    await websocket.accept()

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
            # data format: { "messages": [...], "chat_id": "..." }
            messages = data.get("messages", [])
            chat_id = data.get("chat_id")

            # Add system prompt if not present or just ensure it's there
            if not messages or messages[0].get("role") != "system":
                 messages.insert(0, {"role": "system", "content": "你是一个Ai助手帮助用户，并且分析聊天记录"})

            # Stream response
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
                    # We need to append the assistant's response to the messages list
                    # Note: 'messages' here already includes the user's latest message
                    # But we need to be careful not to duplicate the system prompt if we are saving full history
                    # Actually, the frontend sends the full history. So we just append the new response.
                    messages.append({"role": "assistant", "content": response_text})
                    chat_manager.update_chat_messages(chat_id, messages)

            except Exception as e:
                print(f"LLM Stream Error: {e}")
                await websocket.send_json({"type": "error", "content": f"Stream Error: {str(e)}"})

    except WebSocketDisconnect:
        print("LLM WebSocket disconnected")
    except Exception as e:
        print(f"LLM WebSocket Fatal Error: {e}")

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
