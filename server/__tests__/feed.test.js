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
  'categoryIds',
  'comments',
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

let anotherProduct = {
  categoryIds: [1],
  typeIds: [1, 3],
  description: 'nice jacket',
  price: '230.99',
  photos: [
    'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
  ],
};

// $FlowFixMe
let user: UserDoc = {
  username: 'firstperson',
  emailAddress: 'gianpa+test@gmail.com',
  password: 'expressos',
};

// $FlowFixMe
let anotherUser: UserDoc = {
  username: 'anotherperson',
  emailAddress: 'gianpa+test2@gmail.com',
  password: 'express2',
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

let userId;
let anotherUserId;
let productUuid;
let anotherProductUuid;
let firstJwtToken;
let anotherJwtToken;

describe('## Feed APIs', () => {
  beforeAll(beforeAllTests);

  // TODO: refactor to async/await
  // create 2 users/sellers + 3 products (1 deleted)
  beforeAll(done => {
    createUserAndLogin(user)
      .then(({ user, jwtToken }) => {
        userId = user._id;
        firstJwtToken = jwtToken;
      })
      .then(() => Tag.create([{ _id: 'winter' }, { _id: 'summer' }]))
      .then(() =>
        createUserAndLogin(anotherUser).then(({ user, jwtToken }) => {
          anotherUserId = user._id.toString();
          anotherJwtToken = jwtToken;
        })
      )
      .then(async () => {
        const p1 = await createProduct(product, firstJwtToken);
        expect(p1.description).toBe(product.description);
        productUuid = p1.uuid;
      })
      .then(async () => {
        const p2 = await createProduct(anotherProduct, anotherJwtToken);
        expect(p2.description).toBe(anotherProduct.description);
        anotherProductUuid = p2.uuid;
      })
      .then(async () => {
        const p3 = await createProduct(notForSaleProduct, anotherJwtToken);
        expect(p3.description).toBe(notForSaleProduct.description);
        request(app)
          .delete(`/api/products/${p3.uuid}`)
          .set('Authorization', anotherJwtToken)
          .expect(httpStatus.NO_CONTENT)
          .then(res => {
            expect(res.body).toMatchObject({});
            done();
          });
      });
  });

  // both accounts follow each other
  beforeAll(() =>
    Promise.all([
      followUser(firstJwtToken, anotherUserId),
      followUser(anotherJwtToken, userId),
    ])
  );

  describe('# GET /api/feed/flat', () => {
    it('should get the first user`s feed with 2 products', () => {
      return request(app)
        .get('/api/feed/flat')
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data).toHaveLength(2);
          expect(body.data[0].uuid).toBe(anotherProductUuid);
          expect(body.data[1].uuid).toBe(productUuid);
          expect(Object.keys(body.data[0]).sort()).toEqual(feedFields.sort());
        });
    });

    it('should get another user`s feed', () => {
      return request(app)
        .get('/api/feed/flat')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data[0].uuid).toBe(productUuid);
          expect(body.data[1].uuid).toBe(anotherProductUuid);
          expect(body.data).toHaveLength(2);
        });
    });

    it('should not get my feed if i am not authenticated', () => {
      return request(app)
        .get('/api/feed/flat')
        .expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('# GET /api/feed/flat?categoryIds=', () => {
    let lastId,
      _ids = [];
    beforeAll(async () => {
      const allProducts = await createManyProducts(105, firstJwtToken);
      _ids = allProducts.map(p => p._id);
    });

    it('should get feed by categoryIds', () => {
      return request(app)
        .get('/api/feed/flat?categoryIds=2')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(50);
          expect(data.map(p => p._id)).toEqual(_ids.slice(0, 50));
          lastId = data[data.length - 1]._id;
        });
    });

    it('should get feed by categoryIds with load more', () => {
      return request(app)
        .get(`/api/feed/flat?categoryIds=2&lastId=${lastId}&limit=5`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data[0]._id).toBe(_ids.splice(50, 1)[0]);
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
      const pp = await createProduct(p, firstJwtToken);
      expect(pp.description).toBe(p.description);
      typeIdProductUUID = pp.uuid;
    });

    it('should get feed by typeIds', () => {
      return request(app)
        .get('/api/feed/flat?typeIds=5')
        .set('Authorization', anotherJwtToken)
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
      const pp = await createProduct(p, firstJwtToken);
      expect(pp.description).toBe(p.description);
      tagProductUUID = pp.uuid;
    });

    it('should get feed of tag', () => {
      return request(app)
        .get('/api/feed/flat?tag=cold')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data[0].uuid).toBe(tagProductUUID);
          expect(body.data).toHaveLength(1);
        });
    });
  });

  describe('# GET /api/feed/flat?lastId=', () => {
    // delete all Products
    beforeAll(done => {
      const collections = [Product.collection];
      let todo = collections.length;
      if (!todo) return done();

      collections.forEach(collection => {
        collection.deleteMany({}, { safe: true }, () => {
          if (--todo === 0) done();
        });
      });
    });

    let _ids = [];

    beforeAll(async () => {
      try {
        const allProducts = await createManyProducts(105, firstJwtToken);
        _ids = allProducts.map(p => p._id);
      } catch (err) {
        console.error(err);
      }
    });

    let lastId;
    const limit = 50; // current default

    it('should get feed without pagination', () => {
      return request(app)
        .get('/api/feed/flat/?limit=' + limit)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(limit);
          expect(data.map(p => p._id)).toEqual(_ids.slice(0, limit));
          lastId = data[data.length - 1]._id;
        });
    });

    it('should get feed with load more', () => {
      return request(app)
        .get(`/api/feed/flat?lastId=${lastId}&limit=5`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data.map(p => p._id)).toEqual(_ids.splice(limit, 5));
          expect(data).toHaveLength(5);
          lastId = data[data.length - 1]._id;
        });
    });

    it('should get feed with load more again', () => {
      return request(app)
        .get(`/api/feed/flat?lastId=${lastId}&limit=5`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data.map(p => p._id)).toEqual(_ids.splice(limit, 5));
          expect(data).toHaveLength(5);
        });
    });

    it('should not get feed with load more with a missing lastId', () => {
      return request(app)
        .get(`/api/feed/flat?lastId=5ff999999147a8bd32ea35f6`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.NOT_FOUND)
        .then(({ body }) =>
          expect(body.message).toContain('Product not found')
        );
    });
  });
});
