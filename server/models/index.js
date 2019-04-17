import Block, { BlockDoc } from './block.model';
import DefaultFollow, { DefaultFollowDoc } from './defaultFollow.model';
import Drop, { DropDoc } from './drop.model';
import Cities from './cities.model';
import Departments from './departments.model';
import DiscardedUser, { DiscardedUserDoc } from './discardedUser.model';
import Follow, { FollowDoc } from './follow.model';
// import Like from './like.model';
import Notification, { NotificationDoc } from './notification.model';
import Order, { OrderDoc } from './order.model';
import Product, { ProductDoc, CommentDoc } from './product.model';
import Report, { ReportDoc } from './report.model';
import Review, { ReviewDoc } from './review.model';
import SuggestedUsers, { SuggestedUsersDoc } from './suggestedUsers.model';
import Tag, { TagDoc } from './tag.model';
import User, { UserDoc } from './user.model';
import UserWeb, { UserWebDoc } from './userWeb.model';
import Verification, { VerificationDoc } from './verification.model';

const userPopulateFields =
  'username accountStatus profilePic displayName shippingAddress types';

const productPopulateFields = 'currency photoURIs price status uuid';

Block.syncIndexes();
DefaultFollow.syncIndexes();
Follow.syncIndexes();
Notification.syncIndexes();
Product.syncIndexes();
Report.syncIndexes();
Review.syncIndexes();
Tag.syncIndexes();
User.syncIndexes();
Verification.syncIndexes();

export {
  Block,
  BlockDoc,
  Drop,
  DropDoc,
  Cities,
  CommentDoc,
  Departments,
  DefaultFollow,
  DefaultFollowDoc,
  DiscardedUser,
  DiscardedUserDoc,
  Follow,
  FollowDoc,
  // Like,
  Notification,
  NotificationDoc,
  Order,
  OrderDoc,
  Product,
  ProductDoc,
  productPopulateFields,
  Report,
  ReportDoc,
  Review,
  ReviewDoc,
  SuggestedUsers,
  SuggestedUsersDoc,
  Tag,
  TagDoc,
  User,
  UserDoc,
  UserWeb,
  UserWebDoc,
  userPopulateFields,
  Verification,
  VerificationDoc,
};
