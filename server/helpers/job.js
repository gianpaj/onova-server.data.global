// @flow
const debug = require('debug')('server-data:index');

import { agenda } from '../config/express';
import config from '../config/config';
import { OrderDoc } from '../models';
import { i18n } from '../controllers/order.controller';
import { NP } from '../helpers/shipping';

export default class JobManager {
  static sendSystemMessage(order: OrderDoc): Promise<any> {
    return new Promise((resolve, reject) => {
      let msg = { order };

      switch (order.shippingStatus) {
        // shipping status is still generated after a deal has been confirmed
        case NP.generated:
          msg = {
            ...msg,
            message: i18n.orderConfirmed.replace(
              '__TRACKING_NUM__',
              order.trackingNumber
            ),
          };
          break;

        case NP.shipped:
          msg = {
            ...msg,
            message: i18n.orderShipped.replace(
              '__TRACKING_NUM__',
              order.trackingNumber
            ),
          };
          break;

        case NP.delivered:
          msg = {
            ...msg,
            message: i18n.orderDelivered.replace(
              '__TRACKING_NUM__',
              order.trackingNumber
            ),
          };
          break;

        case NP.refused:
          msg = {
            ...msg,
            message: i18n.refusedItem.replace(
              '__TRACKING_NUM__',
              order.trackingNumber
            ),
          };
          break;

        case NP.collected:
          msg = {
            ...msg,
            message: i18n.orderCompleted.replace(
              '__TRACKING_NUM__',
              order.trackingNumber
            ),
          };
          break;

        default:
          reject(
            new Error(
              'Invalid shippingStatus for scheduling system message:' +
                order.shippingStatus
            )
          );
          break;
      }

      const job = agenda.create(config.JOBNAMES.SYSTEM_MSG, msg);
      // now _also_ check manually during the individual SHIPPING_STATUS_CHECKER job

      job.unique({
        jobName: config.JOBNAMES.SYSTEM_MSG,
        shippingStatus: order.shippingStatus,
        trackingNumber: order.trackingNumber,
      });

      job.save(err => {
        if (err) {
          const error = new Error(`Job failed with error: ${err}`);
          return reject(error);
        }
        debug(config.JOBNAMES.SYSTEM_MSG, 'Job successfully saved');
        resolve();
      });
    });
  }
}
