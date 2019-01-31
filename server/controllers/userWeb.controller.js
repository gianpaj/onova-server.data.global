// @flow

import httpStatus from 'http-status';
import bs58 from 'bs58';
const debug = require('debug')('server-data:index');

import APIError from '../helpers/APIError';
import config from '../config/config';
import { UserWeb, UserWebDoc } from '../models';
import authCtrl from './auth.controller';
import mailCtrl from './mail.controller';

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
 * Get my current user web (authenticate / login)
 *
 * POST /api/users-web/me
 *
 * @property {*} req - Express request
 */
function getMe(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  return res.json({ data: { _id: req.user._id } });
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

    if (body.paymentInfoPayload) {
      const bytes = bs58.decode(body.paymentInfoPayload);
      const payload = JSON.parse(bytes.toString());
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
  getMe,
  create,
  update,
};
