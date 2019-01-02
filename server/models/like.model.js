// @flow

import mongoose from 'mongoose';

const { Schema } = mongoose;

const LikeSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  dateCreated: {
    type: Date,
    default: Date.now,
    required: true,
  },
});

export class LikeDoc /*:: extends Mongoose$Document */ {
  product: MongoId;
  userId: MongoId;
  dateCreated: Date;
}

LikeSchema.loadClass(LikeDoc);

// Never return '__v' fields in the JSON representation
// Note that this doesn't effect `toObject`
LikeSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

LikeSchema.index({ product: 1, dateCreated: 1 });
LikeSchema.index({ userId: 1, dateCreated: 1 });

export default mongoose.model('Like', LikeSchema);
