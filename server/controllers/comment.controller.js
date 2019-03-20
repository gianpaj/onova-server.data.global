// @flow

import httpStatus from 'http-status';
const debug = require('debug')('server-data:index');

import APIError from '../helpers/APIError';
import { User, UserDoc, Product, ProductDoc, CommentDoc } from '../models';
import notifCtrl from '../controllers/notification.controller';
import type { NotifPayload } from '../controllers/notification.controller';

const mentionsRegex = /@[a-zA-Z0-9\_\.]*/g;

// const i18n = {
//   newComment: 'new comment from %s',
//   newMention: '%s mentioned you',
// };

declare class session$Request extends express$Request {
  user: UserDoc;
  product: ProductDoc;
  body: {
    text: string,
  };
}

/**
 * Get product's comments
 *
 * GET /api/product/:uuid/comment
 *
 * @property {*} req - express session
 * @property {*} req.params - express session parameters
 * @property {MongoId} req.params.uuid
 */
function get(req: session$Request, res: express$Response) {
  // const { limit = 50, lastId } = req.query;
  // TODO: paginate inside list of comments` array using limit & lastId

  const { comments, uuid } = req.product;
  res.json({ data: { uuid, comments } });
}

/**
 * Create new comment and create notification for seller
 *
 * POST /api/product/:uuid/comment
 *
 * @property {*} req Express request
 * @property {*} req.params Express params parameters
 * @property {string} req.params.uuid The product uuid
 * @property {*} req.body Express body parameters
 * @property {string} req.body.text The text of the comment
 */
function create(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  if (req.user.accountStatus !== 'verified') {
    throw new APIError(
      'Please verify your account before commenting on a product.',
      httpStatus.BAD_REQUEST
    );
  }

  if (req.product.status !== 'forsale' && req.product.status !== 'reserved') {
    throw new APIError(
      'Comment cannot be added to a product that`s not forsale or reserved.',
      httpStatus.BAD_REQUEST
    );
  }

  let { text } = req.body;
  const rawText = text;

  if (text.indexOf('@') !== -1) {
    // find all username and add store comment with id
    // e.g `hello [@michel:5a78d09e2d314a702698f957] and [@anna:5a78d09e2d314a702698f958]`
    let usernames = text.match(mentionsRegex);
    usernames = [...new Set(usernames)];
    usernames = usernames.map(u => u.replace('@', ''));
    User.find({ username: { $in: usernames } })
      .then(users => {
        // $FlowFixMe
        usernames.forEach(u => {
          const userIndex = users.map(us => us.username).indexOf(u);
          const re = new RegExp(`@${u}`, 'g');
          if (userIndex == -1) {
            text = text.replace(re, `[@${u}:null]`);
          } else {
            text = text.replace(re, `[@${u}:${users[userIndex].id}]`);
          }
        });

        const userIds = users.map(us => us._id);

        saveComment(
          {
            text,
            rawText,
            userIds,
            user: req.user._id,
          },
          req,
          res,
          next
        );
      })
      .catch(err => {
        console.error(err);
      });
  } else {
    saveComment(
      {
        text: text,
        user: req.user._id,
      },
      req,
      res,
      next
    );
  }
}

function saveComment(comment, req, res, next) {
  Product.findOneAndUpdate(
    { _id: req.product.id },
    { $push: { comments: comment } },
    { new: true }
  )
    .then((product: ProductDoc) => {
      // $FlowFixMe
      const lastCommment: CommentDoc =
        product.comments[product.comments.length - 1];
      // $FlowFixMe
      const notif: NotifPayload = {
        data: {
          commentId: lastCommment._id,
          productUuid: req.product.uuid,
          senderName: req.user.username,
          text: req.body.text,
        },
        notifI18n: 'commented',
        targetUser: req.product.seller._id,
        triggeredBy: req.product._id,
        triggeredType: 'Product',
        onlyPush: false,
        sourceUser: req.user,
      };

      // if comment does not contain @mentions
      if (req.body.text.indexOf('@') == -1) {
        // only create a new notification if the comment is not by the seller
        if (product.seller.toString() !== req.user._id.toString()) {
          notifCtrl
            .createNotification(notif)
            .then(() => {
              debug('comment notification created');
            })
            .catch(err => {
              console.error(err);
            });
        }
      } else {
        if (comment.userIds) {
          // TODO: map and parallelise Promises
          comment.userIds.forEach(userId => {
            if (userId == req.user._id.toString()) return;
            // $FlowFixMe
            const notifForMention: NotifPayload = {
              data: {
                commentId: lastCommment._id,
                productUuid: req.product.uuid,
                senderName: req.user.username,
                text: comment.rawText,
              },
              notifI18n: 'mentioned you',
              targetUser: userId,
              triggeredBy: req.product._id,
              triggeredType: 'Product',
              onlyPush: false,
              sourceUser: req.user,
            };
            notifCtrl
              .createNotification(notifForMention)
              .then(() => {
                debug('comment mention notification created');
              })
              .catch(err => {
                console.error(err);
              });
          });
        }
      }
      // if (config.env == 'prod') {
      //   mixpanel.track('new_comment', props);
      // }
      return res
        .status(httpStatus.CREATED)
        .json({ data: { comment: lastCommment, uuid: product.uuid } });
    })
    .catch(err => {
      return next(err);
    });
}

/**
 * Delete a product comment (require authorization)
 *
 * DELETE /api/product/:uuid/comment/:commentId
 *
 * @property {*} req Express request
 * @property {*} req.params Express params parameters
 * @property {string} req.params.uuid The product uuid
 * @property {string} req.params.commentId
 */
function remove(
  req: session$Request,
  res: express$Response,
  next: express$NextFunction
) {
  const { product } = req;

  // $FlowFixMe
  const comment: CommentDoc = product.comments.find(
    c => c._id == req.params.commentId
  );

  if (comment === undefined) {
    const APIerr = new APIError(
      'Comment not found on specific product.',
      httpStatus.NOT_FOUND
    );
    return next(APIerr);
  }

  if (req.user._id.toString() !== comment.user._id.toString()) {
    const APIerr = new APIError(
      'Cannot delete other people`s comment',
      httpStatus.BAD_REQUEST
    );
    return next(APIerr);
  }

  Product.findOneAndUpdate(
    { _id: req.product.id },
    { $pull: { comments: comment } },
    { new: true }
  )
    .then((product: ProductDoc) => {
      // only try to delete a new notification when the comment is not from the seller
      if (product.seller.toString() !== req.user._id.toString()) {
        notifCtrl
          .removeNotification('Comment', comment._id)
          .then(() => {
            debug('comment notification delete');
          })
          .catch(err => {
            console.error(err);
          });
      }
      return res.json({
        data: { length: product.comments.length, uuid: product.uuid },
      });
    })
    .catch(err => {
      return next(err);
    });
}

export default {
  get,
  create,
  remove,
};
