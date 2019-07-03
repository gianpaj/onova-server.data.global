// @flow

import mongoose from 'mongoose';

/**
 * User verification Schema
 */
const VerificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  resetToken: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
    expires: '72h',
  },
});

export class VerificationDoc /*:: extends Mongoose$Document */ {
  user: MongoId;
  resetToken: string;
  createdAt: Date;
}

VerificationSchema.loadClass(VerificationDoc);

VerificationSchema.index({ resetToken: 1 }, { unique: true });
VerificationSchema.index({ user: 1 });

export default mongoose.model('Verification', VerificationSchema);
