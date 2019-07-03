// @flow

import httpStatus from 'http-status';
const IncomingWebhook = require('@slack/client').IncomingWebhook;

import APIError from '../helpers/APIError';
import { User, UserDoc, Product, Report } from '../models';
import config from '../config/config';

const webhook = new IncomingWebhook(config.SLACK_WEBHOOK_URL);

declare class session$Request extends express$Request {
  user: UserDoc;
  body: {
    categoryIds: string,
    description: string,
    typeIds: string,
    tag: string,
    limit: number,
  };
}

/**
 * Report products, comments and users
 *
 * GET /api/report
 *
 * @property {*} req - Express request
 * @property {*} req.body - Express body parameters

function get(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { limit = 50, categoryIds, description, tag, typeIds } = req.body;

  let query;
  if (config.env !== 'test') {
    query = { photoURIs: { $exists: true, $not: { $size: 0 } } };
  }

  if (categoryIds) query = { ...query, categoryIds: { $in: categoryIds } };
  if (description) {
    query = { ...query, description: regex };
  }
  if (tag) query = { ...query, tags: tag };
  if (typeIds) query = { ...query, typeIds: { $in: typeIds } };

  const projection = { comments: 0 };

  // use static method from ProductSchema
  // flow-disable-next-line
  Product.find(query, projection)
    .sort({ _id: -1 }) // faster than createdAt: -1 - same ordering
    .populate({
      path: 'seller',
      select: userPopulateFields,
    })
    .limit(+limit)
    .then(data => res.json({ data }))
    .catch(e => next(e));
}*/

/**
 * Report products or users
 *
 * POST /api/report
 *
 * @property {*} req - Express request
 * @property {*} req.body - Express body parameters
 * @property {string} req.body.product
 * @property {string} req.body.text
 * @property {string} req.body.user
 */
async function create(req: session$Request, res: express$Response, next: express$NextFunction) {
  const { product, text, user } = req.body;
  let slackJSON;

  try {
    if (req.user.accountStatus !== 'verified') {
      throw new APIError('Please verify your account before making a report', httpStatus.BAD_REQUEST);
    }

    const report = new Report({ text });

    if (user) {
      if (user === req.user._id.toString()) {
        throw new APIError('Cannot report yourself', httpStatus.BAD_REQUEST);
      }
      const foundUser = await User.findById(user);
      if (!foundUser) {
        throw new APIError('User not found', httpStatus.NOT_FOUND);
      }
      if (foundUser.accountStatus == 'deleted') {
        throw new APIError('Cannot report a deleted user', httpStatus.BAD_REQUEST);
      }
      slackJSON = {
        attachments: [
          {
            title: 'User reported',
            pretext: `User (@${foundUser.username}) was reported by @${req.user.username}`,
            text: `User: @${foundUser.username}\n` + `Reporter: @${req.user.username}\n` + `Message: ${text}`,
          },
        ],
      };

      report.user = foundUser._id;
    }

    if (product) {
      const foundProduct = await Product.findOne({ uuid: product }).populate('seller');
      if (!foundProduct) throw new APIError('Product not found', httpStatus.NOT_FOUND);

      if (foundProduct.status === 'banned' || foundProduct.status === 'deleted') {
        throw new APIError('Product is deleted or banned', httpStatus.NOT_FOUND);
      }
      if (foundProduct.seller._id.toString() === req.user._id.toString()) {
        throw new APIError('Cannot report your product', httpStatus.BAD_REQUEST);
      }
      slackJSON = {
        attachments: [
          {
            title: 'Item reported',
            pretext: `Item (${foundProduct.uuid}) reported from @${req.user.username}`,
            text:
              `Item id: ${foundProduct.uuid}\n` +
              `Owner: @${foundProduct.seller.username}\n` +
              `Reporter: @${req.user.username}\n` +
              `Message: ${text}`,
          },
        ],
      };

      report.product = foundProduct._id;
    }

    report.reporter = req.user._id;

    const response = await report.save();

    if (config.env === 'production') {
      webhook.send(slackJSON, err => {
        if (err) return console.error('Slack Error:', err);
        console.log('Report sent to Slack');
      });
    }
    return res.status(httpStatus.CREATED).json({ data: response });
  } catch (err) {
    if (!(err instanceof APIError)) {
      // mongoose validation error for neither 'user' or 'product' fields
      if (err.name == 'ValidationError') {
        err = new APIError('Report a user or product', httpStatus.BAD_REQUEST);
      } else {
        err = new APIError('Error reporting', httpStatus.INTERNAL_SERVER_ERROR);
      }
    }
    return next(err);
  }
}

export default {
  // get,
  create,
};
