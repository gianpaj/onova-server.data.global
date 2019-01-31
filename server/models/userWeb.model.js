// @flow

import Promise from 'bluebird';
import mongoose from 'mongoose';
import httpStatus from 'http-status';

import APIError from '../helpers/APIError';

const { Schema } = mongoose;

/**
 * User Schema
 */
const UserWebSchema = new Schema(
  {
    accountStatus: {
      type: String,
      enum: ['banned', 'deleted'],
    },
    emailAddress: {
      type: String,
      trim: true,
      lowercase: true,
      // validated at API level via 'Joi' and 'isEmail' npm packages
    },
    mobileNumber: {
      type: String,
      trim: true,
    },
    paymentInfo: {
      method: {
        type: String,
        enum: ['paypal', 'uapay'],
      },
      card_token: String,
      last_four: String,
    },
    shippingAddress: {
      firstName: String,
      lastName: String,
      city: String,
      departmentNovaposhta: String,
    },
  },
  // assigns 'createdAt' and 'updatedAt' fields to your schema
  { timestamps: true, collection: 'usersweb' }
);

export class UserWebDoc /*:: extends Mongoose$Document */ {
  _id: bson$ObjectId;
  accountStatus: string;
  createdAt: Date;
  emailAddress: string;
  mobileNumber: ?string;
  paymentInfo: ?any;
  shippingAddress: ?any;
  updatedAt: Date;
}

UserWebSchema.loadClass(UserWebDoc);

/**
 * Statics
 */
UserWebSchema.statics = {
  /**
   * Get Web User
   *
   * @param {MongoId} id - The ObjectId of user.
   */
  get(id: string): Promise<UserDoc | APIError> {
    return this.findById(id)
      .then((user: UserDoc) => {
        if (!user) {
          return Promise.reject();
        }
        return user;
      })
      .catch(() => {
        const err = new APIError('Invalid web user', httpStatus.BAD_REQUEST);
        return Promise.reject(err);
      });
  },
};

// Never return these fields in the JSON representation
// This doesn't effect `toObject` method
UserWebSchema.set('toJSON', {
  transform: (doc, ret) => {
    if (doc.paymentInfo.card_token) delete ret.paymentInfo.card_token;
    delete ret.__v;
    return ret;
  },
});

UserWebSchema.index({ emailAddress: 1 });

export default mongoose.model('UserWeb', UserWebSchema);
