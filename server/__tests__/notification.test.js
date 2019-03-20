// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

import { agenda } from '../config/express';
import config from '../config/config';

import app from '../index';

import { i18n } from '../controllers/order.controller';
import { i18n as i18nFollow } from '../controllers/follow.controller';
import { Order, Tag } from '../models';
import {
  beforeAllTests,
  createComment,
  createManyComments,
  createProduct,
  createUserAndLogin,
  createOrder,
  followUser,
} from './utils';
import { buyerPaidDeal } from '../helpers/shipping';

// This sets the mock adapter on the default instance
const mock = new MockAdapter(axios);

jest.setTimeout(10000);

/**
 * root level hooks
 */
afterAll(done => {
  // required because https://github.com/Automattic/mongoose/issues/1251#issuecomment-65793092
  mongoose.models = {};
  mongoose.modelSchemas = {};
  mongoose.connection.close();
  done();
});

// GET /api/users/notifications - should only return these fields
const notifFields = [
  'dateCreated',
  '_id',
  'data',
  'notifI18n',
  'sourceUser',
  'sourceUserType',
  'targetUser',
  'triggeredBy',
  'triggeredType',
];

let user = {
  username: 'firstperson',
  emailAddress: 'gianpa+test@gmail.com',
  password: 'expressos',
};

let anotherUser = {
  username: 'anotherperson',
  emailAddress: 'gianpa+test2@gmail.com',
  password: 'express2',
};

const product = {
  categoryIds: [1, 2, 3],
  typeIds: [1, 2, 3],
  tags: ['winter', 'spring2007'], // optional
  description: 'nice boots',
  // seller comes after the user is created
  price: '1010.99', // if no decimal points .00 will be added
  photos: [
    'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
  ],
};

let anotherProduct = {
  categoryIds: [1],
  typeIds: [1, 3],
  description: 'nice jacket',
  price: '230.99',
  photos: [
    'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
  ],
};

let userId;
let anotherUserId;
let productUuid;
let productId;
let anotherProductId;
let anotherProductUuid;
let firstJwtToken;
let anotherJwtToken;
let lastNotifId;
let numberOfNotifForAnotherUser = 0;
let numberOfNotifForFirstUser = 0;

describe('## Notification APIs', () => {
  beforeAll(beforeAllTests);

  // create 2 users/sellers + 2 products
  beforeAll(done => {
    createUserAndLogin(user)
      .then(({ user, jwtToken }) => {
        userId = user._id;
        firstJwtToken = jwtToken;
      })
      .then(() => {
        return Tag.create([{ _id: 'winter' }, { _id: 'summer' }]).then();
      })
      .then(() => {
        return createUserAndLogin(anotherUser).then(({ user, jwtToken }) => {
          anotherUserId = user._id;
          anotherJwtToken = jwtToken;
        });
      })
      .then(async () => {
        const p1 = await createProduct(product, firstJwtToken);
        expect(p1.description).toBe(product.description);
        productUuid = p1.uuid;
        productId = p1._id;
      })
      .then(async () => {
        const p2 = await createProduct(anotherProduct, anotherJwtToken);
        expect(p2.description).toBe(anotherProduct.description);
        anotherProductUuid = p2.uuid;
        anotherProductId = p2._id;
        done();
      });
  });

  describe('# GET /api/users/notifications', () => {
    // create comments
    beforeAll(async () => {
      const c1 = await createComment(
        { text: 'first!' },
        anotherProductUuid,
        firstJwtToken
      );
      expect(c1.uuid).toBe(anotherProductUuid);
      numberOfNotifForAnotherUser++;
      const c2 = await createComment(
        { text: 'thanks dude!' },
        anotherProductUuid,
        anotherJwtToken
      );
      expect(c2.uuid).toBe(anotherProductUuid);
      await createManyComments(40, productUuid, anotherJwtToken);
      numberOfNotifForFirstUser += 40;
    });

    it('should get anotherUser`s notifications', async () => {
      return request(app)
        .get('/api/users/notifications')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(Object.keys(data[0]).sort()).toEqual(notifFields.sort());
          expect(data[0].triggeredBy._id).toBe(anotherProductId);
          expect(data[0].sourceUser._id).toBe(userId);
          expect(data[0].notifI18n).toBe('commented');
          expect(data).toHaveLength(numberOfNotifForAnotherUser);
        });
    });

    it('should get my notifications', async () => {
      return request(app)
        .get('/api/users/notifications')
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(Object.keys(data[0]).sort()).toEqual(notifFields.sort());
          expect(data[0].triggeredBy._id).toBe(productId);
          expect(data[0].notifI18n).toBe('commented');
          expect(data).toHaveLength(numberOfNotifForFirstUser);
        });
    });

    it('should get my first 20 notifications', async () => {
      return request(app)
        .get('/api/users/notifications?limit=20')
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          lastNotifId = data[19]._id;
          expect(data[0].triggeredBy._id).toBe(productId);
          expect(data[0].notifI18n).toBe('commented');
          expect(data).toHaveLength(20);
        });
    });

    it('should load more notifications', async () => {
      return request(app)
        .get(`/api/users/notifications?lastId=${lastNotifId}`)
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0].triggeredBy._id).toBe(productId);
          expect(data).toHaveLength(20);
        });
    });

    it('should not load more notifications with a missing lastId', async () => {
      return request(app)
        .get(`/api/users/notifications?lastId=5ff8ef0e9147a8bd32ea35f6`)
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.NOT_FOUND)
        .then(res => {
          expect(res.body.message).toContain('Notification not found');
        });
    });

    it('should not get notifications without authorization', async () => {
      return request(app)
        .get('/api/users/notifications')
        .set('Authorization', 'asdf')
        .expect(httpStatus.UNAUTHORIZED);
    });

    it('should not create a new notification when a comment is inserted by the seller', async () => {
      return request(app)
        .get('/api/users/notifications')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(Object.keys(data[0]).sort()).toEqual(notifFields.sort());
          expect(data[0].triggeredBy._id).toBe(anotherProductId);
          expect(data[0].notifI18n).toBe('commented');
          expect(data).toHaveLength(1);
        });
    });
  });

  describe('# DELETE /api/products/:uuid/comment/:commentId', () => {
    let commentIdSecond;

    beforeAll(async () => {
      const data = await createComment(
        { text: 'love the boots' },
        anotherProductUuid,
        firstJwtToken
      );
      commentIdSecond = data.comment._id;

      return request(app)
        .delete(
          `/api/products/${anotherProductUuid}/comment/${commentIdSecond}`
        )
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data.uuid).toBe(anotherProductUuid);
          expect(data.length).toBe(2);
        });
    });

    it('should not get the deleted comment notification', async () => {
      return request(app)
        .get('/api/users/notifications')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0].triggeredBy._id).toBe(anotherProductId);
          expect(data).toHaveLength(1);
        });
    });
  });

  describe('# Follow and Notify', () => {
    // firstUser --follows--> anotherUser
    beforeAll(async done => {
      await followUser(firstJwtToken, anotherUserId);

      // Check a Follow push notification has been scheduled
      setTimeout(() => {
        agenda.jobs({ name: config.JOBNAMES.PUSH_FOLLOW }, (err, jobs) => {
          if (err) return done(err);
          expect(jobs).toHaveLength(1);
          const { data } = jobs.map(j => j.attrs)[0];
          expect(data.senderName).toBe(user.username);
          expect(data.targetUser.toString()).toBe(anotherUserId);
          expect(data.triggeredBy.toString()).toBe(userId);
          expect(data.triggeredType).toBe('User');
          expect(typeof data.random).toBe('string');
          done();
        });
      }, 10);

      numberOfNotifForAnotherUser++;
    });

    it('should create a notification for the person being followed', async () => {
      return request(app)
        .get('/api/users/notifications')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0].triggeredBy._id).toBe(userId);
          expect(data[0].notifI18n).toBe(i18nFollow.newFollower);
          expect(data).toHaveLength(numberOfNotifForAnotherUser);
        });
    });
  });

  describe('# Create an order and Notify cancellation', () => {
    let orderId;
    beforeAll(async () => {
      // anotherUser -- orders -> productUuid from firstUser
      const o = await createOrder(
        { ...product, uuid: productUuid },
        anotherJwtToken
      );
      orderId = o.id;
      expect(o.status).toBe('pending');
      expect(o.priceOfItem).toBe(product.price);
    });

    it('a new order notification should have **not** have been created', () => {
      return request(app)
        .get('/api/users/notifications')
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(numberOfNotifForFirstUser);
        });
    });

    describe('# Seller (firstUser) cancels an order and Notify the buyer (anotherUser)', () => {
      beforeAll(done => {
        return request(app)
          .put(`/api/orders/${orderId}`)
          .set('Authorization', firstJwtToken)
          .send({ status: 'cancelled', reason: 'changed my mind' })
          .expect(httpStatus.OK)
          .then(res => {
            const o = res.body.data;
            expect(o.priceOfItem).toBe(product.price);
            expect(o.status).toBe('cancelled');
            numberOfNotifForAnotherUser++;

            // Check an Order push notification has been scheduled
            setTimeout(() => {
              agenda.jobs({ name: config.JOBNAMES.PUSH_ORDER }, (err, jobs) => {
                if (err) return done(err);
                expect(jobs).toHaveLength(1);
                const { data } = jobs.map(j => j.attrs)[0];
                expect(data.targetUser.toString()).toBe(anotherUserId);
                expect(data.triggeredBy.toString()).toBe(orderId);
                expect(data.triggeredType).toBe('Order');
                expect(data.message).toBe(i18n.orderCancelled);
                expect(typeof data.random).toBe('string');
                done();
              });
            }, 10);
          });
      });

      it('a cancellation order notification should have been created to the buyer', async () => {
        return request(app)
          .get('/api/users/notifications')
          .set('Authorization', anotherJwtToken)
          .expect(httpStatus.OK)
          .then(res => {
            const { data } = res.body;
            expect(data[0].triggeredBy.id).toBe(orderId);
            expect(data[0].notifI18n).toBe(i18n.orderCancelled);
            expect(data).toHaveLength(numberOfNotifForAnotherUser);
          });
      });
    });
  });

  describe('# Create an order and Notify seller of payment by buyer', () => {
    let orderId, productUuid;
    beforeAll(async () => {
      const p2 = await createProduct(anotherProduct, firstJwtToken);
      expect(p2.description).toBe(anotherProduct.description);
      productUuid = p2.uuid;
      // anotherUser -- orders -> productUuid from firstUser
      const o = await createOrder(
        { ...anotherProduct, uuid: productUuid },
        anotherJwtToken
      );
      orderId = o.id;
      expect(o.status).toBe('pending');
      expect(o.priceOfItem).toBe(anotherProduct.price);
    });

    test('a new order notification should have NOT have been created', () => {
      return request(app)
        .get('/api/users/notifications')
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(numberOfNotifForFirstUser);
        });
    });

    describe('# Buyer (anotherUser) pays an order and Notify the buyer (anotherUser)', () => {
      beforeAll(async done => {
        // fake payment creation
        await Order.updateOne({ _id: orderId }, { transactionId: '9B27M6E' });

        mock.onGet(`/deals/9B27M6E`).reply(200, buyerPaidDeal);
        request(app)
          .get(`/api/orders/${orderId}/paymentStatus`)
          .set('Authorization', anotherJwtToken)
          .expect(httpStatus.OK)
          .then(({ body }) => {
            expect(body.data.status).toBe('ua-finished');
            expect(body.data.rawStatus).toBe('FINISHED');
            numberOfNotifForFirstUser++;

            // Check an Order status update to the seller push notification has been scheduled
            setTimeout(() => {
              agenda.jobs({ name: config.JOBNAMES.PUSH_ORDER }, (err, jobs) => {
                if (err) return done(err);
                expect(jobs).toHaveLength(2);
                const { data } = jobs.map(j => j.attrs)[1];
                expect(data.targetUser.toString()).toBe(userId);
                expect(data.triggeredBy.toString()).toBe(orderId);
                expect(data.triggeredType).toBe('Order');
                expect(data.message).toContain(i18n.orderPaid);
                expect(typeof data.random).toBe('string');
                done();
              });
            }, 500);
          });
      });

      test('an order notification should have been created to the seller', () => {
        return request(app)
          .get('/api/users/notifications')
          .set('Authorization', firstJwtToken)
          .expect(httpStatus.OK)
          .then(res => {
            const { data } = res.body;
            expect(data[0].triggeredBy.id).toBe(orderId);
            expect(data[0].notifI18n).toContain(i18n.orderPaid);
            expect(data).toHaveLength(numberOfNotifForFirstUser);
          });
      });
    });

    describe('# Buyer (anotherUser) pays an order and Notify the buyer (anotherUser) 2', () => {
      beforeAll(async () => {
        // fake payment creation
        await Order.updateOne({ _id: orderId }, { transactionId: '9B27M6E' });

        mock.onGet(`/deals/9B27M6E`).reply(200, buyerPaidDeal);
        return request(app)
          .get(`/api/orders/${orderId}/paymentStatus`)
          .set('Authorization', anotherJwtToken)
          .expect(httpStatus.OK)
          .then(({ body }) => {
            expect(body.data.status).toBe('ua-finished');
            expect(body.data.rawStatus).toBe('FINISHED');
          });
      });

      it('should not create a duplicate order notification to the seller', done => {
        setTimeout(() => {
          request(app)
            .get('/api/users/notifications')
            .set('Authorization', firstJwtToken)
            .expect(httpStatus.OK)
            .then(res => {
              const { data } = res.body;
              const notifs = data.filter(
                n => n.notifI18n !== i18n.orderPaidReminder
              );
              expect(notifs[0].notifI18n).toContain(i18n.orderPaid);
              expect(notifs).toHaveLength(numberOfNotifForFirstUser);
              done();
            });
        }, 500);
      });
    });
  });

  describe('# Comment with @mentions', () => {
    // create comments
    beforeAll(async () => {
      const c1 = await createComment(
        { text: 'check this out @anotherperson' },
        productUuid,
        firstJwtToken
      );
      numberOfNotifForAnotherUser++;
      expect(c1.uuid).toBe(productUuid);
      const c3 = await createComment(
        { text: '@anotherperson oops thats`s me!' },
        anotherProductUuid,
        anotherJwtToken
      );
      expect(c3.uuid).toBe(anotherProductUuid);
      const c2 = await createComment(
        { text: '@firstperson thanks dude!' },
        anotherProductUuid,
        anotherJwtToken
      );
      numberOfNotifForFirstUser++;
      expect(c2.uuid).toBe(anotherProductUuid);
      const c4 = await createComment(
        { text: '@hacker thanks dude!' },
        anotherProductUuid,
        anotherJwtToken
      );
      expect(c4.uuid).toBe(anotherProductUuid);
      const c5 = await createComment(
        { text: '@firstperson @firstperson thanks a million' },
        anotherProductUuid,
        anotherJwtToken
      );
      numberOfNotifForFirstUser++;
      expect(c5.uuid).toBe(anotherProductUuid);

      setTimeout(() => {
        agenda.jobs({ name: config.JOBNAMES.PUSH_COMMENT }, (err, jobs) => {
          if (err) throw new Error(err);
          // FIXME: why are the counts need to be incremented and decreased. count for wrong user?
          expect(jobs).toHaveLength(numberOfNotifForFirstUser + 2);

          // get the second comment in order of time for the FirstUser
          const { data } = jobs.map(j => j.attrs)[
            numberOfNotifForFirstUser - 1
          ];
          expect(data.message).toBe('check this out @anotherperson');
          expect(data.hasOwnProperty('platform')).toBe(true);
          expect(data.productUuid).toBe(productUuid);
          expect(data.hasOwnProperty('pushToken')).toBe(true);
          expect(typeof data.random).toBe('string');
          expect(data.senderName).toBe(user.username);
          expect(data.targetUser.toString()).toBe(anotherUserId);
          expect(data.triggeredBy.toString()).toBe(productId);
          expect(data.triggeredType).toBe('Product');
        });
      }, 10);
    });

    it('should get my @anotheruser`s notifications', async () => {
      return request(app)
        .get('/api/users/notifications')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0].data.text).toBe('check this out @anotherperson');
          expect(data[0].triggeredBy._id).toBe(productId);
          expect(data[0].notifI18n).toBe('mentioned you');
          expect(data).toHaveLength(numberOfNotifForAnotherUser);
        });
    });

    it('should get my @firstperson`s notifications excluding mine', async () => {
      return request(app)
        .get('/api/users/notifications')
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[1].data.text).toBe('@firstperson thanks dude!');
          expect(data[1].triggeredBy._id).toBe(anotherProductId);
          expect(data[1].notifI18n).toBe('mentioned you');
          const comment = data.find(
            c => c.data.text == '@anotherperson oops thats`s me!'
          );
          expect(comment).toBeUndefined();
          expect(data[0].data.text).not.toContain('oops thats');
          expect(data).toHaveLength(numberOfNotifForFirstUser + 1);
        });
    });
  });
});
