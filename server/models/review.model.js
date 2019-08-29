import mongoose from 'mongoose';
import httpStatus from 'http-status';

import APIError from '../helpers/APIError';

const { Schema } = mongoose;

/**
 * User review Schema
 */
const ReviewSchema = new Schema({
  order: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Order',
  },
  fromUser: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  targetUser: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  text: {
    type: String,
  },
  rateNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer value',
    },
  },
  lang: {
    type: String,
    required: true,
    enum: ['uk', 'en', 'n/a'],
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

ReviewSchema.post('save', function(error: Error, doc, next) {
  if (error.code === 11000) {
    const APIerr = new APIError('Duplicate review', httpStatus.BAD_REQUEST);
    return next(APIerr);
  }
  next(error);
});

export class ReviewDoc /*:: extends Mongoose$Document */ {
  id: MongoId;
  order: MongoId;
  fromUser: MongoId;
  targetUser: MongoId;
  text: string;
  rateNumber: number;
  lang: string;
  createdAt: Date;
}

ReviewSchema.loadClass(ReviewDoc);

// Never return these fields in the JSON representation
// This doesn't effect `toObject` method
ReviewSchema.set('toJSON', {
  getters: true,
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

ReviewSchema.index({ order: 1, fromUser: 1, targetUser: 1 }, { unique: true });
ReviewSchema.index({ targetUser: 1 });
ReviewSchema.index({ fromUser: 1 });

export default mongoose.model('Review', ReviewSchema);
