// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';

import app from '../index';
import { Tag, Product, UserDoc } from '../models';
import {
  beforeAllTests,
  createProduct,
  createUserAndLogin,
  createManyProducts,
  followUser,
} from './utils';

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

// GET /api/feed/ should only return these fields
const feedFields = [
  '_id',
  'categoryIds', // TODO: remove
  'createdAt', // TODO: remove
  'currency', // TODO: remove
  'description', // TODO: remove
  'photoURIs',
  'price', // TODO: remove
  'seller',
  'status', // TODO: remove
  'tags', // TODO: remove
  'typeIds', // TODO: remove
  'updatedAt', // TODO: remove
  'uuid',
  'weight', // TODO: remove
];

const product = {
  categoryIds: [1, 2, 3],
  typeIds: [1, 2, 3],
  tags: ['winter', 'spring2007'], // optional
  description: 'nice boots',
  // seller comes after the user is created
  price: '1100.99', // if no decimal points .00 will be added
  photos: [
    'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
  ],
};

let product_shoe = {
  categoryIds: [1],
  typeIds: [1, 3],
  description: 'nice jacket',
  price: '230.99',
  photos: [
    'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
  ],
};

const user: UserDoc = {
  username: 'firstperson',
  emailAddress: 'gianpa+test@gmail.com',
  password: 'expressos',
};

const user2: UserDoc = {
  username: 'secondperson',
  emailAddress: 'gianpa+test2@gmail.com',
  password: 'express2',
};

const user3: UserDoc = {
  username: 'thirdperson',
  emailAddress: 'gianpa+test3@gmail.com',
  password: 'express3',
};

const user4: UserDoc = {
  username: 'fourthperson',
  emailAddress: 'gianpa+test4@gmail.com',
  password: 'express4',
};

const user5Reseller: UserDoc = {
  username: 'fifthperson_reseller',
  emailAddress: 'gianpa+test5@gmail.com',
  password: 'express5',
  type: 'reseller',
};

const user6Reseller: UserDoc = {
  username: 'sixthperson_reseller',
  emailAddress: 'gianpa+test6@gmail.com',
  password: 'express6',
  type: 'reseller',
};

const user7 = {
  username: 'seventhperson',
  emailAddress: 'gianpa+test7@gmail.com',
  password: 'express7',
};

const notForSaleProduct = {
  categoryIds: [2],
  typeIds: [1, 3],
  tags: ['WINTER'],
  description: 'nice scarf',
  price: '1130',
  photos: [
    'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
  ],
};

let user1_id;
let user2_id;
let user3_id;
let user6_id_reseller;
let user1_productuuid;
let user2_productuuid;
let user4_productuuid;
let user6_productuuid;
let user1_jwttoken, user2_jwttoken, user3_jwtToken, user4_jwttoken;
let user5_jwttoken_reseller, user6_jwttoken_reseller, user7_jwttoken;
let uuids;

describe('## Feed APIs', () => {
  beforeAll(beforeAllTests);

  // TODO: refactor to async/await
  // create 6 users/sellers (2 resellers) + 24 products (1 deleted, 1 from a reseller)
  beforeAll(done => {
    createUserAndLogin(user)
      .then(({ user, jwtToken }) => {
        user1_id = user._id;
        user1_jwttoken = jwtToken;
      })
      .then(() => Tag.create([{ _id: 'winter' }, { _id: 'summer' }]))
      .then(() =>
        createUserAndLogin(user2).then(({ user, jwtToken }) => {
          user2_id = user._id.toString();
          user2_jwttoken = jwtToken;
        })
      )
      .then(() =>
        createUserAndLogin(user3).then(({ user, jwtToken }) => {
          user3_id = user._id.toString();
          user3_jwtToken = jwtToken;
        })
      )
      .then(() =>
        createUserAndLogin(user4).then(({ jwtToken }) => {
          user4_jwttoken = jwtToken;
        })
      )
      .then(async () => {
        const { jwtToken: token5 } = await createUserAndLogin(user5Reseller);
        user5_jwttoken_reseller = token5;
        const { user: resUser6, jwtToken: token6 } = await createUserAndLogin(
          user6Reseller
        );
        user6_id_reseller = resUser6._id;
        user6_jwttoken_reseller = token6;
        const { user: resUser7, jwtToken: token7 } = await createUserAndLogin(
          user7
        );
        user7._id = resUser7._id;
        user7_jwttoken = token7;

        // const p6 = await createProduct(product, jwtToken6);
        // expect(p6.description).toBe(product.description);
        // productUuid = p6.uuid;

        const p1 = await createProduct(product, user1_jwttoken);
        expect(p1.description).toBe(product.description);
        user1_productuuid = p1.uuid;

        const p2 = await createProduct(product_shoe, user2_jwttoken);
        expect(p2.description).toBe(product_shoe.description);
        user2_productuuid = p2.uuid;

        const allProducts = await createManyProducts(20, user3_jwtToken);
        uuids = allProducts.map(p => p.uuid);

        const p3 = await createProduct(notForSaleProduct, user2_jwttoken);
        expect(p3.description).toBe(notForSaleProduct.description);
        const res = await request(app)
          .delete(`/api/products/${p3.uuid}`)
          .set('Authorization', user2_jwttoken)
          .expect(httpStatus.NO_CONTENT);
        expect(res.body).toMatchObject({});

        const p4 = await createProduct(product_shoe, user5_jwttoken_reseller);
        user4_productuuid = p4.uuid;
        const p5 = await createProduct(product, user6_jwttoken_reseller);
        user6_productuuid = p5.uuid;

        const DEBUG = false;
        if (DEBUG) {
          console.log('user1_id', user1_id);
          console.log('user2_id', user2_id);
          console.log('user3_id', user3_id);
          console.log('user6_id_reseller', user6_id_reseller);
          console.log('user1_productuuid', user1_productuuid);
          console.log('user2_productuuid', user2_productuuid);
          console.log('user4_productuuid', user4_productuuid);
          console.log('user6_productuuid', user6_productuuid);
        }

        done();
      });
  });

  beforeAll(() =>
    Promise.all([
      followUser(user1_jwttoken, user2_id),
      followUser(user5_jwttoken_reseller, user6_id_reseller),
      followUser(user2_jwttoken, user1_id),
      followUser(user4_jwttoken, user3_id),
      followUser(user2_jwttoken, user6_id_reseller),
    ])
  );

  describe('# GET /api/feed/flat', () => {
    it("should get the first user' product feed", () => {
      return request(app)
        .get('/api/feed/flat')
        .set('Authorization', user1_jwttoken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data).toHaveLength(22);
          expect(body.data[0].uuid).toBe(user2_productuuid);
          expect(body.data[1].uuid).toBe(uuids[0]);
          expect(Object.keys(body.data[0]).sort()).toEqual(feedFields.sort());
        });
    });

    it("should get the 4th user's feed with 10 products + 0 an addition (of a non following)", () => {
      return request(app)
        .get('/api/feed/flat/?limit=10')
        .set('Authorization', user4_jwttoken)
        .expect(httpStatus.OK)
        .then(({ body: { data } }) => {
          expect(data).toHaveLength(10);
          expect(data.map(p => p.uuid).slice(0, 10)).toEqual(
            uuids.slice(0, 10)
          );
          expect(Object.keys(data[0]).sort()).toEqual(feedFields.sort());
        });
    });

    it("should get user 2's feed", () => {
      return request(app)
        .get('/api/feed/flat')
        .set('Authorization', user2_jwttoken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data[0].uuid).toBe(user1_productuuid);
          expect(body.data[body.data.length - 1].uuid).toBe(user2_productuuid);
          expect(body.data).toHaveLength(22);
        });
    });

    it("should get user's feed when she doesn't follow anybody", () => {
      return request(app)
        .get('/api/feed/flat')
        .set('Authorization', user7_jwttoken)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data).toHaveLength(22));
    });

    it('should not get my feed if i am not authenticated', () => {
      return request(app)
        .get('/api/feed/flat')
        .expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('# GET /api/feed/flat?categoryIds=', () => {
    let lastId,
      _ids_user1 = [],
      _ids_user6_reseller = [];
    beforeAll(async () => {
      const allProducts_user1 = await createManyProducts(105, user1_jwttoken);
      _ids_user1 = allProducts_user1.map(p => p._id);
      const allProducts_user6 = await createManyProducts(
        105,
        user6_jwttoken_reseller
      );
      _ids_user6_reseller = allProducts_user6.map(p => p._id);
    });

    it('should get only my items in the feed by categoryIds (if i am a designer)', () => {
      return request(app)
        .get('/api/feed/flat?categoryIds=2')
        .set('Authorization', user2_jwttoken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data).toHaveLength(50);
          expect(body.data.map(p => p._id)).toEqual(_ids_user1.slice(0, 50));
          lastId = body.data[body.data.length - 1]._id;
        });
    });

    it('should get feed by categoryIds (if i am a reseller)', () => {
      return request(app)
        .get('/api/feed/flat?categoryIds=2')
        .set('Authorization', user5_jwttoken_reseller)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data).toHaveLength(50);
          expect(body.data.map(p => p._id)).toEqual(
            _ids_user6_reseller.slice(0, 50)
          );
          lastId = body.data[body.data.length - 1]._id;
        });
    });

    it('should get feed by categoryIds with load more', () => {
      return request(app)
        .get(`/api/feed/flat?categoryIds=2&lastId=${lastId}&limit=5`)
        .set('Authorization', user5_jwttoken_reseller)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data[0]._id).toBe(_ids_user6_reseller.splice(50, 1)[0]);
          expect(body.data).toHaveLength(5);
        });
    });
  });

  describe('# GET /api/feed/flat?typeIds=', () => {
    let typeIdProductUUID;

    beforeAll(async () => {
      const p = {
        categoryIds: [1],
        typeIds: [1, 5],
        tags: ['WINTER'],
        description: 'nice hoodie',
        price: '1169',
        photos: [
          'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
        ],
      };
      const pp = await createProduct(p, user1_jwttoken);
      expect(pp.description).toBe(p.description);
      typeIdProductUUID = pp.uuid;
    });

    it('should get feed by typeIds', () => {
      return request(app)
        .get('/api/feed/flat?typeIds=5')
        .set('Authorization', user2_jwttoken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data[0].uuid).toBe(typeIdProductUUID);
          expect(body.data).toHaveLength(1);
        });
    });
  });

  describe('# GET /api/feed/flat?tag=', () => {
    let tagProductUUID;

    beforeAll(async () => {
      const p = {
        categoryIds: [2],
        typeIds: [1, 4],
        tags: ['cold'],
        description: 'nice socks',
        price: '1119',
        photos: [
          'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
        ],
      };
      const pp = await createProduct(p, user1_jwttoken);
      expect(pp.description).toBe(p.description);
      tagProductUUID = pp.uuid;
    });

    it('should get feed of tag', () => {
      return request(app)
        .get('/api/feed/flat?tag=cold')
        .set('Authorization', user2_jwttoken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data[0].uuid).toBe(tagProductUUID);
          expect(body.data).toHaveLength(1);
        });
    });
  });

  describe('# GET /api/feed/flat?lastId=', () => {
    // delete all Products
    beforeAll(() => Product.collection.deleteMany({}, { safe: true }));

    let _ids = [],
      other_ids = [];

    beforeAll(async () => {
      try {
        const allProducts = await createManyProducts(105, user1_jwttoken);
        const otherProducts = await createManyProducts(105, user4_jwttoken);
        _ids = allProducts.map(p => p._id);
        other_ids = otherProducts.map(p => p._id);
      } catch (err) {
        console.error(err);
      }
    });

    let lastId;
    const limit = 50; // current default

    it('should get feed without pagination', () => {
      return request(app)
        .get(`/api/feed/flat?limit=${limit}`)
        .set('Authorization', user2_jwttoken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(limit);
          expect(data.map(p => p._id)).toEqual(_ids.splice(0, limit));
          lastId = data[data.length - 1]._id;
        });
    });

    it('should get feed with load more', () => {
      return request(app)
        .get(`/api/feed/flat?lastId=${lastId}&limit=50`)
        .set('Authorization', user2_jwttoken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(50);
          expect(data.map(p => p._id)).toEqual(_ids.splice(0, 50));
          lastId = data[data.length - 1]._id;
        });
    });

    // FIXME:
    it.skip('should get feed with load more again', () => {
      return request(app)
        .get(`/api/feed/flat?lastId=${lastId}&limit=50`)
        .set('Authorization', user2_jwttoken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(50);
          expect(data.map(p => p._id)).toEqual(_ids.splice(0, 5));
          expect(data.map(p => p._id).slice(5, 50)).toEqual(
            other_ids.slice(0, 45)
          );
        });
    });

    it('should not get feed with load more with a missing lastId', () => {
      return request(app)
        .get(`/api/feed/flat?lastId=5ff999999147a8bd32ea35f6`)
        .set('Authorization', user2_jwttoken)
        .expect(httpStatus.NOT_FOUND)
        .then(({ body }) =>
          expect(body.message).toContain('Product not found')
        );
    });
  });
});
