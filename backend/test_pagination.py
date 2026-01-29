#!/usr/bin/env python3
"""Test pagination with newest-first ordering"""
import requests

API = "https://5gt1117eh5.execute-api.us-east-1.amazonaws.com"
ADMIN_TOKEN = "KrbW8fKmkS7e7f3euyOS_DFtWc_h2i9uYcmYUuxP1Kk"

def test_pagination():
    headers = {"x-invite-token": ADMIN_TOKEN}
    
    # Get first page (limit 2)
    print("=== Page 1 (limit=2) ===")
    res1 = requests.get(f"{API}/media?limit=2", headers=headers).json()
    page1_items = res1["items"]
    next_cursor = res1["next_cursor"]
    
    print(f"Items on page 1:")
    for i, item in enumerate(page1_items, 1):
        print(f"  {i}. {item['created_at']}: {item['filename']}")
    
    if not next_cursor:
        print("❌ No next_cursor returned (expected one)")
        return False
    
    print(f"\n✅ next_cursor available: {next_cursor[:50]}...")
    
    # Get second page using cursor
    print("\n=== Page 2 (using cursor) ===")
    res2 = requests.get(f"{API}/media?limit=2&cursor={next_cursor}", headers=headers).json()
    page2_items = res2["items"]
    next_cursor2 = res2["next_cursor"]
    
    print(f"Items on page 2:")
    for i, item in enumerate(page2_items, 1):
        print(f"  {i}. {item['created_at']}: {item['filename']}")
    
    # Check for duplicates
    page1_ids = set(item["media_id"] for item in page1_items)
    page2_ids = set(item["media_id"] for item in page2_items)
    
    duplicates = page1_ids & page2_ids
    if duplicates:
        print(f"\n❌ Duplicates found: {duplicates}")
        return False
    
    print(f"\n✅ No duplicates between pages")
    
    # Check ordering (newest first)
    if len(page1_items) > 1:
        if page1_items[0]["created_at"] >= page1_items[1]["created_at"]:
            print(f"✅ Ordering correct: {page1_items[0]['created_at']} >= {page1_items[1]['created_at']}")
        else:
            print(f"❌ Ordering wrong: {page1_items[0]['created_at']} < {page1_items[1]['created_at']}")
            return False
    
    # Check total count
    all_items_so_far = page1_items + page2_items
    print(f"\n✅ Total items retrieved so far: {len(all_items_so_far)}")
    
    if next_cursor2:
        print(f"✅ More items available (next_cursor2 present)")
    else:
        print(f"✅ All items loaded (no more pages)")
    
    return True

if __name__ == "__main__":
    success = test_pagination()
    print("\n" + ("="*50))
    if success:
        print("✅ All pagination tests passed!")
    else:
        print("❌ Some tests failed")
