import mongoose, { Model, Schema, Types } from 'mongoose';

export interface IBedType {
  _id?: Types.ObjectId;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const bedTypeSchema = new Schema<IBedType>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'bedtypes',
  }
);

const BedType: Model<IBedType> = mongoose.models.BedType || mongoose.model<IBedType>('BedType', bedTypeSchema);

export default BedType;
