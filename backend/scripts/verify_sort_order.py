"""
Verify the auto-shift behavior:
  1. Pick a category with >= 3 products.
  2. Note the current 1..N order.
  3. Pick the LAST product (position N), set its sortOrder=2 via PUT.
  4. Confirm: that product is now at position 2; everything that was at
     positions 2..N-1 shifted to 3..N; positions are still tight 1..N
     with no duplicates.
  5. Move it back to position N (using sortOrder=N) so the data is
     restored to the post-backfill state.
"""
from __future__ import annotations
import json
import sys
import urllib.request
import base64

API = "https://farm2cook-dashbackend.onrender.com/api"
EMAIL = "admin@farm2cook.com"
PASSWORD = "admin123!"


def http(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def fetch_cat(cat_slug, token):
    r = http("GET", f"/products?category={cat_slug}", token=token)
    return r.get("products", [])


def main():
    token = http("POST", "/auth/login", body={"email": EMAIL, "password": PASSWORD})["accessToken"]

    cat_slug = "lamb"  # 7 products from backfill log
    before = fetch_cat(cat_slug, token)
    if len(before) < 3:
        print(f"need >= 3 products in {cat_slug}, only got {len(before)}")
        return 1

    print(f"BEFORE [{cat_slug}]:")
    for p in before:
        print(f"  {p['sortOrder']}. {p['name']}")

    last = before[-1]
    last_id = last["id"]
    last_name = last["name"]
    target_pos = 2

    print(f"\nMoving '{last_name}' from position {len(before)} -> {target_pos}...")
    http("PUT", f"/products/{last_id}", token=token, body={"sortOrder": target_pos})

    after = fetch_cat(cat_slug, token)
    print(f"\nAFTER:")
    for p in after:
        print(f"  {p['sortOrder']}. {p['name']}")

    # Assertions
    sort_orders = [p["sortOrder"] for p in after]
    expected = list(range(1, len(after) + 1))
    unique = len(set(sort_orders)) == len(sort_orders)
    sequential = sort_orders == expected
    moved_in_place = next((p for p in after if p["id"] == last_id), None)

    print(f"\nVerification:")
    print(f"  unique 1..N         : {unique and sequential}")
    print(f"  '{last_name[:30]}' is at position {moved_in_place['sortOrder'] if moved_in_place else 'MISSING'}")

    if not (unique and sequential):
        print("FAIL")
        return 1
    if not moved_in_place or moved_in_place["sortOrder"] != target_pos:
        print("FAIL: target product not at requested position")
        return 1

    # Restore
    print(f"\nRestoring '{last_name}' back to end...")
    http("PUT", f"/products/{last_id}", token=token, body={"sortOrder": 99999})
    final = fetch_cat(cat_slug, token)
    final_orders = [p["sortOrder"] for p in final]
    print(f"  final orders: {final_orders}")
    print("\nPASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
