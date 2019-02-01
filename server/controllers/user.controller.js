// @flow

import httpStatus from 'http-status';
import Chatkit from '@pusher/chatkit-server';
import bs58 from 'bs58';
const debug = require('debug')('server-data:index');

import APIError from '../helpers/APIError';
import photos from '../helpers/photos';
import config from '../config/config';
import { DefaultFollow, Follow, Order, User, UserDoc } from '../models';
import authCtrl from './auth.controller';
import mailCtrl from './mail.controller';
import followController from './follow.controller';

let ckInst;
if (config.env == 'production') {
  ckInst = new Chatkit({
    instanceLocator: config.chatkit.instanceLocator,
    key: config.chatkit.key,
  });
} else {
  console.warn('not running in production. Chatkit account creation disabled');
}

declare class session$Request extends express$Request {
  user: UserDoc;
  file: File;
}

/**
 * Load user and append to req. object
 */
function load(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction,
  id: string
) {
  // use static method from UserSchema
  // flow-disable-next-line
  User.get(id)
    .then((user: UserDoc) => {
      req.user = user;
      return next();
    })
    .catch(e => next(e));
}

/**
 * Get user
 *
 * GET /api/users/:userId
 *
 * @property {*} req - express session
 * @property {*} req.params - express session parameters
 * @property {MongoId} req.params.userId
 */
async function get(req: session$Request, res: express$Response) {
  const { userId } = req.params;
  let doc = _prepareUserJson(req.user);
  const followers = await Follow.find({
    following: userId,
  }).populate('follower');
  const following = await Follow.find({
    follower: userId,
  }).populate('following');

  const ordersAndReviewsCount = await Order.countDocuments({
    $and: [
      { $or: [{ buyer: userId }, { seller: userId }] },
      {
        $or: [
          {
            status: {
              $in: ['completed', 'failed_by_buyer', 'failed_by_seller'],
            },
          },
          { status: 'cancelled', reason: { $exists: true } },
        ],
      },
    ],
  });

  doc = {
    ...doc,
    followersCount: followers.filter(f => f.follower !== null).length,
    followingCount: following.filter(f => f.following !== null).length,
    ordersAndReviewsCount,
  };
  return res.json(doc);
}

/**
 * Get user's personal info
 *
 * GET /api/users/:userId/personal
 *
 * @property {*} req - Express request
 * @property {*} req.params - Express parameters
 * @property {ObjectId} req.params.userId
 */
async function getPersonal(req: session$Request, res: express$Response) {
  const userId = req.user._id;
  const doc = _prepareUserJson(req.user);

  const ordersAndReviewsCount = await Order.countDocuments({
    $and: [
      { $or: [{ buyer: userId }, { seller: userId }] },
      {
        $or: [
          {
            status: {
              $in: ['completed', 'failed_by_buyer', 'failed_by_seller'],
            },
          },
          { status: 'cancelled', reason: { $exists: true } },
        ],
      },
    ],
  });

  const { createdAt, mobileNumber, paymentInfo, shippingAddress } = req.user;

  return res.json({
    ...doc,
    createdAt,
    mobileNumber,
    ordersAndReviewsCount,
    paymentInfo,
    shippingAddress,
  });
}

/**
 * Create new user
 *
 * POST /api/users
 *
 * @property {*} req - Express request
 * @property {*} req.body - Express body parameters
 * @property {string} req.body.username
 * @property {string} req.body.emailAddress
 * @property {string=} req.body.mobileNumber
 * @property {string} req.body.password (it's salted and hashed)
 * @property {string=} req.body.platform
 * @property {string=} req.body.pushToken
 */
async function create(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { body } = req;

  User.findOne({
    $or: [
      // mongoose changes the email to lowercase
      { emailAddress: body.emailAddress.toLowerCase() },
      { username: body.username },
    ],
  })
    .then((existingUser: UserDoc) => {
      if (existingUser) {
        const APIerr = new APIError(
          'An account with the same email address or username exists.',
          httpStatus.BAD_REQUEST
        );
        throw APIerr;
      }

      const user = new User({
        username: body.username,
        emailAddress: body.emailAddress,
        password: body.password,
      });

      if (body.mobileNumber) user.mobileNumber = body.mobileNumber;
      if (body.platform) user.platform = body.platform;
      if (body.pushToken) user.pushToken = body.pushToken;

      if (body.emailAddress.startsWith('onovaapp')) {
        user.accountStatus = 'verified';
      }

      return user.save();
    })
    .then(async (savedUser: UserDoc) => {
      // if we should Auto Follow certain users by default
      if (config.DEFAULT_FOLLOW) {
        followDefaultUsers(savedUser)
          .then(num => {
            if (typeof num == 'number') debug(`followed ${num} default users`);
          })
          .catch(e => console.error(e));
      }

      if (config.env !== 'production') {
        debug('skipping pusher createUser()');
      } else {
        try {
          await ckInst.createUser({
            id: savedUser._id,
            name: savedUser.username,
          });
          console.log('chatkit user created');
        } catch (err) {
          console.error(err);
          throw err;
        }
      }

      // do not send verification email
      if (body.emailAddress.startsWith('onovaapp')) return savedUser;

      await mailCtrl.sendVerificationEmail(savedUser.emailAddress, savedUser);
      return savedUser;
    })
    .then(savedUser => {
      const payload = _prepareUserJson(savedUser);
      return res.status(httpStatus.CREATED).json({
        data: payload,
        token: `JWT ${authCtrl.generateToken(payload)}`,
      });
    })
    .catch(e => next(e));
}

/**
 * A new user follows the number of users
 */
function followDefaultUsers(newUser: UserDoc): Promise<null | Error | number> {
  return (
    DefaultFollow.find({}, { user: 1 })
      // .then(users => {
      //   if (users.length == 0) {
      //     // FIXME: hide error in a better way - see internalFollow() method
      //     // return reject(new Error('there are no default users to follow'));
      //     throw null;
      //   }
      //   return users;
      // })
      .then(async follows => {
        const promises = follows.map(f =>
          followController.internalFollow(newUser, f.user)
        );
        try {
          await Promise.all(promises);
        } catch (err) {
          console.error(err);
        }
        return follows.length;
      })
  );
}

/**
 * Update existing user - Protected route
 *
 * PUT /api/users/:userId
 *
 * @property {*} req - Express request
 * @property {*} req.body - Express body parameters
 * @property {string=} req.body.bio
 * @property {string=} req.body.displayName
 * @property {string=} req.body.emailAddress
 * @property {string=} req.body.mobileNumber
 * @property {string=} req.body.password
 * @property {string=} req.body.platform
 * @property {string=} req.body.pushToken
 * @property {string=} req.body.facebook
 * @property {string=} req.body.tokens
 * @property {string=} req.body.accessToken
 * @property {string=} req.body.username
 * @property {string=} req.body.paymentInfoPayload
 * @property {any=} req.body.shippingAddress
 */
function update(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { body, user } = req;

  if (typeof body.bio === 'string') user.bio = body.bio;
  if (typeof body.displayName === 'string') user.displayName = body.displayName;
  if (typeof body.mobileNumber === 'string')
    user.mobileNumber = body.mobileNumber;
  // update password (automatically hashed on save() hook)
  if (body.password) user.password = body.password;
  if (body.platform) user.platform = body.platform;
  if (body.pushToken) user.pushToken = body.pushToken;
  if (body.increaseShare) user.sharedCount++;
  if (body.facebook) {
    user.facebook = body.facebook;
    user.tokens.push({
      accessToken: body.accessToken,
      kind: 'fb',
    });
  }
  if (body.shippingAddress) user.shippingAddress = body.shippingAddress;

  if (body.paymentInfoPayload) {
    const bytes = bs58.decode(body.paymentInfoPayload);
    const payload = JSON.parse(bytes.toString());
    user.paymentInfo.last_four = payload.panMasked.slice(-4);
    user.paymentInfo.card_token = payload.id;
    user.paymentInfo.method = 'uapay';
  }

  let Promises = [];

  // updating email address
  if (body.emailAddress) {
    const emailAddress = body.emailAddress.toLowerCase();
    if (user.emailAddress !== emailAddress) {
      // mongoose changes the email to lowercase
      user.emailAddress = emailAddress;
      Promises.push(
        new Promise((resolve, reject) =>
          User.findOne({ emailAddress }).then(existingUser => {
            if (existingUser) {
              const APIerr = new APIError(
                'An account with the same email address exists.',
                httpStatus.BAD_REQUEST
              );
              return reject(APIerr);
            }
            mailCtrl.resendVerificationEmail(user.emailAddress, user);
            user.accountStatus = 'notverified';
            debug(`account ${user._id} is awaiting for email verification`);
            // save user with new email address only if there is no duplicate key error
            resolve();
          })
        )
      );
    }
  }

  // updating username
  if (body.username && user.username != body.username) {
    user.username = body.username;
    Promises.push(
      new Promise((resolve, reject) => {
        User.findOne({ username: body.username }).then(existingUser => {
          if (existingUser) {
            const APIerr = new APIError(
              'An account with the same username exists.',
              httpStatus.BAD_REQUEST
            );
            return reject(APIerr);
          }
          resolve();
        });
      })
    );
  }

  if (req.file) {
    Promises.push(
      new Promise((resolve, reject) => {
        photos
          .uploadProfilePic(req.user, req.file)
          .then(async cloudStoragePublicUrl => {
            const doc = await User.findByIdAndUpdate(req.user._id, {
              $set: { profilePic: cloudStoragePublicUrl },
            });
            if (doc) {
              debug('profilePic updated for user:', doc._id);
              if (config.env === 'production') {
                try {
                  await ckInst.updateUser({
                    id: doc._id,
                    avatarURL: cloudStoragePublicUrl,
                  });
                  console.log('chatkit user updated');
                } catch (err) {
                  console.error(err);
                  return reject(err);
                }
              }
              return resolve(doc);
            }
            reject('error updating profilePic');
          })
          .catch(err => {
            debug('Error saving user profilePic', err);
            reject(err);
          });
      })
    );
  }

  return Promise.all(Promises)
    .then(() => user.save())
    .then(savedUser => res.json(savedUser))
    .then(() => debug(`Username: ${user.username} updated.`))
    .catch(error => next(error));
}

function escapeRegex(text) {
  return text.replace(/[^A-Za-z0-9_]/g, '\\$&');
}

/**
 * Get list of users.
 *
 * GET /api/users
 *
 * @property {*} req - Express request
 * @property {*} req.query - Express query parameters
 * @property {number} req.query.limit Limit number of users to be returned.
 * @property {string} req.query.username
 * @property {string} req.query.u
 */
function list(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { limit = 50, u, username } = req.query;

  if (username) {
    // flow-disable-next-line
    return User.findOne({ username })
      .then((user: UserDoc) => {
        if (!user) {
          return Promise.reject();
        }
        return user;
      })
      .then(user => res.json(_prepareUserJson(user)))
      .catch(() => {
        const err = new APIError('Invalid user', httpStatus.BAD_REQUEST);
        return next(err);
      });
  }

  if (!u) {
    // use static method from UserSchema
    // flow-disable-next-line
    return User.list({ limit })
      .then(users => res.json(users.map(_prepareUserJson)))
      .catch(e => next(e));
  }

  const regex = new RegExp(escapeRegex(u), 'gi');
  User.find({ username: regex, accountStatus: { $nin: ['deleted', 'banned'] } })
    .select('_id accountStatus displayName username profilePic bio')
    .then(users => {
      if (!users) {
        return res.json({});
      }
      return res.json(users);
    })
    .catch(e => {
      const APIerr = new APIError(e, httpStatus.INTERNAL_SERVER_ERROR);
      next(APIerr);
    });
}

/**
 * Delete user - Protected route
 *
 * DELETE /api/users/:userId
 *
 * @property {*} req - Express request
 * @property {*} req.params - Express params parameters
 * @property {string} req.params.userId
 */
function remove(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  User.findOneAndUpdate(
    { _id: req.user._id },
    { accountStatus: 'deleted', deletedAt: new Date() },
    { new: true }
  )
    .then(updatedUser => res.json(updatedUser))
    .catch(e => next(e));
}

/**
 * @private
 *
 * Limit number of fields send back for a user - Un-protected data / no auth
 */
function _prepareUserJson(user: UserDoc): Object {
  return {
    _id: user._id,
    accountStatus: user.accountStatus,
    bio: user.bio,
    displayName: user.displayName,
    emailAddress: user.emailAddress,
    facebook: user.facebook,
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    profilePic: user.profilePic,
    ratingsTotal: user.ratingsTotal,
    reviewsCount: user.reviewsCount,
    sharedCount: user.sharedCount,
    tokens: user.tokens,
    username: user.username,
  };
}

export default { load, get, getPersonal, create, update, list, remove };
