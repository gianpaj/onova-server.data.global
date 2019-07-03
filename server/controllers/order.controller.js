// @flow

const debug = require('debug')('server-data:index');

import axios from 'axios';
import httpStatus from 'http-status';
import * as Sentry from '@sentry/node';

import APIError from '../helpers/APIError';
import { Block, Cities, Notification, Order, OrderDoc, Product, ProductDoc, User, UserDoc, UserWeb } from '../models';
import notifCtrl from '../controllers/notification.controller';
import { getShippingCost } from '../controllers/shipping.controller';
import { NP } from '../helpers/shipping';
import { sendSystemMessage } from '../helpers/job';

import type { NotifPayload } from '../controllers/notification.controller';

import config from '../config/config';

axios.defaults.baseURL = config.UAPAY_BASE_URL;

const axiosConfig = {
  auth: {
    username: config.UAPAY_CLIENTID_ESCROW,
    password: config.UAPAY_KEY_ESCROW,
  },
};

function buyerCanTransact(user) {
  const { paymentInfo, shippingAddress } = user;
  return (
    paymentInfo.full.card_token &&
    shippingAddress.firstName &&
    shippingAddress.lastName &&
    shippingAddress.city &&
    shippingAddress.departmentNovaposhta
  );
}

function sellerCanTransact(user) {
  const { paymentInfo, shippingAddress } = user;
  return (
    (paymentInfo.short.card_token || paymentInfo.full.card_token) &&
    shippingAddress.firstName &&
    shippingAddress.lastName &&
    shippingAddress.city &&
    shippingAddress.departmentNovaposhta
  );
}

declare class express$Request extends express$Request {
  order: OrderDoc;
  user: UserDoc;
}

export const i18n = {
  orderPaidForBuyer: 'Ваше замовлення зареєстровано. Продавець має найближчим часом підтвердити його.',
  orderPaidForSeller: 'Вітаємо, підтвердіть нове замовлення!',
  orderPaidReminder: 'Замовлення чекає вашого підтвердження',
  orderCancelled: 'Ваше замовлення скасовано, ваші кошти повернуться вам',
  orderNotConfirmedToBuyer: 'Шкода, продавець не підтвердив замовлення вчасно',
  orderNotConfirmedToSeller: "Ти не підтвердив замовлення вчасно, це з'явиться в твоїх відгуках",

  // system messages
  orderConfirmed: 'Замовлення підтверджено та чекає відправлення продавцем за номером накладної\n__TRACKING_NUM__',
  // failsToShip: 'TODO',
  orderShipped: 'Замовлення за номером накладної __TRACKING_NUM__\n було відправлено!',
  orderDelivered:
    'Замовлення за номером накладної __TRACKING_NUM__\n доставлено на відділення нової пошти та чекає покупця',
  orderCompleted: 'Замовлення за номером накладної __TRACKING_NUM__\n отримано',
  // failedToCollect:
  //   'TODO - The package with tracking number: __TRACKING_NUM__\n was not collected on time',
  refusedItem: 'Замовлення за номером накладної __TRACKING_NUM__\n було скасовано покупцем на відділенні нової пошти',

  // emails
  openApp: 'Відкрийте мобільний додаток щоб продовжити',
  // please open the Mobile app to continue
};

// export const i18n = {
//   orderPaidForBuyer: 'Your order has been placed. The seller should confirm shortly',
//   orderPaidForSeller: 'Congrats! 🎉 You have a new purchase request! Please confirm', // 60 chars
//   orderPaidReminder: 'You still have an order that needs to be confirmed', // 50 chars
//   orderCancelled: 'Your order has been cancelled. Your money will be returned', // 33 chars
//   orderNotConfirmedToBuyer:
//     "We're sorry, the seller didn't confirm the order one time.", // 58 chars
//   orderNotConfirmedToSeller:
//     "You didn't confirm the order on time. This will appear in your profile reviews", // 78 chars

// system messages
//   orderConfirmed:
//     "Awesome! Here's the tracking number: __TRACKING_NUM__\n The item can now be shipped from Nova Poshta",
//   failsToShip: 'TODO',
//   orderShipped:
//     'The package with tracking number: __TRACKING_NUM__\n has shipped 🎉',
//   orderDelivered:
//     'The package with tracking number: __TRACKING_NUM__\n has been delivered and is ready to be picked up',
//   orderCompleted:
//     'The package with tracking number: __TRACKING_NUM__\n has been collected',
//   refusedItem:
//     'The package with tracking number: __TRACKING_NUM__\n was refused by the buyer',
// };

// i.e. if priceOfItem > 1000
const PRICE_THRESHOLD = 1000;
const ONOVA_PERC_UNTIL_1000 = 0.085; // 8.5% (up to and including 1000)
const ONOVA_PERC_FROM_1000 = 0.035; // 3.5%
const UAPAY_PERC = 0.015; // 1.5 %
const UAPAY_EXTRA = 10; // UAH

/**
 * @private
 *
 * Load a order and append to req.
 */
function load(req: express$Request, res: express$Response, next: express$NextFunction, id: string) {
  // use static method from OrderSchema
  // flow-disable-next-line
  Order.get(id)
    .then((order: OrderDoc) => {
      req.order = order;
      return next();
    })
    .catch(e => next(e));
}

/**
 * Get order
 *
 * GET /api/orders/:orderId
 *
 * @property {*} req - Express request
 * @property {*} req.params - Express session parameters
 * @property {string} req.params.id - The id of the order.
 */
async function get(req: express$Request, res: express$Response) {
  return res.json({ data: req.order });
}

/**
 * Create new order
 *
 * POST /api/orders
 *
 * @property {*} req - Express request
 * @property {*} req.body - Express body parameters
 * @property {bson$ObjectId} req.body.product - uuid
 */
function create(req: express$Request, res: express$Response, next: express$NextFunction) {
  let buyerType = 'User';
  if (req.user.type && req.user.type == 'web') buyerType = 'UserWeb';
  const isWebBuyer = buyerType === 'UserWeb';

  if (!isWebBuyer && req.user.accountStatus !== 'verified') {
    throw new APIError('Please verify your account before buying a product.', httpStatus.BAD_REQUEST);
  }

  Product.findOne({ uuid: req.body.product })
    .populate('seller')
    .then(async (product: ProductDoc) => {
      if (!product) {
        throw new APIError('Product not found', 404);
      }

      if (req.user._id.toString() === product.seller._id.toString()) {
        throw new APIError('You cannot buy your own items', httpStatus.BAD_REQUEST);
      }

      const order = await Order.findOne({
        buyer: req.user._id,
        product: product._id,
      });
      // FIXME: extend APIError to be able to send extra data
      if (order) {
        if (order.status === 'paid' && order.transactionStatus === 'ua-finished') {
          throw new APIError(
            "This product has been paid and it's waiting for seller's confirmation",
            httpStatus.BAD_REQUEST
          );
        }
        const { onovaFee, transactionFee } = calculateFees(product.price);
        order.datePending = new Date();
        order.status = 'pending';
        order.priceOfItem = product.price;
        order.onovaFee = onovaFee;
        order.transactionFee = transactionFee;
        await order.save();

        await addProductToCheckout(product._id._id, order._id);
        throw { message: 'Duplicate order', order };
      }

      const seller = await User.findById(product.seller._id);

      if (!sellerCanTransact(seller)) throw new Error('Seller is missing payment or shipping info');

      const blocking = await Block.countDocuments({
        $or: [{ targetUser: req.user._id }, { sourceUser: req.user._id }],
      });

      if (product.status !== 'forsale' || product.quantity < 1 || blocking > 0) {
        throw new APIError('This product is not longer for sale or is reserved.', httpStatus.BAD_REQUEST);
      }
      return product;
    })
    .then(async product => {
      const { onovaFee, transactionFee } = calculateFees(product.price);

      const order = new Order({
        buyer: req.user._id,
        buyerType,
        currency: product.currency, // 'UAH' by default
        // datePending // Date.now by default
        onovaFee, // paid by the seller
        priceOfItem: product.price,
        product: product._id,
        seller: product.seller._id,
        transactionFee, // paid by the seller
        // weight, // TODO: add weight
        // status // 'pending' by default
      });

      await addProductToCheckout(product._id, order._id);
      return order.save();
    })
    .then(savedOrder => res.status(httpStatus.CREATED).json({ data: savedOrder }))
    .catch(e => {
      if (e.message === 'Duplicate order') {
        return res.status(httpStatus.BAD_REQUEST).json({ message: e.message, data: e.order });
      }
      next(e);
    });
}

function calculateFees(productPrice) {
  let onovaFee;

  if (productPrice > PRICE_THRESHOLD) {
    onovaFee = productPrice * ONOVA_PERC_FROM_1000;
  } else {
    onovaFee = productPrice * ONOVA_PERC_UNTIL_1000;
  }

  const transactionFee = productPrice * UAPAY_PERC + UAPAY_EXTRA;

  return { onovaFee, transactionFee };
}

/**
 * Update an order's status and/or paymentMethod
 *
 * PUT /api/orders/:orderId
 *
 * @property {*} req - Express request
 * @property {*} req.query - Express query parameters
 * @property {MongoId} req.query.orderId
 * @property {string} req.query.status
 * @property {string=} req.query.paymentMethod
 */
async function update(req: session$Request, res: express$Response, next: express$NextFunction) {
  const { archive, reason, status: newStatus } = req.body;

  const iAmTheSeller = req.user._id.toString() == req.order.seller._id.toString();

  const foundOrder = req.order;

  try {
    // can go only from either 'paid' or 'pending' -> 'cancelled'
    if (['paid', 'pending'].indexOf(foundOrder.status) < 0 && newStatus === 'cancelled') {
      throw new APIError('cannot cancel an order that has been shipped or completed', httpStatus.BAD_REQUEST);
    }

    if (foundOrder.status === 'cancelled' && newStatus !== 'cancelled') {
      throw new APIError('cannot change the status of an order once is cancelled', httpStatus.BAD_REQUEST);
    }

    // TODO: do with Joi in order.validation.js
    if (newStatus && archive) {
      throw new APIError('cannot change the status and archive at the same time', httpStatus.BAD_REQUEST);
    }

    if (archive) {
      if (iAmTheSeller) {
        foundOrder.archivedBySeller = true;
      } else {
        foundOrder.archivedByBuyer = true;
      }
    }

    // // can go only from either 'paid' or 'shipped' -> 'completed'
    // if (foundOrder.status === 'pending' && newStatus === 'completed') {
    //   throw new APIError('cannot complete an order that is pending', httpStatus.BAD_REQUEST);
    // }

    if (newStatus === 'confirmed') {
      if (foundOrder.status !== 'paid') {
        throw new APIError('cannot confirm an order that is not paid', httpStatus.BAD_REQUEST);
      }
      // only the seller can confirm the order
      if (!iAmTheSeller) {
        throw new APIError('Unauthorized', httpStatus.UNAUTHORIZED);
      }

      try {
        await axios.post(`/deals/${foundOrder.transactionId}/confirmations`, null, axiosConfig);
      } catch (error) {
        if (error.response && error.response.data) console.error(error.response.data);
        else console.error(error);
        const err = new APIError('Error with payment provider', httpStatus.INTERNAL_SERVER_ERROR);
        return next(err);
      }

      // checks status of deal and saves tracking number (shippingStatus = NP.generated)
      await checkPaymentStatusAndUpdateOrder(foundOrder);

      // Schedule a msg with tracking number to notify both parties via chat (orderConfirmed)

      // development
      // foundOrder.shippingStatus = NP.generated;

      foundOrder.status = 'confirmed';
      foundOrder.dateConfirmed = new Date();

      setTimeout(
        () => {
          // FIXME: do not delay scheduling the initial system message.
          // part of the first message, should include the chat room creating with (buyer, seller and onovabot)
          // this should be done synchronously
          sendSystemMessage(foundOrder);
        },
        config.env === 'test' ? 0 : 5000
      );
      await Product.updateOne({ _id: foundOrder.product }, { status: 'sold' });
    }
  } catch (err) {
    return next(err);
  }

  if (newStatus === 'cancelled') {
    // the seller is required to enter a reason
    if (!reason && iAmTheSeller) {
      const err = new APIError('"reason" is required', httpStatus.BAD_REQUEST);
      return next(err);
    }
    if (!iAmTheSeller && foundOrder.status === 'paid') {
      // buyer cannot cancel a paid order
      const err = new APIError('cannot cancel a paid order', httpStatus.BAD_REQUEST);
      return next(err);
    }
    foundOrder.reason = reason;

    if (foundOrder.transactionId && (foundOrder.status === 'paid' || foundOrder.transactionStatus == 'ua-pending')) {
      try {
        await rejectPayment(foundOrder);
      } catch (error) {
        console.error(error);
        const err = new APIError('Error with payment provider', httpStatus.INTERNAL_SERVER_ERROR);
        return next(err);
      }
    }

    foundOrder.dateCancelled = new Date();
    await removeProductFromCheckout(foundOrder.product._id, foundOrder._id);
  }

  foundOrder.status = newStatus ? newStatus : foundOrder.status;
  foundOrder.paymentMethod = req.body.paymentMethod ? req.body.paymentMethod : foundOrder.paymentMethod;

  if (newStatus) {
    await createOrderNotification(foundOrder, iAmTheSeller);
    debug('notification(s) created for order:', newStatus);
  }

  return foundOrder.save().then(order => {
    return res.json({
      data: {
        ...order.toJSON(),
        reviewedByBuyer: req.reviewedByBuyer,
        reviewedBySeller: req.reviewedBySeller,
      },
    });
  });
}

/**
 * Get list of my orders.
 *
 * GET /api/orders
 *
 * @property {*} req - Express request
 * @property {*} req.query - Express query parameters
 * @property {number} req.query.skip Number of orders to be skipped.
 * @property {number} req.query.limit Limit number of orders to be returned.
 */
function list(req: session$Request, res: express$Response, next: express$NextFunction) {
  const { limit = 50, skip = 0 } = req.query;
  // use static method from orderSchema
  // flow-disable-next-line
  Order.list({ myid: req.user._id, limit, skip })
    .then(orders => res.json({ data: orders }))
    .catch(e => next(e));
}

/**
 * Start payment via UAPAY
 *
 * POST /api/orders/:orderId/pay
 *
 * @property {*} req.query - Express query parameters
 * @property {MongoId} req.query.orderId
 * @property {*} req.body - Express body parameters
 * @property {string} req.body.cvc - The CVC of the payer (buyer) payment card
 */
async function pay(req: express$Request, res: express$Response, next: express$NextFunction) {
  const { body, order } = req;

  try {
    if (isNaN(parseInt(body.cvc))) throw new APIError('Invalid CVC', httpStatus.BAD_REQUEST);

    if (order.status !== 'pending')
      throw new APIError(`Cannot pay an order that\'s ${order.status}`, httpStatus.BAD_REQUEST);

    const product: ProductDoc = await Product.findOne({ _id: order.product });

    if (!product) throw new APIError('Product not found.', httpStatus.NOT_FOUND);

    // confirmation info
    const payment = await createPaymentUAPAY(order, product, body.cvc, req.ip);

    const shippingFee = await getShippingCost(
      product.weight,
      product.price.toString(),
      order.seller.shippingAddress,
      order.buyer.shippingAddress
    );

    // TODO: check transaction hasn't already started
    order.transactionStatus = 'ua-pending';
    order.shippingFee = shippingFee;
    await order.save();

    res.status(httpStatus.CREATED).json({ data: { order, payment } });
  } catch (err) {
    if (err.response && err.response.data) {
      const { response } = err;
      console.error(JSON.stringify(response.data));
      const errorJSON = {
        config: err.config,
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        },
      };
      console.error(errorJSON);
      if (config.env === 'production') Sentry.captureException(errorJSON);
    }

    if (!(err instanceof APIError)) {
      if (config.env === 'production') Sentry.captureException(err);
      console.error(err);
      err = new APIError('Error creating payment', httpStatus.INTERNAL_SERVER_ERROR);
    }
    next(err);
  }
}

function createPaymentUAPAY(order: OrderDoc, product: ProductDoc, cvc: string, remoteIP: string): Promise<any> {
  return new Promise(async (resolve, reject) => {
    try {
      let buyer;
      if (order.buyer.constructor.modelName === 'UserWeb') {
        buyer = await UserWeb.findById(order.buyer);
      } else {
        buyer = await User.findById(order.buyer);
      }
      const seller = await User.findById(order.seller);

      if (!sellerCanTransact(seller)) throw new Error('Seller is missing payment or shipping info');

      if (!buyerCanTransact(buyer)) throw new Error('Buyer is missing payment or shipping info');

      const { shippingAddress: Bship } = buyer;
      const { shippingAddress: Sship } = seller;

      // TODO: if existing order, get deal instead of creating a new one
      // externalId: order._id,
      // Step 1 - Create cart
      const {
        data: { data: cart },
      } = await axios.post('/carts', null, axiosConfig); // no data necessary

      // Step 2 - Create Deal
      const {
        data: { data: deal },
      } = await axios.post(
        '/deals',
        {
          cartId: cart.id,
          // TODO: if existing order, get deal instead of creating a new one
          // externalId: order._id,
          productTitle: product.description.slice(0, 20),
          productWeight: product.weight,
          productPrice: product.price.toString().replace('.', ''), // to number in cents
          sellerFirstName: Sship.firstName,
          sellerLastName: Sship.lastName,
          sellerPatronymic: '', // Sship.fathersName
          sellerPhone: '38' + seller.mobileNumber, // needs to start with 380 e,g. 380 97 741 4301 (no spaces)
          sellerEmail: seller.emailAddress,
          buyerFirstName: Bship.firstName,
          buyerLastName: Bship.lastName,
          buyerPatronymic: '', // Bship.fathersName
          buyerPhone: '38' + buyer.mobileNumber,
          buyerEmail: buyer.emailAddress,
          lg: 'uk',
          payment: {
            type: 'P2P_ONOVA',
            cardToId: seller.paymentInfo.short.card_token || seller.paymentInfo.full.card_token,
          },
          handler: {
            type: 'NovaPoshta',
            senderFirstName: Sship.firstName,
            senderLastName: Sship.lastName,
            senderPatronymic: '',
            senderPhone: '38' + seller.mobileNumber,
            senderEmail: seller.emailAddress,
            senderCityId: Sship.city,
            senderOfficeId: Sship.departmentNovaposhta,
            recipientFirstName: Bship.firstName,
            recipientLastName: Bship.lastName,
            recipientPatronymic: '', // Bship.fathersName
            recipientPhone: '38' + buyer.mobileNumber,
            recipientEmail: buyer.emailAddress,
            recipientCityId: Bship.city,
            recipientOfficeId: Bship.departmentNovaposhta,
          },
        },
        axiosConfig
      );

      order.transactionId = deal.id;
      await order.save();

      // Step 3 - Start payment
      await axios.post(
        `/deals/${deal.id}/payments`,
        {
          remoteIP,
          card: {
            id: buyer.paymentInfo.full.card_token,
            securityCode: cvc,
          },
        },
        axiosConfig
      );
      //TODO: confirm /payments returns waitingFor: 'PAY_PROCESSING'

      // Step 4 - Get deal info to send form details to client
      let retryNum = 0;
      let newDeal;
      do {
        retryNum++;
        const body = await axios.get(`/deals/${deal.id}`, axiosConfig);
        newDeal = body.data.data;
        // console.log(deal.id, newDeal.productPayment.waitingFor);
        await sleep(500);
      } while (newDeal.productPayment.waitingFor !== 'CONFIRMATION' && retryNum < (config.env === 'test' ? 1 : 15));

      const { productPayment: paym } = newDeal;

      // TODO: test with demo UAPAY API
      if (config.env === 'DISABLED') {
        // validate deal
        if (newDeal.productWeight !== product.weight) {
          throw new Error('Error with productWeight');
        }
        if (newDeal.productPrice.toString() !== product.price.toString().replace('.', '')) {
          throw new Error('Error with productPrice');
        }
      }

      // console.log(newDeal);
      // TODO: check commissionAmount is equal to agreed
      if (
        // paym.amount == product.product.toString().replace('.', '') &&
        paym.type === 'P2P_ONOVA' &&
        paym.statusCode === 'NEEDS_CONFIRMATION' &&
        paym.details.confirmation.type === '3DS'
      ) {
        const { confirmation } = paym.details;
        resolve({
          redirectUrl: confirmation.redirectUrl,
          PaReq: confirmation.form.PaReq,
          url: confirmation.url,
        });
      } else if (paym.statusCode === 'REJECTED') {
        if (config.env === 'production') {
          console.log('---');
          console.log('GENERIC-PAYMENT-ERROR');
          console.log('product uuid:', product.uuid);
          console.log('order id:', order._id);
          console.log('seller username:', seller.username);
          console.log('buyer username:', buyer.username);
          console.log(newDeal);
          console.log('---');
        }

        const statusText = JSON.parse(paym.statusText);
        let errorMsg = 'Payment error';
        if (statusText && statusText.message) {
          errorMsg = statusText.message;
        }

        // TODO: 074 = Invalid confirmation code or details of your card.
        throw new APIError(errorMsg, httpStatus.INTERNAL_SERVER_ERROR);
      } else {
        throw new Error(JSON.stringify(newDeal));
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get payment from UAPAY. Used after client makes payment with UAPAY
 *
 * GET /api/orders/:orderId/paymentStatus
 *
 * @property {*} req.query - Express query parameters
 * @property {MongoId} req.query.orderId
 */
async function paymentStatus(req: express$Request, res: express$Response, next: express$NextFunction) {
  const { order } = req;

  try {
    if (!order.transactionId) {
      return res.json({
        data: {
          rawStatus: 'none',
          status: 'none',
        },
      });
    }

    const data = await checkPaymentStatusAndUpdateOrder(order);

    // if (data.productPayment.type === 'P2P_ONOVA')

    await order.save();
    res.json({
      data: {
        rawStatus: data.productPayment.statusCode,
        status: order.transactionStatus,
      },
    });
  } catch (error) {
    // order.save();
    if (!(error instanceof APIError)) {
      console.error(error);
      error = new APIError('Error getting payment status', httpStatus.INTERNAL_SERVER_ERROR);
    }
    next(error);
  }
}

/**
 * Used for /api/orders/:orderId/paymentStatus and internally when changing the state of an order (cancelling, confirming, etc.)
 */
export async function checkPaymentStatusAndUpdateOrder(order: OrderDoc) {
  // TODO: keep audit log
  return new Promise(async (resolve, reject) => {
    try {
      const {
        data: { data },
      } = await axios.get(`/deals/${order.transactionId}`, axiosConfig);

      const { handler } = data;

      switch (data.productPayment.status) {
        // payment not yet created
        case 'NEW':
          order.transactionStatus = 'ua-pending';
          // The buyer needs to confirmation the transaction entering the 3DS code (LOOKUP works?)
          if (data.productPayment.statusCode === 'NEEDS_CONFIRMATION') order.transactionStatus = 'ua-needsconfirmation';
          break;
        case 'PAID':
          if (data.status === 'CONFIRMED') {
            order.cityRecipient = await getCityName(handler.recipientCityId);
            order.citySender = await getCityName(handler.senderCityId);
            order.trackingNumber = handler.waybillNumber;
            order.shippingProvider = 'novaposhta';

            // the 'dateConfirmed' and 'status' are updated in the setTimeout() by newStatus
            // when seller send API request - update()
            // Also, the order notification is done there
          }
          // check needed because payment status is still PAID if deal has been confirmed
          else if (data.status === 'PAID') {
            order.transactionStatus = 'ua-finished';
            order.status = 'paid';
            order.shippingStatus = NP.generated;
            order.shippingUpdatedAt = new Date();
            // only update first time we check
            if (!order.datePaid) order.datePaid = new Date();
            await createOrderNotification(order);
            debug('notification(s) created for order:', 'paid');
          }
          break;
        // The bank has not been able to make debit for technical reasons
        case 'REJECTED':
          console.log('payment rejected:');
          console.log(data);
          console.log(order);

          const statusText = JSON.parse(data.productPayment.statusText);
          let errorMsg = 'Payment error';
          if (statusText && statusText.message) {
            errorMsg = statusText.message;
          }

          order.transactionStatus = 'ua-rejected';
          throw new APIError(errorMsg, httpStatus.INTERNAL_SERVER_ERROR);
          // TODO: 074 = Invalid confirmation code or details of your card.
          break;

        // The payment was returned to the sender's card
        case 'REVERSED':
          order.transactionStatus = 'ua-reversed';
          order.status = 'cancelled';
          if (!order.dateCancelled) order.dateCancelled = new Date();
          break;

        default:
          break;
      }

      resolve(data);
    } catch (error) {
      if (error.response && error.response.data) console.error(error.response.data);
      reject(error);
    }
  });
}

export function rejectPayment(order: OrderDoc): Promise<any> {
  return Promise.all([
    Order.updateOne({ _id: order.id }, { transactionStatus: 'ua-reversed' }),
    axios.post(
      `/deals/${order.transactionId}/rejections`,
      {
        reasonBy: 'SELLER',
      },
      axiosConfig
    ),
  ]);
}

/**
 * Creates the approprate notification(s) for each order status transition
 *
 * See graph in `ORDER_PROCESS.md`
 */
export async function createOrderNotification(order: OrderDoc, iAmTheSeller?: boolean) {
  let notif: NotifPayload = {
    data: order,
    sourceUserType: order.buyerType,
    triggeredBy: order._id,
    triggeredType: 'Order',
  };
  const isBuyerFromTheWeb = order.buyerType === 'UserWeb';
  switch (order.status) {
    // to seller and buyer
    case 'paid':
      // check if notification already exists
      const notifExists = await Notification.findOne({
        triggeredBy: order._id,
        targetUser: order.seller._id,
        sourceUser: order.buyer._id,
        'data.status': 'paid',
      });
      if (notifExists) return Promise.resolve();
      // seller needs to confirm order after receiving a notification and opening the 'confirmOrder' screen on mobile app
      const Promises = [];
      const notifForSeller = {
        ...notif,
        notifI18n: i18n.orderPaidForSeller,
        targetUser: order.seller._id,
        sourceUser: order.buyer._id,
        actionMsg: i18n.openApp,
      };
      Promises.push(notifCtrl.createNotification(notifForSeller));
      if (isBuyerFromTheWeb) {
        const notifForBuyerFromTheWeb = {
          ...notif,
          notifI18n: i18n.orderPaidForBuyer,
          targetUser: order.buyer._id,
          sourceUser: order.seller._id,
          onlyEmail: true,
        };
        Promises.push(notifCtrl.createNotification(notifForBuyerFromTheWeb));
      }
      return Promise.all(Promises);
      break;

    // to buyer
    case 'confirmed':
      // seller can ship item. we send a system message + email to buyer
      notif = {
        ...notif,
        notifI18n: i18n.orderConfirmed,
        sourceUser: order.seller._id,
        targetUser: order.buyer._id,
      };
      break;

    // to buyer
    case 'shipped':
      notif = {
        ...notif,
        notifI18n: i18n.orderShipped,
        targetUser: order.buyer._id,
        sourceUser: order.seller._id,
      };
      break;

    // to buyer
    case 'cancelled':
      if (!iAmTheSeller) return Promise.resolve();
      // cancelled by seller. there is no notification if the buyer cancels
      notif = {
        ...notif,
        notifI18n: i18n.orderCancelled,
        targetUser: order.buyer._id,
        sourceUser: order.seller._id,
        actionMsg: `Причина скасування замовлення продавцем ${order.seller.username}: ${order.reason}`,
      };
      break;

    // to buyer or seller
    case 'failed_by_seller':
      if (iAmTheSeller) {
        notif = {
          ...notif,
          notifI18n: i18n.orderNotConfirmedToSeller,
          targetUser: order.buyer._id,
          sourceUser: order.seller._id,
        };
      } else {
        // to buyer
        notif = {
          ...notif,
          notifI18n: i18n.orderNotConfirmedToBuyer,
          targetUser: order.seller._id,
          sourceUser: order.buyer._id,
        };
      }
      break;
  }

  // only try to send an order email update to a buyer UserWeb
  if (isBuyerFromTheWeb && notif.targetUser == order.buyer._id) {
    notif = { ...notif, onlyEmail: true };
  }

  return notifCtrl.createNotification(notif);
}

async function getCityName(name): Promise<any> {
  try {
    const city = await Cities.findOne({ id: name });
    return city.uk;
  } catch (error) {
    console.error(error);
  }
}

function addProductToCheckout(productId, orderId) {
  return Product.updateOne(
    { _id: productId },
    {
      $inc: { quantity: -1 },
      $push: {
        carted: { quantity: 1, orderId, timestamp: new Date() },
      },
    }
    // ,{ session }
  );
}

function removeProductFromCheckout(productId: string, orderId: string) {
  // TODO: if seller doesn't want to sell an item the quantity should not increase
  return Product.updateOne({ _id: productId }, { $inc: { quantity: 1 }, $pull: { carted: { orderId } } });
}

const sleep = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export default {
  load,
  get,
  create,
  update,
  list,
  pay,
  paymentStatus,
};
