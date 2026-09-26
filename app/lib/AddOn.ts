import mongoose, { Model, Schema, Types } from 'mongoose';

export interface IAddOn {
  _id?: Types.ObjectId;
  name: string;
  description?: string;
  category?: string;
  price: number;
  isActive: boolean;
  stockQuantity?: number | null;
  stockLockToken?: string | null;
  stockLockExpiresAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const addOnSchema = new Schema<IAddOn>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    category: { type: String, trim: true, uppercase: true, default: 'OTHER' },
    price: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    stockQuantity: {
      type: Number,
      min: 0,
      default: null,
      validate: { validator: Number.isInteger, message: 'Stock quantity must be a whole number.' },
    },
    stockLockToken: { type: String, default: null, select: false },
    stockLockExpiresAt: { type: Date, default: null, select: false },
  },
  { timestamps: true, collection: 'add_ons' }
);

addOnSchema.index({ name: 1 }, { unique: true });
addOnSchema.index({ isActive: 1, category: 1 });

const AddOn: Model<IAddOn> = mongoose.models.AddOn || mongoose.model<IAddOn>('AddOn', addOnSchema);

export default AddOn;
