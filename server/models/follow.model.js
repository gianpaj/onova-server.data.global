// @flow

import mongoose from 'mongoose';
import httpStatus from 'http-status';
// import stream from 'getstream-node';

import APIError from '../helpers/APIError';
import { User } from '../models';

const { Schema } = mongoose;
// const FeedManager = stream.FeedManager;

/** @namespace */
const FollowSchema = new Schema({
  follower: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  following: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  dateCreated: {
    type: Date,
    default: Date.now,
    required: true,
  },
  status: {
    type: Number,
    enum: [-1], // eg. 0 = pending, 1 = accepted, 2 = declined,
  },
});

export class FollowDoc /*:: extends Mongoose$Document */ {
  follower: MongoId;
  following: MongoId;
  dateCreated: Date;
}

FollowSchema.loadClass(FollowDoc);

/**
 * Statics
 */
FollowSchema.statics = {
  /**
   * List of follow documents in descending order of 'createdAt' timestamp.
   *
   * @param {Object} query Express query parameters
   * @param {Object} DBquery DB Query parameters (to find followers/followings)
   * @param {number} query.skip Number of follow docs to be skipped
   * @param {number} query.limit Limit number of follow docs to be returned
   */
  list({ DBquery, skip = 0, limit = 50 }): Promise<FollowDoc[] | APIError> {
    const queryingForFollowing = DBquery.hasOwnProperty('following');

    const populateField = queryingForFollowing ? 'follower' : 'following';

    // if (queryingForFollowing) {
    //   DBquery = { ...DBquery, follower: { $ne: me } };
    // } else {
    //   DBquery = { ...DBquery, following: { $ne: me } };
    // }

    return this.find(DBquery)
      .sort({ createdAt: -1 })
      .skip(+skip)
      .limit(+limit)
      .populate({
        path: populateField,
        select: 'username profilePic',
      })
      .then((follows: Array<FollowDoc>) => {
        if (!follows) {
          return Promise.reject();
        }
        return follows;
      })
      .catch(() => {
        const err = new APIError('Invalid follows', httpStatus.BAD_REQUEST);
        return Promise.reject(err);
      });
  },
};

FollowSchema.post('save', function(error: Error, doc, next) {
  if (error.code === 11000) {
    const APIerr = new APIError(
      'Duplicate follower<->following',
      httpStatus.BAD_REQUEST
    );
    return next(APIerr);
  }
  next(error);
});

FollowSchema.post('save', function(doc, next) {
  User.updateOne({ _id: doc.follower }, { $inc: { followingCount: 1 } }).exec();
  // eslint-disable-next-line
  User.updateOne({ _id: doc.following }, { $inc: { followersCount: 1 } }).exec();
  // FeedManager.followUser(doc.follower, doc.following);
  next();
});

FollowSchema.post('remove', function(doc, next) {
  // eslint-disable-next-line
  User.updateOne({ _id: doc.follower }, { $inc: { followingCount: -1 } }).exec();
  // eslint-disable-next-line
  User.updateOne({ _id: doc.following }, { $inc: { followersCount: -1 } }).exec();
  // FeedManager.unfollowUser(doc.follower, doc.following);
  next();
});

// Never return these fields in the JSON representation
// This doesn't effect `toObject` method
FollowSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

FollowSchema.index({ follower: 1, status: 1 });
FollowSchema.index({ following: 1, status: 1 });
// FollowSchema.index({ follower: 1, dateCreated: 1 });
// FollowSchema.index({ following: 1, dateCreated: 1 });
FollowSchema.index({ follower: 1, following: 1 }, { unique: true });

// FollowSchema.plugin(stream.mongoose.activity);

// notify the user which is being followed
// FollowSchema.methods.activityNotify = function() {
//   const following_feed = FeedManager.getNotificationFeed(this.following._id);
//   return [following_feed];
// };

// FollowSchema.methods.activityActorProp = function() {
//   return 'follower';
// };

// // automatically populate paths during enrichment
// FollowSchema.statics.pathsToPopulate = function() {
//   return ['following'];
// };

// FollowSchema.methods.activityForeignId = function() {
//   return this.following._id + ':' + this.follower._id;
// };

export default mongoose.model('Follow', FollowSchema);
