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
  emailSubject: string;
  emailBody: string;
  preArrivalEmailSubject: string;
  preArrivalEmailBody: string;
  thankYouEmailSubject: string;
  thankYouEmailBody: string;
  resortAddress: string;
  contactPhone: string;
  reviewUrl: string;
  cancellationPolicy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const DEFAULT_PRE_ARRIVAL_EMAIL_SUBJECT = "We're Preparing for Your Arrival at La Velleza Resort!";
export const DEFAULT_PRE_ARRIVAL_EMAIL_BODY = [
  'Dear {{guestName}},',
  '',
  'Great news — your getaway at La Velleza Resort is almost here! We are preparing everything for your arrival.',
  '',
  'Reservation: {{reservationNumber}}',
  'Check-in: {{checkIn}} (check-in time: {{checkInTime}})',
  'Check-out: {{checkOut}}',
  '{{roomLabel}}: {{rooms}}',
  'Guests: {{adults}} adult(s), {{children}} child(ren)',
  '',
  'Highlights awaiting you:',
  '- Warm hospitality and a freshly prepared room',
  '- Resort amenities ready for your stay',
  '{{specialRequests}}',
  '',
  'If you have any special requests (such as transfers or early check-in), reply to this email or call us at {{contactPhone}}.',
  '',
  'See you soon!',
  'La Velleza Resort',
  '{{resortAddress}}',
].join('\n');

export const DEFAULT_THANK_YOU_EMAIL_SUBJECT = 'Thank you for staying with us at La Velleza Resort!';
export const DEFAULT_THANK_YOU_EMAIL_BODY = [
  'Dear {{guestName}},',
  '',
  'Thank you for staying with us at La Velleza Resort.',
  '',
  'It was a pleasure hosting you. We hope you had a wonderful and memorable stay.',
  '',
  'We would love to hear about your experience.',
  'Please take a moment to share your feedback: {{reviewUrl}}',
  '',
  'We look forward to welcoming you back soon.',
  '',
  'Warm regards,',
  'La Velleza Resort',
  '{{resortAddress}}',
  '{{contactPhone}}',
].join('\n');

export const DEFAULT_RESORT_ADDRESS = 'La Velleza Resort';
export const DEFAULT_CONTACT_PHONE = '';
export const DEFAULT_REVIEW_URL = '';
export const DEFAULT_CANCELLATION_POLICY = 'Please contact the resort directly for cancellation inquiries.';
export const DEFAULT_EMAIL_SUBJECT = 'La Velleza reservation {{reservationNumber}} update';
export const DEFAULT_EMAIL_BODY = [
  'Dear {{guestName}},',
  '',
  'We are contacting you about your reservation {{reservationNumber}}.',
  'Current status: {{status}}.',
  '',
  '{{roomLabel}}: {{rooms}}',
  'Check-in: {{checkIn}}',
  'Check-out: {{checkOut}}',
  'Guests: {{adults}} adult(s), {{children}} child(ren)',
  'Reservation total: PHP {{total}}',
  '',
  '{{statusMessage}}',
  '',
  'Regards,',
  'La Velleza Resort',
].join('\n');

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
    emailSubject: { type: String, required: true, default: DEFAULT_EMAIL_SUBJECT, trim: true, maxlength: 200 },
    emailBody: { type: String, required: true, default: DEFAULT_EMAIL_BODY, maxlength: 10000 },
    preArrivalEmailSubject: { type: String, required: true, default: DEFAULT_PRE_ARRIVAL_EMAIL_SUBJECT, trim: true, maxlength: 200 },
    preArrivalEmailBody: { type: String, required: true, default: DEFAULT_PRE_ARRIVAL_EMAIL_BODY, maxlength: 10000 },
    thankYouEmailSubject: { type: String, required: true, default: DEFAULT_THANK_YOU_EMAIL_SUBJECT, trim: true, maxlength: 200 },
    thankYouEmailBody: { type: String, required: true, default: DEFAULT_THANK_YOU_EMAIL_BODY, maxlength: 10000 },
    resortAddress: { type: String, default: DEFAULT_RESORT_ADDRESS, trim: true, maxlength: 500 },
    contactPhone: { type: String, default: DEFAULT_CONTACT_PHONE, trim: true, maxlength: 100 },
    reviewUrl: { type: String, default: DEFAULT_REVIEW_URL, trim: true, maxlength: 500 },
    cancellationPolicy: { type: String, default: DEFAULT_CANCELLATION_POLICY, trim: true, maxlength: 2000 },
  },
  {
    timestamps: true,
    collection: 'rate_settings',
  }
);

const RateSettings: Model<IRateSettings> = mongoose.models.RateSettings || mongoose.model<IRateSettings>('RateSettings', rateSettingsSchema);

export default RateSettings;
