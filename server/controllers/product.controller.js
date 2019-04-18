// @flow

import shortid from 'shortid';
import httpStatus from 'http-status';
import path from 'path';
import mongoose from 'mongoose';

import APIError from '../helpers/APIError';
import photos from '../helpers/photos';
import {
  Block,
  Product,
  ProductDoc,
  Tag,
  TagDoc,
  User,
  UserDoc,
  userPopulateFields,
} from '../models';
import config from '../config/config';
import Analytics from '../config/analytics';

const { minPrice } = config.settings;

const geocoder = require('offline-geocoder')({
  database: path.join(__dirname, '../../db.sqlite'),
});

function escapeRegex(text: string) {
  return text.replace(/[^a-zA-Z0-9_]/g, '\\$&');
}

declare class session$Request extends express$Request {
  user: UserDoc;
  product: ProductDoc;
  body: {
    categoryIds: string,
    description: string,
    photos: Array<string>,
    price: string,
    typeIds: string,
    tags: Array<TagDoc>,
    latitude: number,
    longitude: number,
  };
}

/**
 * Load a product and append to req.
 */
function load(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction,
  uuid: string
) {
  // use static method from ProductSchema
  // flow-disable-next-line
  Product.get(uuid)
    .then((product: ProductDoc) => {
      req.product = product;
      return next();
    })
    .catch(e => next(e));
}

/**
 * Load a product with comments (and it's user doc) and append to req.
 */
function loadWithComments(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction,
  uuid: string
) {
  Product.findOne({ uuid })
    .populate({
      path: 'seller',
      select: userPopulateFields,
    })
    .populate({
      path: 'comments.user',
      select: 'username accountStatus displayName profilePic',
    })
    .then((product: ProductDoc) => {
      if (!product) {
        throw new Error('');
      }
      req.product = product;
      return next();
    })
    .catch(() => {
      const e = new APIError('Invalid product', httpStatus.BAD_REQUEST);
      next(e);
    });
}

/**
 * Get a product
 *
 * GET /api/products/:uuid
 *
 * @property {*} req - Express request
 * @property {*} req.params - Express session parameters
 * @property {string} req.params.uuid The unique id (shortid) of product.
 */
function get(req: session$Request, res: express$Response) {
  return res.json({ data: req.product });
}

/**
 * Create a new product
 *
 * POST /api/products
 *
 * @property {*} req - Express request
 * @property {*} req.body - Express body parameters
 * @property {Array<number>} req.body.categoryIds
 * @property {string=} [req.body.currency='UAH']
 * @property {string} req.body.description
 * @property {number=} req.body.latitude
 * @property {number=} req.body.longitude
 * @property {Array<string>} req.body.photos
 * @property {string} req.body.price
 * @property {Array<string>=} req.body.tags
 * @property {Array<number>} req.body.typeIds
 */
async function create(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { body } = req;

  if (parseFloat(body.price) < minPrice) {
    const APIerr = new APIError(
      `Invalid product price. The minimum price is ${minPrice} UAH`,
      httpStatus.BAD_REQUEST
    );
    return next(APIerr);
  }

  const product = new Product({
    categoryIds: body.categoryIds,
    // currency: body.currency,
    description: body.description,
    price: parseFloat(body.price).toFixed(2),
    // status: body.status, // 'forsale' by default
    tags: body.tags,
    typeIds: body.typeIds,
    uuid: shortid.generate(), // needed here for photos' filenames
  });

  if (body.longitude && body.latitude) {
    product.location = {
      type: 'Point',
      coordinates: [body.longitude, body.latitude],
    };

    try {
      const geodata = await geocoder.reverse(body.latitude, body.longitude);
      product.locality = geodata.admin1.name;
    } catch (err) {
      console.error(err);
      const APIerr = new APIError('Invalid location', httpStatus.BAD_REQUEST);
      return next(APIerr);
    }
  }

  // create Tag documents
  if (body.tags) createTags(body.tags);

  User.findById(req.user._id)
    .then(async seller => {
      if (!seller) {
        throw new APIError('Seller not found', httpStatus.BAD_REQUEST);
      }
      if (seller.accountStatus !== 'verified') {
        throw new APIError(
          'Please verify your account before creating a listing',
          httpStatus.BAD_REQUEST
        );
      }
      if (
        !seller.shippingAddress.departmentNovaposhta ||
        !seller.shippingAddress.city
      ) {
        throw new APIError(
          'Please enter your shipping address info before listing an item',
          httpStatus.BAD_REQUEST
        );
      }
      if (!seller.paymentInfo.method || !seller.paymentInfo.card_token) {
        throw new APIError(
          'Please enter your payment info info before listing an item',
          httpStatus.BAD_REQUEST
        );
      }

      product.seller = req.user._id;

      const correctPhotos = body.photos.filter(p =>
        p.startsWith('https://storage.googleapis.com/temp-uploads.onova.co/')
      );

      if (correctPhotos.length < 1) {
        throw new APIError(
          'Product photo(s) are required',
          httpStatus.BAD_REQUEST
        );
      }

      const date = Date.now();

      // TODO: check if images have been uploaded to GSC
      let promises = [];

      for (let i = 0; i < correctPhotos.length; i++) {
        const photo = correctPhotos[i];
        const thumb = photo.replace('.jpg', '-thumb.jpg');
        const thumb2x = photo.replace('.jpg', '-thumb@2x.jpg');
        promises.push(photos.copyPhoto(thumb, product.uuid, i, date, '-thumb'));
        promises.push(
          photos.copyPhoto(thumb2x, product.uuid, i, date, '-thumb@2x')
        );
      }

      correctPhotos.map((p, i) =>
        promises.push(photos.copyPhoto(p, product.uuid, i, date))
      );

      try {
        const photos = await Promise.all(promises);
        product.photoURIs = photos.filter(photo => !photo.includes('thumb'));
      } catch (err) {
        console.error(err);
        throw new APIError('Error copying photos', 500);
      }

      return product
        .save()
        .then(savedProduct => savedProduct)
        .catch(e => {
          console.error(e);
          throw new APIError(
            'Error creating Product',
            httpStatus.INTERNAL_SERVER_ERROR
          );
        });
    })
    .then(savedProduct => {
      if (config.env === 'production') {
        Analytics.track({
          userId: req.user._id.toString(),
          event: 'new_product',
          properties: {
            categoryIds: savedProduct.categoryIds[0],
            numPhotos: savedProduct.photoURIs.length,
            price: savedProduct.price.toString(),
            typeIds: savedProduct.typeIds[0],
            uuid: savedProduct.uuid,
            ...(savedProduct.tags.length ? { tags: savedProduct.tags } : {}),
            ...(body.longitude ? { locality: savedProduct.locality } : {}),
          },
        });
      }
      return res.status(httpStatus.CREATED).json({ data: savedProduct });
    })
    .catch(e => next(e));
}

/**
 * Get a list of products that are for sale and which photos have been uploaded
 *
 * GET /api/products
 *
 * @property {*} req - Express request
 * @property {*} req.query - Express query parameters
 * @property {number|Array<number>=} req.query.categoryIds
 * @property {MongoId=} req.query.lastId (not uuid)
 * @property {number=} req.query.limit Limit number of products to be returned
 * @property {array<string>|string=} req.query.tags
 * @property {string=} req.query.userid (or username)
 * @property {string=} req.query.username (or userid)
 */
async function list(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { categoryIds, lastId, limit = 50, tags, userid, username } = req.query;
  const projection = { comments: 0 };
  let query = { status: 'forsale' };

  if (config.env !== 'test') {
    query = { ...query, photoURIs: { $exists: true, $not: { $size: 0 } } };
  }

  if (tags) {
    if (Array.isArray(tags)) {
      const regexAllTags = tags.map(tag => new RegExp(escapeRegex(tag), 'i'));
      query = { ...query, tags: { $in: regexAllTags } };
    } else {
      const regexTag = new RegExp(escapeRegex(tags), 'i');
      query = { ...query, tags: regexTag };
    }
  }
  if (categoryIds) query = { ...query, categoryIds: { $in: categoryIds } };

  if (userid) {
    if (req.user) {
      const usersIamBlocking = await Block.find({
        sourceUser: req.user._id,
        targetUser: userid,
      });

      const idsB = usersIamBlocking.map(u => u.targetUser.toString());

      // limit by seller and exclude those blocked
      query = {
        ...query,
        seller: { $nin: idsB, $in: [new mongoose.Types.ObjectId(userid)] },
      };
    } else {
      query = { ...query, seller: new mongoose.Types.ObjectId(userid) };
    }
  } else if (username) {
    // search products by seller's username (no pagination[lastId] yet allowed)
    const user = await User.findOne({ username });
    if (!user) {
      const APIerr = new APIError('No seller found', httpStatus.NOT_FOUND);
      return next(APIerr);
    }

    query = { ...query, seller: new mongoose.Types.ObjectId(user._id) };
  }

  // for pagination - results are excluding the lastId
  if (lastId) {
    const product = await Product.findById(lastId);
    if (!product) {
      const APIerr = new APIError('Product not found.', httpStatus.NOT_FOUND);
      return next(APIerr);
    }

    query = { ...query, _id: { $lt: lastId } };
  }

  let sellerTypes;
  if (req.user && req.user.types) {
    sellerTypes = req.user.types;
    if (req.user.types.includes('admin')) {
      sellerTypes = ['reseller', 'designer'];
    }
  }

  // use static method from ProductSchema
  Product.list({ query, projection, limit, sellerTypes })
    .then(data => res.json({ data }))
    .catch(e => next(e));
}

/**
 * Remove a product - marking the 'status' as 'deleted'
 *
 * DELETE /api/products/:uuid
 *
 * @property {*} req - Express request
 * @property {*} req.query - Express query parameters
 * @property {string} req.query.uuid
 */
function remove(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  if (req.product.status !== 'forsale') {
    // item could be already sold or deleted, etc.
    throw new APIError('Product not found', httpStatus.BAD_REQUEST);
  }

  const { uuid } = req.params;

  Product.findOneAndUpdate({ uuid, status: 'forsale' }, { status: 'deleted' })
    .then(() => res.status(httpStatus.NO_CONTENT).json())
    .catch(() => {
      const err = new APIError(
        'Error deleting Product',
        httpStatus.INTERNAL_SERVER_ERROR
      );
      next(err);
    });
}

/**
 * Update a product
 *
 * PUT /api/products/:uuid
 *
 * @property {*} req - Express request
 * @property {*} req.query - Express query parameters
 * @property {string} req.query.uuid
 * @property {*} req.body - Express body parameters
 * @property {Array<number>} req.body.categoryIds
 * @property {string} req.body.description
 * @property {Array<string>} req.body.photos
 * @property {string} req.body.price
 * @property {Array<string>=} req.body.tags
 * @property {Array<number>} req.body.typeIds
 */
async function update(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { body } = req;

  if (parseFloat(body.price) < minPrice) {
    const APIerr = new APIError(
      `Invalid product price. The minimum price is ${minPrice} UAH`,
      httpStatus.BAD_REQUEST
    );
    return next(APIerr);
  }

  Product.findOne({ uuid: req.params.uuid })
    .then(async foundProduct => {
      if (!foundProduct) {
        throw new APIError('Product not found', httpStatus.BAD_REQUEST);
      }

      if (foundProduct.status === 'sold') {
        throw new APIError(
          'Cannot update a product that has been sold',
          httpStatus.BAD_REQUEST
        );
      } else if (foundProduct.status === 'reserved') {
        throw new APIError(
          'Cannot update a product that is reserved',
          httpStatus.BAD_REQUEST
        );
      }

      // create Tag documents
      if (body.tags) createTags(body.tags);

      if (body.photos) {
        const date = Date.now();

        // TODO: check if images have been uploaded to GSC
        try {
          foundProduct.photoURIs = await Promise.all(
            body.photos.map(async (photo, i) => {
              // if it's an existing photo
              if (!photo.includes('/temp-uploads')) return photo;
              else {
                // move both thumbnails
                const thumb = photo.replace('.jpg', '-thumb.jpg');
                const thumb2x = photo.replace('.jpg', '-thumb@2x.jpg');
                const allPhotos = await Promise.all([
                  photos.copyPhoto(thumb, foundProduct.uuid, i, date, '-thumb'),
                  photos.copyPhoto(
                    thumb2x,
                    foundProduct.uuid,
                    i,
                    date,
                    '-thumb@2x'
                  ),
                  photos.copyPhoto(photo, foundProduct.uuid, i, date),
                ]);
                // only store the large size copied photo
                return allPhotos[2];
              }
            })
          );
        } catch (err) {
          console.error(err);
          throw new APIError('Error copying photos', 500);
        }
      }

      foundProduct.categoryIds = body.categoryIds
        ? body.categoryIds
        : foundProduct.categoryIds;
      foundProduct.description = body.description
        ? body.description
        : foundProduct.description;

      // always put 2 decimal points
      foundProduct.price = body.price
        ? parseFloat(body.price).toFixed(2)
        : foundProduct.price;
      foundProduct.tags = body.tags ? body.tags : foundProduct.tags;
      foundProduct.typeIds = body.typeIds ? body.typeIds : foundProduct.typeIds;

      return foundProduct.save();
    })
    .then(product => {
      return res.json({ data: product });
    })
    .catch(err => {
      if (!(err instanceof APIError)) {
        console.error(err);
        err = new APIError(
          'Error updating Product',
          httpStatus.INTERNAL_SERVER_ERROR
        );
      }
      next(err);
    });
}

function createTags(tags: Array<TagDoc>) {
  tags.forEach(tag => {
    Tag.findOneAndUpdate({ _id: tag }, { _id: tag }, { upsert: true }).catch(
      err => {
        if (err.codeName !== 'DuplicateKey') {
          console.log('error saving tags', err);
        }
      }
    );
  });
}

export default {
  load,
  loadWithComments,
  get,
  create,
  update,
  list,
  remove,
};
