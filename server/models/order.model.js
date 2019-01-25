// @flow

import mongoose from 'mongoose';
import httpStatus from 'http-status';

import APIError from '../helpers/APIError';
import { Block, userPopulateFields, productPopulateFields } from '../models';
import { NP } from '../helpers/shipping';

const { Schema } = mongoose;

/** @namespace */
const OrderSchema = new Schema(
  {
    archivedByBuyer: Boolean,
    archivedBySeller: Boolean,
    buyer: {
      type: Schema.Types.ObjectId,
      refPath: 'buyerType',
      required: true,
    },
    buyerType: {
      type: String,
      required: true,
      enum: ['User', 'UserWeb'],
    },
    cityRecipient: String,
    citySender: String,
    currency: {
      type: String,
      required: true,
      default: 'UAH',
    },
    dateCancelled: {
      type: Date,
    },
    dateCompleted: {
      type: Date,
    },
    dateConfirmed: {
      type: Date,
    },
    dateDelivered: {
      type: Date,
    },
    dateFailed: {
      type: Date,
    },
    datePaid: {
      type: Date,
    },
    datePending: {
      type: Date,
      required: true,
      default: Date.now,
    },
    dateShipped: {
      type: Date,
    },
    onovaFee: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['paypal', 'uapay'],
    },
    priceOfItem: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    reason: {
      type: String,
    },
    reviewFromBuyer: {
      type: Schema.Types.ObjectId,
      ref: 'Review',
    },
    reviewFromSeller: {
      type: Schema.Types.ObjectId,
      ref: 'Review',
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      required: true,
      default: 'pending',
      enum: [
        // Unpaid - Customer started the checkout process. Payment is not completed.
        'pending',

        // (1)
        // Buyer pays and waiting for seller to confirm – Product status is now 'reserved'
        'paid',

        // (1)
        // Product is ready for shipment. Tracking number is generated automatically
        'confirmed',

        // (2)
        'shipped',

        // Seller cancels order. Requires reason.
        // or
        // Buyer cancels order (or doesn't pay in 15 mins). Reason if internal process (payment denied/timeout)
        'cancelled',

        // (2)
        'delivered',

        // (2)
        // Item has been collected
        'completed',

        // (1)
        // Buyer fails to collect
        // or
        // Buyer refuses the item (not as described)
        'failed_by_buyer',

        // (1) or Escrow Manager
        // Seller fails to ship
        // or
        // Seller doesn't confirm order
        'failed_by_seller',
      ],
    },
    taxAmount: String,
    trackingNumber: String,
    transactionFee: Schema.Types.Decimal128,
    transactionId: String,
    transactionStatus: {
      type: String,
      enum: [
        'ua-pending',
        'ua-needsconfirmation',
        'ua-finished',
        'ua-rejected',
        'ua-reversed',
      ],
    },
    shippingFee: Schema.Types.Decimal128,
    shippingProvider: {
      type: String,
      enum: ['novaposhta'],
    },
    shippingStatus: {
      type: String,
      enum: [NP.generated, NP.shipped, NP.delivered, NP.refused, NP.collected],
    },
    shippingUpdatedAt: Date,
  },
  // assigns 'createdAt' and 'updatedAt' fields to your schema
  { timestamps: true }
);

/**
 * 1) Can be set only set when checking payment status via Payment Provider i.e. UAPAY
 * 2) Can be set only set when checking tracking code status via Shipping Provider i.e. NovaPohsta
 */

OrderSchema.virtual('total').get(function() {
  return (
    parseFloat(this.priceOfItem) + parseFloat(this.shippingFee || 0)
  ).toString();
});

OrderSchema.virtual('finalisedAt').get(function() {
  if (this.status === 'completed') {
    return this.dateCompleted;
  }
  // cancelled by a seller
  if (this.status === 'cancelled' && this.reason) {
    return this.dateCancelled;
  }
  if (this.status === 'failed_by_buyer' || this.status === 'failed_by_seller') {
    return this.dateFailed;
  }
});

export class OrderDoc /*:: extends Mongoose$Document */ {
  _id: MongoId;
  archivedByBuyer: boolean;
  archivedBySeller: boolean;
  buyer: MongoId;
  cityRecipient: string;
  citySender: string;
  currency: string;
  dateCancelled: ?Date;
  dateCompleted: ?Date;
  dateConfirmed: ?Date;
  dateDelivered: ?Date;
  dateFailed: ?Date;
  datePaid: ?Date;
  datePending: Date;
  dateShipped: ?Date;
  finalisedAt: ?Date;
  onovaFee: number;
  paymentMethod: ?string;
  priceOfItem: number;
  product: MongoId;
  reason: ?string;
  reviewFromBuyer: MongoId;
  reviewFromSeller: MongoId;
  seller: MongoId;
  shippingFee: ?number;
  shippingProvider: ?string;
  shippingStatus: string;
  shippingUpdatedAt: string;
  status: string;
  taxAmount: ?number;
  total: string;
  trackingNumber: ?string;
  transactionFee: number;
  transactionId: ?string;
  transactionStatus: ?string;
}

OrderSchema.loadClass(OrderDoc);

/**
 * Statics
 *
 * @memberof OrderSchema
 */
OrderSchema.statics = {
  /**
   * Get order
   *
   * @param {MongoId} id The unique id (shortid) of order.
   * @returns {Promise<Order, APIError>}
   */
  get(id: string, myid?: string): Promise<APIError> {
    let query = { _id: id };
    if (myid) query['$or'] = [{ buyer: myid }, { seller: myid }];
    return this.findOne(query)
      .populate({
        path: 'buyer',
        select: userPopulateFields,
      })
      .populate({
        path: 'seller',
        select: userPopulateFields,
      })
      .populate({
        path: 'product',
        select: productPopulateFields,
      })
      .then((order: OrderDoc) => {
        if (!order) {
          return Promise.reject();
        }
        return order;
      })
      .catch(() => {
        const err = new APIError('Invalid order', httpStatus.BAD_REQUEST);
        return Promise.reject(err);
      });
  },

  /**
   * List orders (as seller and buyer) in descending order of 'createdAt' timestamp.
   *
   * @param {Object} query Query params
   * @param {MongoId} query.myid User's _id
   * @param {number} query.skip Number of orders to be skipped.
   * @param {number} query.limit Limit number of orders to be returned.
   * @returns {Promise<OrderDoc[]>}
   */
  async list({ myid, skip = 0, limit = 50 }): Promise<OrderDoc[]> {
    const [usersIamBlockedBy, usersIamBlocking] = await Promise.all([
      Block.find({ targetUser: myid }),
      Block.find({ sourceUser: myid }),
    ]);

    const idsA = usersIamBlockedBy.map(u => u.sourceUser);
    const idsB = usersIamBlocking.map(u => u.targetUser);

    return this.find({
      $or: [{ buyer: myid }, { seller: myid }],
      buyer: { $nin: [...idsA, ...idsB] },
      seller: { $nin: [...idsA, ...idsB] },
    })
      .sort({ createdAt: -1 })
      .populate({
        path: 'seller',
        select: userPopulateFields,
      })
      .populate({
        path: 'buyer',
        select: userPopulateFields,
      })
      .populate({
        path: 'product',
        select: productPopulateFields,
      })
      .skip(+skip)
      .limit(+limit)
      .then((orders: OrderDoc[]) => {
        if (!orders) {
          return Promise.reject();
        }
        return orders;
      })
      .catch(() => {
        const err = new APIError('Invalid orders', httpStatus.BAD_REQUEST);
        return Promise.reject(err);
      });
  },
};

OrderSchema.post('save', function(error: Error, doc, next) {
  if (error.code === 11000) {
    return next({ message: 'Duplicate order', order: doc });
  }
  next(error);
});

function transform(doc, ret) {
  ret.onovaFee = ret.onovaFee.toString();
  ret.priceOfItem = ret.priceOfItem.toString();
  // ret.taxAmount = ret.taxAmount.toString();
  if (doc.transactionFee) ret.transactionFee = ret.transactionFee.toString();
  if (doc.shippingFee) ret.shippingFee = ret.shippingFee.toString();
  delete ret._id;
  delete ret.__v;
  return ret;
}

OrderSchema.set('toObject', {
  getters: true,
  virtuals: true,
  transform,
});

OrderSchema.set('toJSON', {
  getters: true,
  virtuals: true,
  transform,
});

OrderSchema.index({ product: 1, buyer: 1 }, { unique: true });
OrderSchema.index({ status: 1, transactionStatus: 1 });
OrderSchema.index({ seller: 1 });
OrderSchema.index({ buyer: 1 });

export default mongoose.model('Order', OrderSchema);
