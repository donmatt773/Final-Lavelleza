import mongoose, { Model, Schema, Types } from 'mongoose';

export interface IFeature {
  _id?: Types.ObjectId;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const featureSchema = new Schema<IFeature>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'features',
  }
);

const Feature: Model<IFeature> = mongoose.models.Feature || mongoose.model<IFeature>('Feature', featureSchema);

export default Feature;
