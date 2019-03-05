//@flow

import { Order, OrderDoc } from '../models';
import Shipping, { NP } from '../helpers/shipping';
import JobManager from '../helpers/job';

import config from '../config/config';

import { agenda } from '../config/express';

const checkShippingStatusEveryXMinutes = parseInt(
  config.settings.checkShippingStatusEvery.split(' ')[0]
);

const debug = require('debug')('server-data:escrow');
// const debug = console.log;

const { JOBNAMES } = config;
const { RECURRING } = JOBNAMES;

export default class ShippingRunner {
  constructor() {
    this.initStatusStarterJob();
    this.initStatusCheckerJobs();
  }

  initStatusStarterJob() {
    this.defineStatusStarterJob();

    agenda.on('ready', () => {
      agenda.cancel(
        { name: RECURRING.SHIPPING_STATUS_STARTER },
        (err, numRemoved) => {
          if (err) return console.error(err);
          debug('shipping-status-starter cleaned up jobs:', numRemoved);
          agenda.start();
          this.createStatusStarterJob();
        }
      );
    });
  }

  initStatusCheckerJobs() {
    this.defineStatusCheckerJobs();

    agenda.on('ready', () => {
      agenda.cancel(
        { name: JOBNAMES.SHIPPING_STATUS_CHECKER },
        (err, numRemoved) => {
          if (err) return console.error(err);
          debug('shipping-status-checker cleaned up jobs:', numRemoved);
          agenda.start();
        }
      );
    });
  }

  createStatusStarterJob() {
    const job = agenda.create(RECURRING.SHIPPING_STATUS_STARTER);
    job.unique({ jobName: RECURRING.SHIPPING_STATUS_STARTER });
    job.repeatEvery(
      config.env === 'test'
        ? '3 seconds'
        : config.settings.checkShippingStatusEvery
    );
    job.save();
  }

  createStatusCheckerJob(orderId: string) {
    return new Promise((resolve, reject) => {
      const job = agenda.create(JOBNAMES.SHIPPING_STATUS_CHECKER, { orderId });
      // job.unique({ jobName: JOBNAMES.SHIPPING_STATUS_CHECKER, orderId });
      job.save(err => {
        if (err) {
          const error = new Error(`Job failed with error: ${err}`);
          return reject(error);
        }
        debug(JOBNAMES.SHIPPING_STATUS_CHECKER, 'Job successfully saved');
        resolve();
      });
    });
  }

  /**
   * checks if there are order shipping statuses that need to be updated
   */
  defineStatusStarterJob() {
    agenda.define(RECURRING.SHIPPING_STATUS_STARTER, async (job, done) => {
      debug('shipping-status-starter job running at', new Date());

      const previousDate = new Date(
        Date.now() -
          (config.env === 'test'
            ? 1 * 1000
            : checkShippingStatusEveryXMinutes * 60 * 1000)
      );

      const orders: Array<OrderDoc> = await Order.find({
        status: { $in: ['confirmed', 'shipped'] },
        // shippingStatus: { $in: [NP.generated, NP.shipped] },
        shippingUpdatedAt: { $lte: previousDate },
      });
      debug('found', orders.length, 'orders');
      if (!orders.length) return done();

      const Promises = orders.map(order =>
        this.createStatusCheckerJob(order.id)
      );

      try {
        await Promise.all(Promises);
        done();
      } catch (error) {
        console.log(RECURRING.SHIPPING_STATUS_STARTER);
        console.error(error);
        done(error);
      }
    });
  }

  defineStatusCheckerJobs() {
    // define job for checking shipping status that needs to be updated and send system message
    agenda.define(JOBNAMES.SHIPPING_STATUS_CHECKER, async (job, done) => {
      const { orderId } = job.attrs.data;

      debug(
        'shipping-status-checker job running at',
        new Date(),
        'for orderId:',
        orderId
      );

      try {
        const order: OrderDoc = await Order.findById(orderId);

        if (!order) {
          throw new Error('Error getting order for checking shipping status');
        }

        const { status } = await Shipping.getShippingStatus(
          order.trackingNumber
        );

        if (order.shippingStatus == status) {
          debug('already updated with this shippingStatus', status);
          return done();
        }

        switch (status) {
          case NP.shipped:
            order.status = 'shipped';
            order.dateShipped = new Date();
            break;
          case NP.delivered:
            order.status = 'delivered';
            order.dateDelivered = new Date();
            break;
          case NP.collected:
            order.status = 'completed';
            order.dateCompleted = new Date();
            break;
          case NP.refused:
            // TODO: distinguish between "Buyer fails to collect" and "Buyer refuses the item (not as described)"
            order.status = 'failed_by_buyer';
            order.dateFailed = new Date();
            break;

          default:
            break;
        }

        // TODO: 'failed_by_seller' - did not ship on time - no status associated from Nova Poshta?

        order.shippingStatus = status;
        order.shippingUpdatedAt = new Date();
        await order.save();

        // send system message for the various shippingStatus
        await JobManager.sendSystemMessage(order);
        done();
      } catch (error) {
        console.log(JOBNAMES.SHIPPING_STATUS_CHECKER);
        console.error(error);
        done(error);
      }
    });
  }
}
