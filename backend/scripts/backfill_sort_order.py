"""
One-time backfill: trigger the auto-shift renumber so every category's
products land on a tight 1..N sequence and categories themselves land on
a tight 1..K sequence at the tenant level.

Strategy: the new placeProductAtPosition / placeCategoryAtPosition helpers
renumber the WHOLE category (or tenant's categories) on every triggered
PUT — so we just need a single PUT per category (with a sortOrder value
different from the picked product's current one) to cascade.

We pick the LAST product (by current sort) and PUT sortOrder=99999. The
helper clamps that to N, leaves the product at the end, and renumbers
1..N. Same approach for categories.
"""
from __future__ import annotations
import json
import sys
import urllib.request
import urllib.error

API = "https://farm2cook-dashbackend.onrender.com/api"
EMAIL = "admin@farm2cook.com"
PASSWORD = "admin123!"


def http(method: str, path: str, token: str | None = None, body: dict | None = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} on {method} {path}: {e.read().decode()[:200]}")
        raise


def main() -> int:
    print("Logging in...")
    login = http("POST", "/auth/login", body={"email": EMAIL, "password": PASSWORD})
    token = login["accessToken"]
    tenant_id = login["user"]["tenantId"] if "user" in login else None
    if tenant_id is None:
        # Decode JWT payload (no verification needed — just want tenantId)
        import base64
        payload = token.split(".")[1] + "=="
        decoded = json.loads(base64.urlsafe_b64decode(payload))
        tenant_id = decoded["tenantId"]
    print(f"  tenantId={tenant_id}")

    # Probe: pick any active product, PUT with sortOrder=99999, and check
    # the returned sortOrder. New code clamps to N (a small number); old
    # code stores 99999 verbatim. If we see 99999, the deploy hasn't
    # landed and we abort to avoid corrupting data.
    print("\nProbing deploy state...")
    probe_resp = http("GET", "/products?limit=1", token=token)
    probe_products = probe_resp.get("products", [])
    if not probe_products:
        print("  no products to probe with — abort")
        return 1
    probe_id = probe_products[0]["id"]
    probe_cat = probe_products[0]["category"]
    cat_count_resp = http("GET", f"/products?category={probe_cat}", token=token)
    expected_max = len(cat_count_resp.get("products", []))
    probe_after = http("PUT", f"/products/{probe_id}", token=token, body={"sortOrder": 99999})
    new_sort = probe_after["product"]["sortOrder"]
    if new_sort == 99999:
        print(f"  probe sortOrder=99999 — deploy NOT live yet, abort")
        return 1
    if new_sort > expected_max + 1:
        print(f"  probe sortOrder={new_sort} (expected <= {expected_max}) -- abort")
        return 1
    print(f"  probe sortOrder={new_sort} (<= {expected_max}) -- new code is live")

    # Step 1: renumber products inside each category
    cats_resp = http("GET", "/categories?includeInactive=1", token=token)
    categories = cats_resp.get("categories", [])
    print(f"\nFound {len(categories)} categories")

    for cat in categories:
        slug = cat["slug"]
        # Fetch all products in this category (no location filter)
        prods_resp = http("GET", f"/products?category={slug}", token=token)
        prods = prods_resp.get("products", [])
        if not prods:
            print(f"  [{slug}] empty — skip")
            continue
        # Last product (already sorted by sortOrder asc, createdAt desc)
        last = prods[-1]
        before = [(p["name"], p["sortOrder"]) for p in prods]
        print(f"  [{slug}] {len(prods)} products. Triggering renumber via {last['name'][:40]}")
        try:
            http("PUT", f"/products/{last['id']}", token=token, body={"sortOrder": 99999})
        except Exception as e:
            print(f"    failed: {e}")
            continue

        # Verify
        prods_after = http("GET", f"/products?category={slug}", token=token).get("products", [])
        sort_orders = [p["sortOrder"] for p in prods_after]
        unique = len(set(sort_orders)) == len(sort_orders)
        sequential = sort_orders == list(range(1, len(sort_orders) + 1))
        status = "OK" if unique and sequential else "BAD"
        print(f"    [{status}] new orders: {sort_orders}")

    # Step 2: renumber categories at tenant level
    print("\nRenumbering categories...")
    cats_resp = http("GET", "/categories?includeInactive=1", token=token)
    categories = cats_resp.get("categories", [])
    if categories:
        last_cat = categories[-1]
        print(f"  Triggering renumber via {last_cat['name']}")
        try:
            http("PUT", f"/categories/{last_cat['id']}", token=token, body={"sortOrder": 99999})
        except Exception as e:
            print(f"  failed: {e}")
        cats_after = http("GET", "/categories?includeInactive=1", token=token).get("categories", [])
        sort_orders = [c["sortOrder"] for c in cats_after]
        unique = len(set(sort_orders)) == len(sort_orders)
        sequential = sort_orders == list(range(1, len(sort_orders) + 1))
        status = "OK" if unique and sequential else "BAD"
        print(f"  [{status}] category orders: {sort_orders}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
