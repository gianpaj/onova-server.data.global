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
 * Load userWeb and append to req. object
 */
function load(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction,
  id: string
) {
  // use static method from UserSchema
  // flow-disable-next-line
  UserWeb.get(id)
    .then((user: UserDoc) => {
      req.user = user;
      return next();
    })
    .catch(e => next(e));
}

/**
 * Create new user
 *
 * POST /api/users
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
    token: `JWT ${authCtrl.generateToken(user.toJSON())}`,
    data: user,
  });
}

export default {
  // load,
  // get,
  create,
};
