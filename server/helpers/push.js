// @flow
import shortid from 'shortid';
const debug = require('debug')('server-data:index');

import { Block, Order, Product, ProductDoc, User, UserDoc } from '../models';
import type { NotifPayload } from '../controllers/notification.controller';
import { agenda } from '../config/express';
import config from '../config/config';

export async function sendPush({
  data,
  notifI18n,
  targetUser,
  triggeredBy,
  triggeredType,
  message,
}: NotifPayload): Promise<void> {
  let blocking = 0;

  // New follower
  // if (triggeredType == 'User') {

  // if person A is blocking person B neither of them can send each other push notifications
  blocking = await Block.countDocuments({
    $or: [{ sourceUser: targetUser, targetUser: triggeredBy }, { sourceUser: triggeredBy, targetUser: targetUser }],
  });

  // }

  if (blocking > 0) {
    console.log(`${targetUser} cannot receive push from ${triggeredBy}`);
    return Promise.resolve();
  }

  // New follower
  if (triggeredType == 'User') {
    return User.findById(triggeredBy)
      .then(sender => {
        if (!sender) {
          throw new Error('Cannot find sender');
        }

        return User.findById(targetUser).then(target => {
          if (!target) {
            throw new Error('Cannot find target');
          }
          return { sender, target };
        });
      })
      .then(({ sender, target }: { sender: UserDoc, target: UserDoc }) => {
        const pushData = {
          message: notifI18n,
          platform: target.platform,
          pushToken: target.pushToken,
          triggeredBy: sender._id,
          triggeredType,
          senderName: sender.username,
          targetUser: target._id,
          random: shortid(), // for unique push notification
        };

        const job = agenda.create(config.JOBNAMES.PUSH_FOLLOW, pushData);

        return job.save(err => {
          if (err) throw new Error(`Job failed with error: ${err}`);
        });
      })
      .catch(e => {
        console.error(e);
        return e;
      });
    // New comment notification to seller or mention
  } else if (triggeredType == 'Product') {
    return Product.findById(triggeredBy)
      .then(product => {
        if (!product) {
          throw new Error('Cannot find product');
        }

        return User.findById(targetUser).then(target => {
          if (!target) {
            throw new Error('Cannot find target');
          }
          return { product, target };
        });
      })
      .then(({ product, target }: { product: ProductDoc, target: UserDoc }) => {
        const pushData = {
          message,
          platform: target.platform,
          productUuid: data.productUuid,
          pushToken: target.pushToken,
          random: shortid(), // for unique push notification
          senderName: data.senderName,
          targetUser: target._id,
          triggeredBy: product._id,
          triggeredType,
        };

        const job = agenda.create(config.JOBNAMES.PUSH_COMMENT, pushData);

        return job.save(err => {
          if (err) throw new Error(`Job failed with error: ${err}`);
        });
      })
      .catch(e => {
        console.error(e);
        return e;
      });
    // Order paid, cancelled, etc.
  } else if (triggeredType == 'Order') {
    return Order.findById(triggeredBy)
      .then(order => {
        if (!order) throw new Error('Cannot find order');
      })
      .then(async () => {
        const target: UserDoc = await User.findById(targetUser);
        if (!target) throw new Error('Cannot find target');

        const pushData = {
          data,
          message,
          platform: target.platform,
          pushToken: target.pushToken,
          triggeredBy,
          triggeredType,
          targetUser: target._id,
          random: shortid(), // for unique push notification
        };

        const job = agenda.create(config.JOBNAMES.PUSH_ORDER, pushData);

        return job.save(err => {
          if (err) throw new Error(`Job failed with error: ${err}`);
          debug(config.JOBNAMES.PUSH_ORDER, 'Job successfully saved');
        });
      })
      .catch(e => {
        console.error(e);
        return e;
      });
  }
}

/**
 * Interpolate string on variables
 *
 * Example:
 *
 * const template = 'New comment from: ${username}';
 * interpolate(template, { username: 'Jesus' })
 * 'New comment from: Jesus'
 *
 * From: https://stackoverflow.com/a/41118285/728287
 */
function interpolate(tpl: string, args: any) {
  return tpl.replace(/\${(\w+)}/g, (_, v) => args[v]);
}
