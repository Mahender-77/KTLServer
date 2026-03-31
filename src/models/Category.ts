import mongoose, { Schema, Document } from "mongoose";

export interface ICategory extends Document {
  organizationId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  parent?: mongoose.Types.ObjectId | null;
  image?: string;
  isActive: boolean;
}

const categorySchema = new Schema<ICategory>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    image: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Subcategory lookups and tree building: find children by parent
categorySchema.index({ organizationId: 1, parent: 1 });
categorySchema.index({ organizationId: 1, slug: 1 }, { unique: true });

const Category = mongoose.model<ICategory>("Category", categorySchema);

export default Category;
