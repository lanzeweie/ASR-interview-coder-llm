import argparse
import asyncio
import base64
import json
import os
import re
import threading
import time
import wave

from fastapi import (Body, FastAPI, File, HTTPException, UploadFile, WebSocket,
                     WebSocketDisconnect)
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Conditional imports for optional features
try:
    from main import RealTimeASR_SV
    ASR_AVAILABLE = True
except ImportError:
    ASR_AVAILABLE = False
    print("警告: ASR 模块不可用。使用 --no-asr 取消此警告。")

from chat_manager import ChatManager
from llm_client import LLMClient
from chat_manager import ChatManager
from llm_client import LLMClient
from resume_manager import ResumeManager
from job_manager import JobManager

# Intelligent Agent imports
try:
    from intelligent_agent import agent_manager, format_intent_analysis
    from trigger_manager import trigger_manager
    AGENT_AVAILABLE = True
except ImportError:
    AGENT_AVAILABLE = False
    print("警告: 智能 Agent 模块不可用。")

# Parse command line arguments
parser = argparse.ArgumentParser(description='AST Real-time ASR and LLM Chat Server')
parser.add_argument('--no', action='store_true', help='Skip ALL model initialization (disable ASR, voiceprint, and local agent models)')
parser.add_argument('--no-asr', '--no-voice', action='store_true', help='[DEPRECATED] Use --no instead. Skip ASR and voiceprint model initialization')
parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to bind (default: 0.0.0.0)')
parser.add_argument('--port', type=int, default=8000, help='Port to bind (default: 8000)')
args = parser.parse_args()

# Handle deprecated argument
if args.no_asr:
    print("[⚠️  警告] --no-asr 参数已弃用，请使用 --no 替代")
    args.no = True

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- Config Management ---
CONFIG_FILE = "api_config.json"
AGENT_ROLE_FILE = "data/agent.json"
UI_STATE_FILE = "data/ui_state.json"

LEGACY_IDENTITY_MAP = {
    "思考": "tech_assistant",
    "快速": "concise_assistant",
    "引导": "guide",
    "技术辅助者": "tech_assistant",
    "精简辅助者": "concise_assistant",
    "资深求职着": "guide"
}


def normalize_identity_identifier(value: str | None) -> str:
    if not value:
        return ""
    identifier = value.strip()
    if not identifier:
        return ""
    identifier = re.sub(r"\s+", "_", identifier)
    # 优先匹配中文/别名
    mapped = LEGACY_IDENTITY_MAP.get(identifier)
    if mapped:
        return mapped

    identifier = identifier.lower()
    mapped = LEGACY_IDENTITY_MAP.get(identifier)
    if mapped:
        return mapped

    if identifier.endswith("_tag"):
        identifier = identifier[:-4]
    return identifier


def sanitize_role_definition(role: dict | None) -> dict | None:
    """Normalize role definitions to a single canonical ID field."""
    if not isinstance(role, dict):
        return None

    normalized_id = normalize_identity_identifier(role.get("id") or role.get("tag_key"))
    if not normalized_id:
        return None

    name = (role.get("name") or "").strip() or normalized_id
    prompt = (role.get("prompt") or "").strip()
    enabled = bool(role.get("enabled", True))

    return {
        "id": normalized_id,
        "name": name,
        "prompt": prompt,
        "enabled": enabled
    }


def build_identity_lookup(roles: list[dict]) -> dict[str, dict]:
    """Create a fast lookup table for identity definitions."""
    lookup: dict[str, dict] = {}
    for role in roles:
        normalized_id = normalize_identity_identifier(role.get("id"))
        if not normalized_id:
            continue
        copy = dict(role)
        copy["id"] = normalized_id
        lookup[normalized_id] = copy
    return lookup


def select_identity_role(tags: list[str], lookup: dict[str, dict]) -> tuple[str | None, dict | None, list[str]]:
    """
    Find the first enabled identity (with prompt) that matches the provided tags.
    Returns (active_tag, role_dict, disabled_role_names).
    """
    disabled_names: list[str] = []
    for tag in tags:
        normalized_tag = normalize_identity_identifier(tag)
        if not normalized_tag:
            continue
        role = lookup.get(normalized_tag)
        if not role:
            continue
        if not role.get("enabled", True):
            disabled_names.append(role.get("name") or normalized_tag)
            continue
        prompt_text = (role.get("prompt") or "").strip()
        if not prompt_text:
            continue
        role_copy = dict(role)
        role_copy["prompt"] = prompt_text
        return normalized_tag, role_copy, disabled_names
    return None, None, disabled_names


def load_think_tank_roles() -> list[dict]:
    if not os.path.exists(AGENT_ROLE_FILE):
        return []
    try:
        with open(AGENT_ROLE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        print(f"[智囊团] 加载身份失败: {exc}")
        return []

    roles: list[dict] = []
    needs_resave = False
    for raw_role in data.get("think_tank_roles", []):
        sanitized = sanitize_role_definition(raw_role)
        if not sanitized:
            continue
        roles.append(sanitized)
        if (
            raw_role.get("tag_key") is not None
            or normalize_identity_identifier(raw_role.get("id")) != sanitized["id"]
            or (raw_role.get("name") or "").strip() != sanitized["name"]
            or (raw_role.get("prompt") or "").strip() != sanitized["prompt"]
        ):
            needs_resave = True

    if needs_resave:
        save_think_tank_roles(roles)

    return roles


def save_think_tank_roles(roles: list[dict]):
    os.makedirs(os.path.dirname(AGENT_ROLE_FILE), exist_ok=True)
    sanitized_roles = []
    for role in roles:
        sanitized = sanitize_role_definition(role)
        if sanitized:
            sanitized_roles.append(sanitized)
    payload = {"think_tank_roles": sanitized_roles}
    with open(AGENT_ROLE_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def normalize_config_tags(config: dict) -> dict:
    tags = config.get("tags") or []
    normalized_tags = []
    for tag in tags:
        normalized = normalize_identity_identifier(tag)
        if normalized:
            normalized_tags.append(normalized)
    config["tags"] = normalized_tags
    return config

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            configs = data.get("configs", [])
            data["configs"] = [normalize_config_tags(dict(config)) for config in configs]
            return data
    return {"configs": [], "current_config": ""}

def save_config(config):
    configs = config.get("configs", [])
    config["configs"] = [normalize_config_tags(dict(conf)) for conf in configs]
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=4, ensure_ascii=False)

def load_ui_state():
    if os.path.exists(UI_STATE_FILE):
        try:
            with open(UI_STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading UI state: {e}")
    return {}

def save_ui_state(state):
    os.makedirs(os.path.dirname(UI_STATE_FILE), exist_ok=True)
    try:
        with open(UI_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        print(f"Error saving UI state: {e}")

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

# Initialize Resume Manager
resume_manager = ResumeManager(llm_client=llm_client)
# Initialize Resume Manager
resume_manager = ResumeManager(llm_client=llm_client)
resume_personalization_enabled = False

# Initialize Job Manager
job_manager = JobManager(llm_client=llm_client)
CACHED_JOB_CONTEXT = None

def update_job_context_cache():
    """Update the global cached job context."""
    global CACHED_JOB_CONTEXT
    content = None
    if os.path.exists(job_manager.job_analysis_path):
        try:
            with open(job_manager.job_analysis_path, "r", encoding="utf-8") as f:
                content = f.read()
        except:
            pass
    CACHED_JOB_CONTEXT = content
    print(f"[JobManager] Context cache updated. Size: {len(content) if content else 0}")

# Load initial job context
update_job_context_cache()

# Load initial resume config
_initial_config = load_config()
if "resume_config" in _initial_config:
    resume_manager.update_config(_initial_config["resume_config"])

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
        phase1_result = result.get('phase1', {})
        is_needed = phase1_result.get('is', False)
        analysis_id = result.get('analysis_id')
        reason = phase1_result.get('reason', '')
        summary = result.get('analysis_summary')
        count = result.get('analysis_count')
        preview = result.get('analysis_preview')
        model_name = phase1_result.get('model_name')

        summary_label = summary or f"[{speaker_name}]"
        status_text = f"{summary_label} · 分析完成"
        if is_needed:
            status_text = f"{summary_label} · 助手介入"
        elif reason:
            status_text = f"{summary_label} · {reason}"

        # Prepare intent info for broadcast
        phase2_result = result.get('phase2')
        intent_data = None
        if phase2_result and phase2_result.get('success'):
            raw_xml = phase2_result.get('summary_xml', '')
            import re
            summary_match = re.search(r'<summary>(.*?)</summary>', raw_xml, re.DOTALL)
            summary_text = summary_match.group(1).strip() if summary_match else raw_xml
            
            intent_data = {
                'model': phase2_result.get('model_name', 'Unknown'),
                'summary': summary_text
            }

        # 分析完成，发送结束消息到ASR面板
        await manager.broadcast({
            "time": time.strftime("%H:%M:%S"),
            "speaker": "智能分析",
            "text": status_text,
            "analysis_status": "completed",
            "analysis_need_ai": is_needed,
            "analysis_id": analysis_id,
            "analysis_reason": reason,
            "analysis_summary": summary,
            "analysis_count": count,
            "analysis_preview": preview,
            "analysis_model": model_name,
            "intent_info": intent_data
        })

        if is_needed:
            print(f"[智能分析] ✅ 检测到需要AI帮助分析，主人公: {speaker_name}")

            try:
                # 获取当前聊天 ID
                current_chat_id = chat_manager.get_current_chat_id()
                print(f"[智能分析] 当前聊天ID: {current_chat_id}")

                # 如果没有当前聊天，创建一个
                if not current_chat_id:
                    new_chat = chat_manager.create_chat(f"智能分析 - {speaker_name}")
                    current_chat_id = new_chat['id']
                    print(f"[智能分析] ✅ 创建新聊天: {current_chat_id}")

                # 准备消息上下文（最近的 10 条消息）
                recent_messages = messages[-10:] if len(messages) > 10 else messages
                print(f"[智能分析] 准备发送 {len(recent_messages)} 条消息给AI")

                # 获取分发配置
                distribution_result = result.get('distribution', {})
                distribution_mode = distribution_result.get('mode', 'single')
                targets = distribution_result.get('targets', [])
                intent_result = distribution_result.get('intent')

                # 构造发送给下一阶段AI的消息
                system_prompt = f"你是AI助手，帮助{speaker_name}提供技术支持。"
                if intent_result and intent_result.get("summary_xml"):
                    intent_summary_xml = format_intent_analysis(intent_result)
                    
                    # 提取摘要用于显示，避免在UI显示原始XML
                    import re
                    match = re.search(r'<summary>(.*?)</summary>', intent_summary_xml, re.DOTALL)
                    summary_text = match.group(1).strip() if match else intent_summary_xml
                    
                    # 构造人类可读的提示
                    display_content = f"【意图识别分析】\n{summary_text}"
                    
                    formatted_messages = [
                        {"role": "system", "content": system_prompt + " 请根据意图识别分析结果直接给出建议。"},
                        {"role": "user", "content": display_content}
                    ]
                    print("[智能分析] 使用意图识别结果作为唯一上下文发送给下一阶段AI")
                else:
                    formatted_messages = [
                        {"role": "system", "content": f"你是AI助手，帮助{speaker_name}分析以下对话。{speaker_name}是主人公。"}
                    ]
                    for msg in recent_messages:
                        role = 'user' if msg.get('speaker') else 'assistant'
                        content = msg.get('content', '')
                        formatted_messages.append({
                            "role": role,
                            "content": content
                        })
                    print(f"[智能分析] 使用完整对话上下文发送，共 {len(formatted_messages)} 条消息")

                print(f"[智能分析] 消息内容预览:")
                for i, msg in enumerate(formatted_messages):
                    preview = msg['content'][:50]
                    suffix = '...' if len(msg['content']) > 50 else ''
                    print(f"  [{i}] {msg['role']}: {preview}{suffix}")

                # 根据分发模式决定处理方式
                is_multi_llm = (distribution_mode == 'think_tank')

                # 打印发送前的调试信息
                print(f"[智能分析] 📤 准备发送消息到AI:")
                print(f"  - 分发模式: {'智囊团' if is_multi_llm else '单模型'}")
                print(f"  - 聊天ID: {current_chat_id}")
                print(f"  - 消息数量: {len(formatted_messages)}")

                # 如果有智囊团目标，使用智囊团模式
                if distribution_mode == 'halt':
                    print(f"[智能分析] 🛑 分析流程已终止 (原因: {distribution_result.get('reason', 'Unknown')})")
                elif is_multi_llm and targets:
                    broadcast_message = {
                        "type": "agent_triggered",
                        "reason": phase1_result.get('reason', '检测到需要AI帮助分析，已启动智囊团'),
                        "speaker": speaker_name,
                        "messages": formatted_messages,
                        "chat_id": current_chat_id,
                        "is_multi_llm": True,
                        "intent_recognition": intent_result is not None,
                        "intent_data": intent_result
                    }
                    print(f"[智能分析] 📡 发送智囊团触发消息...")
                    await llm_manager.broadcast(broadcast_message)
                    print(f"[智能分析] ✅ 🤖 智囊团已触发，分发到{len(targets)}个目标")
                else:
                    # 使用单模型模式
                    broadcast_message = {
                        "type": "agent_triggered",
                        "reason": phase1_result.get('reason', '检测到需要AI帮助分析'),
                        "speaker": speaker_name,
                        "messages": formatted_messages,
                        "chat_id": current_chat_id,
                        "is_multi_llm": False,
                        "intent_recognition": intent_result is not None,
                        "intent_data": intent_result
                    }
                    print(f"[智能分析] 📡 发送单模型触发消息...")
                    await llm_manager.broadcast(broadcast_message)
                    print(f"[智能分析] ✅ 🤖 单模型模式已触发，等待AI回复...")
            except Exception as broadcast_error:
                print(f"[智能分析] ❌ 发送消息时出错: {broadcast_error}")
                import traceback
                traceback.print_exc()
        else:
            print(f"[智能分析] ❌ 检测到无需AI帮助，不发送消息")

    except Exception as e:
        print(f"[智能分析] ❌ 回调处理失败: {e}")
        import traceback
        traceback.print_exc()

# --- LLM 连接管理器 ---
class LLMConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[LLM连接] 新连接加入，当前活跃连接数: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"[LLM连接] 连接断开，当前活跃连接数: {len(self.active_connections)}")
        else:
            print(f"[LLM连接] 尝试断开不存在的连接")

    async def broadcast(self, message: dict):
        print(f"[LLM广播] 开始广播到 {len(self.active_connections)} 个连接")
        print(f"[LLM广播] 消息类型: {message.get('type', 'unknown')}")
        print(f"[LLM广播] 消息内容: {str(message)[:100]}{'...' if len(str(message)) > 100 else ''}")

        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
                print(f"[LLM广播] ✅ 成功发送到连接")
            except Exception as e:
                print(f"[LLM广播] ❌ 广播失败: {e}")
                disconnected.append(connection)

        # 移除断开的连接
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)

        print(f"[LLM广播] 广播完成，剩余 {len(self.active_connections)} 个活跃连接")

llm_manager = LLMConnectionManager()


# --- 智囊团请求处理函数 ---
async def handle_multi_llm_request(websocket: WebSocket, messages: list, chat_id: str):
    """处理智囊团请求"""
    config_data = load_config()
    active_names = config_data.get("multi_llm_active_names", [])
    configs = config_data.get("configs", [])
    cached_roles = load_think_tank_roles()
    role_lookup = build_identity_lookup(cached_roles)

    active_configs = [c for c in configs if c["name"] in active_names]

    if not active_configs:
        await websocket.send_json({"type": "error", "content": "未选择任何模型加入集群 (请在设置中勾选)"})
        return

    # Check if job analysis exists locally
    if not os.path.exists(job_manager.job_analysis_path):
        await websocket.send_json({"type": "error", "content": "请先设置目标岗位，完成岗位分析。助手对话框右上角→设置目标岗位"})
        return

    # Prepare tasks
    async def stream_one(conf):
        name = conf["name"]
        try:
            client = LLMClient(conf["api_key"], conf["base_url"], conf["model"])

            # Handle separate system prompt
            current_messages = [m.copy() for m in messages]
            config_prompt = conf.get("system_prompt", "").strip()

            # Check identity tags and resolve active role
            raw_tags = conf.get("tags", [])
            normalized_tags = [normalize_identity_identifier(tag) for tag in raw_tags if tag]
            active_tag, active_role, disabled_candidates = select_identity_role(normalized_tags, role_lookup)

            identity_applied = False
            if active_role:
                tag_prompt = active_role["prompt"]
                sys_idx = next((i for i, m in enumerate(current_messages) if m["role"] == "system"), -1)
                if sys_idx != -1:
                    current_messages[sys_idx]["content"] = tag_prompt
                else:
                    current_messages.insert(0, {"role": "system", "content": tag_prompt})
                identity_applied = True
                print(f"[智囊团] 应用身份标签 Prompt: {active_role['name']} → 模型 {name}")
            elif config_prompt:
                sys_idx = next((i for i, m in enumerate(current_messages) if m["role"] == "system"), -1)
                if sys_idx != -1:
                    current_messages[sys_idx]["content"] = config_prompt
                else:
                    current_messages.insert(0, {"role": "system", "content": config_prompt})
            elif normalized_tags:
                if disabled_candidates:
                    print(f"[智囊团] 身份已停用，跳过 Prompt: {', '.join(disabled_candidates)}")
                else:
                    print(f"[智囊团] 未找到可用身份 Prompt: {normalized_tags}")

            # Inject Job Analysis Context
            inject_job_analysis_to_messages(current_messages)

            # [调试] 显示实际发送给模型的完整 prompt
            print(f"\n{'='*80}")
            print(f"[调试] [智囊团] 正在发送请求到模型: {conf.get('model', 'Unknown')} (Stream=True)")
            print(f"{'='*80}")
            print(f"[调试] [智囊团] 模型名称: {name}")
            print(f"[调试] [智囊团] 使用 System Prompt: {config_prompt if (config_prompt and not identity_applied) else '否'}")
            if normalized_tags:
                if identity_applied and active_role:
                    print(f"[调试] [智囊团] 身份标签: {normalized_tags} → 激活: {active_role['name']} ({active_tag})")
                elif disabled_candidates:
                    print(f"[调试] [智囊团] 身份标签: {normalized_tags} (停用: {', '.join(disabled_candidates)})")
                else:
                    print(f"[调试] [智囊团] 身份标签: {normalized_tags} (未找到可用身份)")
            print(f"[调试] [智囊团] 消息总数: {len(current_messages)}")
            print(f"{'-'*80}")
            print("[调试] [智囊团] 完整 Prompt 内容:")
            print(f"{'-'*80}")
            for i, msg in enumerate(current_messages):
                role = msg.get('role', 'unknown')
                content = msg.get('content', '')
                print(f"\n[消息 {i+1}] 角色: {role}")
                print(f"[消息 {i+1}] 内容: {content[:200]}{'...' if len(content) > 200 else ''}")
            print(f"\n{'='*80}\n")

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
    if not args.no and ASR_AVAILABLE:
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
            print("[提示] 使用 --no 参数跳过所有模型初始化")
    else:
        if args.no:
            print("[配置] 已跳过所有模型初始化 (--no)")
        else:
            print("[配置] ASR 系统不可用")

    # Initialize Intelligent Agent
    if AGENT_AVAILABLE and not args.no:
        try:
            # Load agent from config
            config_data = load_config()
            agent_config = config_data.get("agent_config", {})
            agent_model_name = agent_config.get("model_name")

            if agent_model_name:
                # 检查是否显式指定了模型类型
                model_type = agent_config.get('model_type', None)

                if model_type == 'local':
                    # 显式指定为本地模型
                    print(f"[配置] 使用本地模型: {agent_model_name}")
                    model_config = {
                        'model_type': 'local',
                        'model': agent_model_name
                    }
                    agent_manager.load_agent(agent_config, model_config)
                    print(f"[成功] 智能 Agent 已加载（本地模型）: {agent_model_name}")
                else:
                    # 未显式指定或指定为API，先尝试从configs中查找
                    model_config = next(
                        (c for c in config_data.get("configs", []) if c["name"] == agent_model_name),
                        None
                    )

                    if model_config:
                        # 在API配置中找到了，使用API模式
                        model_config['model_type'] = 'api'
                        agent_manager.load_agent(agent_config, model_config)
                        print(f"[成功] 智能 Agent 已加载（API模型）: {agent_model_name}")
                    else:
                        # API配置中没找到，作为本地模型处理
                        print(f"[配置] 在API配置中未找到 '{agent_model_name}'，作为本地模型加载")
                        model_config = {
                            'model_type': 'local',
                            'model': agent_model_name
                        }
                        agent_manager.load_agent(agent_config, model_config)
                        print(f"[成功] 智能 Agent 已加载（本地模型）: {agent_model_name}")
            else:
                print("[配置] 未配置智能 Agent 模型")

            # 注册智能分析回调
            trigger_manager.add_callback(agent_analysis_callback)
            print("[成功] 智能分析回调已注册")

            # 设置trigger manager的event loop引用
            trigger_manager.set_event_loop(main_event_loop)
            print("[成功] Trigger Manager event loop已设置")

            # 设置广播回调，用于发送WebSocket消息
            async def broadcast_to_asr(message):
                """向ASR面板广播消息"""
                await manager.broadcast(message)
            trigger_manager.set_broadcast_callback(broadcast_to_asr)
            print("[成功] 智能分析广播回调已设置")

            # 加载触发阈值和消息上限
            min_characters = agent_config.get("min_characters", 10)
            silence_threshold = agent_config.get("silence_threshold", 2)
            max_messages = agent_config.get("max_messages", 50)
            trigger_manager.set_thresholds(min_characters, silence_threshold)
            trigger_manager.set_max_history(max_messages)
            print(f"[成功] 触发参数已加载: {min_characters}字, {silence_threshold}秒, {max_messages}条消息")

            # 加载主人公配置
            protagonist = config_data.get("protagonist", "")
            if protagonist:
                trigger_manager.set_protagonist(protagonist)
                print(f"[成功] 主人公已加载: {protagonist}")

        except Exception as e:
            print(f"[错误] 智能 Agent 初始化失败: {e}")
    else:
        if args.no:
            print("[配置] 已跳过智能分析初始化 (--no)")
        elif not AGENT_AVAILABLE:
            print("[配置] 智能 Agent 模块不可用")

@app.get("/")
async def get():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)

    # 立即发送 ASR 系统状态给前端
    await websocket.send_json({
        "time": "00:00:00",
        "speaker": "系统",
        "text": "ASR 系统未初始化" if not asr_system else "ASR 系统已就绪",
        "asr_status": {
            "initialized": asr_system is not None,
            "message": "请使用正常模式启动服务器以启用实时语音转写功能" if not asr_system else "实时语音转写功能已启用"
        }
    })

    try:
        while True:
            # Keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# --- LLM Endpoints ---

@app.get("/api/ui_state")
async def get_ui_state():
    """获取前端 UI 状态"""
    return load_ui_state()

@app.post("/api/ui_state")
async def update_ui_state(data: dict = Body(...)):
    """更新前端 UI 状态 (增量更新)"""
    current_state = load_ui_state()
    # 深度合并或替换顶层键
    current_state.update(data)
    save_ui_state(current_state)
    return {"status": "success", "state": current_state}

@app.get("/api/identities")
async def get_identities():
    """获取可用身份"""
    return load_think_tank_roles()


def validate_identity_payload(role_id: str, name: str, prompt: str):
    if not role_id:
        raise HTTPException(status_code=400, detail="请提供唯一的身份ID")
    if not re.match(r"^[a-z0-9_-]+$", role_id):
        raise HTTPException(status_code=400, detail="ID 仅能包含字母、数字、下划线或连字符")
    if not name:
        raise HTTPException(status_code=400, detail="请输入身份名称")
    if not prompt:
        raise HTTPException(status_code=400, detail="请输入身份提示词")


@app.post("/api/identities")
async def create_identity(data: dict = Body(...)):
    raw_id = data.get("id", "")
    normalized_id = normalize_identity_identifier(raw_id)
    name = (data.get("name") or "").strip()
    prompt = (data.get("prompt") or "").strip()
    enabled = bool(data.get("enabled", True))

    validate_identity_payload(normalized_id, name, prompt)

    roles = load_think_tank_roles()
    if any(normalize_identity_identifier(role.get("id")) == normalized_id for role in roles):
        raise HTTPException(status_code=400, detail="该身份ID已存在")

    new_role = {
        "id": normalized_id,
        "name": name,
        "prompt": prompt,
        "enabled": enabled
    }
    roles.append(new_role)
    save_think_tank_roles(roles)
    return {"status": "success", "role": new_role}


@app.put("/api/identities/{role_id}")
async def update_identity(role_id: str, data: dict = Body(...)):
    normalized_id = normalize_identity_identifier(role_id)
    roles = load_think_tank_roles()
    target = next((role for role in roles if normalize_identity_identifier(role.get("id")) == normalized_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="身份不存在")

    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="身份名称不能为空")
        target["name"] = name

    if "prompt" in data:
        prompt = (data.get("prompt") or "").strip()
        if not prompt:
            raise HTTPException(status_code=400, detail="提示词不能为空")
        target["prompt"] = prompt

    if "enabled" in data:
        target["enabled"] = bool(data.get("enabled"))

    save_think_tank_roles(roles)
    return {"status": "success", "role": target}


@app.delete("/api/identities/{role_id}")
async def delete_identity(role_id: str):
    normalized_id = normalize_identity_identifier(role_id)
    roles = load_think_tank_roles()
    index = next(
        (idx for idx, role in enumerate(roles) if normalize_identity_identifier(role.get("id")) == normalized_id),
        None
    )
    if index is None:
        raise HTTPException(status_code=404, detail="身份不存在")

    removed = roles.pop(index)
    save_think_tank_roles(roles)
    return {"status": "success", "removed": removed}

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
        # Update ResumeManager's LLM client as well
        resume_manager.set_llm_client(llm_client)
        # Update JobManager's LLM client too
        job_manager.set_llm_client(llm_client)
    
    return {"status": "success", "message": "配置已更新"}

@app.post("/api/test_connection")
async def test_connection_endpoint(data: dict = Body(...)):
    """
    Test connection with provided config.
    """
    api_key = data.get("api_key")
    base_url = data.get("base_url")
    model = data.get("model")
    
    if not all([api_key, base_url, model]):
        return {"success": False, "message": "缺少必需字段"}
        
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
    title = data.get("title", "新聊天")
    new_chat = chat_manager.create_chat(title)
    return new_chat

@app.get("/api/chats/{chat_id}")
async def get_chat(chat_id: str):
    chat = chat_manager.get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="未找到聊天")
    return chat

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    success = chat_manager.delete_chat(chat_id)
    if not success:
        raise HTTPException(status_code=404, detail="未找到聊天")
    return {"status": "success"}

@app.post("/api/chats/{chat_id}/clear")
async def clear_chat(chat_id: str):
    success = chat_manager.clear_chat_messages(chat_id)
    if not success:
        raise HTTPException(status_code=404, detail="未找到聊天")
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
        "config": agent_config,
        "model_local": config_data.get("model_local", ["Qwen3-0.6B"])
    }

@app.get("/api/agent/roles")
async def get_agent_roles():
    """获取智囊团角色配置"""
    try:
        with open("data/agent.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"think_tank_roles": []}
    except json.JSONDecodeError:
        return {"think_tank_roles": []}

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
    print(f"DEBUG: Received update_agent_config data: {data}")
    
    # Update config file
    config_data = load_config()
    agent_config = config_data.get("agent_config", {})
    
    # Only update fields that are present in data
    if "min_characters" in data:
        agent_config["min_characters"] = data["min_characters"]
        
    if "silence_threshold" in data:
        agent_config["silence_threshold"] = data["silence_threshold"]
        
    if "max_messages" in data:
        agent_config["max_messages"] = data["max_messages"]
        
    if "model_name" in data:
        agent_config["model_name"] = data["model_name"]
        
    if "model_type" in data:
        agent_config["model_type"] = data["model_type"]
        
    if "intent_recognition_enabled" in data:
        agent_config["intent_recognition_enabled"] = data["intent_recognition_enabled"]
        
    if "intent_model_name" in data:
        agent_config["intent_model_name"] = data["intent_model_name"]
        
    if "intent_model_type" in data:
        agent_config["intent_model_type"] = data["intent_model_type"]

    # Update trigger manager thresholds if changed
    min_chars = agent_config.get("min_characters", 10)
    silence_thresh = agent_config.get("silence_threshold", 2)
    max_msgs = agent_config.get("max_messages", 50)
    
    trigger_manager.set_thresholds(min_chars, silence_thresh)
    trigger_manager.set_max_history(max_msgs)

    config_data["agent_config"] = agent_config
    save_config(config_data)

    # Reload agent if model changed
    model_name = agent_config.get("model_name")
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
    """手动触发智能分析或意图识别"""
    if not AGENT_AVAILABLE:
        raise HTTPException(status_code=503, detail="智能 Agent 模块不可用")

    messages = data.get("messages", [])
    speaker_name = data.get("speaker_name", "用户")
    request_type = data.get("request_type", "agent_analysis")  # 区分是智能分析还是意图识别
    modules_param = data.get("modules")
    print(f"[AgentAPI] 收到 /api/agent/analyze 请求 -> type={request_type}, speaker={speaker_name}, messages={len(messages)}")

    def load_intent_agent(intent_cfg: dict):
        config_data = load_config()
        model_type = intent_cfg.get("model_type", "local")
        model_name = intent_cfg.get("model_name", "Qwen3-0.6B")
        print(f"[AgentAPI] 意图识别模型配置: type={model_type}, name={model_name}")

        model_config = None
        if model_type == "api":
            model_config = next(
                (c for c in config_data.get("configs", []) if c["name"] == model_name),
                None
            )
            if model_config:
                model_config['model_type'] = 'api'
                print(f"[意图识别] 已加载API模型: {model_name}")
            else:
                print(f"[意图识别] 未找到API模型 '{model_name}'，降级到本地模式")
                model_type = "local"
                model_name = "Qwen3-0.6B"
                model_config = None

        agent_manager.configure_intent_agent(
            {
                "model_type": model_type,
                "model_name": model_name
            },
            model_config
        )
        if model_type == "local":
            print(f"[意图识别] 已加载本地模型: {model_name}")

    def normalize_modules(value):
        if not value:
            return None
        if isinstance(value, str):
            candidates = [value]
        else:
            candidates = list(value)
        normalized = {'analysis': False, 'intent': False, 'think_tank': False}
        for item in candidates:
            name = str(item).strip().lower()
            if name in ("analysis", "smart", "smart_analysis"):
                normalized['analysis'] = True
            elif name in ("intent", "intent_recognition"):
                normalized['intent'] = True
            elif name in ("think_tank", "thinktank", "distribution"):
                normalized['think_tank'] = True
        return normalized if any(normalized.values()) else None

    modules_request = normalize_modules(modules_param)
    if not modules_request and request_type == "intent_recognition":
        modules_request = {'analysis': False, 'intent': True, 'think_tank': False}

    if modules_request:
        print(f"[AgentAPI] modules_request={modules_request}, request_type={request_type}")

        if modules_request['intent']:
            intent_config = data.get("intent_recognition_config", {})
            load_intent_agent(intent_config)

        print(
            "[AgentAPI] 运行模块 -> "
            f"analysis={modules_request['analysis']} | "
            f"intent={modules_request['intent']} | "
            f"think_tank={modules_request['think_tank']}"
        )

        result = await agent_manager.run_pipeline(
            messages,
            speaker_name,
            use_analysis=modules_request['analysis'],
            use_intent=modules_request['intent'],
            use_think_tank=modules_request['think_tank'],
            bypass_enabled=True,
            force_modules=True
        )

        intent_success = bool(result.get("phase2", {}).get("success")) if modules_request['intent'] else None
        print(
            "[AgentAPI] pipeline完成 -> "
            f"phase1_reason={result.get('phase1', {}).get('reason')} | "
            f"intent_success={intent_success}"
        )

        if modules_request['intent'] and not modules_request['analysis']:
            phase2_result = result.get("phase2", {})
            success = bool(phase2_result and phase2_result.get("success"))
            reason = "意图识别完成" if success else phase2_result.get("error", "意图识别失败")
            result["phase1"] = {
                "is": False,
                "reason": reason,
                "confidence": 0.0,
                "intent_only": True,
                "intent_success": success
            }

        return result

    # 默认执行阶段1分析
    result = await agent_manager.analyze_conversation(messages, speaker_name)
    summary_flag = result.get("is")
    summary_reason = result.get("reason", "")
    print(f"[AgentAPI] 分析完成 -> need_ai={summary_flag}, reason={summary_reason}")
    return result

@app.get("/api/protagonist")
async def get_protagonist():
    """获取当前主人公配置"""
    config_data = load_config()
    protagonist = config_data.get("protagonist", "")
    return {"protagonist": protagonist}

@app.post("/api/protagonist")
async def set_protagonist_endpoint(data: dict = Body(...)):
    """设置主人公"""
    if not AGENT_AVAILABLE:
        raise HTTPException(status_code=503, detail="智能 Agent 模块不可用")
    
    protagonist = data.get("protagonist", "").strip()
    
    # 更新trigger manager
    trigger_manager.set_protagonist(protagonist)
    
    # 保存到配置文件
    config_data = load_config()
    config_data["protagonist"] = protagonist
    save_config(config_data)
    
    return {"status": "success", "protagonist": protagonist}

@app.post("/api/agent/trigger")
async def trigger_multi_llm(data: dict = Body(...)):
    """手动触发智囊团"""
    messages = data.get("messages", [])
    chat_id = data.get("chat_id")

    # This will be handled by the WebSocket endpoint
    return {
        "status": "triggered",
        "message": "智囊团已触发",
        "messages": messages,
        "chat_id": chat_id
    }

# --- 声纹管理 API ---

@app.get("/api/voiceprints")
async def get_voiceprints():
    """获取声纹库列表"""
    # 即使ASR系统未初始化，也能查看声纹列表
    voiceprint_dir = asr_system.VOICEPRINT_DIR if asr_system else "voiceprints"

    if not os.path.exists(voiceprint_dir):
        return {"voiceprints": []}

    voiceprints = []
    for filename in os.listdir(voiceprint_dir):
        if filename.lower().endswith('.wav'):
            name = os.path.splitext(filename)[0]
            wav_path = os.path.join(voiceprint_dir, filename)
            npy_path = os.path.join(voiceprint_dir, f"{name}.npy")

            # 获取文件大小
            wav_size = os.path.getsize(wav_path)
            has_embedding = os.path.exists(npy_path)
            embedding_size = os.path.getsize(npy_path) if has_embedding else 0

            # 获取音频时长（简单估算）
            try:
                import soundfile as sf
                info = sf.info(wav_path)
                duration = round(info.duration, 2)
            except:
                duration = None

            voiceprints.append({
                "name": name,
                "wav_file": filename,
                "wav_size": wav_size,
                "has_embedding": has_embedding,
                "embedding_size": embedding_size,
                "duration": duration,
                "created_time": os.path.getctime(wav_path)
            })

    return {"voiceprints": voiceprints}

@app.post("/api/voiceprints")
async def create_voiceprint(data: dict = Body(...)):
    """录制并保存新的声纹"""
    name = data.get("name", "").strip()
    audio_data = data.get("audio_data", "")

    if not name:
        raise HTTPException(status_code=400, detail="请输入说话人姓名")

    if not audio_data:
        raise HTTPException(status_code=400, detail="缺少音频数据")

    # 检查姓名是否已存在
    voiceprint_dir = asr_system.VOICEPRINT_DIR if asr_system else "voiceprints"
    wav_path = os.path.join(voiceprint_dir, f"{name}.wav")
    npy_path = os.path.join(voiceprint_dir, f"{name}.npy")

    if os.path.exists(wav_path):
        raise HTTPException(status_code=400, detail=f"说话人 '{name}' 已存在")

    try:
        # 解码 base64 音频数据
        # 前端发送的格式: "data:audio/wav;base64,<base64_data>"
        if ',' in audio_data:
            header, audio_base64 = audio_data.split(',', 1)
        else:
            audio_base64 = audio_data

        audio_bytes = base64.b64decode(audio_base64)

        # 保存为临时 WAV 文件
        temp_path = os.path.join(voiceprint_dir, f"temp_{name}.wav")
        with open(temp_path, 'wb') as f:
            f.write(audio_bytes)

        # 检查音频时长
        duration = None
        try:
            import soundfile as sf
            info = sf.info(temp_path)
            duration = info.duration

            if duration < 10:
                os.remove(temp_path)
                raise HTTPException(status_code=400, detail=f"录制时长太短 ({duration:.1f}秒)，至少需要 10 秒")

            if duration > 40:
                os.remove(temp_path)
                raise HTTPException(status_code=400, detail=f"录制时长太长 ({duration:.1f}秒)，最多 40 秒")
        except Exception as e:
            os.remove(temp_path)
            raise HTTPException(status_code=400, detail=f"音频验证失败: {str(e)}")

        # 如果 ASR 系统已初始化，使用完整流程
        if asr_system:
            # 转换并保存为标准格式
            asr_system.check_and_convert_audio(temp_path)
            # 重命名为最终文件名
            os.rename(temp_path, wav_path)

            # 计算并保存嵌入
            print(f"正在为 {name} 计算声纹嵌入...")
            embedding = asr_system.extract_embedding(wav_path)
            if embedding is not None:
                import numpy as np
                np.save(npy_path, embedding)
                print(f"✅ 声纹嵌入已保存: {name}")

                # 重新加载声纹库
                asr_system.load_voiceprints()

                return {
                    "status": "success",
                    "message": f"声纹已保存: {name}",
                    "name": name,
                    "duration": duration,
                    "embedding_saved": True
                }
            else:
                os.remove(wav_path)
                if os.path.exists(npy_path):
                    os.remove(npy_path)
                raise HTTPException(status_code=500, detail="声纹嵌入计算失败")
        else:
            # ASR 系统未初始化，只保存 WAV 文件
            # 后续 main.py 启动时会自动转换
            os.rename(temp_path, wav_path)
            print(f"⚠️  ASR 系统未初始化，已保存 WAV 文件: {name}")
            print(f"💡 提示：使用正常模式启动服务器时会自动计算声纹嵌入")

            return {
                "status": "success",
                "message": f"声纹已保存: {name}（仅音频文件，嵌入将在下次正常启动时计算）",
                "name": name,
                "duration": duration,
                "embedding_saved": False
            }

    except HTTPException:
        raise
    except Exception as e:
        # 清理临时文件
        temp_path = os.path.join(voiceprint_dir, f"temp_{name}.wav")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")

@app.delete("/api/voiceprints/{name}")
async def delete_voiceprint(name: str):
    """删除声纹"""
    # 即使ASR系统未初始化，也能删除声纹文件
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="请提供说话人姓名")

    voiceprint_dir = asr_system.VOICEPRINT_DIR if asr_system else "voiceprints"
    wav_path = os.path.join(voiceprint_dir, f"{name}.wav")
    npy_path = os.path.join(voiceprint_dir, f"{name}.npy")

    deleted_files = []

    # 删除 WAV 文件
    if os.path.exists(wav_path):
        os.remove(wav_path)
        deleted_files.append(f"{name}.wav")

    # 删除 NPY 文件
    if os.path.exists(npy_path):
        os.remove(npy_path)
        deleted_files.append(f"{name}.npy")

    if not deleted_files:
        raise HTTPException(status_code=404, detail=f"未找到说话人 '{name}' 的声纹")

    # 只有在ASR系统初始化时才重新加载声纹库
    if asr_system:
        asr_system.load_voiceprints()

    return {
        "status": "success",
        "message": f"已删除声纹: {name}",
        "deleted_files": deleted_files
    }

@app.post("/api/voiceprints/rebuild")
async def rebuild_voiceprints():
    """重新计算所有声纹嵌入"""
    if not asr_system:
        return {
            "status": "error",
            "detail": "ASR 系统未初始化，无法重新计算嵌入。",
            "message": "请使用正常模式启动服务器（不使用 --no 参数）"
        }

    try:
        asr_system.load_voiceprints()
        return {
            "status": "success",
            "message": "声纹嵌入重新计算完成",
            "count": len(asr_system.speakers)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重新计算失败: {str(e)}")

@app.get("/api/voiceprint/audio/{name}")
async def get_voiceprint_audio(name: str):
    """获取声纹音频文件"""
    # 即使ASR系统未初始化，也能提供音频文件
    # 解码URL编码的名字
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="请提供说话人姓名")

    voiceprint_dir = asr_system.VOICEPRINT_DIR if asr_system else "voiceprints"
    wav_path = os.path.join(voiceprint_dir, f"{name}.wav")

    if not os.path.exists(wav_path):
        raise HTTPException(status_code=404, detail=f"未找到声纹文件: {name}")

    # 返回音频文件
    from fastapi.responses import FileResponse
    return FileResponse(
        wav_path,
        media_type='audio/wav',
        filename=f"{name}.wav"
    )


# --- Resume Management Endpoints ---

@app.post("/api/resume/upload")
async def upload_resume(file: UploadFile = File(...)):
    """Upload and parse resume PDF."""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")
    
    # Check if already processing
    status = resume_manager.get_status()
    if status["state"] == "processing":
        return JSONResponse(status_code=400, content={"status": "error", "message": "正在处理另一个简历，请稍候或停止当前任务"})

    try:
        content = await file.read()
        # Save PDF
        pdf_path = await resume_manager.save_pdf(content, file.filename)
        
        # Start background processing
        current_config_data = load_config()
        task = asyncio.create_task(resume_manager.process_resume_task(pdf_path, config_data=current_config_data))
        resume_manager.current_task = task
        
        return {"status": "success", "message": "简历已上传，开始后台分析..."}
            
    except Exception as e:
        print(f"Resume upload error: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@app.post("/api/resume/stop")
async def stop_resume_processing():
    """Stop current resume processing."""
    await resume_manager.stop_processing()
    return {"status": "success", "message": "已停止处理"}

@app.get("/api/resume/status")
async def get_resume_status():
    """Get resume status and configuration."""
    status = resume_manager.get_status()
    status["personalization_enabled"] = resume_personalization_enabled
    return status

@app.post("/api/resume/toggle")
async def toggle_resume_personalization(data: dict = Body(...)):
    """Toggle resume personalization."""
    global resume_personalization_enabled
    enabled = data.get("enabled", False)
    resume_personalization_enabled = enabled
    return {"status": "success", "enabled": resume_personalization_enabled}

@app.get("/api/resume/xml")
async def get_resume_xml():
    """Get the parsed resume XML."""
    xml = resume_manager.get_resume_xml()
    if not xml:
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"xml": xml}

@app.get("/api/resume/markdown")
async def get_resume_markdown():
    """Get the parsed resume Markdown."""
    md = resume_manager.get_resume_markdown()
    if not md:
        raise HTTPException(status_code=404, detail="Resume markdown not found")
    return {"markdown": md}

    return {"markdown": md}

# --- Job Analysis Endpoints ---

@app.post("/api/job/generate")
async def generate_job_analysis(data: dict = Body(...)):
    """Generate job analysis background task."""
    title = data.get("title")
    jd = data.get("jd", "")
    
    if not title:
        raise HTTPException(status_code=400, detail="请提供职位标题")
        
    # Check if already processing
    status = job_manager.processing_status
    if status["state"] == "processing":
         return JSONResponse(status_code=400, content={"status": "error", "message": "另一个分析正在进行中"})

    current_config_data = load_config()
    # Merge transient options from request
    if "thinking_mode" in data:
         if "job_config" not in current_config_data:
             current_config_data["job_config"] = {}
         current_config_data["job_config"]["thinking_mode"] = data["thinking_mode"]

    await job_manager.generate_analysis(title, jd, config_data=current_config_data)
    
    # Trigger cache update (optimistic or wait for completion? 
    # Since it's async, we might not update immediately, but the client will poll status.
    # The cache should be updated after completion. 
    # For simplicity, we can't update cache here. 
    # But we can update it in the status check or separate task.)
    
    return {"status": "success", "message": "已开始职位分析生成"}

@app.get("/api/job/status")
async def get_job_status():
    status = job_manager.processing_status.copy()
    info = job_manager.get_job_info()
    has_content = os.path.exists(job_manager.job_analysis_path)
    
    # If completed and cache is empty, update cache
    if status["state"] == "completed" and not CACHED_JOB_CONTEXT:
        update_job_context_cache()
    
    # Also if state is idle but file exists (restart case), ensure cache
    if status["state"] == "idle" and has_content and not CACHED_JOB_CONTEXT:
        update_job_context_cache()

    return {
        "status": status,
        "info": info,
        "has_analysis": has_content
    }

@app.get("/api/job/content")
async def get_job_content():
    content = await job_manager.get_analysis_content()
    if not content:
        raise HTTPException(status_code=404, detail="未找到分析结果")
    return {"content": content}

@app.post("/api/job/clear")
async def clear_job_analysis():
    job_manager.clear_analysis()
    update_job_context_cache()
    return {"status": "success", "message": "职位分析已清空"}

def inject_job_analysis_to_messages(messages: list[dict]):
    """Inject job analysis context into system prompt if available."""
    if not CACHED_JOB_CONTEXT:
        return

    prompt = f"""
    为了让回答更具针对性，请参考以下【目标岗位信息】进行适配：
    <job_context_global>{CACHED_JOB_CONTEXT}</job_context_global>
    """

    found_system = False
    for msg in messages:
        if msg.get("role") == "system":
            if "<job_context_global>" not in msg["content"]:
                msg["content"] += prompt
            found_system = True
            break
            
    if not found_system:
        messages.insert(0, {"role": "system", "content": prompt})

def inject_resume_to_messages(messages: list[dict]):
    """Inject resume XML into system prompt if enabled."""
    if not resume_personalization_enabled:
        return
    
    xml = resume_manager.get_resume_xml()
    if not xml:
        return

    prompt = f"\n\n<resume_context>\n{xml}\n</resume_context>\n请根据以上简历信息，个性化你的回答。"
    
    for msg in messages:
        if msg.get("role") == "system":
            if "<resume_context>" not in msg["content"]:
                msg["content"] += prompt
            return
            
    messages.insert(0, {"role": "system", "content": prompt})

@app.websocket("/ws/llm")
async def llm_websocket(websocket: WebSocket):
    await llm_manager.connect(websocket)
    current_data = load_config()
    curr_name = current_data.get("current_config")
    curr_conf = next((c for c in current_data.get("configs", []) if c["name"] == curr_name), None)

    if curr_conf:
        llm_client.update_config(
            api_key=curr_conf.get("api_key"),
            base_url=curr_conf.get("base_url"),
            model=curr_conf.get("model")
        )
        job_manager.set_llm_client(llm_client)
    
    # Store initial config to detect changes
    last_config_signature = None

    try:
        while True:
            data = await websocket.receive_json()

            # Reload config for every request to ensure freshness
            current_data = load_config()
            curr_name = current_data.get("current_config")
            curr_conf = next((c for c in current_data.get("configs", []) if c["name"] == curr_name), None)
            
            # Update LLM Client if config changed
            if curr_conf:
                # Create a signature to check if we really need to update LLM client (avoid overhead if possible, though update_config is cheap)
                # But simple update is fine.
                llm_client.update_config(
                    api_key=curr_conf.get("api_key"),
                    base_url=curr_conf.get("base_url"),
                    model=curr_conf.get("model")
                )
                resume_manager.set_llm_client(llm_client)
                job_manager.set_llm_client(llm_client)

            # 处理智能分析触发消息
            if data.get("type") == "agent_triggered":
                print(f"[智能分析] ✅ WebSocket 收到触发消息")
                messages = data.get("messages", [])
                chat_id = data.get("chat_id")
                is_multi_llm = data.get("is_multi_llm", False)
                intent_recognition = data.get("intent_recognition", False)

                print(f"[智能分析] 📋 消息详情:")
                print(f"  - 分发模式: {'智囊团' if is_multi_llm else '单模型'}")
                print(f"  - 意图识别: {'开启' if intent_recognition else '关闭'}")
                print(f"  - 消息数量: {len(messages)}")
                print(f"  - 聊天ID: {chat_id}")
                print(f"[智能分析] 📝 消息内容预览:")
                for i, msg in enumerate(messages):
                    print(f"  [{i}] {msg.get('role', 'unknown')}: {str(msg.get('content', ''))[:50]}{'...' if len(str(msg.get('content', ''))) > 50 else ''}")

                # 根据模式处理
                if is_multi_llm:
                    # 处理智囊团模式
                    await handle_multi_llm_request(websocket, messages, chat_id)
                else:
                    # 处理单模型模式
                    await websocket.send_json({
                        "type": "agent_notification",
                        "content": "🤖 智能分析已启动，将为您提供专业建议"
                    })

                    # 修复：处理当前配置的 System Prompt
                    current_messages = [m.copy() for m in messages]
                    config_prompt = (curr_conf.get("system_prompt", "") if curr_conf else "").strip()

                    # 检查是否选择了身份标签
                    raw_tags = curr_conf.get("tags", []) if curr_conf else []
                    normalized_tags = [normalize_identity_identifier(tag) for tag in raw_tags if tag]
                    roles = load_think_tank_roles()
                    role_lookup = build_identity_lookup(roles)
                    active_tag, active_role, disabled_candidates = select_identity_role(normalized_tags, role_lookup)
                    identity_applied = False

                    # 应用 System Prompt
                    if active_role:
                        tag_prompt = active_role["prompt"]
                        identity_applied = True
                        print(f"[智能分析] 应用身份标签 Prompt: {active_role['name']}")
                        sys_idx = next((i for i, m in enumerate(current_messages) if m["role"] == "system"), -1)
                        if sys_idx != -1:
                            current_messages[sys_idx]["content"] = tag_prompt
                        else:
                            current_messages.insert(0, {"role": "system", "content": tag_prompt})
                    elif config_prompt:
                        sys_idx = next((i for i, m in enumerate(current_messages) if m["role"] == "system"), -1)
                        if sys_idx != -1:
                            current_messages[sys_idx]["content"] = config_prompt
                        else:
                            current_messages.insert(0, {"role": "system", "content": config_prompt})
                    elif normalized_tags:
                        if disabled_candidates:
                            print(f"[智能分析] 身份已停用，跳过 Prompt: {', '.join(disabled_candidates)}")
                        else:
                            print(f"[智能分析] 未找到标签 '{normalized_tags[0]}' 的 Prompt 定义")

                    # Check if job analysis exists locally
                    if not os.path.exists(job_manager.job_analysis_path):
                        error_msg = "请先设置目标岗位，完成岗位分析。助手对话框右上角→设置目标岗位"
                        await websocket.send_json({"type": "done", "full_text": error_msg})
                        if chat_id:
                            messages.append({"role": "assistant", "content": error_msg})
                            chat_manager.update_chat_messages(chat_id, messages)
                        continue

                    inject_job_analysis_to_messages(current_messages)

                    # [调试] 显示实际发送给模型的完整 prompt
                    print(f"\n{'='*80}")
                    print(f"[调试] [智能分析] 正在发送请求到模型: {curr_conf.get('model', 'Unknown')} (Stream=True)")
                    print(f"{'='*80}")
                    print(f"[调试] [智能分析] 当前配置: {curr_conf.get('name', 'Unknown')}")
                    print(f"[调试] [智能分析] 使用 System Prompt: {config_prompt if (config_prompt and not identity_applied) else '否'}")
                    if normalized_tags:
                        if identity_applied and active_role:
                            print(f"[调试] [智能分析] 身份标签: {normalized_tags} → 激活: {active_role['name']} ({active_tag})")
                        elif disabled_candidates:
                            print(f"[调试] [智能分析] 身份标签: {normalized_tags} (停用: {', '.join(disabled_candidates)})")
                        else:
                            print(f"[调试] [智能分析] 身份标签: {normalized_tags} (未找到可用身份)")
                    print(f"[调试] [智能分析] 消息总数: {len(current_messages)}")
                    print(f"{'-'*80}")
                    print("[调试] [智能分析] 完整 Prompt 内容:")
                    print(f"{'-'*80}")
                    for i, msg in enumerate(current_messages):
                        role = msg.get('role', 'unknown')
                        content = msg.get('content', '')
                        print(f"\n[消息 {i+1}] 角色: {role}")
                        print(f"[消息 {i+1}] 内容: {content}")
                    print(f"\n{'='*80}\n")

                    # 直接使用当前配置的模型
                    response_text = ""
                    try:
                        async for chunk in llm_client.chat_stream(current_messages):
                            await websocket.send_json({"type": "chunk", "content": chunk})
                            response_text += chunk

                        await websocket.send_json({"type": "done", "full_text": response_text})

                        # 保存到聊天历史
                        if chat_id:
                            messages.append({"role": "assistant", "content": response_text})
                            chat_manager.update_chat_messages(chat_id, messages)

                    except Exception as e:
                        print(f"单模型流式响应错误: {e}")
                        await websocket.send_json({"type": "error", "content": f"流式响应错误: {str(e)}"})

                continue

            # data format: { "messages": [...], "chat_id": "...", "is_multi_llm": bool }
            messages = data.get("messages", [])
            chat_id = data.get("chat_id")
            is_multi_llm = data.get("is_multi_llm", False)

            # 获取动态 system prompt
            config_data = load_config()
            agent_config = config_data.get("agent_config", {})
            intent_enabled = agent_config.get("intent_recognition_enabled", False)
            
            from intelligent_agent import get_sub_agent_system, normalize_identity_identifier
            system_prompt = get_sub_agent_system(
                agent_config_path=AGENT_ROLE_FILE
            )
            
            # Add system prompt if not present or update existing one
            if not messages or messages[0].get("role") != "system":
                 messages.insert(0, {"role": "system", "content": system_prompt})
            else:
                 messages[0]["content"] = system_prompt

            # Inject Resume if enabled
            inject_resume_to_messages(messages)
            
            # Check if job analysis exists locally
            if not os.path.exists(job_manager.job_analysis_path):
                error_msg = "请先设置目标岗位，完成岗位分析。助手对话框右上角→设置目标岗位"
                await websocket.send_json({"type": "done", "full_text": error_msg})
                if chat_id:
                    messages.append({"role": "assistant", "content": error_msg})
                    chat_manager.update_chat_messages(chat_id, messages)
                continue

            # Inject Job Analysis Context (Always if available)
            inject_job_analysis_to_messages(messages)

            if is_multi_llm:
                await handle_multi_llm_request(websocket, messages, chat_id)
                continue
            else:
                # --- Single LLM Mode (Original Logic) ---
                response_text = ""
                try:
                    # Check if client is ready
                    if not llm_client.client:
                         await websocket.send_json({"type": "error", "content": "LLM 客户端未初始化。请检查设置。"})
                         continue

                    # 修复：处理当前配置的 System Prompt 和 身份标签
                    current_messages = [m.copy() for m in messages]
                    config_prompt = (curr_conf.get("system_prompt", "") if curr_conf else "").strip()
                    tags = curr_conf.get("tags", []) if curr_conf else []
                    has_tags = bool(tags)
                    
                    target_system_prompt = None
                    
                    if tags:
                        # 1. 优先使用身份标签 (即使是无效标签，也优先于 config_prompt，回退到默认)
                        # 这里简单取第一个标签作为角色ID
                        first_tag = tags[0]
                        normalized_tag = normalize_identity_identifier(first_tag)
                        target_system_prompt = get_sub_agent_system(
                             agent_config_path=AGENT_ROLE_FILE,
                             role_id=normalized_tag
                        )
                        print(f"[AgentAPI] 检测到身份标签: {tags} -> 使用角色: {normalized_tag}")
                    elif config_prompt:
                         # 2. 其次使用配置定义的 system prompt
                         target_system_prompt = config_prompt
                         print(f"[AgentAPI] 使用配置定义的 System Prompt")

                    # 应用目标 System Prompt (如果有)
                    # 如果 target_system_prompt 为 None，则保持 messages 中的默认 Prompt (已在 loop 开始时插入)
                    if target_system_prompt:
                        sys_idx = next((i for i, m in enumerate(current_messages) if m["role"] == "system"), -1)
                        if sys_idx != -1:
                            current_messages[sys_idx]["content"] = target_system_prompt
                        else:
                            current_messages.insert(0, {"role": "system", "content": target_system_prompt})

                    # Ensure Job Analysis and Resume Context is present (in case it was overwritten)
                    inject_job_analysis_to_messages(current_messages)
                    inject_resume_to_messages(current_messages)

                    # [调试] 显示实际发送给模型的完整 prompt
                    print(f"\n{'='*80}")
                    print(f"[调试] 正在发送请求到模型: {curr_conf.get('model', 'Unknown')} (Stream=True)")
                    print(f"{'='*80}")
                    print(f"[调试] 当前配置: {curr_conf.get('name', 'Unknown')}")
                    print(f"[调试] 使用 System Prompt: {config_prompt if (config_prompt and not has_tags) else '否'}")
                    if has_tags:
                        print(f"[调试] 身份标签: {tags} (System Prompt 被禁用)")
                    print(f"[调试] 消息总数: {len(current_messages)}")
                    print(f"{'-'*80}")
                    print("[调试] 完整 Prompt 内容:")
                    print(f"{'-'*80}")
                    for i, msg in enumerate(current_messages):
                        role = msg.get('role', 'unknown')
                        content = msg.get('content', '')
                        print(f"\n[消息 {i+1}] 角色: {role}")
                        print(f"[消息 {i+1}] 内容: {content}")
                    print(f"\n{'='*80}\n")

                    async for chunk in llm_client.chat_stream(current_messages):
                        await websocket.send_json({"type": "chunk", "content": chunk})
                        response_text += chunk

                    await websocket.send_json({"type": "done", "full_text": response_text})

                    # Save to chat history if chat_id is provided
                    if chat_id:
                        messages.append({"role": "assistant", "content": response_text})
                        chat_manager.update_chat_messages(chat_id, messages)

                except Exception as e:
                    print(f"LLM 流式响应错误: {e}")
                    import traceback
                    traceback.print_exc()
                    try:
                        await websocket.send_json({"type": "error", "content": f"流式响应错误: {str(e)}"})
                    except Exception as send_error:
                        print(f"发送错误消息失败: {send_error}")

    except WebSocketDisconnect:
        print("LLM WebSocket 连接已断开")
        llm_manager.disconnect(websocket)
    except Exception as e:
        print(f"LLM WebSocket 严重错误: {e}")
        import traceback
        traceback.print_exc()
        try:
            llm_manager.disconnect(websocket)
        except Exception as disconnect_error:
            print(f"断开连接失败: {disconnect_error}")

if __name__ == "__main__":
    import uvicorn

    # Print startup banner
    print("=" * 60)
    print("🚀 AST 实时语音转文本与大模型分析系统")
    print("=" * 60)
    print(f"[配置] ASR 系统: {'✅ 启用' if not args.no else '❌ 禁用 (--no)'}")
    print(f"[配置] LLM 客户端: ✅ 启用")
    print(f"[配置] 服务地址: http://{args.host}:{args.port}")
    print("=" * 60)
    print("")

    uvicorn.run(app, host=args.host, port=args.port)
def format_intent_analysis(intent_result: dict) -> str:
    """将意图识别结果格式化为系统消息"""
    summary_xml = intent_result.get("summary_xml", "")
    if not summary_xml:
        return "【意图识别】未生成结构化结果"

    def _extract(tag):
        import re
        match = re.search(rf"<{tag}>([\s\S]*?)</{tag}>", summary_xml, re.IGNORECASE)
        return match.group(1).strip() if match else ""

    summary = _extract("summary")
    question = _extract("true_question")
    steps = re.findall(r"<step>([\s\S]*?)</step>", summary_xml, re.IGNORECASE)
    steps = [s.strip() for s in steps if s.strip()]

    parts = ["【Leader Agent 意图分析】"]
    if summary:
        parts.append(f"意图总结：{summary}")
    if question:
        parts.append(f"真实问题：{question}")
    if steps:
        parts.append("下一步行动：")
        parts.extend(f"- {step}" for step in steps)
    return "\n".join(parts)
    return "\n".join(parts)
