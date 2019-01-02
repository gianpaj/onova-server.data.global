// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';

import app from '../index';
import { Tag, Product } from '../models';
import {
  beforeAllTests,
  createManyProducts,
  createProduct,
  createUserAndLogin,
  followUser,
  productFields,
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

const product = {
  categoryIds: [1, 2],
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
let firstJwtToken;
let anotherJwtToken;

describe('## Search APIs', () => {
  // TODO: reset the collections beforeEach
  beforeAll(beforeAllTests);

  // create 2 users/sellers + 2 products
  beforeAll(done => {
    createUserAndLogin(user)
      .then(({ user, jwtToken }) => {
        userId = user._id;
        firstJwtToken = jwtToken;
      })
      .then(async () => {
        await Tag.create([{ _id: 'winter' }, { _id: 'summer' }]);
      })
      .then(async () => {
        try {
          const { user, jwtToken } = await createUserAndLogin(anotherUser);
          anotherUserId = user._id;
          anotherJwtToken = jwtToken;
        } catch (err) {
          console.error(err);
        }
      })
      .then(async () => {
        const p1 = await createProduct(product, firstJwtToken);
        expect(p1.description).toBe(product.description);
      })
      .then(async () => {
        const p2 = await createProduct(anotherProduct, anotherJwtToken);
        expect(p2.description).toBe(anotherProduct.description);
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

  describe('# GET /api/search', () => {
    it('should not allow me to search without authentication', async () => {
      return request(app)
        .get('/api/search')
        .expect(httpStatus.UNAUTHORIZED)
        .then();
    });

    it('should not find a deleted product', async () => {
      return request(app)
        .get('/api/search')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0].description).not.toBe(notForSaleProduct.description);
          expect(data[1].description).not.toBe(notForSaleProduct.description);
          expect(data).toHaveLength(2);
        });
    });
  });

  describe('# GET /api/search?categoryIds=', () => {
    let categoryProductUUID;

    beforeAll(async () => {
      const p = {
        categoryIds: [2],
        typeIds: [1, 3],
        tags: ['WINTER'],
        description: 'nice jumper',
        price: '239',
        photos: [
          'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
        ],
      };
      const pp = await createProduct(p, firstJwtToken);
      expect(pp.description).toBe(p.description);
      categoryProductUUID = pp.uuid;
    });

    it('should find products by categoryIds', async () => {
      return request(app)
        .get('/api/search?categoryIds[]=2')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0].uuid).toBe(categoryProductUUID);
          expect(data).toHaveLength(2);
        });
    });

    it('should not find products by categoryIds (no product match)', async () => {
      return request(app)
        .get('/api/search?categoryIds[]=3')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(0);
        });
    });

    it('should not search by invalid categoryIds', async () => {
      return request(app)
        .get('/api/search?categoryIds[]=55')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('# GET /api/search?typeIds[]=', () => {
    let typeIdProductUUID;

    beforeAll(async () => {
      const p = {
        categoryIds: [1],
        typeIds: [1, 5],
        tags: ['WINTER'],
        description: 'nice hoodie',
        price: '169',
        photos: [
          'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
        ],
      };
      const pp = await createProduct(p, firstJwtToken);
      expect(pp.description).toBe(p.description);
      typeIdProductUUID = pp.uuid;
    });

    it('should find products by typeIds', async () => {
      return request(app)
        .get('/api/search?typeIds[]=5')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(Object.keys(data[0]).sort()).toEqual(productFields.sort());
          expect(data[0].uuid).toBe(typeIdProductUUID);
          expect(data).toHaveLength(1);
        });
    });

    it('should not search by invalid typeIds', async () => {
      return request(app)
        .get('/api/search?typeIds[]=55')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.BAD_REQUEST);
    });

    // TODO:
    // it('should **not** work with multiple query fields', async () => {
    //   return (
    //     request(app)
    //       .get('/api/search?typeIds[]=5&categoryIds[]=1')
    //       .set('Authorization', anotherJwtToken)
    //       .expect(httpStatus.BAD_REQUEST)
    //       .then();
    //   );
    // });
  });

  describe('# GET /api/search?tag=', () => {
    let tagProductUUID;

    beforeAll(async () => {
      const p = {
        categoryIds: [2],
        typeIds: [1, 4],
        tags: ['warm'],
        description: 'nice socks',
        price: '219',
        photos: [
          'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
        ],
      };
      const pp = await createProduct(p, firstJwtToken);
      expect(pp.description).toBe(p.description);
      tagProductUUID = pp.uuid;
      await createProduct({ ...p, tags: ['WARM'] }, firstJwtToken);
    });

    it('should find products by a tag (warm)', async () => {
      return request(app)
        .get('/api/search?tag=warm')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[1].uuid).toBe(tagProductUUID);
          expect(data).toHaveLength(2);
        });
    });

    it('should not find products by tag (no product match)', async () => {
      return request(app)
        .get('/api/search?tag=freezing')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(0);
        });
    });

    it('should not search products by invalid tag', async () => {
      return request(app)
        .get('/api/search?tag=freezingfreezingfreezingfreezingfreezing')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('# GET /api/search?description=', () => {
    let descriptionProductUUID;

    beforeAll(async () => {
      const p = {
        categoryIds: [2],
        typeIds: [1, 3],
        tags: ['WINTER'],
        description: 'nice hoodie',
        price: '390',
        photos: [
          'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
        ],
      };
      const pp = await createProduct(p, firstJwtToken);
      expect(pp.description).toBe(p.description);
      descriptionProductUUID = pp.uuid;
    });

    it('should find products by text description (hoodie)', async () => {
      return request(app)
        .get('/api/search?description=hoodie')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0].uuid).toBe(descriptionProductUUID);
          expect(data).toHaveLength(2);
        });
    });

    it('should find products by text description (hoo)', async () => {
      return request(app)
        .get('/api/search?description=hoo')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0].uuid).toBe(descriptionProductUUID);
          expect(data).toHaveLength(2);
        });
    });

    it('should not find products by text description (no product match)', async () => {
      return request(app)
        .get('/api/search?description=how')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(0);
        });
    });

    it('should not search products by invalid text description', async () => {
      const really_long_string = new Array(52).join('x');
      return request(app)
        .get(`/api/search?description=${really_long_string}`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('# GET /api/search?categoryIds=&typeIds&tag', () => {
    let descriptionProductUUID;

    beforeAll(async () => {
      const p = {
        categoryIds: [2],
        typeIds: [1, 3],
        tags: ['summer'],
        description: 'nice hoodie',
        price: '390',
        photos: [
          'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
        ],
      };
      const pp = await createProduct(p, firstJwtToken);
      expect(pp.description).toBe(p.description);
      descriptionProductUUID = pp.uuid;
    });

    it('should find products by tag & categoryIds', async () => {
      return request(app)
        .get('/api/search?tag=summer&categoryIds=2')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0].uuid).toBe(descriptionProductUUID);
          expect(data).toHaveLength(1);
        });
    });

    it('should not find products by tag & categoryIds (no match)', async () => {
      return request(app)
        .get('/api/search?tag=summer&categoryIds=1')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(0);
        });
    });

    it('should find products by tag & typeIds', async () => {
      return request(app)
        .get('/api/search?tag=summer&typeIds=3')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0].uuid).toBe(descriptionProductUUID);
          expect(data).toHaveLength(1);
        });
    });

    it('should not find products by tag & typeIds (no match)', async () => {
      return request(app)
        .get('/api/search?tag=summer&typeIds=2')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(0);
        });
    });

    it('should find products by categoryIds & typeIds', async () => {
      return request(app)
        .get('/api/search?categoryIds=2&typeIds=3')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0].uuid).toBe(descriptionProductUUID);
          expect(data).toHaveLength(4);
        });
    });
  });

  describe('# GET /api/search/?lastId=', () => {
    // delete all the Products
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

    beforeAll(async () => {
      const a = await createManyProducts(105, anotherJwtToken);
      if (a instanceof Error) console.error(a);
    });

    let lastId;

    it('should search without pagination', async () => {
      return request(app)
        .get('/api/search/?categoryIds=2')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(50);
          lastId = data[49]._id;
        });
    });

    it('should get feed with load more', async () => {
      return request(app)
        .get(`/api/search/?categoryIds=2&lastId=${lastId}`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data[0]._id).not.toBe(lastId);
          expect(data[data.length - 1]._id).not.toBe(lastId);
          expect(data).toHaveLength(50);
        });
    });
  });
});
