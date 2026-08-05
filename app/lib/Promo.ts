import mongoose, { Model, Schema, Types } from 'mongoose';

export type PromoStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
export type AdditionalRoomDiscountMode = 'PERCENT' | 'FIXED_AMOUNT';

export interface IPromoImage {
  fileUrl: string;
  storageKey?: string;
  altText?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface IPromoInclusion {
  _id?: Types.ObjectId;
  type: string;
  name: string;
  description?: string;
  quantity?: number;
  unit?: string;
  pax?: number;
  roomId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  sortOrder?: number;
  isOptional?: boolean;
}

export interface IAdditionalRoomDiscount {
  mode: AdditionalRoomDiscountMode;
  value: number;
  appliesToRoomIds?: Types.ObjectId[];
  maxDiscountAmount?: number;
  notes?: string;
}

export interface IPromo {
  _id?: Types.ObjectId;
  name: string;
  code: string;
  codeNormalized: string;
  description?: string;
  packagePrice: number;
  currency: string;
  banner?: IPromoImage;
  inclusions: IPromoInclusion[];
  includedPax?: number;
  includedRoomIds: Types.ObjectId[];
  additionalRoomDiscount?: IAdditionalRoomDiscount;
  status: PromoStatus;
  startDate?: Date;
  endDate?: Date;
  timezone: string;
  notes?: string;
  termsAndConditions: string[];
  isArchived: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export function getPromoEffectiveStatus(status: string | undefined, startDate?: Date | null, endDate?: Date | null): PromoStatus {
  const normalized = typeof status === 'string' ? status.toUpperCase() : 'DRAFT';
  if (normalized === 'ACTIVE' && endDate && endDate < new Date()) {
    return 'EXPIRED';
  }
  return normalized as PromoStatus;
}

export function resolvePromoStatus(
  status: string | undefined,
  nextStartDate?: Date | null,
  nextEndDate?: Date | null,
  fallbackStartDate?: Date | null,
  fallbackEndDate?: Date | null
): PromoStatus {
  const resolvedStartDate = nextStartDate ?? fallbackStartDate;
  const resolvedEndDate = nextEndDate ?? fallbackEndDate;
  return getPromoEffectiveStatus(status, resolvedStartDate, resolvedEndDate);
}

const promoImageSchema = new Schema<IPromoImage>(
  {
    fileUrl: { type: String, required: true, trim: true },
    storageKey: { type: String, trim: true },
    altText: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    width: { type: Number, min: 1 },
    height: { type: Number, min: 1 },
  },
  { _id: false }
);

const promoInclusionSchema = new Schema<IPromoInclusion>(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    quantity: { type: Number, min: 1 },
    unit: { type: String, trim: true },
    pax: { type: Number, min: 1 },
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: function requiredRoomId(this: IPromoInclusion) {
        return this.type === 'ROOM';
      },
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    sortOrder: { type: Number, default: 0 },
    isOptional: { type: Boolean, default: false },
  },
  { _id: true }
);

const additionalRoomDiscountSchema = new Schema<IAdditionalRoomDiscount>(
  {
    mode: {
      type: String,
      required: true,
      enum: ['PERCENT', 'FIXED_AMOUNT'],
    },
    value: { type: Number, required: true, min: 0 },
    appliesToRoomIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Room' }],
      default: [],
      validate: {
        validator: (ids: Types.ObjectId[]) => {
          const normalized = ids.map((id) => String(id));
          return new Set(normalized).size === normalized.length;
        },
        message: 'Additional discount room references must be unique.',
      },
    },
    maxDiscountAmount: { type: Number, min: 0 },
    notes: { type: String, trim: true },
  },
  { _id: false }
);

const promoSchema = new Schema<IPromo>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    codeNormalized: { type: String, required: true, unique: true, trim: true, uppercase: true },
    description: { type: String, trim: true },
    packagePrice: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) => Number.isFinite(value),
        message: 'Package price must be a valid number.',
      },
    },
    currency: { type: String, default: 'PHP', trim: true, uppercase: true },
    banner: { type: promoImageSchema, required: false },
    inclusions: { type: [promoInclusionSchema], default: [] },
    includedPax: { type: Number, min: 1 },
    includedRoomIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Room' }],
      default: [],
      validate: {
        validator: (ids: Types.ObjectId[]) => {
          const normalized = ids.map((id) => String(id));
          return new Set(normalized).size === normalized.length;
        },
        message: 'Included room references must be unique.',
      },
    },
    additionalRoomDiscount: { type: additionalRoomDiscountSchema, required: false },
    status: {
      type: String,
      required: true,
      enum: ['DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED'],
      default: 'DRAFT',
    },
    startDate: { type: Date },
    endDate: { type: Date },
    timezone: { type: String, default: 'Asia/Manila', trim: true },
    notes: { type: String, trim: true },
    termsAndConditions: { type: [String], default: [] },
    isArchived: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: 'promos',
  }
);

promoSchema.pre('validate', function normalizePromoData() {
  if (this.code) {
    this.codeNormalized = this.code.trim().toUpperCase();
  }

  this.status = getPromoEffectiveStatus(this.status, this.startDate, this.endDate);

  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'End date must be greater than or equal to start date.');
  }

  if (this.status === 'ACTIVE' && (!this.startDate || !this.endDate)) {
    this.invalidate('status', 'ACTIVE promos require startDate and endDate.');
  }

  const inclusionRoomIds = this.inclusions
    .filter((inclusion) => inclusion.type === 'ROOM' && inclusion.roomId)
    .map((inclusion) => String(inclusion.roomId));

  const explicitRoomIds = (this.includedRoomIds || []).map((roomId) => String(roomId));
  const merged = Array.from(new Set([...explicitRoomIds, ...inclusionRoomIds]));
  this.includedRoomIds = merged.map((roomId) => new Types.ObjectId(roomId));
});

promoSchema.index({ codeNormalized: 1 }, { unique: true });
promoSchema.index({ status: 1, isArchived: 1, startDate: 1, endDate: 1 });
promoSchema.index({ includedRoomIds: 1 });
promoSchema.index({ endDate: 1, status: 1 });
promoSchema.index({ name: 1 });
promoSchema.index({ 'inclusions.roomId': 1 });

const Promo: Model<IPromo> = mongoose.models.Promo || mongoose.model<IPromo>('Promo', promoSchema);

export default Promo;