// @flow

import httpStatus from 'http-status';
import mongoose from 'mongoose';

import APIError from '../helpers/APIError';
import { Follow, FollowDoc, Product, UserDoc } from '../models';

declare class session$Request extends express$Request {
  user: UserDoc;
}

/**
 * Get list of products based on the sellers you follow
 *
 * GET /api/feed/flat
 *
 * @property {*} req - Express request
 * @property {*} req.query - Express query parameters
 * @property {Array<number>=} req.query.categoryIds
 * @property {Array<string>=} req.query.tag - limited to single tag
 * @property {Array<number>=} req.query.typeIds
 * @property {MongoId} req.query.lastId (not uuid)
 * @property {number} req.query.limit Limit number of products to be returned.
 */
function flat(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { limit = 50, lastId, categoryIds, tag, typeIds } = req.query;

  Follow.find({
    follower: req.user._id,
    status: { $ne: -1 },
  })
    .limit(1000)
    .then(async (following: Array<FollowDoc>) => {
      if (!following.length) return res.json({ data: [] });

      const followingIDs = following.map(f => f.following);

      let blockedByIDs = [];
      const blockedBy = await Follow.find({
        follower: req.user._id,
        status: -1,
      });
      if (blockedBy) blockedByIDs = blockedBy.map(f => f.following);

      let DBqueryInclusive = {
        status: 'forsale',
        seller: { $in: followingIDs },
      };
      let DBqueryExclusive = {
        status: 'forsale',
        seller: { $nin: [...followingIDs, ...blockedByIDs] },
      };

      if (typeIds) {
        DBqueryInclusive = { ...DBqueryInclusive, typeIds: { $in: typeIds } };
        DBqueryExclusive = { ...DBqueryExclusive, typeIds: { $in: typeIds } };
      }
      if (categoryIds) {
        DBqueryInclusive = {
          ...DBqueryInclusive,
          categoryIds: { $in: categoryIds },
        };
        DBqueryExclusive = {
          ...DBqueryExclusive,
          categoryIds: { $in: categoryIds },
        };
      }
      if (tag) {
        DBqueryInclusive = { ...DBqueryInclusive, tags: tag };
        DBqueryExclusive = { ...DBqueryExclusive, tags: tag };
      }

      // for pagination - results are excluding the lastId
      if (lastId) {
        DBqueryInclusive = {
          ...DBqueryInclusive,
          _id: { $lt: new mongoose.Types.ObjectId(lastId) },
        };
        DBqueryExclusive = {
          ...DBqueryExclusive,
          _id: { $lt: new mongoose.Types.ObjectId(lastId) },
        };

        const lastIdProd = await Product.findById(lastId);
        if (!lastIdProd) {
          throw new APIError('Product not found.', httpStatus.NOT_FOUND);
        }
      }

      let sellerTypes = req.user.types;
      if (req.user.types.includes('admin')) {
        sellerTypes = ['reseller', 'designer', 'admin'];
      }

      const products = await Promise.all([
        Product.list({ query: DBqueryInclusive, limit, sellerTypes }),
        Product.list({ query: DBqueryExclusive, limit, sellerTypes }),
      ]);

      return res.json({
        data: [].concat.apply([], products).slice(0, +limit),
      });
    })
    .catch(e => next(e));
}

// const StreamMongoose = stream.mongoose;
// const StreamBackend = new StreamMongoose.Backend();

// const enrichActivities = function(body) {
//   return StreamBackend.enrichActivities(body.results);
// };

// const enrichAggregatedActivities = function(body) {
//   return StreamBackend.enrichAggregatedActivities(body.results);
// };

// router.get('/flat', ensureAuthenticated, function(req, res, next) {
//   const flatFeed = FeedManager.getNewsFeeds(req.user.id)['timeline'];

//   flatFeed
//     .get({})
//     .then(enrichActivities)
//     .then(function(enrichedActivities) {
//       res.render('feed', {
//         location: 'feed',
//         user: req.user,
//         activities: enrichedActivities,
//         path: req.url,
//       });
//     })
//     .catch(next);
// });

// router.get('/aggregated_feed', ensureAuthenticated, function(req, res, next) {
//   const aggregatedFeed = FeedManager.getNewsFeeds(req.user.id)[
//     'timeline_aggregated'
//   ];

//   aggregatedFeed
//     .get({})
//     .then(enrichAggregatedActivities)
//     .then(function(enrichedActivities) {
//       res.render('aggregated_feed', {
//         location: 'aggregated_feed',
//         user: req.user,
//         activities: enrichedActivities,
//         path: req.url,
//       });
//     })
//     .catch(next);
// });

// router.get('/notification_feed/', ensureAuthenticated, function(
//   req,
//   res,
//   next
// ) {
//   const notificationFeed = FeedManager.getNotificationFeed(req.user.id);

//   notificationFeed
//     .get({ mark_read: true, mark_seen: true })
//     .then(body => {
//       const activities = body.results;
//       if (activities.length == 0) {
//         return res.send('');
//       }
//       req.user.unseen = 0;
//       return StreamBackend.enrichActivities(activities[0].activities);
//     })
//     .then(enrichedActivities => {
//       res.render('notification_follow', {
//         lastFollower: enrichedActivities[0],
//         count: enrichedActivities.length,
//         layout: false,
//       });
//     })
//     .catch(next);
// });

export default { flat };
