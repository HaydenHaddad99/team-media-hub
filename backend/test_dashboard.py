#!/usr/bin/env python3
"""
Integration tests for dashboard team management features.
Tests: Rename team, Delete team, list teams after changes.
"""

import json
import requests
import sys
import os
from datetime import datetime

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
INVITE_TOKEN = os.getenv("INVITE_TOKEN", "")
TEAM_ID = os.getenv("TEAM_ID", "test-team-123")

def log(msg: str):
    """Print with timestamp."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_rename_team():
    """Test PUT /teams/{team_id} to rename team."""
    log("\n=== Test: Rename Team ===")
    
    new_name = f"Renamed Team {datetime.now().strftime('%H%M%S')}"
    
    response = requests.put(
        f"{BASE_URL}/teams/{TEAM_ID}",
        headers={
            "x-invite-token": INVITE_TOKEN,
            "Content-Type": "application/json",
        },
        json={"team_name": new_name},
    )
    
    log(f"Status: {response.status_code}")
    if response.status_code not in [200, 201]:
        log(f"ERROR: {response.text}")
        return False
    
    data = response.json()
    log(f"✓ Team renamed to: {data['data']['team_name']}")
    return True

def test_delete_team():
    """Test DELETE /teams/{team_id} to delete team."""
    log("\n=== Test: Delete Team ===")
    
    response = requests.delete(
        f"{BASE_URL}/teams/{TEAM_ID}",
        headers={
            "x-invite-token": INVITE_TOKEN,
        },
    )
    
    log(f"Status: {response.status_code}")
    if response.status_code not in [200, 204]:
        log(f"ERROR: {response.text}")
        return False
    
    log(f"✓ Team deleted successfully")
    return True

def test_invalid_team():
    """Test rename/delete with invalid team ID."""
    log("\n=== Test: Invalid Team ID ===")
    
    response = requests.put(
        f"{BASE_URL}/teams/nonexistent-team",
        headers={
            "x-invite-token": INVITE_TOKEN,
            "Content-Type": "application/json",
        },
        json={"team_name": "New Name"},
    )
    
    log(f"Status: {response.status_code}")
    if response.status_code == 404:
        log(f"✓ Correctly returned 404 for nonexistent team")
        return True
    else:
        log(f"ERROR: Expected 404, got {response.status_code}")
        return False

def test_missing_token():
    """Test endpoints without auth token."""
    log("\n=== Test: Missing Auth Token ===")
    
    response = requests.put(
        f"{BASE_URL}/teams/{TEAM_ID}",
        headers={"Content-Type": "application/json"},
        json={"team_name": "New Name"},
    )
    
    log(f"Status: {response.status_code}")
    if response.status_code in [401, 403]:
        log(f"✓ Correctly rejected request without token")
        return True
    else:
        log(f"ERROR: Expected 401/403, got {response.status_code}")
        return False

def main():
    """Run all tests."""
    log(f"Dashboard Team Management API Tests")
    log(f"API Base URL: {BASE_URL}")
    log(f"Team ID: {TEAM_ID}")
    
    if not INVITE_TOKEN:
        log("ERROR: INVITE_TOKEN environment variable not set")
        return 1
    
    results = []
    
    # Test basic endpoint routing first
    log("\n=== Checking API Availability ===")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        log(f"✓ Health check: {response.status_code}")
    except Exception as e:
        log(f"ERROR: Cannot reach API at {BASE_URL}")
        log(f"Make sure the dev server is running: python3 backend/src/dev_server.py")
        return 1
    
    # Run tests
    results.append(("Invalid Team ID", test_invalid_team()))
    results.append(("Missing Auth Token", test_missing_token()))
    
    # These tests modify state - only run if explicitly requested
    if os.getenv("RUN_DESTRUCTIVE_TESTS"):
        results.append(("Rename Team", test_rename_team()))
        results.append(("Delete Team", test_delete_team()))
    else:
        log("\nℹ️  Skipping destructive tests (Rename/Delete)")
        log("To run them, set: RUN_DESTRUCTIVE_TESTS=1")
    
    # Summary
    log("\n=== Test Summary ===")
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✓" if result else "✗"
        log(f"{status} {test_name}")
    
    log(f"\nPassed: {passed}/{total}")
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())
