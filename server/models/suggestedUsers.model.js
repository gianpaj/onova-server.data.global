import mongoose from 'mongoose';

const { Schema } = mongoose;

const SuggestionSchema = new Schema({
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
    expires: '24h', // TODO: expire at the specific time each day
  },
  suggestions: {
    type: [
      {
        _id: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        numOfConns: Number,
      },
    ],
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

export class SuggestionDoc /*:: extends Mongoose$Document */ {
  _id: MongoId;
  createdAt: Date;
  suggestions: Array<any>;
  user: MongoId;
}

SuggestionSchema.loadClass(SuggestionDoc);

// Never return '__v' field in the JSON representation
// Note that this doesn't effect `toObject`
SuggestionSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

SuggestionSchema.index({ user: 1 }, { unique: true });
export default mongoose.model('SuggestedUsers', SuggestionSchema);
