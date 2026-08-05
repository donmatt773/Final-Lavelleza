import mongoose, { Model, Schema, Types } from 'mongoose';

export interface IRateSettings {
  _id?: Types.ObjectId;
  key: string;
  checkInTime: string;
  checkOutTime: string;
  extraPersonRate: number;
  childExemptionAge: number;
  extraSingleBedRate: number;
  extraDoubleBedRate: number;
  halfDayCutoffTime: string;
  beforeCutoffRateType: 'HALF_DAY';
  afterCutoffRateType: 'WHOLE_DAY';
  createdAt?: Date;
  updatedAt?: Date;
}

const rateSettingsSchema = new Schema<IRateSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'default', trim: true },
    checkInTime: { type: String, required: true, default: '1:00 PM', trim: true },
    checkOutTime: { type: String, required: true, default: '11:00 AM', trim: true },
    extraPersonRate: { type: Number, required: true, default: 150, min: 0 },
    childExemptionAge: { type: Number, required: true, default: 9, min: 0 },
    extraSingleBedRate: { type: Number, required: true, default: 300, min: 0 },
    extraDoubleBedRate: { type: Number, required: true, default: 500, min: 0 },
    halfDayCutoffTime: { type: String, required: true, default: '6:00 PM', trim: true },
    beforeCutoffRateType: { type: String, required: true, enum: ['HALF_DAY'], default: 'HALF_DAY' },
    afterCutoffRateType: { type: String, required: true, enum: ['WHOLE_DAY'], default: 'WHOLE_DAY' },
  },
  {
    timestamps: true,
    collection: 'rate_settings',
  }
);

const RateSettings: Model<IRateSettings> = mongoose.models.RateSettings || mongoose.model<IRateSettings>('RateSettings', rateSettingsSchema);

export default RateSettings;
