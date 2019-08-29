import mongoose from 'mongoose';

const { Schema } = mongoose;

// Default users which will be followed when an user is created
/** @namespace */
const defaultFollowSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    location: {
      type: String,
      default: 'UA', // country code (ISO 3166-1 alpha-2 code)
    },
    initialFollowersCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value',
      },
    },
  },
  {
    // assigns 'createdAt' and 'updatedAt' fields to your schema
    timestamps: true,
  }
);

export class DefaultFollowDoc /*:: extends Mongoose$Document */ {
  user: MongoId;
  createdAt: Date;
  updatedAt: Date;
}

defaultFollowSchema.loadClass(DefaultFollowDoc);

// Never return these fields in the JSON representation
// This doesn't effect `toObject` method
defaultFollowSchema.set('toJSON', {
  getters: true,
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

// defaultFollowSchema.index({ user: 1 }); // created by `unique` schema setting above

export default mongoose.model('DefaultFollow', defaultFollowSchema);
