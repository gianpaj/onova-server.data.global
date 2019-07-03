// @flow

import httpStatus from 'http-status';

import APIError from '../helpers/APIError';
import { User, UserDoc, Block, Follow } from '../models';

declare class session$Request extends express$Request {
  user: UserDoc;
}

/**
 * Block users (no unblocking for now)
 *
 * POST /api/block
 *
 * @property {*} req - Express request
 * @property {*} req.body - Express body parameters
 * @property {string} req.body.targetUser
 */
async function create(req: session$Request, res: express$Response, next: express$NextFunction) {
  const { targetUser } = req.body;

  let foundUser;
  try {
    foundUser = await User.findById(targetUser);
    if (!foundUser) {
      throw new APIError('User not found', httpStatus.NOT_FOUND);
    }
    if (foundUser._id.toString() === req.user._id.toString()) {
      throw new APIError('Cannot block yourself', httpStatus.BAD_REQUEST);
    }
    if (foundUser.accountStatus == 'deleted') {
      throw new APIError('Cannot block a deleted user', httpStatus.BAD_REQUEST);
    }
  } catch (err) {
    return next(err);
  }

  const block = new Block({
    sourceUser: req.user._id,
    targetUser: foundUser._id,
  });

  await Follow.updateMany(
    {
      $or: [{ follower: req.user._id, following: foundUser._id }, { following: req.user._id, follower: foundUser._id }],
    },
    { status: -1 }
  );

  return block
    .save()
    .then(block => {
      return res.status(httpStatus.CREATED).json({ data: block });
    })
    .catch(err => {
      if (!(err instanceof APIError)) {
        err = new APIError('Error blocking', httpStatus.INTERNAL_SERVER_ERROR);
      }
      next(err);
    });
}

export default {
  create,
};
