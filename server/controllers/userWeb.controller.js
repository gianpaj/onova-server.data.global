// @flow

import httpStatus from 'http-status';
import bs58 from 'bs58';
const debug = require('debug')('server-data:index');

import APIError from '../helpers/APIError';
import { UserWeb } from '../models';
import authCtrl from './auth.controller';

/**
 * Create new user
 *
 * POST /api/users-web
 *
 * @property {*} req - Express request
 * @property {*} req.body - Express body parameters
 */
async function create(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const user = await UserWeb.create({});

  return res.status(httpStatus.CREATED).json({
    token: `JWT ${authCtrl.generateToken({ ...user.toJSON(), type: 'web' })}`,
    data: user,
  });
}

/**
 * Get a user web or my user
 *
 * POST /api/users-web/:userId|me
 *
 * @property {*} req - Express request
 * @property {*} req.params - express session parameters
 * @property {MongoId} req.params.userId
 */
async function get(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  if (req.params.userId === 'me') return res.json({ data: req.user });

  UserWeb.get(req.params.userId)
    .then((user: UserDoc) => res.json(user))
    .catch(e => next(e));
}

/**
 * Update my current user web
 *
 * PUT /api/users-web/me
 *
 * @property {*} req - Express request
 */
async function update(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { body, user: authUser } = req;

  try {
    const user = await UserWeb.findById(authUser._id);
    if (!user) throw new APIError('Error getting your UserWeb');

    if (body.emailAddress) user.emailAddress = body.emailAddress;

    if (body.mobileNumber)
      user.mobileNumber = body.mobileNumber.replace('+380', '0');

    if (body.shippingAddress) user.shippingAddress = body.shippingAddress;

    if (body.paymentInfoPayload) {
      const bytes = bs58.decode(body.paymentInfoPayload);
      const payload = JSON.parse(bytes.toString());
      user.paymentInfo.first_four = payload.panMasked.slice(0, 4);
      user.paymentInfo.last_four = payload.panMasked.slice(-4);
      user.paymentInfo.card_token = payload.id;
      user.paymentInfo.method = 'uapay';
    }

    const savedUser = await user.save();
    res.json(savedUser);
    debug(`UserWeb id: ${user.id} updated.`);
  } catch (error) {
    next(error);
  }
}

export default {
  get,
  create,
  update,
};
