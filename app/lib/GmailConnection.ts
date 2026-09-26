import mongoose, { Model, Schema, Types } from 'mongoose';

export interface IGmailConnection {
  _id?: Types.ObjectId;
  key: string;
  email: string;
  refreshTokenEncrypted: string;
  connectedBy: string;
  connectedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const gmailConnectionSchema = new Schema<IGmailConnection>(
  {
    key: { type: String, required: true, unique: true, default: 'primary' },
    email: { type: String, required: true, trim: true, lowercase: true },
    refreshTokenEncrypted: { type: String, required: true, select: false },
    connectedBy: { type: String, required: true, trim: true },
    connectedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: 'gmail_connections' }
);

const GmailConnection: Model<IGmailConnection> = mongoose.models.GmailConnection || mongoose.model<IGmailConnection>('GmailConnection', gmailConnectionSchema);

export default GmailConnection;