// @flow

import Promise from 'bluebird';
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import shortid from 'shortid';

import APIError from '../helpers/APIError';
import { ProductDoc, UserDoc } from '.';

const { Schema } = mongoose;

const DropSchema = new Schema(
  {
    description: {
      type: String,
    },
    subscribers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    posted: {
      type: Boolean,
      required: true,
      default: false,
    },
    products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    scheduledAt: {
      type: Date,
      required: true,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    uuid: {
      type: String,
      unique: true, // Unique index
    },
    status: {
      type: String,
      required: true,
      default: 'valid',
      enum: ['valid', 'sold', 'banned', 'deleted'],
    },
  },
  {
    // assigns 'createdAt' and 'updatedAt' fields
    timestamps: true,
  }
);

export class DropDoc /*:: extends Mongoose$Document */ {
  _id: MongoId;
  amISubscribed: Boolean;
  createdAt: Date;
  description: ?string;
  posted: Boolean;
  products: Array<ProductDoc>;
  scheduledAt: Date;
  seller: MongoId;
  subscribers: Array<UserDoc>;
  updatedAt: Date;
  uuid: string;
}

DropSchema.loadClass(DropDoc);

/**
 * Statics
 *
 * @memberof DropSchema
 */
DropSchema.statics = {
  /**
   * List drops, by default in descending order of 'createdAt' timestamp.
   *
   * @param {string} uuid
   */
  get(uuid): Promise<DropDoc | APIError> {
    return this.findOne({ uuid, status: 'valid' })
      .populate({
        path: 'seller',
        select: 'username profilePic',
      })
      .populate({
        path: 'products',
        select: 'photoURIs',
        // TODO: only return the first image
        // options: {
        //   slice: {
        //     photoURIs: 1,
        //   },
        // },
      })
      .populate({
        path: 'subscribers',
        select: 'username profilePic',
      })
      .then((drop: DropDoc) => drop)
      .catch(error => {
        console.log(error);
        throw new APIError('Invalid drop', httpStatus.BAD_REQUEST);
      });
  },

  /**
   * List drops, by default in descending order of 'createdAt' timestamp.
   *
   * @param {Object} query Query params
   * @param {Object} query.query DB query
   * @param {Object} query.sort
   * @param {number} query.limit Limit number of drops to be returned.
   */
  list({
    query = {},
    sort = { _id: -1 }, // faster than createdAt: -1 , same ordering
    limit = 50,
  }): Promise<DropDoc[] | APIError> {
    return this.find({ ...query, status: 'valid' })
      .populate({
        path: 'seller',
        select: 'username profilePic',
      })
      .populate({
        path: 'products',
        select: 'photoURIs',
        // TODO: only return the first image
        // options: {
        //   slice: {
        //     photoURIs: 1,
        //   },
        // },
      })
      .populate({
        path: 'subscribers',
        select: 'username profilePic',
      })
      .sort(sort)
      .limit(+limit)
      .then((drops: DropDoc[]) => drops)
      .catch(error => {
        console.log(error);
        throw new APIError('Invalid drops', httpStatus.BAD_REQUEST);
      });
  },
};

DropSchema.pre('save', function(next) {
  const doc = this;
  if (!doc.uuid) return generateUnique(doc, next);
  next();
});

// Never return '__v' fields in the JSON representation
// Note that this doesn't effect `toObject`
DropSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

DropSchema.index({ scheduledAt: 1, createdAt: 1 });
DropSchema.index({ scheduledAt: 1, seller: 1 });

const UNIQUE_RETRIES = 9999;

function generateUnique(doc, next) {
  let retries = 0;
  let sid;

  // Try to generate a unique ID,
  // i.e. one that hasn't been used previously
  while (!sid && retries < UNIQUE_RETRIES) {
    sid = shortid.generate();
    doc.constructor.findOne({ uuid: sid }).then(
      docRes => {
        if (docRes) {
          sid = null;
          return retries++;
        }
        doc.uuid = sid;
        next();
      },
      err => next(err)
    );
  }
}

export default mongoose.model('Drop', DropSchema);
