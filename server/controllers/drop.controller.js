// @flow

import httpStatus from 'http-status';
import shortid from 'shortid';
import {
  addMinutes,
  differenceInCalendarDays,
  differenceInSeconds,
  differenceInMinutes,
} from 'date-fns';
import path from 'path';
const geocoder = require('offline-geocoder')({
  database: path.join(__dirname, '../../db.sqlite'),
});
const debug = require('debug')('server-data:drop');

import { agenda } from '../config/express';
import config from '../config/config';

import photoHelper from '../helpers/photos';
import APIError from '../helpers/APIError';
import {
  Drop,
  DropDoc,
  Follow,
  FollowDoc,
  User,
  UserDoc,
  Product,
  ProductDoc,
} from '../models';

const { minPrice } = config.settings;

export const i18n = {
  // listedDrop: 'Your drop has been posted',
  listedDrop: 'Ваш Дроп виставлено на продаж',
};

declare class session$Request extends express$Request {
  user: UserDoc;
  drop: DropDoc;
}

/**
 * Load a drop and append to req.
 */
function load(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction,
  uuid: string
) {
  // use static method from DropSchema
  // flow-disable-next-line
  Drop.get(uuid)
    .then((drop: DropDoc) => {
      if (!drop) {
        throw new APIError('Drop not found', httpStatus.NOT_FOUND);
      }
      req.drop = drop;
      return next();
    })
    .catch(e => next(e));
}

/**
 * Get a single drop
 *
 * GET /api/v2/drop/:uuid
 *
 * @property {*} req - Express request
 * @property {*} req.params - express session parameters
 * @property {shortid} req.params.uuid
 */
function get(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  if (!req.drop) {
    const error = new APIError('Drop not found', httpStatus.NOT_FOUND);
    return next(error);
  }
  return res.json({ data: req.drop });
}

/**
 * Delete a drop (only admins can)
 *
 * DELETE /api/v2/drop/:uuid
 *
 * @property {*} req - Express request
 * @property {*} req.params - express session parameters
 * @property {shortid} req.params.uuid
 */
async function remove(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  try {
    const { uuid } = req.params;

    const doc = await Drop.findOneAndUpdate(
      { uuid, status: 'valid' },
      { status: 'deleted' }
    );

    if (!doc) {
      return res.status(httpStatus.NOT_FOUND).json();
    }
    return res.status(httpStatus.NO_CONTENT).json();
  } catch (error) {
    if (!(error instanceof APIError)) {
      console.error(error);
      const e = new APIError(
        'Error deleting a drop',
        httpStatus.SERVICE_UNAVAILABLE
      );
      return next(e);
    }
    next(error);
  }
}

/**
 * List a user's drops
 *
 * GET /api/v2/drop
 *
 * @property {*} req - Express request
 * @property {*} req.query
 * @property {string} req.query.username
 */
async function list(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  try {
    const user = await User.findOne({ username: req.query.username });
    if (!user) {
      const e = new APIError('User not found', httpStatus.NOT_FOUND);
      return next(e);
    }

    const query = { seller: user._id, posted: false };

    let drops = await Drop.list({ query });

    if (req.user) {
      const myUserId = req.user._id.toString();

      // add the amISubscribed field
      drops = drops.map(drop => {
        const subscribers = drop.subscribers.map(subscriber =>
          subscriber._id.toString()
        );
        let amISubscribed = false;
        if (subscribers.indexOf(myUserId.toString()) > -1) {
          amISubscribed = true;
        }
        return { ...drop.toJSON(), amISubscribed };
      });
    }

    return res.json({ data: drops });
  } catch (error) {
    if (!(error instanceof APIError)) {
      console.error(error);
      const e = new APIError(
        'Error getting scheduled listing',
        httpStatus.SERVICE_UNAVAILABLE
      );
      return next(e);
    }
    next(error);
  }
}

/**
 * Get list of scheduled drops of the people who i am following
 *
 * GET /api/feed/drops
 *
 * @property {*} req - Express request
 * @property {*} req.query - Express query parameters
 * @property {MongoId} req.query.lastId
 * @property {number} req.query.limit Limit number of drops to be returned.
 */
async function myFeed(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { limit = 50, lastId } = req.query;

  try {
    const following: Array<FollowDoc> = await Follow.find({
      follower: req.user._id,
      status: { $ne: -1 }, // those who i am blocking
    }).limit(1000);
    if (!following.length) return res.json({ data: [] });

    // console.log(following);
    let followingIDs = following.map(f => f.following);

    let blockedByIDs = [];
    const blockedBy = await Follow.find({
      following: req.user._id,
      status: -1,
    });
    if (blockedBy) {
      blockedByIDs = blockedBy.map(f => f.following);
      followingIDs = followingIDs.filter(id => -1 === blockedByIDs.indexOf(id));
    }

    let query = { seller: { $in: followingIDs }, posted: false };

    // for pagination - results are excluding the lastId
    if (lastId) {
      query = { ...query, _id: { $lt: lastId } };

      const lastDropId = await Drop.findById(lastId);
      if (!lastDropId) {
        throw new APIError('Drop not found.', httpStatus.NOT_FOUND);
      }
    }

    let drops = await Drop.list({ query, limit });

    const myUserId = req.user._id.toString();

    // add the amISubscribed field
    drops = drops.map(drop => {
      const subscribers = drop.subscribers.map(subscriber =>
        subscriber._id.toString()
      );
      let amISubscribed = false;
      if (subscribers.indexOf(myUserId.toString()) > -1) {
        amISubscribed = true;
      }
      return { ...drop.toJSON(), amISubscribed };
    });

    return res.json({ data: drops });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a drop a new listing with a specific dropId
 *
 * POST /api/v2/drops
 *
 * @property {*} req - Express request
 * @property {*} req.body - Express body parameters
 * @property {string} req.body.description
 * @property {string} req.body.date
 * @property {number=} req.body.latitude
 * @property {number=} req.body.longitude
 * @property {Array<Object>} req.body.products
 * @property {Array<number>} req.body.products.categoryIds
 * @property {Array<string>=} req.body.products.photos
 * @property {string} req.body.products.price
 * @property {Array<string>=} req.body.products.tags
 * @property {Array<number>} req.body.products.typeIds
 */
async function create(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { body } = req;

  try {
    if (differenceInCalendarDays(body.date, Date.now()) > 90) {
      throw new APIError('Cannot create a drop 90 days from today', httpStatus.BAD_REQUEST);
    }

    validateProducts(body.products);

    const seller = await User.findById(req.user._id);

    validateSeller(seller);

    const location = {
      type: 'Point',
      coordinates: [body.longitude, body.latitude],
    };

    const geodata = await geocoder.reverse(body.latitude, body.longitude);
    const locality = geodata.admin1.name;

    // if the date is not further than 30 seconds in the future, mark it as posted, skipping the job scheduler
    // but for testing only is not further thatn 3 seconds in the future
    const secondsDiff = config.env === 'test' ? 2 : 30;
    const posted =
      Math.abs(differenceInSeconds(new Date(), body.date)) <= secondsDiff;

    const drop: DropDoc = new Drop({
      scheduledAt: body.date,
      seller: req.user._id,
      posted,
    });

    const date = Date.now();
    const productPromises = body.products.reverse().map(async prod => {
      const product = new Product({
        categoryIds: prod.categoryIds,
        // currency: prod.currency,
        description: prod.description,
        dropId: drop._id,
        locality,
        location,
        price: parseFloat(prod.price).toFixed(2),
        // status: prod.status, // 'forsale' by default
        tags: prod.tags,
        typeIds: prod.typeIds,
        uuid: shortid.generate(), // needed here for photos' filenames
        // createdAt: new Date(body.date),
        seller: req.user._id,
        status: posted ? 'forsale' : 'ready',
      });

      let promises = [];

      for (let i = 0; i < prod.photos.length; i++) {
        const photo = prod.photos[i];
        const thumb = photo.replace('.jpg', '-thumb.jpg');
        const thumb2x = photo.replace('.jpg', '-thumb@2x.jpg');
        promises.push(
          photoHelper.copyPhoto(thumb, product.uuid, i, date, '-thumb')
        );
        promises.push(
          photoHelper.copyPhoto(thumb2x, product.uuid, i, date, '-thumb@2x')
        );
      }

      prod.photos.map((p, i) =>
        promises.push(photoHelper.copyPhoto(p, product.uuid, i, date))
      );

      try {
        const photos = await Promise.all(promises);
        product.photoURIs = photos.filter(photo => !photo.includes('thumb'));
      } catch (err) {
        console.error(err);
        throw new APIError('Error copying photos', 500);
      }

      return Product.create(product);
    });

    // const savedProducts = await Promise.all(products);

    // guarantee order - notice `reverse()` in the map
    const savedProducts = [];
    for (let i = 0; i < productPromises.length; i++) {
      savedProducts.push(await productPromises[i]);
    }

    drop.products = savedProducts.map(p => p._id);

    await drop.save();

    if (!posted) {
      // schedule a single job that it's only job is to set the products as 'forsale', from 'ready'
      // and to set the Drop as
      agenda.schedule(body.date, config.JOBNAMES.SCHEDULE, drop, err => {
        if (err) throw new APIError(`Error scheduling a drop: ${err}`);
        debug(`job ${config.JOBNAMES.SCHEDULE} saved`);
      });
    }

    return res.status(httpStatus.CREATED).json({ data: drop });
  } catch (error) {
    if (!(error instanceof APIError)) console.error(error);
    next(error);
  }
}

/**
 * Subscribe to a Drop
 *
 * POST /api/v2/drops/:dropId/subscribe
 *
 * @property {*} req Express request
 * @property {*} req.params Express params parameters
 * @property {string} req.params.dropId The target drop to subscribe to
 */
async function subscribe(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { drop } = req;

  const myUserId = req.user._id.toString();

  try {
    if (myUserId === drop.seller._id.toString()) {
      throw new APIError(
        'Cannot subscribe your own drop',
        httpStatus.BAD_REQUEST
      );
    }

    const subscribers = drop.subscribers.map(subscriber =>
      subscriber._id.toString()
    );

    if (subscribers.indexOf(myUserId) > -1) {
      throw new APIError("You're already subscribed", httpStatus.BAD_REQUEST);
    }

    drop.subscribers.push(req.user);

    await drop.save();

    if (differenceInMinutes(drop.scheduledAt, new Date()) > 15) {
      // schedule to send push notifications + Notification
      agenda.schedule(
        addMinutes(drop.scheduledAt, -15),
        config.JOBNAMES.DROP_SUBSCRIPTION,
        { drop, sub: req.user },
        err => {
          if (err) throw new APIError(`Error drop subscription: ${err}`);
          debug(
            `job ${config.JOBNAMES.DROP_SUBSCRIPTION} saved for later than 15m`
          );
          res.status(httpStatus.CREATED).json({ data: drop });
        }
      );
    } else if (differenceInMinutes(drop.scheduledAt, new Date()) > 10) {
      // schedule to send push notifications + Notification
      agenda.schedule(
        addMinutes(drop.scheduledAt, -5),
        config.JOBNAMES.DROP_SUBSCRIPTION,
        { drop, sub: req.user },
        err => {
          if (err) throw new APIError(`Error drop subscription: ${err}`);
          debug(
            `job ${config.JOBNAMES.DROP_SUBSCRIPTION} saved for later than 10m`
          );
          res.status(httpStatus.CREATED).json({ data: drop });
        }
      );
    } else if (differenceInMinutes(drop.scheduledAt, new Date()) > 1) {
      // schedule to send push notifications + Notification
      agenda.schedule(
        addMinutes(drop.scheduledAt, -1),
        config.JOBNAMES.DROP_SUBSCRIPTION,
        { drop, sub: req.user },
        err => {
          if (err) throw new APIError(`Error drop subscription: ${err}`);
          debug(
            `job ${config.JOBNAMES.DROP_SUBSCRIPTION} saved for later than 1m`
          );
          res.status(httpStatus.CREATED).json({ data: drop });
        }
      );
    } else {
      res.status(httpStatus.CREATED).json({ data: drop });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Unsubscribe to a Drop
 *
 * POST /api/v2/drops/:dropId/unsubscribe
 *
 * @property {*} req Express request
 * @property {*} req.params Express params parameters
 * @property {string} req.params.dropId The target drop to unsubscribe to
 */
async function unsubscribe(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { drop } = req;

  const myUserId = req.user._id.toString();

  try {
    if (myUserId === drop.seller._id.toString()) {
      throw new APIError(
        'Cannot unsubscribe your own drop',
        httpStatus.BAD_REQUEST
      );
    }

    const subscribers = drop.subscribers.map(subscriber =>
      subscriber._id.toString()
    );

    if (subscribers.indexOf(myUserId) === -1) {
      throw new APIError("You're not subscribed", httpStatus.BAD_REQUEST);
    }

    drop.subscribers = drop.subscribers.filter(
      sub => sub._id.toString() !== myUserId
    );

    await drop.save();

    agenda.cancel(
      { 'data.drop._id': drop._id, 'data.sub._id': req.user._id },
      (err, numRemoved) => {
        if (err) return console.error(err);
        debug('numRemoved ' + numRemoved);
        return res.status(httpStatus.OK).json({ data: drop });
      }
    );
  } catch (error) {
    next(error);
  }
}

function validateProducts(products: Array<ProductDoc>) {
  products.forEach(product => {
    if (parseFloat(product.price) < minPrice) {
      throw new APIError(
        `Invalid product price. The minimum price is ${minPrice} UAH`,
        httpStatus.BAD_REQUEST
      );
    }

    const correctPhotos = product.photos.filter(p =>
      p.startsWith('https://storage.googleapis.com/temp-uploads.onova.co/')
    );

    if (correctPhotos.length < 1) {
      throw new APIError('Invalid photos', httpStatus.BAD_REQUEST);
    }
    // throw new APIError('asdf', httpStatus.BAD_REQUEST);
  });
}

function validateSeller(seller) {
  if (!seller) {
    throw new APIError('Seller not found', httpStatus.BAD_REQUEST);
  }
  if (seller.accountStatus !== 'verified') {
    throw new APIError(
      'Please verify your account before creating a drop',
      httpStatus.BAD_REQUEST
    );
  }
  if (
    !seller.shippingAddress.departmentNovaposhta ||
    !seller.shippingAddress.city
  ) {
    throw new APIError(
      'Please enter your shipping address info before creating a drop',
      httpStatus.BAD_REQUEST
    );
  }
  if (!seller.paymentInfo.method || !seller.paymentInfo.card_token) {
    throw new APIError(
      'Please enter your payment info before creating a drop',
      httpStatus.BAD_REQUEST
    );
  }
}

export default {
  load,
  create,
  remove,
  list,
  get,
  myFeed,
  // myFriendsFeed
  subscribe,
  unsubscribe,
};
