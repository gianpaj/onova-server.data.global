// @flow

import httpStatus from 'http-status';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import request from 'supertest';

import { agenda } from '../../config/express';
import config from '../../config/config';

import app from '../../index';

import { i18n } from '../../controllers/order.controller';
import { Order, Product } from '../../models';

import { NP } from '../../helpers/shipping';

import {
  beforeAllTests,
  clearJobs,
  createOrder,
  createProduct,
  createUserAndLogin,
  closeDBConnection,
} from '../utils';
import {
  buyerNeedsToPay,
  buyerPaidDeal,
  dealConfirmationResp,
  sellerConfirmedResponse,
  novaPoshta,
} from '../../helpers/shipping';

const photos = {
  photos: [
    'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
  ],
};

jest.setTimeout(10000);

// This sets the mock adapter on the default instance
const mock = new MockAdapter(axios);

describe('## Shipping Runner', () => {
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

  let productA = {
    categoryIds: [1, 2, 3],
    typeIds: [1, 2, 3],
    description: 'A - nice boots',
    price: '190.99',
    ...photos,
  };

  let user1JwtToken, user2JwtToken;

  // create 3 users
  beforeAll(async () => {
    try {
      const { user: u1, jwtToken: j1 } = await createUserAndLogin(user1);
      user1JwtToken = j1;
      user1._id = u1._id;
      const { user: u2, jwtToken: j2 } = await createUserAndLogin(user2);
      user2JwtToken = j2;
      user2._id = u2._id;
    } catch (error) {
      console.error(error);
    }
  });

  describe('Check shipping status from generated to shipped', () => {
    let o1;
    // clear Product and Orders
    // create 2 products
    beforeEach(async () => {
      try {
        await Product.collection.deleteMany({}, { safe: true });
        await Order.collection.deleteMany({}, { safe: true });
        await clearJobs();
        const { uuid } = await createProduct(productA, user1JwtToken);
        o1 = await createOrder({ ...productA, uuid }, user2JwtToken);
      } catch (error) {
        console.error(error);
      }
    });

    afterEach(() => closeDBConnection());

    it('should have checked an order tracking number has been generated', async done => {
      try {
        const dealID = '1B27M6E';
        await payOrder(o1.id, user2JwtToken, dealID);
        // seller needs to ships after confirming
        await confirmOrder(o1.id, user1JwtToken, dealID);

        mock
          .onPost('https://api.novaposhta.ua/v2.0/json/documentsTracking/')
          .reply(200, novaPoshta.generated);

        const waitFor = 15 * 1000; // seconds
        const interval = Math.floor(waitFor / 100);
        let totalTime = interval;

        // test a system message has been scheduled
        // Check every 150ms for up to 15 seconds
        const timer = setInterval(async () => {
          totalTime += interval;

          const {
            body: { data: orderFound1 },
          } = await request(app)
            .get(`/api/orders/${o1.id}`)
            .set('Authorization', user2JwtToken)
            .expect(httpStatus.OK);

          if (orderFound1.status == 'confirmed') {
            expect(orderFound1.shippingStatus).toBe(NP.generated);
            // expect(orderFound1.status).toBe('confirmed');

            const jobs = await findJobs(config.JOBNAMES.SYSTEM_MSG, {
              'data.order.status': 'paid',
            });
            if (jobs.length) {
              expect(jobs).toHaveLength(1);
              expect(
                jobs[0].message.startsWith(i18n.orderConfirmed.slice(0, 10))
              ).toBe(true);
              done();
            }
          }

          if (totalTime >= waitFor) {
            clearInterval(timer);
            throw new Error('timeout');
          }
        }, interval);
      } catch (error) {
        console.error(error);
      }
    });

    it('should have checked an order has been shipped', async done => {
      try {
        const dealID = '1B27M6E';
        await payOrder(o1.id, user2JwtToken, dealID);
        // seller needs to ships after confirming
        await confirmOrder(o1.id, user1JwtToken, dealID);

        mock
          .onPost('https://api.novaposhta.ua/v2.0/json/documentsTracking/')
          .reply(200, novaPoshta.shipped);

        const waitFor = 15 * 1000; // seconds
        const interval = Math.floor(waitFor / 100);
        let totalTime = interval;

        // test system message has been scheduled
        // Check every 150ms for up to 15 seconds
        const timer = setInterval(async () => {
          totalTime += interval;

          const {
            body: { data: orderFound1 },
          } = await request(app)
            .get(`/api/orders/${o1.id}`)
            .set('Authorization', user2JwtToken)
            .expect(httpStatus.OK);

          if (orderFound1.shippingStatus == NP.shipped) {
            expect(orderFound1.shippingStatus).toBe(NP.shipped);
            expect(orderFound1.status).toBe('shipped');
            expect(typeof orderFound1.dateShipped).toBe('string');

            const jobs = await findJobs(config.JOBNAMES.SYSTEM_MSG, {
              'data.order.status': 'shipped',
            });
            expect(jobs).toHaveLength(1);
            const job = jobs[0];
            expect(job.message.endsWith(i18n.orderShipped.slice(-10))).toBe(
              true
            );
            done();
          }

          if (totalTime >= waitFor) {
            clearInterval(timer);
            throw new Error('timeout');
          }
        }, interval);
      } catch (error) {
        console.error(error);
      }
    });

    it('should have checked an order has been delivered', async done => {
      try {
        const dealID = '1B27M6E';
        await payOrder(o1.id, user2JwtToken, dealID);
        // seller needs to ships after confirming
        await confirmOrder(o1.id, user1JwtToken, dealID);

        mock
          .onPost('https://api.novaposhta.ua/v2.0/json/documentsTracking/')
          .reply(200, novaPoshta.delivered);

        const waitFor = 15 * 1000; // seconds
        const interval = Math.floor(waitFor / 100);
        let totalTime = interval;

        // test system message has been scheduled
        // Check every 150ms for up to 15 seconds
        const timer = setInterval(async () => {
          totalTime += interval;

          const {
            body: { data: orderFound },
          } = await request(app)
            .get(`/api/orders/${o1.id}`)
            .set('Authorization', user2JwtToken)
            .expect(httpStatus.OK);

          if (orderFound.shippingStatus == NP.delivered) {
            // expect(orderFound.shippingStatus).toBe(NP.delivered);
            expect(orderFound.dateDelivered).toBe(
              new Date(
                novaPoshta.delivered.data[0].DateFirstDayStorage
              ).toISOString()
            );
            expect(orderFound.status).toBe('delivered');

            const jobs = await findJobs(config.JOBNAMES.SYSTEM_MSG, {
              'data.order.status': 'delivered',
            });
            if (jobs.length) {
              expect(jobs).toHaveLength(1);
              expect(
                jobs[0].message.endsWith(i18n.orderDelivered.slice(-10))
              ).toBe(true);
              done();
            }
          }
          if (totalTime >= waitFor) {
            clearInterval(timer);
            throw new Error('timeout');
          }
        }, interval);
      } catch (error) {
        done(error);
      }
    });

    it('should have checked an order has been collected', async done => {
      try {
        const dealID = '1B27M6E';
        await payOrder(o1.id, user2JwtToken, dealID);
        // seller needs to ships after confirming
        await confirmOrder(o1.id, user1JwtToken, dealID);

        mock
          .onPost('https://api.novaposhta.ua/v2.0/json/documentsTracking/')
          .reply(200, novaPoshta.collected);

        const waitFor = 15 * 1000; // seconds
        const interval = Math.floor(waitFor / 100);
        let totalTime = interval;

        // test system message has been scheduled
        // Check every 150ms for up to 15 seconds
        const timer = setInterval(async () => {
          totalTime += interval;

          const {
            body: { data: orderFound },
          } = await request(app)
            .get(`/api/orders/${o1.id}`)
            .set('Authorization', user2JwtToken)
            .expect(httpStatus.OK);

          if (orderFound.shippingStatus == NP.collected) {
            expect(orderFound.shippingStatus).toBe(NP.collected);
            expect(orderFound.status).toBe('completed');
            expect(!isNaN(Date.parse(orderFound.dateCompleted))).toBe(true);

            const jobs = await findJobs(config.JOBNAMES.SYSTEM_MSG, {
              'data.order.status': 'completed',
            });
            if (jobs.length) {
              expect(jobs).toHaveLength(1);
              expect(
                jobs[0].message.endsWith(i18n.orderCompleted.slice(-10))
              ).toBe(true);
              done();
            }
          }

          if (totalTime >= waitFor) {
            clearInterval(timer);
            throw new Error('timeout');
          }
        }, interval);
      } catch (error) {
        console.error(error);
      }
    });

    it('should have checked an order for a shipment that has been refused', async done => {
      try {
        const dealID = '1B27M6E';
        await payOrder(o1.id, user2JwtToken, dealID);
        // seller needs to ships after confirming
        await confirmOrder(o1.id, user1JwtToken, dealID);

        mock
          .onPost('https://api.novaposhta.ua/v2.0/json/documentsTracking/')
          .reply(200, novaPoshta.refused);

        const waitFor = 15 * 1000; // seconds
        const interval = Math.floor(waitFor / 100);
        let totalTime = interval;

        // test system message has been scheduled
        // Check every 150ms for up to 15 seconds
        const timer = setInterval(async () => {
          totalTime += interval;

          const {
            body: { data: orderFound },
          } = await request(app)
            .get(`/api/orders/${o1.id}`)
            .set('Authorization', user2JwtToken)
            .expect(httpStatus.OK);

          if (orderFound.shippingStatus == NP.refused) {
            expect(orderFound.shippingStatus).toBe(NP.refused);
            expect(orderFound.status).toBe('failed_by_buyer');
            expect(!isNaN(Date.parse(orderFound.dateFailed))).toBe(true);

            const jobs = await findJobs(config.JOBNAMES.SYSTEM_MSG, {
              'data.order.status': 'failed_by_buyer',
            });
            if (jobs.length) {
              expect(jobs).toHaveLength(1);
              expect(
                jobs[0].message.endsWith(i18n.refusedItem.slice(-10))
              ).toBe(true);
              done();
            }
          }

          if (totalTime >= waitFor) {
            clearInterval(timer);
            throw new Error('timeout');
          }
        }, interval);
      } catch (error) {
        console.error(error);
      }
    });
  });
});

function findJobs(jobName: string, extraQuery: Object = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    agenda.jobs(
      {
        name: jobName,
        ...extraQuery,
      },
      (err, jobs) => {
        if (err) return reject(err);

        const data = jobs.map(job => job.attrs.data);
        resolve(data);
      }
    );
  });
}

async function payOrder(orderId: string, buyerJWTToken, dealID) {
  mock.onPost('/carts').reply(200, { data: { id: 577, deals: [] } });
  mock.onPost('/deals').reply(200, { data: { id: dealID } });
  mock.onPost(`/deals/${dealID}/payments`).reply(200);
  mock.onGet(`/deals/${dealID}`).reply(200, buyerNeedsToPay);
  mock
    .onGet('/handlers/NovaPoshta/costs')
    .reply(200, { data: { handlerPrice: 2500 } });
  await request(app)
    .post(`/api/orders/${orderId}/pay`)
    .set('Authorization', buyerJWTToken)
    .send({ cvc: '123' })
    .expect(httpStatus.CREATED)
    .then(({ body }) => {
      expect(body.data.payment.redirectUrl).toContain(
        '.uapay.ua/api/payments/'
      );
      expect(body.data.payment.PaReq.length).toBeGreaterThan(400);
    });

  mock.onGet(`/deals/${dealID}`).reply(200, buyerPaidDeal);
  return request(app)
    .get(`/api/orders/${orderId}/paymentStatus`)
    .set('Authorization', buyerJWTToken)
    .expect(httpStatus.OK)
    .then(({ body }) => {
      expect(body.data.status).toBe('ua-finished');
      expect(body.data.rawStatus).toBe('FINISHED');
    });
}

async function confirmOrder(
  orderId: string,
  sellerJwtToken,
  dealID
): Promise<any> {
  mock
    .onPost(`/deals/${dealID}/confirmations`)
    .reply(200, dealConfirmationResp);
  mock.onGet(`/deals/${dealID}`).reply(200, sellerConfirmedResponse);
  return request(app)
    .put(`/api/orders/${orderId}`)
    .set('Authorization', sellerJwtToken)
    .send({ status: 'confirmed' })
    .expect(httpStatus.OK)
    .then(res => {
      const o = res.body.data;
      expect(o.status).toBe('confirmed');
      expect(o.transactionStatus).toBe('ua-finished');
      expect(o.transactionId).toBe(dealID);
      expect(o.trackingNumber).toBe(
        sellerConfirmedResponse.data.handler.waybillNumber.toString()
      );
      expect(typeof o.dateConfirmed).toBe('string');
    });
}
