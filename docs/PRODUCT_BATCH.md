# Product & Batch: How It Works

## 1. Product creation vs batch creation

| Step | What you do | What the system stores |
|------|-------------|------------------------|
| **Product creation** | Create the product (name, category, variants with size/price). No quantity. | One product document with `variants[]` and empty `inventoryBatches[]`. |
| **Add batch** | On the product detail page, add a batch: choose store, variant, quantity, manufacturing date, **expiry date**, batch number, optional cost. | A new batch is **appended** to that product’s `inventoryBatches[]`. |

- **Product** = the sellable item (e.g. “Tomato 500g”) with its variants and prices.
- **Batch** = one receipt of stock at a store for a variant, with **when it was made** and **when it expires**.

Stock is computed only from batches: sum of `quantity` over batches where `expiryDate > today` and `quantity > 0`. No separate “shelf life” is used for this calculation.

---

## 2. Shelf life vs batch expiry date (they are not the same)

- **Shelf life** = a **duration** (e.g. “90 days”). It answers: “How long is this product good after production?”
- **Batch expiry date** = a **calendar date** (e.g. “2025-05-15”). It answers: “On which date does this specific batch expire?”

Relationship:

- **Expiry date ≈ Manufacturing date + Shelf life** (for a given batch).
- The system does **not** auto-compute expiry from shelf life. When you “Add batch”, you enter **manufacturing date** and **expiry date** (and optionally use the product’s **shelf life** in the admin UI to suggest expiry).

So:

- **Shelf life** is an optional product-level hint (e.g. “this product is good for 90 days”). It can be used in the admin to suggest or validate the batch expiry date.
- **Batch expiry date** is what actually drives:
  - Available stock (only non-expired batches count).
  - “Expiring soon” reports.
  - “Expired” / “Expiring soon” / “Healthy” in the batch list.

They are not the same: one is a length of time (shelf life), the other is the concrete date this batch expires (batch expiry date).

---

## 3. Is it scalable?

- **Product creation**: Yes. You create products once; no batches at creation. Lightweight.
- **Batch creation**: Batches are stored **inside** the product document (`inventoryBatches[]`). This is fine for:
  - Dozens to a few hundred batches per product (e.g. one batch per store/variant per week).
- If you expect **very high** batch volume (e.g. thousands of batches per product, or very frequent small batches), consider later:
  - Moving batches to a **separate `Batch` collection** with `product`, `store`, `variant`, and the same fields (quantity, manufacturingDate, expiryDate, batchNumber, costPrice).
  - Keeping only aggregated or recent data on the product for fast reads.

Current design is scalable for typical retail/FMCG usage (products with moderate batch counts per store/variant).

---

## 4. Flow summary

1. **Create product** → Product exists with variants; no stock.
2. **Add batch** (per product, store, variant) → Enter manufacturing date, **expiry date**, quantity, batch number → Batch is stored; available stock for that store/variant increases (until expiry or sell-down).
3. **Stock** = sum of quantities of non-expired batches for that (store, variant).
4. **Shelf life** (optional) = product-level “typical days until expiry”; used in admin to help set or check batch expiry, not to compute stock.
