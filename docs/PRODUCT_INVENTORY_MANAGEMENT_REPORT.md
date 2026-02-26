# Product & Inventory Management System — End-to-End Report

This document describes how products are created, validated, stored, listed, and how inventory (batches) is managed across backend and admin frontend.

---

## 1. Overview

| Layer | Responsibility |
|-------|----------------|
| **Product model** | Defines product schema, variants, and batch structure with two pricing modes. |
| **Validators** | Zod schemas for create-product and add-batch; conditional rules by `pricingType`. |
| **Controller** | Parses multipart/JSON, calls service, returns HTTP responses. |
| **Service** | Business logic: create product, add batch, list products, format responses, stock computation. |
| **Admin UI** | Product list, create product (fixed/dynamic), product detail, add batch. |

**Pricing modes**

- **Fixed**: Price per variant (e.g. 500g @ ₹50, 1kg @ ₹90). Requires at least one variant. Stock is per store + variant.
- **Dynamic**: Price per base unit (e.g. ₹100/kg). No variants. Requires `baseUnit` and `pricePerUnit`. Stock is per store in base unit.

---

## 2. Data Model (Backend)

### 2.1 Product (`IProduct`)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `name` | string | Yes | Product name. |
| `slug` | string | Yes (auto) | Unique, slugified from name. |
| `description` | string | No | Optional description. |
| `category` | ObjectId | Yes | Ref: Category. |
| `images` | string[] | No | Image URLs (e.g. from upload). |
| `pricingType` | `"fixed" \| "dynamic"` | Yes | Default: `"fixed"`. |
| `baseUnit` | `"g" \| "kg" \| "ml" \| "l" \| "pcs"` | If dynamic | Required when `pricingType === "dynamic"`. |
| `pricePerUnit` | number | If dynamic | Required when `pricingType === "dynamic"`. |
| `variants` | IVariant[] | If fixed | Required when `pricingType === "fixed"`; optional/empty for dynamic. |
| `inventory` | IInventory[] | No | Legacy/summary store–variant quantities; can be empty. |
| `inventoryBatches` | IInventoryBatch[] | No | Batch-wise stock (source of truth for availability). |
| `shelfLifeDays` | number | No | Optional hint (1–3650) for UI when adding batches. |
| `isActive` | boolean | Yes | Default: true. |
| `createdAt` / `updatedAt` | Date | Auto | Timestamps. |

### 2.2 Variant (`IVariant`) — used only for fixed pricing

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `_id` | ObjectId | Auto | Set by Mongoose. |
| `type` | `"weight" \| "pieces" \| "box"` | Yes | Variant kind. |
| `value` | number | Yes | e.g. 500, 1. |
| `unit` | `"g" \| "kg" \| "ml" \| "l" \| "pcs" \| "box"` | Yes | Unit of measure. |
| `price` | number | Yes | Price for this variant. |
| `offerPrice` | number | No | Optional offer price. |
| `sku` | string | No | Optional SKU. |

### 2.3 Inventory Batch (`IInventoryBatch`)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `_id` | ObjectId | Auto | Subdocument id. |
| `store` | ObjectId | Yes | Ref: Store. |
| `variant` | ObjectId | If fixed | Required when product `pricingType === "fixed"`. Omitted for dynamic. |
| `unit` | `"g" \| "kg" \| "ml" \| "l" \| "pcs"` | Yes | Unit for this batch; must match product `baseUnit` for dynamic. |
| `quantity` | number | Yes | Quantity in **base unit** (min 0). |
| `manufacturingDate` | Date | Yes | When batch was produced. |
| `expiryDate` | Date | Yes | When batch expires (drives availability). |
| `batchNumber` | string | Yes | Unique per (store, variant) within product. |
| `costPrice` | number | No | Optional cost. |
| `createdAt` / `updatedAt` | Date | Auto | Timestamps. |

**Uniqueness**: One `batchNumber` per (product, store, variant) for fixed; per (product, store) for dynamic.

---

## 3. Product Creation

### 3.1 API

- **Endpoint**: `POST /api/products`
- **Auth**: Protected, admin only.
- **Content-Type**: `multipart/form-data` (for image upload) with optional JSON-string fields for `variants` and `inventory`.

### 3.2 Request Body (Create Product)

| Field | Type | Required | Validation / Notes |
|-------|------|----------|--------------------|
| `name` | string | Yes | 1–200 chars, trimmed. |
| `description` | string | No | Max 5000. |
| `category` | string | Yes | Valid ObjectId. |
| `pricingType` | `"fixed" \| "dynamic"` | No | Default: `"fixed"`. |
| `baseUnit` | `"g" \| "kg" \| "ml" \| "l" \| "pcs"` | If dynamic | Required when `pricingType === "dynamic"`. |
| `pricePerUnit` | number | If dynamic | Required when dynamic; ≥ 0. |
| `variants` | string (JSON) or array | If fixed | Required when fixed: non-empty array of variant objects. Each: `type`, `value` (positive), `unit`, `price` (≥ 0), optional `offerPrice`, `sku`. |
| `inventory` | string (JSON) or array | No | Optional; used only for fixed (store + variantIndex + quantity). |
| `shelfLifeDays` | number | No | 1–3650 if present. |
| `image` | file | No | Single image file. |

### 3.3 Validation (Zod)

- **createProductSchema** (with `superRefine`):
  - **Dynamic**: `baseUnit` and `pricePerUnit` required; variants not required.
  - **Fixed**: At least one variant required (non-empty string or array).
- Variant schema: `type`, positive `value`, `unit`, non-negative `price`, optional `offerPrice`, optional `sku` (max 50).

### 3.4 Service Logic (createProduct)

1. Check `name`, `category` present.
2. **Dynamic**: require `baseUnit` and `pricePerUnit`; else throw `MISSING_FIELDS`.
3. **Fixed**: require `variants` array with length ≥ 1; else throw `MISSING_FIELDS`.
4. Generate `slug` from name; reject if product with same slug exists (`PRODUCT_EXISTS`).
5. Create product with:
   - `pricingType`, and for dynamic: `baseUnit`, `pricePerUnit`;
   - `variants`: array (empty for dynamic, validated array for fixed);
   - `inventory`: [] initially;
   - optional `shelfLifeDays`, `images` from upload.
6. If fixed and `inventory` array provided: map to `{ store, variant, quantity }` by variant index; save. On error, delete product and throw `INVENTORY_ERROR`.

### 3.5 Response

- **201**: Created product document (as returned by Mongoose).

---

## 4. Product Listing & Single Product

### 4.1 Admin List — `GET /api/products`

- **Auth**: Protected, admin only.
- **Query**: `category` (optional), pagination (`page`, `limit`).
- **Filter**: `isActive: true`; optional by category.
- **Response**: Paginated list. Each item is **formatted** (see below); includes `availableQuantity`, pricing fields by type; **does not** filter out zero-stock products.

### 4.2 Public List — `GET /api/products/public`

- **Auth**: None.
- **Query**: `category` (optional), pagination.
- **Filter**: `isActive: true`; **and** at least one batch with `expiryDate > today` and `quantity > 0` (`$elemMatch`). So expired-only products are excluded.
- **Response**: Same formatted shape as admin list.

### 4.3 Formatted Product Shape (Listing & Public Single)

- **availableQuantity**: Sum of batch quantities where `expiryDate > now` and `quantity > 0`.
- **Dynamic**:
  - `pricingType: "dynamic"`, `baseUnit`, `pricePerUnit`, `availableQuantity`.
  - **Variants are omitted** in response.
- **Fixed**:
  - `pricingType: "fixed"`, `variants` (array with prices), `availableQuantity`.
  - No `baseUnit` / `pricePerUnit` in response.

`inventoryBatches` is not exposed in listing/single-product responses (only in admin get-by-id when needed).

### 4.4 Public Single — `GET /api/products/public/:id`

- **Auth**: None.
- **Response**: Formatted product; 404 if not found or not active.

### 4.5 Admin Single — `GET /api/products/:id`

- **Auth**: Protected, admin only.
- **Response**: Full product document including `inventoryBatches` with populated `store` names (for batch management UI).

---

## 5. Add Batch (Inventory)

### 5.1 API

- **Endpoint**: `POST /api/products/:id/add-batch`
- **Auth**: Protected, admin only.
- **Body**: JSON.

### 5.2 Request Body (Add Batch)

| Field | Type | Required | Validation / Notes |
|-------|------|----------|--------------------|
| `store` | string | Yes | Valid ObjectId. |
| `variant` | string | If fixed | Required for fixed-pricing product; valid ObjectId. |
| `unit` | `"g" \| "kg" \| "ml" \| "l" \| "pcs"` | Yes | Must match product `baseUnit` for dynamic. |
| `quantity` | number | Yes | > 0. |
| `manufacturingDate` | date (ISO or coerce) | Yes | Must be before expiry. |
| `expiryDate` | date (ISO or coerce) | Yes | Must be after manufacturingDate. |
| `batchNumber` | string | Yes | 1–100 chars, trimmed. |
| `costPrice` | number | No | ≥ 0. |

### 5.3 Validation (Zod)

- **addBatchSchema**: params `id` (ObjectId); body as above.
- **Refine**: `expiryDate > manufacturingDate`.

### 5.4 Service Logic (addBatch)

1. Load product; 404 if not found.
2. **Dynamic**:
   - Require `data.unit === product.baseUnit`; else throw `UNIT_MISMATCH`.
   - No `variant` in batch.
3. **Fixed**:
   - Require `data.variant`; else throw `MISSING_VARIANT`.
   - Batch includes `variant`.
4. Check duplicate: same product, store, variant (or no variant for dynamic), and same `batchNumber`; if duplicate throw `BATCH_NUMBER_DUPLICATE`.
5. Append new batch to `inventoryBatches` (with `unit`, optional `variant`, quantity, dates, batchNumber, optional costPrice); save.
6. Return success and updated product (e.g. name, _id, inventoryBatches).

---

## 6. Stock & Expiry

### 6.1 Available Quantity

- **Definition**: Sum of `quantity` over batches where `expiryDate > now` and `quantity > 0`.
- **Scope**: Per product (all stores/variants summed for listing); per (product, store, variant) in helpers like `getAvailableStock` for orders.

### 6.2 Shelf Life vs Batch Expiry

- **Shelf life** (`shelfLifeDays`): Product-level hint (e.g. 90 days). Used in admin to **suggest** expiry when user enters manufacturing date; not used to compute stock.
- **Batch expiry date**: Actual date; drives:
  - Whether batch counts toward available quantity.
  - “Expiring soon” reports and batch status (Expired / Expiring Soon / Healthy).

### 6.3 Expiring Batches Report

- **Endpoint**: `GET /api/products/expiring?days=7`
- **Auth**: Admin only.
- **Behavior**: Aggregation over products with batches whose `expiryDate` is between now and now+days, `quantity > 0`; grouped by product, variant, store; paginated.

---

## 7. Routes Summary

| Method | Path | Auth | Purpose |
|--------|------|------|--------|
| GET | `/api/products/public` | No | Public product list (with stock, no expired-only). |
| GET | `/api/products/public/:id` | No | Public single product (formatted). |
| POST | `/api/products` | Admin | Create product (multipart + validation). |
| GET | `/api/products` | Admin | Admin product list (formatted). |
| GET | `/api/products/expiring` | Admin | Expiring batches (query `days`). |
| GET | `/api/products/:id` | Admin | Admin single product (full, with batches). |
| DELETE | `/api/products/:id` | Admin | Delete product. |
| POST | `/api/products/:id/add-batch` | Admin | Add inventory batch. |

---

## 8. Admin Frontend (Summary)

### 8.1 Products List (`/products`)

- **Data**: Fetches `GET /api/products`; displays formatted list (name, category, pricing type badge, price/unit, available quantity, status, actions).
- **Create product modal**:
  - **Pricing type**: Fixed (per variant) or Dynamic (price per unit).
  - **Dynamic**: Base unit dropdown, Price per unit (₹). No variant fields.
  - **Fixed**: Variant type, value, unit, price, offer price, SKU.
  - Common: name, description, category (and subcategory if any), shelf life (optional), image (optional).
  - Submit: `FormData` with `pricingType`, and either `baseUnit` + `pricePerUnit` + `variants: []` or full `variants` array.
- **Validation**: Client-side checks for required fields by pricing type before submit.

### 8.2 Product Detail (`/products/:id`)

- **Data**: Fetches `GET /api/products/:id` (admin); shows product header with pricing type and, for dynamic, “₹pricePerUnit / baseUnit”.
- **Batches table**: Store, Variant (only for fixed), Unit, Quantity, Expiry date, Status (Expired / Expiring Soon / Healthy).
- **Add batch modal**:
  - **Dynamic**: Store, read-only Unit (product base unit), Quantity (in base unit), manufacturing/expiry dates, batch number, optional cost price. No variant. Payload includes `unit` = product base unit.
  - **Fixed**: Store, Variant (required), Unit (required; can be set from selected variant), Quantity, dates, batch number, optional cost. Payload includes `variant` and `unit`.
  - Shelf life used to suggest expiry from manufacturing date when available.

---

## 9. Validation Summary

| Operation | Where | Key rules |
|-----------|--------|-----------|
| Create product | Zod + service | Name, category; dynamic → baseUnit + pricePerUnit; fixed → ≥1 variant; slug unique. |
| Add batch | Zod + service | Store, unit, quantity > 0, dates, batch number; expiry > mfg; dynamic → unit = product.baseUnit, no variant; fixed → variant required; batch number unique per (store, variant). |
| Listing | Service | Public list excludes products with no non-expired stock; all list/single responses use formatted shape and availableQuantity. |

---

## 10. Error Codes (Product / Batch)

| Code | HTTP | Meaning |
|------|------|--------|
| INVALID_BODY | 400 | Missing or invalid request body. |
| INVALID_VARIANTS / INVALID_INVENTORY | 400 | Malformed JSON for variants or inventory. |
| MISSING_FIELDS | 400 | Required fields missing (e.g. baseUnit/pricePerUnit for dynamic, or variants for fixed). |
| PRODUCT_EXISTS | 400 | Product with same slug already exists. |
| INVENTORY_ERROR | 400 | Invalid inventory mapping (e.g. invalid variant index). |
| PRODUCT_NOT_FOUND | 404 | Product id not found. |
| UNIT_MISMATCH | 400 | Batch unit does not match product baseUnit (dynamic). |
| MISSING_VARIANT | 400 | Variant required for fixed product when adding batch. |
| BATCH_NUMBER_DUPLICATE | 400 | Batch number already exists for same store (and variant for fixed). |
| VALIDATION_ERROR | 400 | Zod validation failed (body/params). |

---

This report reflects the current product and inventory management flow from API and validation through to admin UI behavior.
