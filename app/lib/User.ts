import mongoose, { Model, Schema } from 'mongoose';

export interface IUser {
  employeeId: string;
  username?: string;
  name: string;
  password: string;
  role: number;
}

const userSchema = new Schema<IUser>(
  {
    employeeId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    role: { type: Number, required: true, default: 1 }
  },
  {
    timestamps: true,
    collection: 'users'
  }
);

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', userSchema);

export default User;