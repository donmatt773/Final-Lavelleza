import mongoose, { Model, Schema, Types } from 'mongoose';

export type PaymentMethod = 'CASH_ON_ARRIVAL' | 'GCASH';
export type PaymentType = 'RESERVATION_DEPOSIT' | 'PARTIAL_PAYMENT' | 'FULL_PAYMENT' | 'REFUND';
export type PaymentRecordStatus = 'UNPAID' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';

export interface IPayment {
  _id?: Types.ObjectId;
  paymentNumber: string;
  reservation: Types.ObjectId | string;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  amountPaid: number;
  balanceRemaining: number;
  paymentType: PaymentType;
  paymentStatus: PaymentRecordStatus;
  receivedBy: string;
  receiptNumber?: string;
  receiptDate?: Date | null;
  issuedBy?: string | null;
  notes?: string;
  proofOfPaymentUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    paymentNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    reservation: { type: Schema.Types.ObjectId, ref: 'Reservation', required: true, index: true },
    paymentDate: { type: Date, required: true, default: Date.now },
    paymentMethod: { type: String, required: true, enum: ['CASH_ON_ARRIVAL', 'GCASH'] },
    referenceNumber: { type: String, trim: true },
    amountPaid: { type: Number, required: true, min: 0.01 },
    balanceRemaining: { type: Number, required: true, min: 0, default: 0 },
    paymentType: { type: String, required: true, enum: ['RESERVATION_DEPOSIT', 'PARTIAL_PAYMENT', 'FULL_PAYMENT', 'REFUND'] },
    paymentStatus: {
      type: String,
      required: true,
      enum: ['UNPAID', 'PENDING_VERIFICATION', 'PARTIALLY_PAID', 'PAID', 'REFUNDED'],
      default: 'UNPAID',
    },
    receivedBy: { type: String, required: true, trim: true, uppercase: true },
    receiptNumber: { type: String, trim: true, uppercase: true },
    receiptDate: { type: Date, default: null },
    issuedBy: { type: String, trim: true, uppercase: true, default: null },
    notes: { type: String, trim: true },
    proofOfPaymentUrl: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'payments',
  }
);

paymentSchema.index({ reservation: 1, createdAt: -1 });
paymentSchema.index({ paymentMethod: 1, paymentDate: -1 });
paymentSchema.index({ paymentStatus: 1, paymentDate: -1 });
paymentSchema.index({ receiptNumber: 1 }, { unique: true, sparse: true });

const Payment: Model<IPayment> = mongoose.models.Payment || mongoose.model<IPayment>('Payment', paymentSchema);

export default Payment;
