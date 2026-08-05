import mongoose, { Model, Schema, Types } from 'mongoose';

export interface IRoomImage {
  _id?: Types.ObjectId;
  fileUrl: string;
  storageKey?: string;
  altText?: string;
  sortOrder: number;
  isPrimary: boolean;
}

export interface IRoomBed {
  bedTypeId: Types.ObjectId | string;
  quantity: number;
}

export interface IRoom {
  _id?: Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  maxGuests: number;
  status: 'AVAILABLE' | 'MAINTENANCE' | 'INACTIVE';
  nightlyRate: number;
  halfDayRate: number;
  wholeDayRate: number;
  beds: IRoomBed[];
  features: Array<Types.ObjectId | string>;
  amenities: Array<Types.ObjectId | string>;
  images: IRoomImage[];
  primaryImageId?: Types.ObjectId | string | null;
  isArchived: boolean;
  archivedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const roomImageSchema = new Schema<IRoomImage>(
  {
    fileUrl: { type: String, required: true, trim: true },
    storageKey: { type: String, trim: true },
    altText: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true }
);

const roomBedSchema = new Schema<IRoomBed>(
  {
    bedTypeId: { type: Schema.Types.ObjectId, ref: 'BedType', required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const roomSchema = new Schema<IRoom>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, trim: true },
    maxGuests: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: ['AVAILABLE', 'MAINTENANCE', 'INACTIVE'],
      default: 'AVAILABLE',
    },
    nightlyRate: { type: Number, required: true, min: 0 },
    halfDayRate: { type: Number, required: true, min: 0 },
    wholeDayRate: { type: Number, required: true, min: 0 },
    beds: { type: [roomBedSchema], default: [] },
    features: [{ type: Schema.Types.ObjectId, ref: 'Feature' }],
    amenities: [{ type: Schema.Types.ObjectId, ref: 'Amenity' }],
    images: { type: [roomImageSchema], default: [] },
    primaryImageId: { type: Schema.Types.ObjectId, default: null },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'rooms',
  }
);

roomSchema.index({ status: 1, isArchived: 1 });
roomSchema.index({ maxGuests: 1 });
roomSchema.index({ name: 1 }, { unique: true });

const Room: Model<IRoom> = mongoose.models.Room || mongoose.model<IRoom>('Room', roomSchema);

export default Room;
