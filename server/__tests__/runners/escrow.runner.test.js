// @flow

import httpStatus from 'http-status';
import request from 'supertest';

import { agenda } from '../../config/express';
import config from '../../config/config';

import app from '../../index';

import { i18n } from '../../controllers/order.controller';
import { Order, Product } from '../../models';

import {
  beforeAllTests,
  clearJobs,
  closeDBConnection,
  createOrder,
  createProduct,
  createUserAndLogin,
  mock,
  payOrder,
} from '../utils';
import { buyerNeedsToPay, buyerPaymentFailure, sellerCancelsAPaidDeal } from '../../helpers/shipping';

const photos = {
  photos: ['https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg'],
};

jest.setTimeout(10000);

describe('## Escrow Manager', () => {
  beforeAll(beforeAllTests);

  let user1 = {
    username: 'userone',
    emailAddress: 'userone@gmail.com',
    password: 'expressos',
  };

  let user2 = {
    username: 'usertwo',
    emailAddress: 'usertwo@gmail.com',
    password: 'expressos',
  };

  let user3 = {
    username: 'userthree',
    emailAddress: 'userthree@gmail.com',
    password: 'expressos',
  };

  let productA = {
    categoryIds: [1, 2, 3],
    typeIds: [1, 2, 3],
    description: 'A - nice boots',
    price: '190.99',
    ...photos,
  };

  let user1ProductUuidA, user1ProductUuidA2;
  let user1JwtToken, user2JwtToken, user3JwtToken;

  // create 3 users
  beforeAll(async () => {
    try {
      const { user: u1, jwtToken: j1 } = await createUserAndLogin(user1);
      user1JwtToken = j1;
      user1._id = u1._id;
      const { user: u2, jwtToken: j2 } = await createUserAndLogin(user2);
      user2JwtToken = j2;
      user2._id = u2._id;
      const { user: u3, jwtToken: j3 } = await createUserAndLogin(user3);
      user3JwtToken = j3;
      user3._id = u3._id;
    } catch (error) {
      console.error(error);
    }
  });

  describe('Product reservation and order cancellation', () => {
    // clear Product and Orders
    // create 2 products
    beforeEach(async () => {
      await Product.collection.deleteMany({}, { safe: true });
      await Order.collection.deleteMany({}, { safe: true });
      await clearJobs();
      try {
        const p1 = await createProduct(productA, user1JwtToken);
        user1ProductUuidA = p1.uuid;
        const p2 = await createProduct(productA, user1JwtToken);
        user1ProductUuidA2 = p2.uuid;
      } catch (error) {
        console.error(error);
      }
    });

    afterEach(() => closeDBConnection());

    it('should reserve a product and put back forsale', async done => {
      try {
        const o = await createOrder({ ...productA, uuid: user1ProductUuidA }, user2JwtToken);
        const o2 = await createOrder({ ...productA, uuid: user1ProductUuidA2 }, user2JwtToken);

        const { body } = await request(app)
          .post('/api/orders')
          .set('Authorization', user3JwtToken)
          .send({ product: user1ProductUuidA })
          .expect(httpStatus.BAD_REQUEST);

        // put the 2nd order 10 minutes back
        await Order.updateOne({ _id: o2.id }, { $set: { datePending: new Date(Date.now() - 10 * 60 * 1000) } });

        expect(body.message).toBe('This product is not longer for sale or is reserved.');

        const { body: product } = await request(app)
          .get(`/api/products/${user1ProductUuidA}`)
          .set('Authorization', user3JwtToken)
          .expect(httpStatus.OK);

        expect(product.data.status).toBe('reserved');

        const waitFor = 15 * 1000; // seconds
        const interval = Math.floor(waitFor / 100);
        let totalTime = interval;

        // Check every 150ms for up to 15 seconds
        const timer = setInterval(async () => {
          totalTime += interval;

          const { body: product2 } = await request(app)
            .get(`/api/products/${user1ProductUuidA2}`)
            .set('Authorization', user3JwtToken)
            .expect(httpStatus.OK);

          if (product2.data.status == 'forsale') {
            // expect(product2.data.status).toBe('forsale');

            const {
              body: { data: orderFound1 },
            } = await request(app)
              .get(`/api/orders/${o.id}`)
              .set('Authorization', user2JwtToken)
              .expect(httpStatus.OK);

            expect(orderFound1.status).toBe('pending');
            // expect(typeof orderFound1.datePending).toBe('string');
            expect(!isNaN(Date.parse(orderFound1.datePending))).toBe(true);

            const {
              body: { data: orderFound2 },
            } = await request(app)
              .get(`/api/orders/${o2.id}`)
              .set('Authorization', user2JwtToken)
              .expect(httpStatus.OK);

            expect(orderFound2.status).toBe('cancelled');
            expect(typeof orderFound2.dateCancelled).toBe('string');
            expect(!isNaN(Date.parse(orderFound2.dateCancelled))).toBe(true);

            done();
            clearInterval(timer);
            return;
          }

          if (totalTime >= waitFor) {
            clearInterval(timer);
            throw new Error('timeout for order: ' + o.id);
          }
        }, interval);
      } catch (error) {
        console.error(error);
      }
    });

    it("should cancel an order after the seller didn't confirm", async done => {
      const buyer = { ...user2, jwtToken: user2JwtToken };
      const seller = {
        ...user1,
        jwtToken: user1JwtToken,
        productUUID: user1ProductUuidA,
      };

      try {
        const o = await createOrder({ ...productA, uuid: seller.productUUID }, buyer.jwtToken);
        const o2 = await createOrder({ ...productA, uuid: user1ProductUuidA2 }, buyer.jwtToken);
        const dealID = '9B27M6E';

        // put the order payment 10 minutes back
        await Order.updateOne({ _id: o.id }, { $set: { datePaid: new Date(Date.now() - 10 * 60 * 1000) } });

        // buyer pays
        await payOrder(o.id, buyer.jwtToken, dealID);

        // buyer pays
        await payOrder(o2.id, buyer.jwtToken, dealID);

        mock.onPost(`/deals/${dealID}/rejections`).reply(200, sellerCancelsAPaidDeal);

        const waitFor = 15 * 1000; // seconds
        const interval = Math.floor(waitFor / 100);
        let totalTime = interval;

        // Check every 150ms for up to 15 seconds
        const timer = setInterval(async () => {
          totalTime += interval;

          const { body: product } = await request(app)
            .get(`/api/products/${seller.productUUID}`)
            .set('Authorization', user3JwtToken)
            .expect(httpStatus.OK);

          if (product.data.status === 'forsale') {
            // expect(product.data.status).toBe('forsale');
            expect(product.data.datePending).toBe(undefined);

            const { body: orderFound } = await request(app)
              .get(`/api/orders/${o.id}`)
              .set('Authorization', buyer.jwtToken)
              .expect(httpStatus.OK);

            expect(orderFound.data.status).toBe('failed_by_seller');
            expect(orderFound.data.transactionStatus).toBe('ua-reversed');
            expect(typeof orderFound.data.dateFailed).toBe('string');

            const { body: orderFound2 } = await request(app)
              .get(`/api/orders/${o2.id}`)
              .set('Authorization', buyer.jwtToken)
              .expect(httpStatus.OK);

            expect(orderFound2.data.status).toBe('paid');
            expect(orderFound2.data.transactionStatus).toBe('ua-finished');
            expect(orderFound2.data.dateFailed).toBeUndefined();

            agenda.jobs({ name: config.JOBNAMES.PUSH_ORDER }, (err, jobs) => {
              if (err) return done(err);

              jobs = jobs.filter(j => j.attrs.data.triggeredBy.toString() !== o2.id);
              expect(jobs).toHaveLength(3);
              const targetUsers = jobs
                .map(j => j.attrs)
                .map(({ data }) => data.targetUser.toString())
                .slice(1); // remove the first push notification job

              expect(targetUsers.find(u => u === buyer._id)).toBeTruthy();
              expect(targetUsers.find(u => u === seller._id)).toBeTruthy();

              const { data: push1 } = jobs.map(j => j.attrs)[1];
              expect(push1.triggeredBy.toString()).toBe(o.id);
              expect(push1.triggeredType).toBe('Order');
              expect(typeof push1.random).toBe('string');
              const { data: push2 } = jobs.map(j => j.attrs)[2];
              expect(push2.triggeredBy.toString()).toBe(o.id);
              expect(push2.triggeredType).toBe('Order');
              expect(typeof push2.random).toBe('string');

              agenda.jobs({ name: config.JOBNAMES.PUSH_ORDER }, (err, jobs) => {
                if (err) return done(err);
                const data = jobs.map(job => job.attrs.data);
                expect(data.find(d => d.message.endsWith(i18n.orderPaidReminder.slice(-10)))).toBeTruthy();
                done();
                clearInterval(timer);
              });
            });
          }

          if (totalTime >= waitFor) {
            clearInterval(timer);
            throw new Error('timeout for order: ' + o2.id);
          }
        }, interval);
      } catch (error) {
        console.error(error);
      }
    });

    // TODO: enable once the 'ua-rejected' transactionStatus is saved and the app doesn't check for existing order paymentStatus
    it.skip('should cancel an order after the buyer payment failed (rejected)', async done => {
      const buyer = { ...user2, jwtToken: user2JwtToken };
      const seller = {
        ...user1,
        jwtToken: user1JwtToken,
        productUUID: user1ProductUuidA,
      };

      try {
        const o = await createOrder({ ...productA, uuid: seller.productUUID }, buyer.jwtToken);
        const dealID = '9B27M6E';

        // buyer starts payment BUT payment fails
        mock.onPost('/carts').reply(200, { data: { id: 575, deals: [] } });
        mock.onPost('/deals').reply(200, { data: { id: dealID } });
        mock.onPost(`/deals/${dealID}/payments`).reply(200);
        mock.onGet(`/deals/${dealID}`).reply(200, buyerNeedsToPay);
        mock.onGet('/handlers/NovaPoshta/costs').reply(200, { data: { handlerPrice: 2500 } });
        await request(app)
          .post(`/api/orders/${o.id}/pay`)
          .set('Authorization', buyer.jwtToken)
          .send({ cvc: '123' })
          .expect(httpStatus.CREATED);
        mock.onGet(`/deals/${dealID}`).reply(200, buyerPaymentFailure);
        await request(app)
          .get(`/api/orders/${o.id}/paymentStatus`)
          .set('Authorization', buyer.jwtToken)
          .expect(httpStatus.OK)
          .then(({ body }) => {
            expect(body.data.status).toBe('ua-rejected');
            expect(body.data.rawStatus).toBe('REJECTED');
          });

        const waitFor = 15 * 1000; // seconds
        const interval = Math.floor(waitFor / 100);
        let totalTime = interval;

        // Check every 150ms for up to 15 seconds
        const timer = setInterval(async () => {
          totalTime += interval;

          const { body: product } = await request(app)
            .get(`/api/products/${seller.productUUID}`) // order 1
            .set('Authorization', user3JwtToken)
            .expect(httpStatus.OK);

          console.log(product.data.status);

          if (product.data.status === 'forsale') {
            // expect(product.data.status).toBe('forsale');
            expect(product.data.datePending).toBe(undefined);

            const { body: orderFound } = await request(app)
              .get(`/api/orders/${o.id}`)
              .set('Authorization', buyer.jwtToken)
              .expect(httpStatus.OK);

            expect(orderFound.data.status).toBe('failed_by_seller');
            expect(orderFound.data.transactionStatus).toBe('ua-reversed');
            expect(typeof orderFound.data.dateFailed).toBe('string');

            expect(orderFound2.data.status).toBe('paid');
            expect(orderFound2.data.transactionStatus).toBe('ua-finished');
            expect(orderFound2.data.dateFailed).toBeUndefined();

            agenda.jobs({ name: config.JOBNAMES.PUSH_ORDER }, (err, jobs) => {
              if (err) return done(err);

              jobs = jobs.filter(j => j.attrs.data.triggeredBy.toString() !== o2.id);
              expect(jobs).toHaveLength(3);
              const targetUsers = jobs
                .map(j => j.attrs)
                .map(({ data }) => data.targetUser.toString())
                .slice(1); // remove the first push notification job

              expect(targetUsers.find(u => u === buyer._id)).toBeTruthy();
              expect(targetUsers.find(u => u === seller._id)).toBeTruthy();

              const { data: push1 } = jobs.map(j => j.attrs)[1];
              expect(push1.triggeredBy.toString()).toBe(o.id);
              expect(push1.triggeredType).toBe('Order');
              expect(typeof push1.random).toBe('string');
              const { data: push2 } = jobs.map(j => j.attrs)[2];
              expect(push2.triggeredBy.toString()).toBe(o.id);
              expect(push2.triggeredType).toBe('Order');
              expect(typeof push2.random).toBe('string');

              done();
              clearInterval(timer);
            });
          }

          if (totalTime >= waitFor) {
            clearInterval(timer);
            throw new Error('timeout for order: ' + o.id);
          }
        }, interval);
      } catch (error) {
        console.error(error);
      }
    });

    it("should NOT cancel an order after the seller didn't confirm", async done => {
      const buyer = { ...user2, jwtToken: user2JwtToken };
      const seller = {
        ...user1,
        jwtToken: user1JwtToken,
        productUUID: user1ProductUuidA,
      };

      try {
        const o = await createOrder({ ...productA, uuid: seller.productUUID }, buyer.jwtToken);
        const dealID = '9B27M6E';

        // buyer pays
        await payOrder(o.id, buyer.jwtToken, dealID);

        mock.onPost(`/deals/${dealID}/rejections`).reply(200, sellerCancelsAPaidDeal);

        const waitFor = 15 * 1000; // seconds
        const interval = Math.floor(waitFor / 100);
        let totalTime = interval;

        // Check every 150ms for up to 15 seconds
        const timer = setInterval(async () => {
          totalTime += interval;

          const { body: product } = await request(app)
            .get(`/api/products/${seller.productUUID}`)
            .set('Authorization', user3JwtToken)
            .expect(httpStatus.OK);

          if (product.data.status == 'reserved') {
            // expect(product.data.status).toBe('reserved');
            expect(typeof product.data.reservedDate).toBe('string');

            const { body: orderFound } = await request(app)
              .get(`/api/orders/${o.id}`)
              .set('Authorization', buyer.jwtToken)
              .expect(httpStatus.OK);

            expect(orderFound.data.status).toBe('paid');
            expect(orderFound.data.transactionStatus).toBe('ua-finished');
            expect(typeof orderFound.data.datePaid).toBe('string');

            done();
            clearInterval(timer);
            return;
          }

          if (totalTime >= waitFor) {
            clearInterval(timer);
            throw new Error('timeout for order: ' + o1.id);
          }
        });
      } catch (error) {
        console.error(error);
      }
    });
  });
});
