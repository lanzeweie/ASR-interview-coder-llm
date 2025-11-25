import requests
import json

BASE_URL = "http://localhost:8000/api/chats"

def test_chat_management():
    print("--- Testing Chat Management APIs ---")

    # 1. Create New Chat
    print("\n[1] Creating new chat...")
    resp = requests.post(BASE_URL, json={"title": "Test Chat"})
    if resp.status_code == 200:
        chat = resp.json()
        chat_id = chat["id"]
        print(f"Success: Created chat {chat_id} ('{chat['title']}')")
    else:
        print(f"Failed: {resp.text}")
        return

    # 2. Get Chat List
    print("\n[2] Getting chat list...")
    resp = requests.get(BASE_URL)
    if resp.status_code == 200:
        data = resp.json()
        print(f"Success: Found {len(data['chats'])} chats. Current: {data['current_chat_id']}")
    else:
        print(f"Failed: {resp.text}")

    # 3. Get Chat Details
    print(f"\n[3] Getting details for {chat_id}...")
    resp = requests.get(f"{BASE_URL}/{chat_id}")
    if resp.status_code == 200:
        print("Success: Chat details retrieved.")
    else:
        print(f"Failed: {resp.text}")

    # 4. Clear Chat
    print(f"\n[4] Clearing chat {chat_id}...")
    resp = requests.post(f"{BASE_URL}/{chat_id}/clear")
    if resp.status_code == 200:
        print("Success: Chat cleared.")
    else:
        print(f"Failed: {resp.text}")

    # 5. Delete Chat
    print(f"\n[5] Deleting chat {chat_id}...")
    resp = requests.delete(f"{BASE_URL}/{chat_id}")
    if resp.status_code == 200:
        print("Success: Chat deleted.")
    else:
        print(f"Failed: {resp.text}")

if __name__ == "__main__":
    try:
        test_chat_management()
    except Exception as e:
        print(f"Test failed with exception: {e}")
        print("Make sure the server is running!")
