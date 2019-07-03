//@flow

import {
  Order,
  OrderDoc,
  Product,
  userPopulateFields,
  productPopulateFields,
} from '../models';
import {
  createOrderNotification,
  rejectPayment,
  i18n,
} from '../controllers/order.controller';
import notifCtrl from '../controllers/notification.controller';

import config from '../config/config';

import { agenda } from '../config/express';

const debug = require('debug')('server-data:escrow');
// const debug = console.log;

const { RECURRING: JOB } = config.JOBNAMES;

export default class EscrowRunner {
  constructor() {
    this.initCheckoutJob();
    this.initCancelPaidOrdersJob();
    this.initRemindToConfirmOrdersJob();
  }

  initCheckoutJob() {
    this.defineCheckoutJob();

    agenda.on('ready', () => {
      agenda.cancel({ name: JOB.CHECKOUT }, (err, numRemoved) => {
        if (err) return console.error(err);
        debug('checkout cleaned up jobs:', numRemoved);
        agenda.start();
        this.createCheckoutJob();
      });
    });
  }

  initCancelPaidOrdersJob() {
    this.defineCancelPaidOrdersJob();

    agenda.on('ready', () => {
      agenda.cancel({ name: JOB.CANCEL_PAID_ORDERS }, (err, numRemoved) => {
        if (err) return console.error(err);
        debug('cancelPaidOrders cleaned up jobs:', numRemoved);
        agenda.start();
        this.createCancelPaidOrdersJob();
      });
    });
  }

  initRemindToConfirmOrdersJob() {
    this.defineRemindToConfirmOrderJob();

    agenda.on('ready', () => {
      agenda.cancel(
        { name: JOB.PUSH_ORDER_CONFIRM_REMINDER },
        (err, numRemoved) => {
          if (err) return console.error(err);
          debug(
            JOB.PUSH_ORDER_CONFIRM_REMINDER,
            'cleaned up jobs:',
            numRemoved
          );
          agenda.start();
          this.createRemindToConfirmOrderJob();
        }
      );
    });
  }

  createCheckoutJob() {
    const job = agenda.create(JOB.CHECKOUT);
    job.unique({ jobName: JOB.CHECKOUT });
    job.repeatEvery(config.env === 'test' ? '3 seconds' : '30 seconds');
    job.save();
  }

  createCancelPaidOrdersJob() {
    const job = agenda.create(JOB.CANCEL_PAID_ORDERS);
    job.unique({ jobName: JOB.CANCEL_PAID_ORDERS });
    job.repeatEvery(config.env === 'test' ? '3 seconds' : '60 minutes');
    job.save();
  }

  createRemindToConfirmOrderJob() {
    const job = agenda.create(JOB.PUSH_ORDER_CONFIRM_REMINDER);
    job.unique({ jobName: JOB.PUSH_ORDER_CONFIRM_REMINDER });
    job.repeatEvery(
      config.env === 'test'
        ? '3 seconds'
        : config.settings.remindToConfirmOrderEvery
    );
    job.save();
  }

  defineCheckoutJob() {
    agenda.define(JOB.CHECKOUT, async (job, done) => {
      debug('checkout job running at', new Date());

      const previousDate = new Date(
        Date.now() -
          (config.env === 'test'
            ? 30 * 1000
            : config.settings.holdProductFor * 1000)
      );
      const query = {
        status: 'pending',
        // this also matches orders without transactionStatus key (pending orders that haven't been paid)
        transactionStatus: { $nin: ['ua-finished', 'ua-rejected'] },
        datePending: { $lte: previousDate },
      };

      try {
        const orders: Array<OrderDoc> = await Order.find(query);
        debug('orders found:', orders.length);
        if (!orders.length) return done();

        const ordersUpdated: Array<OrderDoc> = await Order.updateMany(query, {
          $set: { status: 'cancelled', dateCancelled: new Date() },
        });

        debug('Unpaid orders cancelled:', ordersUpdated.nModified);
        const productsToPutBackForSale = orders
          .map(order => order.product)
          .filter(p => p);
        debug('productsToPutBackForSale:', productsToPutBackForSale);
        const updated = await this.removeProductsFromCheckout(
          productsToPutBackForSale
        );
        debug('Products updated:', updated.nModified);
        done();
      } catch (error) {
        console.error(JOB.CHECKOUT);
        console.error(error);
        done(error);
      }
    });
  }

  // Reject UAPAY transaction of paid orders that seller has not confirmed
  defineCancelPaidOrdersJob() {
    agenda.define(JOB.CANCEL_PAID_ORDERS, async (job, done) => {
      debug('cancel-paid-orders job running at', new Date());

      const previousDate = new Date(
        Date.now() -
          (config.env === 'test'
            ? 30 * 1000
            : config.settings.cancelPaidOrdersAfter * 1000)
      );

      try {
        const query = {
          status: 'paid',
          transactionStatus: 'ua-finished',
          datePaid: { $lte: previousDate },
        };
        const orders: Array<OrderDoc> = await Order.find(query);
        if (!orders.length) return done();

        const paymentsToReject = orders.map(rejectPayment);

        await Promise.all(paymentsToReject);

        debug(paymentsToReject.length, 'payment(s) rejected');

        const ordersUpdated: Array<OrderDoc> = await Order.updateMany(
          { ...query, transactionStatus: 'ua-reversed' },
          {
            $set: { status: 'failed_by_seller', dateFailed: new Date() },
          }
        );

        debug('Paid orders cancelled:', ordersUpdated.nModified);
        const productsToPutBackForSale = orders
          .map(order => order.product)
          .filter(p => p);
        debug('productsToPutBackForSale:', productsToPutBackForSale);
        const updated = await this.removeProductsFromCheckout(
          productsToPutBackForSale
        );
        debug('Products updated:', updated.nModified);

        const updatedOrders: Array<OrderDoc> = await Order.find({
          _id: { $in: orders.map(o => o._id) },
        });

        // notify buyer that order has been cancelled, because the seller didn't confirm
        // notify seller that they did not confirm or canceled the order on time

        // create array of arrays of notification promises and then flatten/merge the arrays
        const notificationPromises = [].concat.apply(
          [],
          updatedOrders.map(order => [
            createOrderNotification(order, true),
            createOrderNotification(order, false),
          ])
        );

        await Promise.all(notificationPromises);

        done();
      } catch (error) {
        console.error(JOB.CANCEL_PAID_ORDERS);
        console.error(error);
        done(error);
      }
    });
  }

  defineRemindToConfirmOrderJob() {
    agenda.define(JOB.PUSH_ORDER_CONFIRM_REMINDER, async (job, done) => {
      debug(JOB.PUSH_ORDER_CONFIRM_REMINDER + ' job running at', new Date());

      const previousDate = new Date(
        Date.now() -
          (config.env === 'test'
            ? 30 * 1000
            : config.settings.cancelPaidOrdersAfter * 1000)
      );

      try {
        const query = {
          status: 'paid',
          transactionStatus: 'ua-finished',
          datePaid: { $gt: previousDate },
        };
        const orders: Array<OrderDoc> = await Order.find(query)
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
          });
        if (!orders.length) return done();

        const notifications = orders.map(order =>
          notifCtrl.createNotification({
            actionMsg: i18n.openApp,
            data: order,
            notifI18n: i18n.orderPaidReminder,
            sourceUser: order.buyer._id,
            sourceUserType: order.buyer.buyerType,
            targetUser: order.seller._id,
            triggeredBy: order._id,
            triggeredType: 'Order',
          })
        );

        await Promise.all(notifications);

        debug(orders.length, 'scheduled remiders(s) to confirm orders');

        done();
      } catch (error) {
        console.error(JOB.PUSH_ORDER_CONFIRM_REMINDER);
        console.error(error);
        done(error);
      }
    });
  }

  removeProductsFromCheckout(products): Promise<any> {
    return Product.updateMany(
      { _id: { $in: products } },
      { status: 'forsale', $unset: { reservedDate: '' } }
    );
  }
}
