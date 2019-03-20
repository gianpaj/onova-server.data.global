// @flow

import httpStatus from 'http-status';
const debug = require('debug')('server-data:index');

import { sendPush } from '../helpers/push';
import APIError from '../helpers/APIError';
import config from '../config/config';
import { UserDoc, Notification, NotificationDoc } from '../models';
import mailController from './mail.controller';

declare class session$Request extends express$Request {
  user: UserDoc;
}

export type NotifPayload = {
  data: {
    commentId: ?string,
    productUuid: ?string,
    senderName: ?string,
    text: ?string,
  },
  notifI18n: string,
  targetUser: string,
  sourceUser: string,
  triggeredBy: string,
  triggeredType: string,
  onlyPush: ?boolean,
  message: ?string,
};

/**
 * Get user's notifications
 *
 * GET /api/users/notifications
 *
 * @property {*} req - express session
 * @property {*} req.query - Express query parameters
 * @property {MongoId} req.query.lastId
 * @property {number} req.query.limit Limit number of notifications to be returned
 */
async function get(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { limit = 50, lastId } = req.query;
  let DBquery = { targetUser: req.user._id };

  try {
    // for pagination - results are excluding the lastId`
    if (lastId) {
      DBquery = { ...DBquery, _id: { $lt: lastId } };

      const notif = await Notification.findById(lastId);
      if (!notif) {
        throw new APIError('Notification not found.', httpStatus.NOT_FOUND);
      }
    }
    const data = await Notification.find(DBquery)
      .populate('triggeredBy sourceUser')
      .sort({ _id: -1 }) // faster than createdAt: -1 - same ordering
      .limit(+limit);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new notification for user's notification screen and optionally schedule a push notification
 *
 * @property {NotifPayload} notif
 * @property {any} notif.data
 * @property {string} notif.notifI18n
 * @property {MongoId} notif.targetUser
 * @property {MongoId} notif.triggeredBy
 * @property {string} notif.triggeredType User|Product|Order
 * @property {boolean} notif.onlyPush (default false)
 */
function createNotification(notif: NotifPayload): Promise<null> {
  const {
    data,
    notifI18n,
    targetUser,
    triggeredBy,
    sourceUser,
    sourceUserType,
    triggeredType,
    onlyPush,
    onlyEmail,
    actionMsg,
  } = notif;

  const notification = {
    data,
    targetUser,
    triggeredBy,
    triggeredType,
  };

  return new Promise(async (resolve, reject) => {
    // New follower
    if (triggeredType == 'User') {
      sendPush({ ...notification, notifI18n })
        .then(() => {
          debug(config.JOBNAMES.PUSH_FOLLOW, 'Job successfully saved');
          resolve();
        })
        .catch(err => {
          console.error(err);
          reject(err);
        });

      if (!onlyPush) {
        Notification.create({
          ...notification,
          notifI18n,
          sourceUser,
        })
          .then(() => resolve())
          .catch(e => reject(e));
      }
    } else if (triggeredType == 'Product') {
      // New comment notification to seller
      sendPush({ ...notification, message: shorten(data.text, 40) })
        .then(() => {
          debug(config.JOBNAMES.PUSH_COMMENT, 'Job successfully saved');
          resolve();
        })
        .catch(err => {
          console.error(err);
          reject(err);
        });

      if (!onlyPush) {
        Notification.create({
          ...notification,
          notifI18n,
          sourceUser,
        })
          .then(() => resolve())
          .catch(e => reject(e));
      }
    } else if (triggeredType == 'Order') {
      // Order update, created, cancelled, confirmation-reminder etc.
      try {
        if (!onlyEmail) {
          await sendPush({ ...notification, message: notifI18n });
          debug(config.JOBNAMES.PUSH_ORDER, 'Job successfully saved');
          await Notification.create({
            ...notification,
            notifI18n,
            sourceUser,
            sourceUserType,
          });
        }
        await mailController.sendOrderUpdate({
          notifI18n,
          targetUser,
          data,
          actionMsg,
        });
        resolve();
      } catch (err) {
        console.error(err);
        reject(err);
      }
    }
  });
}

/**
 * Delete a notification. For example, when a comment is deleted
 *
 * @property {string} type The type of notification (Comment, )
 * @property {string} id
 */
function removeNotification(type: string, id: string): Promise<null> {
  return new Promise((resolve, reject) => {
    if (type == 'Comment') {
      Notification.findOneAndRemove({ 'data.commentId': id })
        .then((notif: NotificationDoc) => {
          if (!notif) {
            const err = new Error('Notification not found');
            return reject(err);
          }
          resolve();

          // if (req.user._id.toString() !== notif.targetUser.toString()) {
          //   const err = new Error('Cannot delete other people`s notification');
          //   return reject(err);
          // }
        })
        .catch(e => reject(e));
    }
  });
}

/**
 * Shorten string and add elipses character (…) if it's longer
 */
function shorten(str: string, maxLength: number): string {
  if (str.length < maxLength) {
    return str;
  }
  let trimmedString = str.substr(0, maxLength);
  trimmedString = trimmedString.substr(
    0,
    Math.min(trimmedString.length, trimmedString.lastIndexOf(' '))
  );
  return `${trimmedString}\…`;
}

export default {
  get,
  createNotification,
  removeNotification,
};
