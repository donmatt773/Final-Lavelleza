import mongoose, { Model, Schema, Types } from 'mongoose';

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' | 'CHECKED_IN' | 'CHECKED_OUT';
export type PaymentStatus = 'UNPAID' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
export type ReservationSource = 'ONLINE' | 'WALK_IN';

export interface IReservation {
  _id?: Types.ObjectId;
  reservationNumber: string;
  guestName: string;
  email: string;
  phone: string;
  address?: string;
  room: Types.ObjectId | string;
  promo?: Types.ObjectId | string | null;
  adults: number;
  children: number;
  checkIn: Date;
  checkOut: Date;
  specialRequests?: string;
  reservationStatus: ReservationStatus;
  paymentStatus: PaymentStatus;
  reservationSource?: ReservationSource;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  checkedInBy?: string | null;
  checkedOutBy?: string | null;
  statusHistory?: Array<{
    fromStatus?: ReservationStatus | null;
    toStatus: ReservationStatus;
    changedAt: Date;
    staffMember: string;
  }>;
  pricingSummary?: {
    currency: 'PHP';
    roomRate: number;
    numberOfNights: number;
    extraPersonFee: number;
    extraBedFee: number;
    promoDiscount: number;
    additionalRoomDiscount: number;
    subtotal: number;
    grandTotal: number;
  };
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const reservationSchema = new Schema<IReservation>(
  {
    reservationNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    guestName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    promo: { type: Schema.Types.ObjectId, ref: 'Promo', default: null },
    adults: { type: Number, required: true, min: 1 },
    children: { type: Number, required: true, min: 0, default: 0 },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    specialRequests: { type: String, trim: true },
    reservationStatus: {
      type: String,
      required: true,
      enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'CHECKED_IN', 'CHECKED_OUT'],
      default: 'PENDING',
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ['UNPAID', 'PENDING_VERIFICATION', 'PARTIALLY_PAID', 'PAID', 'REFUNDED'],
      default: 'UNPAID',
    },
    reservationSource: {
      type: String,
      required: true,
      enum: ['ONLINE', 'WALK_IN'],
      default: 'ONLINE',
    },
    checkInAt: { type: Date, default: null },
    checkOutAt: { type: Date, default: null },
    checkedInBy: { type: String, trim: true, default: null },
    checkedOutBy: { type: String, trim: true, default: null },
    statusHistory: {
      type: [
        new Schema(
          {
            fromStatus: {
              type: String,
              enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'CHECKED_IN', 'CHECKED_OUT', null],
              default: null,
            },
            toStatus: {
              type: String,
              required: true,
              enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'CHECKED_IN', 'CHECKED_OUT'],
            },
            changedAt: { type: Date, required: true },
            staffMember: { type: String, required: true, trim: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    pricingSummary: {
      currency: { type: String, default: 'PHP' },
      roomRate: { type: Number, default: 0, min: 0 },
      numberOfNights: { type: Number, default: 1, min: 1 },
      extraPersonFee: { type: Number, default: 0, min: 0 },
      extraBedFee: { type: Number, default: 0, min: 0 },
      promoDiscount: { type: Number, default: 0, min: 0 },
      additionalRoomDiscount: { type: Number, default: 0, min: 0 },
      subtotal: { type: Number, default: 0, min: 0 },
      grandTotal: { type: Number, default: 0, min: 0 },
    },
    createdBy: { type: String, required: true, default: 'PUBLIC', trim: true, uppercase: true },
  },
  {
    timestamps: true,
    collection: 'reservations',
  }
);

reservationSchema.pre('validate', function validateReservationDates() {
  if (this.checkIn && this.checkOut && this.checkOut <= this.checkIn) {
    this.invalidate('checkOut', 'Check-out date must be later than check-in date.');
  }
});

reservationSchema.index({ reservationNumber: 1 }, { unique: true });
reservationSchema.index({ room: 1, checkIn: 1, checkOut: 1 });
reservationSchema.index({ reservationStatus: 1, paymentStatus: 1, createdAt: -1 });
reservationSchema.index({ checkInAt: 1, checkOutAt: 1 });
reservationSchema.index({ guestName: 1, email: 1, phone: 1 });

const Reservation: Model<IReservation> = mongoose.models.Reservation || mongoose.model<IReservation>('Reservation', reservationSchema);

export default Reservation;
