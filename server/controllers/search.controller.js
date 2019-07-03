// @flow

import httpStatus from 'http-status';
import mongoose from 'mongoose';

import APIError from '../helpers/APIError';
import { Block, UserDoc, Product } from '../models';
import config from '../config/config';

declare class session$Request extends express$Request {
  user: UserDoc;
}

function escapeRegex(text: string) {
  return text.replace(/[^a-zA-Z0-9_]/g, '\\$&');
}

/**
 * Search for products
 *
 * GET /api/search
 *
 * e.g.
 * GET /api/search/?categoryIds[]=1&categoryIds[]=2&tag=winter&typeIds[]=1&description=lviv
 * (only one is valid)
 *
 * @property {*} req - Express request
 * @property {*} req.query - Express query parameters
 * @property {number|Array<number>=} req.query.categoryIds
 * @property {string} req.query.description (not used by client apps)
 * @property {MongoId} req.query.lastId (not uuid)
 * @property {number} req.query.limit Limit number of products to be returned
 * @property {array<string>|string=} req.query.sellerType
 * @property {string} req.query.tag Limited to a single tag
 * @property {Array<number>=} req.query.typeIds
 */
async function get(req: session$Request, res: express$Response, next: express$NextFunction) {
  const { categoryIds, description, lastId, limit = 50, sellerType, tag, typeIds } = req.query;
  const projection = { comments: 0 };
  let query = { status: 'forsale', quantity: { $gt: 0 } };
  let sellerTypes;

  if (config.env !== 'test') {
    query = { ...query, photoURIs: { $exists: true, $not: { $size: 0 } } };
  }

  if (categoryIds) query = { ...query, categoryIds: { $in: categoryIds } };
  if (description) {
    const regex = new RegExp(escapeRegex(description), 'i');
    query = { ...query, description: regex };
  }
  if (tag) {
    const regexTag = new RegExp(escapeRegex(tag), 'i');
    query = { ...query, tags: regexTag };
  }
  if (typeIds) query = { ...query, typeIds: { $in: typeIds } };

  if (req.user) {
    const [usersIamBlockedBy, usersIamBlocking] = await Promise.all([
      Block.find({ targetUser: req.user._id }),
      Block.find({ sourceUser: req.user._id }),
    ]);

    const idsA = usersIamBlockedBy.map(u => u.sourceUser);
    const idsB = usersIamBlocking.map(u => u.targetUser);

    query.seller = { $nin: [...idsA, ...idsB] };
  }

  // for pagination - results are excluding the lastId
  if (lastId) {
    const product = await Product.findById(lastId);
    if (!product) {
      const APIerr = new APIError('Product not found.', httpStatus.NOT_FOUND);
      return next(APIerr);
    }

    query = { ...query, _id: { $lt: new mongoose.Types.ObjectId(lastId) } };
  }

  if (req.user && req.user.types) {
    sellerTypes = req.user.types;
    if (req.user.types.includes('admin')) {
      sellerTypes = ['reseller', 'designer', 'admin'];
    }
  } else if (sellerType) {
    sellerTypes = [sellerType];
  }

  // use static method from ProductSchema
  Product.list({ query, projection, limit, sellerTypes })
    .then(data => res.json({ data }))
    .catch(e => next(e));
}

export default {
  get,
};
