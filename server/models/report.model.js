import mongoose from 'mongoose';
import httpStatus from 'http-status';

import APIError from '../helpers/APIError';

const { Schema } = mongoose;

/**
 * User or Product reporting Schema
 */
const ReportSchema = new Schema({
  // comment: {
  //   type: Schema.Types.ObjectId,
  // },
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: function() {
      return !this.user;
    },
  },
  reporter: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  text: {
    type: String,
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return !this.product;
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
});

export class ReportDoc /*:: extends Mongoose$Document */ {
  // comment: MongoId;
  product: MongoId;
  reporter: MongoId;
  text: String;
  user: MongoId;
  createdAt: Date;
}

ReportSchema.loadClass(ReportDoc);

ReportSchema.post('save', function(error: Error, doc, next) {
  if (error.code === 11000) {
    const APIerr = new APIError('Duplicate report', httpStatus.BAD_REQUEST);
    return next(APIerr);
  }
  next(error);
});

// Never return '__v' or 'id' fields in the JSON representation
// Note that this doesn't effect `toObject`
ReportSchema.set('toJSON', {
  getters: true,
  transform: (doc, ret) => {
    delete ret.id;
    delete ret.__v;
    return ret;
  },
});

ReportSchema.index({ reporter: 1, createdAt: -1 });
ReportSchema.index({ reporter: 1, user: 1 }, { unique: true });
ReportSchema.index({ reporter: 1, product: 1 }, { unique: true });
// ReportSchema.index({ reporter: 1, commentId: 1 }, { unique: true });

export default mongoose.model('Report', ReportSchema);
