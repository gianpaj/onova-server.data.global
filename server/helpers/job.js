// @flow
const debug = require('debug')('server-data:index');

import { agenda } from '../config/express';
import config from '../config/config';
import { OrderDoc } from '../models';
import { i18n } from '../controllers/order.controller';
import { NP } from '../helpers/shipping';

export function getOrderUpdateMessage(shippingStatus, trackingNumber) {
  let message;
  switch (shippingStatus) {
    // shipping status is still generated after a deal has been confirmed
    case NP.generated:
      message = i18n.orderConfirmed;
      break;

    case NP.shipped:
      message = i18n.orderShipped;
      break;

    case NP.delivered:
      message = i18n.orderDelivered;
      break;

    case NP.refused:
      message = i18n.refusedItem;
      break;

    case NP.collected:
      message = i18n.orderCompleted;
      break;

    default:
      return false;
  }
  return message.replace('__TRACKING_NUM__', trackingNumber);
}

export function sendSystemMessage(order: OrderDoc): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!order.trackingNumber) {
      reject(new Error('Invalid trackingNumber for scheduling system message:' + order.shippingStatus));
      return;
    }
    if (!getOrderUpdateMessage(order.shippingStatus, order.trackingNumber)) {
      reject(new Error('Invalid shippingStatus for scheduling system message:' + order.shippingStatus));
      return;
    }

    const msg = {
      order,
      message: getOrderUpdateMessage(order.shippingStatus, order.trackingNumber),
    };

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
