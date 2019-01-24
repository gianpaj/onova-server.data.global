// @flow

import httpStatus from 'http-status';
import request from 'supertest';
import { MongoClient } from 'mongodb';

import {
  Block,
  DiscardedUser,
  Drop,
  CommentDoc,
  DefaultFollow,
  Follow,
  Notification,
  Order,
  OrderDoc,
  Product,
  ProductDoc,
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

// GET & PUT /api/orders/ should only return these fields
export const orderFields = [
  'buyer',
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
  'likes',
  'photoURIs',
  'price',
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
    // fathersName: 'Мішель',
    city: '8d5a980d-391c-11dd-90d9-001a92567626', // Київ
    departmentNovaposhta: '1ec09d88-e1c2-11e3-8c4a-0050568002cf', // Відділення №1: вул. Червонопрапорна, 34 (Корчувате)
  },
};

const userPaymentInfo = {
  paymentInfoPayload:
    '2zNu7MwoGb5ovdnwctMmaCsTHRAJetjVertfZk3ta62znkhvtwAPeFZj2dngnAngXgqECAuEJAddghgVm6SWCJn584GVghQjf4uyqHRvPgw34PiCWx',
};

/**
 * Create a user and activate it
 */
// TODO: return a tuple so it's shorter to rename
export function createUserAndLogin(
  user: UserDoc
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

      await request(app)
        .put(`/api/users/${body.data._id}`)
        .set('Authorization', body.token)
        .send({ ...userPaymentInfo, ...userShippingAddress })
        .expect(httpStatus.OK);

      return { resUser: body.data, jwtToken: body.token };
    })
    .then(({ resUser, jwtToken }) => {
      // flow-disable-next-line
      return Verification.findOne({ user: resUser._id }).then(verDoc => {
        if (!verDoc) {
          throw Error('no verification token found');
        }
        return { resetToken: verDoc.resetToken, resUser, jwtToken };
      });
    })
    .then(({ resetToken, resUser, jwtToken }) => {
      return request(app)
        .get(`/api/auth/activate/${resetToken}`)
        .expect(httpStatus.OK)
        .then(({ text }) => {
          expect(text).toContain('Профіль активовано');
          return { user: resUser, jwtToken };
        });
    })
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
    .then(res => {
      if (!res.body.data) console.error(res.body);
      expect(typeof res.body.data).toBe('object');
      return res.body.data;
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
    .then(res => {
      expect(res.body.data.uuid).toBe(productUuid);
      return res.body.data;
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
    Drop.collection,
    DiscardedUser.collection,
    Follow.collection,
    Notification.collection,
    DefaultFollow.collection,
    Order.collection,
    Product.collection,
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
    MongoClient.connect(
      jobDb,
      (err, client) => {
        mongoClient = client;
        const mongoDb = client.db(config.mongo.jobDb);
        mongoDb
          .collection('agendaJobs')
          .deleteMany({ name: { $nin: Object.values(RECURRING) } })
          .then(res => {
            // console.log(res.deletedCount);
            resolve();
          });
        if (err) reject(err);
      }
    );
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
