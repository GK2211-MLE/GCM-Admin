# Farm2Cook (B2C) — Implementation Plan

## High-Level Approach

We will go feature-by-feature, making each one match the B2B (M2R) quality and depth, adapted for B2C where needed.

---

## Feature Checklist

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **Dashboard** | 🔴 Needs rework | Current B2C is minimal — missing 6 of 8 B2B sections |
| 2 | Sidebar & Navigation | ⬜ Pending | |
| 3 | Orders (List + Detail) | ⬜ Pending | |
| 4 | Customers (List + Detail) | ⬜ Pending | |
| 5 | Products (List + CRUD) | ⬜ Pending | |
| 6 | Settings (Users, Locations, General) | ⬜ Pending | |
| 7 | Promotions | ⬜ Pending | |
| 8 | Analytics | ⬜ Pending | |
| 9 | Procurement (Vendors + POs) | ⬜ Pending | |
| 10 | CMS | ⬜ Pending | |
| 11 | Invoices / Payments / Fulfillment | ⬜ Pending | |
| 12 | Notifications (Push) | ⬜ Pending | |
| 13 | Auth (Login, Forgot Password) | ⬜ Pending | |
| 14 | WhatsApp Bot | ⬜ Pending | |
| 15 | Backend API completeness | ⬜ Pending | |

---

## Current Focus: #1 — Dashboard

See detailed comparison below.

---

## Dashboard: B2B vs B2C Comparison

### B2B (M2R) Dashboard — 8 Sections

The B2B dashboard is split into **8 separate component files** with rich animations, real data computation, and interactive elements:

| # | Section | B2B Component | What it does |
|---|---------|--------------|--------------|
| 1 | **KPI Cards** | `KPISection.tsx` | 4 cards (Revenue, Orders, Pending Orders, Active Partners) with animated counters, sparkline mini-charts, week-over-week growth %, loading skeletons |
| 2 | **Today's Activity** | Inline in `DashboardPage.tsx` | 3 stat cards (Orders Today, Revenue Today, Pending Actions) |
| 3 | **Revenue Chart** | `RevenueChart.tsx` | Area chart of daily revenue, total + daily average, gradient fill, custom tooltip |
| 4 | **Order Status Chart** | `OrderStatusChart.tsx` | Donut/pie chart with center total, color-coded legend, percentage tooltip |
| 5 | **Recent Orders** | `RecentOrders.tsx` | 5-column table (Order #, Customer, Total, Status badge, Time ago), row animations, "View All" link |
| 6 | **Top Products** | `TopProducts.tsx` | Horizontal bar chart of top 5 products by price, legend with icons |
| 7 | **Pending Actions** | `PendingActions.tsx` | Urgency-colored action cards (Pending Orders, Active Deliveries) with pulse indicators, "View" buttons |
| 8 | **Greeting + Controls** | `DashboardPage.tsx` | Time-based greeting, date pill, refresh button, CSV export button |

### B2C (Farm2Cook) Dashboard — Current State (MINIMAL)

Currently a **single flat file** with:
- 6 static KPI cards (no animations, no sparklines, no growth %)
- 1 basic pie chart (no donut, no center text, no legend)
- 1 recent orders list (no table, no "View All" link)
- No revenue chart
- No top products
- No pending actions
- No today's activity section
- No greeting or controls
- No loading skeletons

### What to Build (B2C Dashboard)

#### KEEP from B2B (adapt for B2C):

| Section | Adaptation |
|---------|-----------|
| **KPI Cards** (4 cards) | Change "Active Partners" → "Active Customers". Same animated counters, sparklines, growth % |
| **Today's Activity** (3 cards) | Same — Orders Today, Revenue Today, Pending Actions |
| **Revenue Chart** | Same — daily revenue area chart with totals |
| **Order Status Chart** | Same donut chart. Add "processing" and "out_for_delivery" statuses (B2C has more granular delivery tracking) |
| **Recent Orders Table** | Same 5-column table with animations. Show B2C statuses |
| **Pending Actions** | Same urgency cards. Change "Active Deliveries" label — B2C deliveries are to homes, not restaurants |
| **Greeting + Controls** | Same — time-based greeting, refresh, export |
| **Loading Skeletons** | Same shimmer/skeleton pattern on all sections |

#### REMOVE from B2B (not needed for B2C):

| Section | Reason |
|---------|--------|
| **Top Products by Price** | B2B shows top products by price because restaurants care about high-value items. For B2C, this is less useful since consumer prices are lower and more uniform. **Replace with:** "Popular Products" (top 5 by order frequency) — more relevant for B2C since it shows what consumers actually buy most. |

#### ADD for B2C (not in B2B):

| Section | Reason |
|---------|--------|
| **Delivery vs Pickup Split** | B2C has a significant mix of home delivery and store pickup. B2B is mostly pickup. A small donut or stat showing the split helps the B2C admin plan delivery logistics. Will be added inside the Today's Activity row. |
| **"Out for Delivery" count in KPI or Pending** | B2C tracks `out_for_delivery` as a separate status (B2B doesn't). This is critical for B2C operations — the admin needs to see how many orders are currently in transit. Will be shown as a Pending Action card. |

### File Structure (Target)

```
frontend/src/features/dashboard/
├── DashboardPage.tsx        # Layout, greeting, controls, today's activity
├── KPISection.tsx           # 4 animated KPI cards with sparklines
├── RevenueChart.tsx         # Daily revenue area chart
├── OrderStatusChart.tsx     # Donut chart with legend
├── RecentOrders.tsx         # 5-column table with row animations
├── PopularProducts.tsx      # Top 5 by order frequency (B2C adaptation)
├── PendingActions.tsx       # Urgency-colored action cards
└── api.ts                   # useDashboardSummary + useDashboardPerformance hooks
```

### Backend API Changes Needed

The current `/api/orders/summary/dashboard` endpoint returns basic counts. Need to add:
- `statusCounts` — already exists but needs to include all B2C statuses
- `weekOverWeek` — revenue/order growth for KPI cards
- `dailyRevenue` — array for revenue chart
- `topProducts` — by order frequency (new)
- `deliveryMethodCounts` — pickup vs delivery split (new)

### Animation Timeline (match B2B)

| Component | Delay | Duration |
|-----------|-------|----------|
| Greeting | 0s | 0.4s |
| KPI Cards | 0-0.3s (staggered) | 0.5s |
| Today's Activity | 0.15s | 0.4s |
| Revenue Chart | 0.45s | 0.5s |
| Order Status | 0.55s | 0.5s |
| Recent Orders | 0.6s | 0.5s |
| Popular Products | 0.7s | 0.5s |
| Pending Actions | 0.8s | 0.5s |
