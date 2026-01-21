import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()
BASE_URL = os.getenv("DEV_BASE_URL", "http://127.0.0.1:8000")

def pretty(label, resp):
    print(f"\n=== {label} ===")
    print(f"Status: {resp.status_code}")
    try:
        print(json.dumps(resp.json(), indent=2))
    except Exception:
        print(resp.text)

def main():
    # Health
    pretty("Health", requests.get(f"{BASE_URL}/health"))

    # Create team
    create = requests.post(f"{BASE_URL}/teams", json={"team_name": "Local Test Team"})
    pretty("Create Team", create)
    body = create.json()
    token = body.get("admin_invite_token")

    # List media (requires token)
    headers = {"x-invite-token": token} if token else {}
    pretty("List Media", requests.get(f"{BASE_URL}/media?limit=30", headers=headers))

if __name__ == "__main__":
    main()
