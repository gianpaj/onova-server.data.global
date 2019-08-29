import mongoose from 'mongoose';
import httpStatus from 'http-status';

import APIError from '../helpers/APIError';

const { Schema } = mongoose;

/**
 * User blocking Schema
 */
const BlockSchema = new Schema({
  sourceUser: {
    ref: 'User',
    required: true,
    type: Schema.Types.ObjectId,
  },
  targetUser: {
    ref: 'User',
    required: true,
    type: Schema.Types.ObjectId,
  },
  createdAt: {
    default: Date.now,
    required: true,
    type: Date,
  },
});

export class BlockDoc /*:: extends Mongoose$Document */ {
  sourceUser: MongoId;
  targetUser: MongoId;
  createdAt: Date;
}

BlockSchema.loadClass(BlockDoc);

BlockSchema.post('save', function(error: Error, doc, next) {
  if (error.code === 11000) {
    const APIerr = new APIError('Duplicate block', httpStatus.BAD_REQUEST);
    return next(APIerr);
  }
  next(error);
});

// Never return '__v' or 'id' fields in the JSON representation
// Note that this doesn't effect `toObject`
BlockSchema.set('toJSON', {
  getters: true,
  transform: (doc, ret) => {
    delete ret.id;
    delete ret.__v;
    return ret;
  },
});

BlockSchema.index({ targetUser: 1, createdAt: -1 });
BlockSchema.index({ sourceUser: 1, targetUser: 1 }, { unique: true });

export default mongoose.model('Block', BlockSchema);
