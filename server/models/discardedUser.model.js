import mongoose from 'mongoose';

const { Schema } = mongoose;

const DiscardedSchema = new Schema({
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
    expires: '168h', // 7 days
  },
  source: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  target: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

export class DiscardedDoc /*:: extends Mongoose$Document */ {
  _id: MongoId;
  createdAt: Date;
  source: MongoId;
  target: MongoId;
}

DiscardedSchema.index({ source: 1, target: 1 }, { unique: true });

export default mongoose.model('DiscardedUser', DiscardedSchema);
