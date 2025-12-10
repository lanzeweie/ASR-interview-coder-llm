import json
import os
import uuid
from datetime import datetime

CHAT_HISTORY_FILE = "data/chat_history.json"

class ChatManager:
    def __init__(self):
        self.file_path = CHAT_HISTORY_FILE
        # 确保 data 目录存在
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        self.data = self._load_data()

    def _load_data(self):
        if os.path.exists(self.file_path):
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"加载聊天历史错误: {e}")
                return {"current_chat_id": None, "chats": {}}
        return {"current_chat_id": None, "chats": {}}

    def _save_data(self):
        try:
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"保存聊天历史错误: {e}")

    def create_chat(self, title="新聊天"):
        chat_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        new_chat = {
            "id": chat_id,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "messages": []
        }
        self.data["chats"][chat_id] = new_chat
        self.data["current_chat_id"] = chat_id
        self._save_data()
        return new_chat

    def get_chat(self, chat_id):
        return self.data["chats"].get(chat_id)

    def get_all_chats(self):
        # Return list of chats sorted by updated_at desc
        chats = list(self.data["chats"].values())
        chats.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        return chats

    def update_chat_messages(self, chat_id, messages):
        if chat_id in self.data["chats"]:
            self.data["chats"][chat_id]["messages"] = messages
            self.data["chats"][chat_id]["updated_at"] = datetime.now().isoformat()
            self._save_data()
            return True
        return False

    def delete_chat(self, chat_id):
        if chat_id in self.data["chats"]:
            del self.data["chats"][chat_id]
            if self.data["current_chat_id"] == chat_id:
                self.data["current_chat_id"] = None
            self._save_data()
            return True
        return False

    def clear_chat_messages(self, chat_id):
        if chat_id in self.data["chats"]:
            self.data["chats"][chat_id]["messages"] = []
            self.data["chats"][chat_id]["updated_at"] = datetime.now().isoformat()
            self._save_data()
            return True
        return False

    def set_current_chat(self, chat_id):
        if chat_id in self.data["chats"]:
            self.data["current_chat_id"] = chat_id
            self._save_data()
            return True
        return False

    def get_current_chat_id(self):
        return self.data.get("current_chat_id")
