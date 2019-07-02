// @flow

import httpStatus from 'http-status';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import request from 'supertest';
import { MongoClient } from 'mongodb';

import {
  Block,
  CommentDoc,
  DefaultFollow,
  DiscardedUser,
  Drop,
  Follow,
  Notification,
  Order,
  OrderDoc,
  Product,
  ProductDoc,
  Report,
  Review,
  SuggestedUsers,
  Tag,
  User,
  UserDoc,
  UserWeb,
  Verification,
} from '../models';

import app from '../index';
import config from '../config/config';
import { agenda } from '../config/express';
import {
  buyerNeedsToPay,
  buyerPaidDeal,
  dealConfirmationResp,
  sellerConfirmedResponse,
} from '../helpers/shipping';

// This sets the mock adapter on the default instance
export const mock = new MockAdapter(axios);

// GET & PUT /api/orders/ should only return these fields
export const orderFields = [
  'buyer',
  'buyerType',
  'createdAt',
  'currency',
  'datePending',
  // 'finalisedAt',
  'id',
  'onovaFee',
  'priceOfItem',
  'product',
  'seller',
  'status',
  'total',
  'transactionFee',
  'updatedAt',
];

export const orderCompletedFieldsWithReview = [
  ...orderFields,
  'cityRecipient',
  'citySender',
  'reviewFromBuyer',
  'reviewFromSeller',
].sort();

// should only return these fields
export const productFields = [
  '_id',
  'categoryIds',
  'createdAt',
  'currency',
  'description',
  'photoURIs',
  'price',
  'quantity',
  'seller',
  'status',
  'tags',
  'typeIds',
  'updatedAt',
  'uuid',
  'weight',
];

const userShippingAddress = {
  shippingAddress: {
    firstName: 'Джанфранко',
    lastName: 'Палумбо',
    city: '8d5a980d-391c-11dd-90d9-001a92567626', // Київ
    departmentNovaposhta: '1ec09d88-e1c2-11e3-8c4a-0050568002cf', // Відділення №1: вул. Червонопрапорна, 34 (Корчувате)
  },
};

const sellerPaymentInfo = {
  paymentInfoPayload:
    '2zNu7MwoGb5ovdnwctMmaCsTHRAJetjVertfZk3ta62znkhvtwAPeFZj2dngnAngXgqECAuEJAddghgVm6SWCJn584GVghQjf4uyqHRvPgw34PiCWx',
  short: true,
};

const buyerPaymentInfo = {
  ...sellerPaymentInfo,
  short: false,
};

/**
 * Create a user and activate it
 */
// TODO: return a tuple so it's shorter to rename
export function createUserAndLogin(
  user: UserDoc,
  paymentInfoAs: 'buyer' | 'seller' = 'buyer'
): Promise<{ user: UserDoc, jwtToken: string }> {
  return request(app)
    .post('/api/users')
    .send(user)
    .expect(httpStatus.CREATED)
    .then(async ({ body }) => {
      if (!body.data) {
        throw new Error(body);
      }
      expect(Object.keys(body.data).sort()).toMatchSnapshot();

      const paymentInfo =
        paymentInfoAs === 'buyer' ? buyerPaymentInfo : sellerPaymentInfo;

      await request(app)
        .put(`/api/users/${body.data._id}`)
        .set('Authorization', body.token)
        .send({ ...paymentInfo, ...userShippingAddress })
        .expect(httpStatus.OK);

      return { resUser: body.data, jwtToken: body.token };
    })
    .then(({ resUser, jwtToken }) =>
      // flow-disable-next-line
      Verification.findOne({ user: resUser._id }).then(verDoc => {
        if (!verDoc) {
          throw Error('no verification token found');
        }
        return { resetToken: verDoc.resetToken, resUser, jwtToken };
      })
    )
    .then(({ resetToken, resUser, jwtToken }) =>
      request(app)
        .get(`/api/auth/activate/${resetToken}`)
        .expect(httpStatus.OK)
        .then(({ text }) => {
          expect(text).toContain('Профіль активовано');
          return { user: resUser, jwtToken };
        })
    )
    .catch(e => {
      console.error(e);
      throw e;
    });
}

/**
 * Create a product
 *
 * @param {ProductDoc} product
 * @param {string} jwToken
 * @return {Promise<ProductDoc>}
 */
export function createProduct(
  product: ProductDoc,
  jwToken: string
): Promise<ProductDoc> {
  return request(app)
    .post('/api/products')
    .set('Authorization', jwToken)
    .send(product)
    .expect(httpStatus.CREATED)
    .then(({ body }) => {
      if (!body.data) console.error(body);
      expect(typeof body.data).toBe('object');
      return body.data;
    });
}

/**
 * Create a comment on a product
 *
 * @param {CommentDoc} comment
 * @param {string} productUuid
 * @param {string} jwToken
 * @return {Promise<CommentDoc>}
 */
export function createComment(
  comment: CommentDoc,
  productUuid: string,
  jwToken: string
): Promise<CommentDoc> {
  return request(app)
    .post(`/api/products/${productUuid}/comment`)
    .set('Authorization', jwToken)
    .send(comment)
    .expect(httpStatus.CREATED)
    .then(({ body }) => {
      expect(body.data.uuid).toBe(productUuid);
      return body.data;
    });
}

export function createManyComments(
  num: number,
  productUuid: string,
  jwtToken: string
) {
  const comment = {
    text: 'nice pair of socks',
  };

  const Promises = [];
  for (let i = 0; i < num; i++) {
    Promises.push(createComment(comment, productUuid, jwtToken));
  }

  return Promise.all(Promises);
}

/**
 * Order an order
 *
 * @param {ProductDoc} product
 * @param {string} jwtToken
 * @returns {Promise<OrderDoc>}
 */
export function createOrder(
  product: ProductDoc,
  jwtToken: string
): Promise<OrderDoc> {
  return request(app)
    .post('/api/orders')
    .set('Authorization', jwtToken)
    .send({ product: product.uuid })
    .expect(httpStatus.CREATED)
    .then(res => {
      if (!res.body.data) {
        console.error(res.body);
        throw new Error(res.body);
      }
      const o = res.body.data;
      expect(o.status).toBe('pending');
      expect(o.priceOfItem).toBe(product.price);
      return o;
    })
    .catch(e => {
      throw e;
    });
}

export async function createManyProducts(num: number, jwtToken: string) {
  let p = {
    categoryIds: [2],
    typeIds: [1],
    tags: ['warm', 'bundle'],
    description: 'nice pair of socks',
    photos: [
      'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
    ],
    price: '999',
    quantity: 1,
  };

  const res = [];
  for (let i = 0; i < num; i++) {
    res.push(await createProduct(p, jwtToken));
  }

  return res.reverse();

  // sequential

  // parallel
  // const items = [];
  // for (let i = 0; i < num; i++) {
  //   items.push(p);
  // }
  // return Promise.all(items.map(item => createProduct(item, jwtToken)));
}

export function beforeAllTests(done: () => void) {
  const collections = [
    Block.collection,
    DefaultFollow.collection,
    DiscardedUser.collection,
    Drop.collection,
    Follow.collection,
    Notification.collection,
    Order.collection,
    Product.collection,
    Report.collection,
    Review.collection,
    SuggestedUsers.collection,
    Tag.collection,
    User.collection,
    UserWeb.collection,
    Verification.collection,
  ];

  let todo = collections.length;
  if (!todo) return done();

  collections.forEach(collection => {
    collection.deleteMany({}, { safe: true }, () => {
      if (--todo === 0) done();
    });
  });
}

let mongoClient = null;

export function clearJobs() {
  const { RECURRING } = config.JOBNAMES;

  return new Promise((resolve, reject) => {
    const jobDb = `mongodb://${config.mongo.host}:${config.mongo.port}/${
      config.mongo.jobDb
    }`;
    MongoClient.connect(jobDb, { useNewUrlParser: true })
      .then(client => {
        mongoClient = client;
        const mongoDb = client.db(config.mongo.jobDb);
        mongoDb
          .collection('agendaJobs')
          .deleteMany({ name: { $nin: Object.values(RECURRING) } })
          .then(res => {
            // console.log(res.deletedCount);
            resolve();
          });
      })
      .catch(err => reject(err));
  });
}

export function closeDBConnection() {
  return new Promise(async resolve => {
    await mongoClient.close();
    return resolve();
  });
}

export function followUser(token: string, target: string): Promise<any> {
  return request(app)
    .post(`/api/users/${target}/follow`)
    .set('Authorization', token)
    .expect(httpStatus.CREATED);
}

export function findJobs(name: string, extraQuery: Object = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    agenda.jobs({ name, ...extraQuery }, (err, jobs) => {
      if (err) return reject(err);

      const data = jobs.map(job => job.attrs.data);
      resolve(data);
    });
  });
}

export async function payOrder(
  orderId: string,
  buyerJWTToken: string,
  dealID: string
) {
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

export async function confirmOrder(
  orderId: string,
  sellerJwtToken: string,
  dealID: string
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
      expect(!isNaN(Date.parse(o.dateConfirmed))).toBe(true);
    });
}
