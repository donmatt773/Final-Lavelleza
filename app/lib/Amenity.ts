import mongoose, { Model, Schema, Types } from 'mongoose';

export interface IAmenity {
  _id?: Types.ObjectId;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const amenitySchema = new Schema<IAmenity>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'amenities',
  }
);

const Amenity: Model<IAmenity> = mongoose.models.Amenity || mongoose.model<IAmenity>('Amenity', amenitySchema);

export default Amenity;
