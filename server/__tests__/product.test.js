// @flow

import request from 'supertest';
import httpStatus from 'http-status';
import path from 'path';

import app from '../index';

import { Product, User } from '../models';
import { beforeAllTests, createOrder, createProduct, createUserAndLogin, productFields } from './utils';

describe('## Product APIs', () => {
  beforeAll(beforeAllTests);

  let user1 = {
    username: 'firstperson',
    emailAddress: 'gianpa+test@gmail.com',
    password: 'expressos',
  };

  let user2 = {
    username: 'anotherperson',
    emailAddress: 'gianpa+test2@gmail.com',
    password: 'express2',
  };

  let user3: UserDoc = {
    username: 'thirdperson',
    emailAddress: 'gianpa+test3@gmail.com',
    password: 'express3',
  };

  let user4: UserDoc = {
    username: 'forthperson',
    emailAddress: 'gianpa+test4@gmail.com',
    password: 'express4',
  };

  let user5Reseller: UserDoc = {
    username: 'fifthperson',
    emailAddress: 'gianpa+test5@gmail.com',
    password: 'express5',
  };

  let product = {
    categoryIds: [0],
    typeIds: [3], // for other - no gender
    tags: ['winter', 'spring2007'], // optional
    description: 'nice winter jacket for anybody',
    // seller comes after the user is created
    photos: ['https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg'],
    price: '2100.99', // if 1 decimal point .00 will be added
    quantity: 1,
  };

  let productUser2 = {
    categoryIds: [1],
    typeIds: [1], // women
    description: 'nice women shoes',
    photos: ['https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg'],
    price: '230.99',
    quantity: 1,
  };

  let thirdProduct = {
    categoryIds: [2],
    tags: ['spring'],
    description: 'nice scarf for men',
    photos: ['https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg'],
    price: '3130',
    quantity: 1,
  };

  let badProduct = {
    categoryIds: [2],
    typeIds: [1], // women
    tags: ['lol@'],
    description: 'nice handbag for women',
    photos: ['https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg'],
    price: '4290.00',
    quantity: 1,
  };

  let productUuid;
  let jwtToken1, jwtToken2, jwtToken3, jwtToken4, jwtToken5;
  let productUser2Uuid;
  let thirdProdUuid;
  let prodUuidWithLocality;

  let productsCount = 0;
  let productsResellerCount = 0;

  // create 4 users/sellers (of them reseller) + Tag and upload profile pic of a seller
  // 1 user doesn't have the shippingAddress
  beforeAll(async () => {
    const { user: resUser, jwtToken: token } = await createUserAndLogin(user1);
    user1._id = resUser._id;
    jwtToken1 = token;
    await request(app)
      .put(`/api/users/${user1._id}`)
      .set('Authorization', jwtToken1)
      .attach('profilePic', path.join(__dirname, 'images/profilepic.jpg'))
      .expect(httpStatus.OK);
    const { user: resUser2, jwtToken: token2 } = await createUserAndLogin(user2);
    user2._id = resUser2._id;
    jwtToken2 = token2;
    const { user: resUser3, jwtToken: token3 } = await createUserAndLogin(user3);
    user3._id = resUser3._id;
    jwtToken3 = token3;
    const { user: resUser4, jwtToken: token4 } = await createUserAndLogin(user4);
    user4._id = resUser4._id;
    jwtToken4 = token4;
    const { user: resUser5, jwtToken: token5 } = await createUserAndLogin(user5Reseller);
    user5Reseller._id = resUser5._id;
    jwtToken5 = token5;
    await request(app)
      .put(`/api/users/${user3._id}`)
      .set('Authorization', jwtToken3)
      .send({ shippingAddress: {} })
      .expect(httpStatus.OK);
    await User.updateOne({ _id: user4._id }, { $unset: { paymentInfo: '' } });
    await User.updateOne({ _id: user5Reseller._id }, { $set: { types: ['reseller'] } });
  });

  describe('# POST /api/products', () => {
    it('should NOT create a product with invalid photos', () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken1)
        .send({ ...product, photos: ['http://asdfasd'] })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('Product photo(s) are required'));
    });

    it('should NOT create a product with a price too low', () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken1)
        .send({ ...product, price: '99' })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('Invalid product price. The minimum'));
    });

    it(`should NOT create a product without if seller doesn't have a shipping address`, () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken3)
        .send(product)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('Please enter your shipping address'));
    });

    it(`should NOT create a product without if seller doesn't have payment info`, () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken4)
        .send(product)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('Please enter your payment info'));
    });

    it('should create a product without coordinates', () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken1)
        .send(product)
        .expect(httpStatus.CREATED)
        .then(res => {
          const p = res.body.data;
          expect(p.categoryIds.sort()).toEqual(product.categoryIds);
          expect(Array.isArray(p.comments));
          expect(p.comments).toHaveLength(0);
          expect(p.currency).toBe('UAH');
          expect(p.description).toBe(product.description);
          expect(p.photoURIs[0]).not.toContain('thumb');
          expect(p.photoURIs[0]).toContain('/products/');
          expect(p.price).toBe(product.price);
          expect(p.quantity).toBe(product.quantity);
          expect(p.seller).toBe(user1._id);
          expect(p.status).toBe('forsale');
          expect(Array.isArray(p.tags));
          expect(p.tags).toEqual(product.tags);
          expect(p.typeIds.sort()).toEqual(product.typeIds);
          expect(Object.keys(p).sort()).toEqual([...productFields, 'comments'].sort());
          productUuid = p.uuid;
          productsCount++;
        });
    });

    it('should create a product with coordinates', async () => {
      const p = await createProduct({ ...productUser2, longitude: 23.9573617, latitude: 49.8134431 }, jwtToken1);
      expect(p.locality).toBe('Lviv');
      expect(p.description).toBe(productUser2.description);
      expect(Object.keys(p).sort()).toEqual([...productFields, 'comments', 'locality'].sort());
      prodUuidWithLocality = p.uuid;
      productsCount++;
      return p;
    });

    test('the reseller creates a product', async () => {
      const p = await createProduct({ ...productUser2, longitude: 23.9573617, latitude: 49.8134431 }, jwtToken5);
      expect(p.locality).toBe('Lviv');
      expect(p.description).toBe(productUser2.description);
      expect(Object.keys(p).sort()).toEqual([...productFields, 'comments', 'locality'].sort());
      productsResellerCount++;
      return p;
    });

    // it('should NOT create a product with invalid coordinates', () => {
    //   return request(app)
    //     .post('/api/products')
    //     .set('Authorization', jwtToken)
    //     .send({
    //       ...anotherProduct,
    //       longitude: 0.1,
    //       latitude: 0.1,
    //     })
    //     .expect(httpStatus.BAD_REQUEST)
    //     .then(res => {
    //       const p = res.body.data;
    //       // console.log(p);
    //     });
    // });

    it('should NOT create a product with invalid coordinates', () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken1)
        .send({
          ...productUser2,
          longitude: 0.1,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('[longitude] without its required peers [latitude]'));
    });

    it('should NOT create product with an invalid tag (with @)', () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken1)
        .send(badProduct)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('fails to match the required pattern'));
    });

    it('should NOT create product with an invalid tag (with space)', () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken1)
        .send({ ...badProduct, tags: ['my pony'] })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('fails to match the required pattern'));
    });

    it('should NOT create product with an invalid tag (with .)', () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken1)
        .send({ ...badProduct, tags: ['lol.pony'] })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('fails to match the required pattern'));
    });

    it('should create product with a valid tag (start with numbers)', () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken1)
        .send({ ...product, tags: ['111pony'] })
        .expect(httpStatus.CREATED)
        .then(() => void productsCount++);
    });

    it('should create product with a valid price (once decimal point)', () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken1)
        .send({ ...product, price: '211.1' })
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          expect(body.data.price).toBe('211.10');
          productsCount++;
        });
    });

    it('should create product with a valid tag (cyrillic)', () => {
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken1)
        .send({ ...product, tags: ['плнаше'] })
        .expect(httpStatus.CREATED)
        .then(() => void productsCount++);
    });

    it('should NOT create product without a proper price', () => {
      badProduct.tags = ['winter'];
      badProduct.price = '0';
      return request(app)
        .post('/api/products')
        .set('Authorization', jwtToken1)
        .send(badProduct)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('"price" contains an invalid value'));
    });
  });

  describe('# GET /api/products/:uuid', () => {
    // update displayName
    beforeAll(() => {
      const displayName = 'first user';
      return request(app)
        .put(`/api/users/${user1._id}`)
        .set('Authorization', jwtToken1)
        .send({ displayName })
        .expect(httpStatus.OK)
        .then(res => expect(res.body.displayName).toBe(displayName));
    });

    it('should get an existing product', () => {
      return request(app)
        .get(`/api/products/${productUuid}`)
        .expect(httpStatus.OK)
        .then(res => {
          const p = res.body.data;
          expect(Object.keys(p).sort()).toMatchSnapshot('product');
          expect(p.description).toBe(product.description);
          expect(p.seller._id).toBe(user1._id);
          expect(p.seller.username).toBe(user1.username);
          expect(Object.keys(p.seller).sort()).toMatchSnapshot('product.seller');
          expect(p.seller.profilePic).toBe('https://assets.onova.co/users/5b091babdde06965f6580a6b-1527323596437.jpg');
          expect(p.seller.profilePic).toContain('.jpg');
          expect(p.status).toBe('forsale');
          expect(p.price).toBe(product.price);
          expect(p.quantity).toBe(product.quantity);
          expect(p.currency).toBe('UAH');
          expect(Array.isArray(p.comments));
          // expect(p.comments).toHaveLength(0);
          expect(Array.isArray(p.tags));
          expect(p.tags).toHaveLength(2);
          expect(p.typeIds.sort()).toEqual(product.typeIds);
          expect(p.categoryIds.sort()).toEqual(product.categoryIds);
          expect(p.photoURIs).toHaveLength(1);
        });
    });

    it('should NOT get an non valid product', () => {
      return request(app)
        .get('/api/products/SkveMe9lz')
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toBe('Invalid product'));
    });

    it('should get a product with locality', () => {
      return request(app)
        .get(`/api/products/${prodUuidWithLocality}`)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(Object.keys(body.data).sort()).toEqual([...productFields, 'locality'].sort());
        });
    });
  });

  describe('# GET /api/products/', () => {
    beforeAll(async () => {
      const p1 = await createProduct(productUser2, jwtToken1);
      expect(typeof p1).toBe('object');
      const p2 = await createProduct(thirdProduct, jwtToken1);
      expect(p2.tags).toEqual(expect.arrayContaining(thirdProduct.tags));
      expect(p2.tags).toHaveLength(1);
      expect(typeof p2).toBe('object');
      productsCount++;
      productsCount++;
    });

    it('should get all products (default from designers)', () => {
      return request(app)
        .get('/api/products/')
        .expect(httpStatus.OK)
        .then(res => {
          const p = res.body.data;
          expect(Array.isArray(p));
          expect(Object.keys(p[0].seller).sort()).toMatchSnapshot();
          expect(p).toHaveLength(productsCount);
          expect(Object.keys(p[0]).sort()).toEqual(productFields.sort());
        });
    });

    it('should get all products (from resellers)', () => {
      return request(app)
        .get('/api/products/?sellerType=reseller')
        .expect(httpStatus.OK)
        .then(res => {
          const p = res.body.data;
          expect(Object.keys(p[0].seller).sort()).toMatchSnapshot();
          expect(p).toHaveLength(1);
          expect(Object.keys(p[0]).sort()).toEqual([...productFields, 'locality'].sort());
        });
    });

    it('should get all products (I am a reseller)', () => {
      return request(app)
        .get('/api/products/')
        .set('Authorization', jwtToken5)
        .expect(httpStatus.OK)
        .then(res => {
          const p = res.body.data;
          expect(p).toHaveLength(productsResellerCount);
          expect(Object.keys(p[0]).sort()).toEqual([...productFields, 'locality'].sort());
        });
    });

    it('should get only the last product', () => {
      return request(app)
        .get('/api/products/?limit=1')
        .expect(httpStatus.OK)
        .then(res => {
          const p = res.body.data;
          expect(p).toHaveLength(1);
          expect(p[0].description).toBe(thirdProduct.description);
        });
    });

    it("should get only the user's products by userid", () => {
      return request(app)
        .get(`/api/products/?userid=${user1._id}`)
        .expect(httpStatus.OK)
        .then(res => {
          const p = res.body.data;
          expect(p).toHaveLength(productsCount);
          expect(Object.keys(p[0]).sort()).toEqual(productFields.sort());
        });
    });

    it('should get all the products by username', () => {
      return request(app)
        .get(`/api/products/?username=${user1.username}`)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(productsCount);
          expect(Object.keys(data[0]).sort()).toEqual(productFields.sort());
        });
    });

    it('should get all the products by username and categoryIds=0 (clothes)', () => {
      return request(app)
        .get(`/api/products/?username=${user1.username}&categoryIds=0`)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data).toHaveLength(4);
          expect(Object.keys(data[0]).sort()).toEqual(productFields.sort());
        });
    });

    it("should NOT get only user's products by username and userid", () => {
      return request(app)
        .get(`/api/products/?username=banana&userid=${user1._id}`)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toBe('"username" must not exist simultaneously with [userid]'));
    });

    it("should NOT get only user's products by non existent username", () => {
      return request(app)
        .get(`/api/products/?username=banana`)
        .expect(httpStatus.NOT_FOUND);
    });

    it("should NOT get only user's products by invalid username", () => {
      return request(app)
        .get(`/api/products/?username=ban!an`)
        .expect(httpStatus.BAD_REQUEST);
    });

    it("should NOT get only user's products by invalid username (too long)", () => {
      return request(app)
        .get(`/api/products/?username=ananbananbananbananbananbananbanan`)
        .expect(httpStatus.BAD_REQUEST);
    });

    it("should NOT get only user's products by invalid username (too short)", () => {
      return request(app)
        .get(`/api/products/?username=an`)
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('# GET /api/products/?tags=', () => {
    it('should find products by a single tag', () => {
      return request(app)
        .get('/api/products/?tags=winter')
        .expect(httpStatus.OK)
        .then(res => {
          const p = res.body.data;
          expect(p).toHaveLength(2);
          expect(p[0].description).toBe(product.description);
        });
    });

    it('should find products by multiple tags', () => {
      return request(app)
        .get('/api/products/?tags[]=winter&tags[]=spring')
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data).toHaveLength(3);
          expect(body.data[0].tags).toEqual(thirdProduct.tags);
          expect(body.data[1].tags).toEqual(product.tags);
          // not duplicated product. just the same product was added twice
          expect(body.data[2].tags).toEqual(product.tags);
        });
    });

    it('should find products by multiple tags with different case', () => {
      return request(app)
        .get('/api/products/?tags[]=Winter&tags[]=Spring')
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data).toHaveLength(3);
          expect(body.data[0].tags).toEqual(thirdProduct.tags);
          expect(body.data[1].tags).toEqual(product.tags);
          // not duplicated product. just the same product was added twice
          expect(body.data[2].tags).toEqual(product.tags);
        });
    });
  });

  describe('# DELETE /api/products/:uuid', () => {
    let productToBeDeleted;
    beforeAll(async () => {
      const p = await createProduct(thirdProduct, jwtToken1);
      productToBeDeleted = p.uuid;
      const p2 = await createProduct(productUser2, jwtToken2);
      productUser2Uuid = p2.uuid;
      productsCount++;
    });

    it('should delete an existing product', () => {
      return request(app)
        .delete(`/api/products/${productToBeDeleted}`)
        .set('Authorization', jwtToken1)
        .expect(httpStatus.NO_CONTENT)
        .then(({ body }) => expect(body).toMatchObject({}));
    });

    it('should get all remaining products', () => {
      return request(app)
        .get('/api/products/')
        .expect(httpStatus.OK)
        .then(res => {
          const p = res.body.data;
          expect(p).toHaveLength(productsCount);
          expect(Object.keys(p[0]).sort()).toEqual(productFields.sort());
        });
    });

    it('should NOT delete an already deleted product', () => {
      return request(app)
        .delete(`/api/products/${productToBeDeleted}`)
        .set('Authorization', jwtToken1)
        .expect(httpStatus.BAD_REQUEST);
    });

    it('should NOT delete a product which is not mine', () => {
      return request(app)
        .delete(`/api/products/${productUser2Uuid}`)
        .set('Authorization', jwtToken1)
        .expect(httpStatus.UNAUTHORIZED)
        .then(({ body }) => expect(body.message).toBe('Unauthorized'));
    });
  });

  describe('# PUT /api/products/:uuid', () => {
    let photoURIs, forthProdUuid;
    beforeAll(async () => {
      const p = await createProduct(thirdProduct, jwtToken1);
      thirdProdUuid = p.uuid;
      await Product.updateOne({ uuid: thirdProdUuid }, { $set: { status: 'sold' } });
      const p2 = await createProduct(thirdProduct, jwtToken1);
      forthProdUuid = p2.uuid;
      await createOrder(p2, jwtToken2);
    });

    it('should update the description, price, categoryIds and typeIds', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .send({
          description: 'amazing boots',
          price: '319.99',
          categoryIds: [3],
          typeIds: [3],
        })
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          const p = body.data;
          expect(p.description).toBe('amazing boots');
          expect(p.price).toBe('319.99');
          expect(p.categoryIds).toEqual([3]);
          expect(p.typeIds).toEqual([3]);
          expect(p.photoURIs[0]).not.toContain('thumb');
          expect(p.photoURIs[0]).toContain('/products/');
        });
    });

    it('should NOT update the with empty categoryIds', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .send({
          description: 'amazing boots',
          price: '319.99',
          categoryIds: [],
        })
        .set('Authorization', jwtToken1)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toBe('"categoryIds" must contain at least 1 items'));
    });

    it('should update the tags', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .send({ ...product, tags: ['amazing', 'yolo'] })
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data.tags).toEqual(['amazing', 'yolo']));
    });

    it('should update the price with decimal points', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .send({ ...product, price: '199.9' })
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data.price).toEqual('199.90'));
    });

    it('should NOT update a product with a price too low', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .set('Authorization', jwtToken1)
        .send({ ...product, price: '99' })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('Invalid product price. The minimum'));
    });

    it('should update the price without decimal points', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .send({ ...product, price: '199' })
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data.price).toEqual('199.00'));
    });

    it('should increase the quantity', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .send({ ...product, quantity: 2 })
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data.quantity).toEqual(2));
    });

    it('should zero the quantity', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .send({ ...product, quantity: 0 })
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data.quantity).toEqual(0));
    });

    it('should replace the photos', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .send({
          ...product,
          photos: ['https://storage.googleapis.com/temp-uploads.onova.co/1533139516448-.jpeg'],
        })
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          const p = body.data;
          expect(p.photoURIs).toHaveLength(1);
          expect(p.photoURIs[0]).not.toContain('thumb');
          expect(p.photoURIs[0]).not.toContain('temp-uploads');
          expect(p.photoURIs[0]).toContain('/products/');
          expect(p.tags).toEqual(product.tags);
          photoURIs = p.photoURIs;
        });
    });

    it('should NOT update remove all the photos', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .send({
          ...product,
          photos: [],
        })
        .set('Authorization', jwtToken1)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toBe('"photos" must contain at least 1 items'));
    });

    it('should not require to update the photos', () => {
      // eslint-disable-next-line no-unused-vars
      const { photos, ...restOfKeys } = product;

      return request(app)
        .put(`/api/products/${productUuid}`)
        .send(restOfKeys)
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data.photoURIs[0]).toContain('/products/'));
    });

    it('should update one photo', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .send({
          ...product,
          photos: [photoURIs[0], 'https://storage.googleapis.com/temp-uploads.onova.co/1533139516448-.jpeg'],
        })
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data.photoURIs[1]).not.toContain('temp-uploads');
          expect(body.data.photoURIs[1]).toContain('/products/');
          expect(body.data.tags).toEqual(product.tags);
        });
    });

    it('should NOT update with invalid field', () => {
      return request(app)
        .put(`/api/products/${productUuid}`)
        .send({ blah: 'dasdf' })
        .set('Authorization', jwtToken1)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toBe('"blah" is not allowed'));
    });

    it('should NOT update a product which is not mine', () => {
      return request(app)
        .put(`/api/products/${productUser2Uuid}`)
        .set('Authorization', jwtToken1)
        .expect(httpStatus.UNAUTHORIZED)
        .then(({ body }) => expect(body.message).toBe('Unauthorized'));
    });

    it('should NOT update a product that has been sold', () => {
      return request(app)
        .put(`/api/products/${thirdProdUuid}`)
        .set('Authorization', jwtToken1)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toBe('Cannot update a product that has been sold'));
    });

    it('should NOT update a product that is reserved', () => {
      return request(app)
        .put(`/api/products/${forthProdUuid}`)
        .set('Authorization', jwtToken1)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toBe('Cannot update a product that is reserved'));
    });
  });
});
