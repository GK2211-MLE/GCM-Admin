# Bug Fixes Log

## 2026-04-10

### 1. Inventory page white screen crash
- **File**: `frontend/src/features/inventory/InventoryPage.tsx` (line 273)
- **Cause**: Products with empty `category` string (e.g. "egg" product) were included in the category filter dropdown. Radix UI `<Select.Item>` throws an error when `value` is an empty string, crashing the entire page.
- **Fix**: Added `.filter(Boolean)` to exclude empty category strings from the dropdown list.

### 2. Category delete failing with 500 error
- **File**: `backend/src/routes/categories.ts` (line 114-118)
- **Cause**: The delete route only cleared `products.category` (slug text field) but did not clear `products.categoryId` (the UUID foreign key column). When the category row was then deleted, the FK constraint on `products.category_id` blocked the deletion, resulting in a 500 Internal Server Error.
- **Fix**: Added an additional update query to set `categoryId: null` on all products referencing the category by `categoryId` before deleting the category row.
