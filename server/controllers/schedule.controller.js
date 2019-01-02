// @flow

import shortid from 'shortid';
import httpStatus from 'http-status';
import differenceInCalendarDays from 'date-fns/difference_in_calendar_days';
import path from 'path';
const geocoder = require('offline-geocoder')({
  database: path.join(__dirname, '../../db.sqlite'),
});

import { agenda } from '../config/express';
import config from '../config/config';
import APIError from '../helpers/APIError';
import photos from '../helpers/photos';
import { Product, ProductDoc, Tag, TagDoc, User, UserDoc } from '../models';

export const i18n = {
  // listedDrop: 'Your drop has been posted',
  listedDrop: 'Ваш Дроп виставлено на продаж',
};

declare class session$Request extends express$Request {
  user: UserDoc;
  product: ProductDoc;
  body: {
    categoryIds: string,
    date: Date,
    description: string,
    dropId: MongoId,
    price: string,
    typeIds: string,
    tags: Array<TagDoc>,
    photos: Array<string>,
    // socials: Array<string>,
    latitude: number,
    longitude: number,
  };
}

const { minPrice } = config.settings;

/**
 * Schedule a new listing with a specific dropId
 *
 * POST /api/schedule
 *
 * @property {*} req - Express request
 * @property {*} req.body - Express body parameters
 * @property {Array<number>} req.body.categoryIds
 * @property {string=} [req.body.currency='UAH']
 * @property {string} req.body.date
 * @property {string} req.body.description
 * @property {MongoId} req.body.dropId
 * @property {number=} req.body.latitude
 * @property {number=} req.body.longitude
 * @property {Array<string>=} req.body.photos
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

  if (differenceInCalendarDays(body.date, Date.now()) > 90) {
    const APIerr = new APIError(
      'Cannot schedule listings after 90 days from today',
      400
    );
    return next(APIerr);
  }

  const product = new Product({
    categoryIds: body.categoryIds,
    // currency: body.currency,
    description: body.description,
    dropId: body.dropId,
    price: parseFloat(body.price).toFixed(2),
    // status: body.status, // 'forsale' by default
    tags: body.tags,
    typeIds: body.typeIds,
    uuid: shortid.generate(), // needed here for photos' filenames
    createdAt: new Date(body.date),
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
          'Please verify your account before scheduling a drop',
          400
        );
      }
      if (
        !seller.shippingAddress.departmentNovaposhta ||
        !seller.shippingAddress.city
      ) {
        throw new APIError(
          'Please enter your shipping address info before scheduling a drop',
          400
        );
      }
      if (!seller.paymentInfo.method || !seller.paymentInfo.card_token) {
        throw new APIError(
          'Please enter your payment info before scheduling a drop',
          400
        );
      }

      // if (body.socials.indexOf('fb') > -1 && !seller.facebook) {
      //   throw new APIError('Please authorize with Facebook', httpStatus.BAD_REQUEST);
      // }

      product.seller = req.user._id;

      const correctPhotos = body.photos.filter(p =>
        p.startsWith('https://storage.googleapis.com/temp-uploads.onova.co/')
      );

      if (correctPhotos.length < 1) {
        throw new APIError('Invalid photos', httpStatus.BAD_REQUEST);
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

      const jobData = {
        // socials: body.socials,
        product,
      };

      return agenda.schedule(
        body.date,
        config.JOBNAMES.SCHEDULE,
        jobData,
        err => {
          if (err) throw new APIError(`Error scheduling a listing: ${err}`);
        }
      );
    })
    .then(savedListing =>
      res.status(httpStatus.CREATED).json({ data: savedListing })
    )
    .catch(e => next(e));
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

/**
 * List a user's scheduled listing, i.e. drops
 *
 * GET /api/schedule
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
  let userId = req.user._id;
  if (req.query.username) {
    try {
      const user = await User.findOne({ username: req.query.username });
      if (!user) {
        const e = new APIError('User not found', httpStatus.NOT_FOUND);
        return next(e);
      }
      userId = user._id;
    } catch (error) {
      console.error(error);
      const e = new APIError(
        'Error getting scheduled listing',
        httpStatus.SERVICE_UNAVAILABLE
      );
      return next(e);
    }
  }

  const now = new Date();

  agenda.jobs(
    {
      name: config.JOBNAMES.SCHEDULE,
      'data.product.seller': userId,
      $or: [
        // scheduled
        {
          nextRunAt: { $gte: now },
        },
        // queued
        {
          nextRunAt: { $lte: now },
          $expr: {
            $gte: ['$nextRunAt', '$lastFinishedAt'],
          },
        },
      ],
    },
    (err, jobs: Array<any>) => {
      if (err) {
        const e = new APIError(
          'Error getting scheduled listing',
          httpStatus.SERVICE_UNAVAILABLE
        );
        return next(e);
      }

      const scheduled = jobs.map(job => ({
        lastFinishedAt: job.attrs.lastFinishedAt
          ? job.attrs.lastFinishedAt
          : null,
        nextRunAt: job.attrs.nextRunAt,
        ...job.attrs.data.product,
      }));

      // group jobs by dropId
      // e.g. {'5c10f4a56c72b954bd942d92': [{}, {}]}
      // inspired by https://stackoverflow.com/a/47385953/728287
      const result = scheduled.reduce(
        (accumulator, currentValue) => ({
          ...accumulator,
          [currentValue.dropId]: (
            accumulator[currentValue.dropId] || []
          ).concat(currentValue),
        }),
        {}
      );

      res.json({ data: result });
    }
  );
}

export default {
  list,
  create,
};
