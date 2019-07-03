// @flow

import httpStatus from 'http-status';

const debug = require('debug')('server-data:index');
import APIError from '../helpers/APIError';
import { Block, DefaultFollow, User, UserDoc, Follow, FollowDoc } from '../models';
import notifCtrl from '../controllers/notification.controller';
import type { NotifPayload } from '../controllers/notification.controller';

export const i18n = {
  // newFollower: 'started following you',
  newFollower: 'став вашим клієнтом',
};

declare class session$Request extends express$Request {
  user: UserDoc;
}

/**
 * Get follow document to check if the requestor is following :userId
 *
 * GET /api/users/:userId/follow
 *
 * @property {*} req - express session
 * @property {*} req.params - express session parameters
 * @property {MongoId} req.params.userId
 */
function get(req: session$Request, res: express$Response, next: express$NextFunction) {
  const targetUserId = req.params.userId;

  if (req.user._id.toString() === targetUserId.toString()) {
    const APIerr = new APIError('Cannot follow thyself', httpStatus.BAD_REQUEST);
    return next(APIerr);
  }

  Follow.findOne({
    follower: req.user._id,
    following: req.params.userId,
  })
    .then(followDoc => {
      if (!followDoc) {
        throw new APIError('Not following', httpStatus.NOT_FOUND);
      }
      return res.json({ data: followDoc });
    })
    .catch(e => next(e));
}

/**
 * Create new following relationship
 *
 * POST /api/users/:userId/follow
 *
 * @property {*} req Express request
 * @property {*} req.params Express params parameters
 * @property {string} req.params.userId The target user to be followed
 */
async function follow(req: session$Request, res: express$Response, next: express$NextFunction) {
  const targetUserId = req.params.userId;

  if (req.user._id.toString() === targetUserId.toString()) {
    const APIerr = new APIError('Cannot follow thyself', httpStatus.BAD_REQUEST);
    return next(APIerr);
  }

  const blocking = await Block.countDocuments({
    $or: [
      { sourceUser: req.user._id, targetUser: targetUserId },
      { sourceUser: targetUserId, targetUser: req.user._id },
    ],
  });

  if (blocking > 0) {
    const APIerr = new APIError('Error following a user', httpStatus.BAD_REQUEST);
    return next(APIerr);
  }

  internalFollow(req.user, targetUserId)
    .then(savedDoc => res.status(httpStatus.CREATED).json({ data: savedDoc }))
    .catch(e => {
      if (e.message.startsWith('Error following a user:')) {
        e = new APIError(e.message, httpStatus.BAD_REQUEST);
      }
      next(e);
    });
}

/**
 * Follow a user by _id or username and create a Notification
 *
 * @param {UserDoc} sender
 * @param {String} targetUser _id or username
 */
function internalFollow(sender: UserDoc, targetUser: String | MongoId): Promise<any> {
  // search by userId and username
  return User.findOne({
    $or: [{ username: targetUser }, { _id: targetUser }],
  })
    .then((user: UserDoc) => {
      if (!user) {
        throw new Error(`Error following a user: ${targetUser}`);
      }
      return user;
    })
    .then(user => {
      const notif: NotifPayload = {
        data: {
          senderName: sender.username,
        },
        notifI18n: i18n.newFollower,
        targetUser: user._id,
        triggeredBy: sender._id,
        triggeredType: 'User',
        onlyPush: false,
        sourceUser: sender._id,
      };

      notifCtrl
        .createNotification(notif)
        .then(() => {
          debug('comment notification created');
        })
        .catch(err => {
          console.error(err);
        });

      const doc = new Follow({
        follower: sender._id,
        following: user._id,
      });

      return doc.save();
    })
    .then(follow => {
      DefaultFollow.updateOne(
        { user: follow.following },
        {
          $inc: { initialFollowersCount: 1 },
        }
      ).then(res => {
        if (res.nModified == 1) {
          return void debug('increase initial count for defaultFollower');
        }
        // FIXME: hide error in a better way - see followDefaultUsers() method
        // console.error('error incrementing initialFollowersCount');
      });
      return follow;
    });
}

/**
 * Delete a following relationship
 *
 * POST /api/users/:userId/unfollow
 *
 * @property {*} req Express request
 * @property {*} req.params Express params parameters
 * @property {string} req.params.userId The target user to be followed
 */
function unfollow(req: session$Request, res: express$Response, next: express$NextFunction) {
  const targetUserId = req.params.userId;

  if (req.user._id.toString() === targetUserId.toString()) {
    const APIerr = new APIError('Cannot unfollow thyself', httpStatus.BAD_REQUEST);
    return next(APIerr);
  }

  User.findById(targetUserId)
    .then((targetUser: UserDoc) => {
      if (!targetUser) {
        throw new APIError('Error unfollowing a user', httpStatus.BAD_REQUEST);
      }
      return targetUser;
    })
    .then(targetUser =>
      Follow.findOne({
        follower: req.user._id,
        following: targetUser._id,
        status: { $ne: -1 },
      })
    )
    .then((followDoc: FollowDoc) => {
      if (!followDoc) {
        throw new APIError('Error unfollowing a user', httpStatus.BAD_REQUEST);
      }
      return followDoc.remove();
    })
    .then(deletedDoc => res.json({ data: deletedDoc }))
    .catch(e => next(e));
}

/**
 * Get list of followers of a specific user and if I am following them or not (amIAFollower)
 *
 * GET /api/users/:userId/followers
 *
 * @property {*} req - Express request
 * @property {*} req.params - Express params parameters
 * @property {string} req.params.userId
 * @property {*} req.query - Express query parameters
 * @property {number} req.query.skip Number of users to be skipped.
 * @property {number} req.query.limit Limit number of users to be returned.
 */
async function listFollowers(req: session$Request, res: express$Response, next: express$NextFunction) {
  const { limit = 50, skip = 0 } = req.query;

  const DBquery = { following: req.params.userId, status: { $ne: -1 } };

  // using static method from FollowSchema
  // flow-disable-next-line
  try {
    let followers = await Follow.list({ DBquery, limit, skip });
    if (followers) {
      // filter followers that not longer exist (populate returns null)
      followers = followers.filter(f => f.follower !== null);

      // get only the list of followers ids of the queried User
      const ids = followers.map(f => f.follower._id.toString());

      // get the list of users I follow based on that list ^
      let myFollowings = await Follow.find({
        follower: req.user._id.toString(),
        following: { $in: ids },
      });
      myFollowings = myFollowings.map(f => f.following.toString());
      followers = followers.map((f: FollowDoc) => {
        f = f.toJSON();
        const doc = {
          ...f.follower,
          dateCreated: f.dateCreated,
          amIAFollower: false,
        };
        if (myFollowings && myFollowings.indexOf(f.follower._id.toString()) > -1) {
          doc.amIAFollower = true;
        }
        return doc;
      });
    }
    res.json({ data: followers });
  } catch (error) {
    next(error);
  }
}

/**
 * Get list of users a specific user is following and if I am following them or not (amIAFollower)
 *
 * GET /api/users/:userId/following
 *
 * @property {*} req - Express request
 * @property {*} req.params - Express params parameters
 * @property {string} req.params.userId
 * @property {*} req.query - Express query parameters
 * @property {number} req.query.skip Number of users to be skipped.
 * @property {number} req.query.limit Limit number of users to be returned.
 */
async function listFollowing(req: session$Request, res: express$Response, next: express$NextFunction) {
  const { limit = 50, skip = 0 } = req.query;

  const DBquery = { follower: req.params.userId, status: { $ne: -1 } };

  // use static method from FollowSchema
  // flow-disable-next-line
  try {
    let followings = await Follow.list({ DBquery, limit, skip });
    if (followings.length) {
      // filter followers that no longer exist (populate returns null)
      followings = followings.filter(f => f.following !== null);
      // TODO: filter followings that are deleted
      // get the list ids of the queried User is following
      const ids = followings.map(f => f.following._id.toString());
      // get the list of users I follow based on that list ^
      let myFollowings = await Follow.find({
        follower: req.user._id.toString(),
        following: { $in: ids },
      });
      myFollowings = myFollowings.map(f => f.following.toString());
      followings = followings.map((f: FollowDoc) => {
        f = f.toJSON();
        const doc = {
          ...f.following,
          dateCreated: f.dateCreated,
          amIAFollower: false,
        };
        if (myFollowings.indexOf(f.following._id.toString()) > -1) {
          doc.amIAFollower = true;
        }
        return doc;
      });
    }
    res.json({ data: followings });
  } catch (error) {
    next(error);
  }
}

export default {
  get,
  follow,
  internalFollow,
  unfollow,
  listFollowers,
  listFollowing,
};
