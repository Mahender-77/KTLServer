import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import User from "../models/User";
import Organization from "../models/Organization";
import Category from "../models/Category";
import Product from "../models/Product";
import { createProduct } from "./product.service";
import { DEFAULT_PRODUCT_FIELD_CONFIG } from "../constants/productFields";
import { invalidateProductFieldConfigCache } from "../utils/productFieldConfig";

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
}, 30_000);

describe("createProduct + productFieldConfig (integration)", () => {
  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    invalidateProductFieldConfigCache();
  });

  async function seedTenant(overrides: Partial<typeof DEFAULT_PRODUCT_FIELD_CONFIG> = {}) {
    const user = await User.create({
      name: "Admin",
      email: `adm-${Date.now()}@test.local`,
      password: "password12",
      role: "admin",
    });
    const productFieldConfig = { ...DEFAULT_PRODUCT_FIELD_CONFIG, ...overrides };
    const org = await Organization.create({
      name: `Org ${Date.now()}`,
      owner: user._id,
      productFieldConfig,
    });
    const category = await Category.create({
      organizationId: org._id,
      name: "Vegetables",
      slug: `veg-${Date.now()}`,
    });
    return { orgId: org._id.toString(), categoryId: category._id.toString() };
  }

  it("strips tags, description, tax, price when those fields are disabled for the org", async () => {
    const { orgId, categoryId } = await seedTenant({
      tags: false,
      description: false,
      taxRate: false,
      pricePerUnit: false,
    });

    const created = await createProduct(
      {
        name: "Ginger",
        description: "Should not persist",
        category: categoryId,
        pricingMode: "unit",
        baseUnit: "kg",
        pricePerUnit: 99,
        hasExpiry: false,
        tags: ["organic", "fresh"],
        taxRate: 18,
      },
      orgId
    );

    const stored = await Product.findById(created._id).lean();
    expect(stored).toBeTruthy();
    expect(stored!.description).toBeUndefined();
    expect(stored!.tags ?? []).toEqual([]);
    expect(stored!.taxRate).toBeUndefined();
    expect(stored!.pricePerUnit).toBe(0);
  });

  it("forces unit pricing and clears variants when pricingMode and variants are disabled", async () => {
    const { orgId, categoryId } = await seedTenant({
      pricingMode: false,
      variants: false,
    });

    const created = await createProduct(
      {
        name: "Pack",
        category: categoryId,
        pricingMode: "fixed",
        baseUnit: "pcs",
        pricePerUnit: 50,
        hasExpiry: false,
        variants: [
          {
            type: "weight",
            value: 250,
            unit: "g",
            price: 40,
          },
        ],
      },
      orgId
    );

    const stored = await Product.findById(created._id).lean();
    expect(stored!.pricingMode).toBe("unit");
    expect(stored!.variants ?? []).toEqual([]);
  });
});
