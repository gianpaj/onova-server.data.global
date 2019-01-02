// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';

import { Product, Tag } from '../models';

import app from '../index';
import {
  beforeAllTests,
  createComment,
  createProduct,
  createUserAndLogin,
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

// should only have these fields
const commentFields = ['_id', 'createdAt', 'text', 'user'];

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

let user = {
  username: 'firstperson',
  emailAddress: 'gianpa+test@gmail.com',
  password: 'expressos',
  pushToken:
    'e4Xu1jjTbXg:APA91bF_3S7FuBIDjO6feBMy1OzD2JsVtUJwVmIJD8YYPNk417zxX8YTYv_FoCCjg-x1rXUlHlxzKDjflXCK7Dujvff81aDBXFet8S8z99lK2_QwBIhvjQchS3HlTfJCuoJnfbm6xEjW',
  platform: 'ios',
};

let anotherUser = {
  username: 'anotherperson',
  emailAddress: 'gianpa+test2@gmail.com',
  password: 'express2',
  pushToken:
    'e4Xu1jjTbXg:APA91bF_3S7FuBIDjO6feBMy1OzD2JsVtUJwVmIJD8YYPNk417zxX8YTYv_FoCCjg-x1rXUlHlxzKDjflXCK7Dujvff81aDBXFet8S8z99lK2_QwBIhvjQchS3HlTfJCuoJnfbm6xEjW',
  platform: 'android',
};

const thirdUser = {
  username: 'thirdwheel',
  emailAddress: 'gianpa+thirdwheel@gmail.com',
  password: 'express3',
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

let productUuid;
let anotherProductUuid;
let notForSaleProductUuid;
let jwtToken;
let anotherJwtToken;
let thirdJWTtoken;

describe('## Comment APIs', () => {
  beforeAll(beforeAllTests);

  // create 2 users/sellers + 2 products
  beforeAll(done => {
    createUserAndLogin(user)
      .then(({ jwtToken: token }) => {
        // userId = user._id;
        jwtToken = token;
      })
      .then(() => {
        return request(app)
          .post('/api/users')
          .send(thirdUser)
          .expect(httpStatus.CREATED)
          .then(res => {
            const resUser = res.body.data;
            expect(resUser.username).toBe(thirdUser.username);
            expect(resUser.emailAddress).toBe(thirdUser.emailAddress);
            expect(resUser.accountStatus).toBe('notverified');
          });
      })
      .then(() => {
        return request(app)
          .post('/api/auth/login')
          .send({
            emailAddress: thirdUser.emailAddress,
            password: thirdUser.password,
          })
          .expect(httpStatus.OK)
          .then(res => {
            thirdJWTtoken = res.body.token;
          });
      })
      .then(() => {
        return Tag.create([{ _id: 'winter' }, { _id: 'summer' }]).then();
      })
      .then(async () => {
        return createUserAndLogin(anotherUser).then(({ jwtToken: token }) => {
          // anotherUserId = user._id;
          anotherJwtToken = token;
        });
      })
      .then(async () => {
        const p1 = await createProduct(product, jwtToken);
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
        notForSaleProductUuid = p3.uuid;
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

  describe('# POST /api/products/:uuid/comment', () => {
    beforeAll(done => {
      Product.collection.updateMany({}, { $unset: { comments: '' } }, () => {
        done();
      });
    });

    it('should add a comment to a product', async () => {
      return request(app)
        .post(`/api/products/${productUuid}/comment`)
        .set('Authorization', anotherJwtToken)
        .send({ text: 'first!' })
        .expect(httpStatus.CREATED)
        .then(res => {
          const { data } = res.body;
          expect(data.uuid).toBe(productUuid);
          expect(Object.keys(data.comment).sort()).toEqual(
            commentFields.sort()
          );
        });
    });

    it('should add a comment to a product with a @mention', async () => {
      return request(app)
        .post(`/api/products/${productUuid}/comment`)
        .set('Authorization', anotherJwtToken)
        .send({ text: 'nice one @firstperson' })
        .expect(httpStatus.CREATED)
        .then(res => {
          const { data } = res.body;
          expect(data.uuid).toBe(productUuid);
          expect(data.comment.text).toContain('nice one [@firstperson:');
          expect(Object.keys(data.comment).sort()).toEqual(
            commentFields.sort()
          );
        });
    });

    it('should add a comment to a product with a non existant user @mention', async () => {
      return request(app)
        .post(`/api/products/${productUuid}/comment`)
        .set('Authorization', anotherJwtToken)
        .send({ text: 'nice one @hacker' })
        .expect(httpStatus.CREATED)
        .then(res => {
          const { data } = res.body;
          expect(data.uuid).toBe(productUuid);
          expect(data.comment.text).toContain('nice one [@hacker:null]');
          expect(Object.keys(data.comment).sort()).toEqual(
            commentFields.sort()
          );
        });
    });

    it('should add a comment to a product with a 3 @mention s', async () => {
      return request(app)
        .post(`/api/products/${productUuid}/comment`)
        .set('Authorization', anotherJwtToken)
        .send({ text: 'nice one @hacker and @firstperson and @anotherperson' })
        .expect(httpStatus.CREATED)
        .then(res => {
          const { data } = res.body;
          expect(data.uuid).toBe(productUuid);
          expect(data.comment.text).toContain(
            'nice one [@hacker:null] and [@firstperson:'
          );
          expect(data.comment.text).toContain(' and [@anotherperson:');
          expect(Object.keys(data.comment).sort()).toEqual(
            commentFields.sort()
          );
        });
    });

    it('should add a comment to a product with a 2 equal @mention s', async () => {
      return request(app)
        .post(`/api/products/${productUuid}/comment`)
        .set('Authorization', anotherJwtToken)
        .send({ text: 'nice one @firstperson and @firstperson' })
        .expect(httpStatus.CREATED)
        .then(res => {
          const { data } = res.body;
          expect(data.uuid).toBe(productUuid);
          expect(data.comment.text).toContain('nice one [@firstperson:');
          expect(data.comment.text).toContain(' and [@firstperson:');
          expect(Object.keys(data.comment).sort()).toEqual(
            commentFields.sort()
          );
        });
    });

    it('should add a comment to a product with a 2 equal non-existant @mention s', async () => {
      return request(app)
        .post(`/api/products/${productUuid}/comment`)
        .set('Authorization', anotherJwtToken)
        .send({ text: 'nice one @hacker and @hacker' })
        .expect(httpStatus.CREATED)
        .then(res => {
          const { data } = res.body;
          expect(data.uuid).toBe(productUuid);
          expect(data.comment.text).toContain(
            'nice one [@hacker:null] and [@hacker:null]'
          );
          expect(Object.keys(data.comment).sort()).toEqual(
            commentFields.sort()
          );
        });
    });

    it('should not add a comment to a deleted product', async () => {
      return request(app)
        .post(`/api/products/${notForSaleProductUuid}/comment`)
        .set('Authorization', anotherJwtToken)
        .send({ text: 'first!' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toContain('Comment cannot be added');
        });
    });

    it('should not add a comment to a invalid product', async () => {
      return request(app)
        .post(`/api/products/1234/comment`)
        .set('Authorization', anotherJwtToken)
        .send({ text: 'first!' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toContain('Invalid product');
        });
    });

    it('should not add a comment without a verified account', async () => {
      return request(app)
        .post(`/api/products/${productUuid}/comment`)
        .set('Authorization', thirdJWTtoken)
        .send({ text: 'first!' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toContain('Please verify your account befo');
        });
    });
  });

  describe('# GET /api/products/:uuid/comment', () => {
    let commentIdFirst;

    beforeAll(done => {
      Product.collection.updateMany({}, { $unset: { comments: '' } }, () => {
        done();
      });
    });

    beforeAll(async () => {
      const data = await createComment(
        { text: 'nice jacket' },
        productUuid,
        jwtToken
      );
      commentIdFirst = data.comment._id;
    });

    it('should get the first product`s comments', async () => {
      return request(app)
        .get(`/api/products/${productUuid}/comment`)
        .set('Authorization', jwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data.uuid).toBe(productUuid);
          expect(data.comments[0]._id).toBe(commentIdFirst);
          expect(Object.keys(data.comments[0].user).sort()).toEqual([
            '_id',
            'accountStatus',
            'username',
          ]);
          expect(Object.keys(data.comments[0]).sort()).toEqual(
            commentFields.sort()
          );
          expect(data.comments).toHaveLength(1);
        });
    });

    it('should not get comments if i am not authenticated', async () => {
      return request(app)
        .get(`/api/products/${productUuid}/comment`)
        .expect(httpStatus.UNAUTHORIZED)
        .then();
    });
  });

  describe('# DELETE /api/products/:uuid/comment/:commentId', () => {
    let commentIdSecond;
    let commentIdThird;
    let commentIdReply;

    beforeAll(done => {
      Product.collection.updateMany({}, { $unset: { comments: '' } }, () => {
        done();
      });
    });

    beforeAll(async () => {
      const data2 = await createComment(
        { text: 'nice jacket' },
        productUuid,
        anotherJwtToken
      );
      commentIdSecond = data2.comment._id;
      const data3 = await createComment(
        { text: 'nice jacket' },
        anotherProductUuid,
        jwtToken
      );
      commentIdThird = data3.comment._id;
      const data4 = await createComment(
        { text: 'thanks for the comment @firstperson' },
        anotherProductUuid,
        anotherJwtToken
      );
      commentIdReply = data4.comment._id;
    });

    it('should delete the first product`s comment', async () => {
      return request(app)
        .delete(`/api/products/${productUuid}/comment/${commentIdSecond}`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(Object.keys(data).sort()).toEqual(['uuid', 'length'].sort());
          expect(data.uuid).toBe(productUuid);
          expect(data.length).toBe(0);
        });
    });

    it('should not delete a comment that doesn`t exist', async () => {
      return request(app)
        .delete(`/api/products/${productUuid}/comment/${commentIdSecond}`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.NOT_FOUND)
        .then(res => {
          expect(res.body.message).toContain('Comment not found');
        });
    });

    it('should not get comments if i am not authenticated', async () => {
      return request(app)
        .get(`/api/products/${productUuid}/comment`)
        .expect(httpStatus.UNAUTHORIZED)
        .then();
    });

    it('should not delete the comment of another user', async () => {
      return request(app)
        .delete(`/api/products/${anotherProductUuid}/comment/${commentIdThird}`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toContain(
            'Cannot delete other people`s comment'
          );
        });
    });

    it('should delete a product`s seller`s reply comment', async () => {
      return request(app)
        .delete(`/api/products/${anotherProductUuid}/comment/${commentIdReply}`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const { data } = res.body;
          expect(data.uuid).toBe(anotherProductUuid);
          expect(data.length).toBe(1);
        });
    });
  });

  // TODO: test comment's pagination
  // describe('# GET /api/products/:uuid/comment?lastId=', () => {
  //   // delete all Products
  //   beforeAll(done => {
  //     const collections = [Product.collection];
  //     let todo = collections.length;
  //     if (!todo) return done();

  //     collections.forEach(collection => {
  //       collection.remove({}, { safe: true }, () => {
  //         if (--todo === 0) done();
  //       });
  //     });
  //   });

  //   beforeAll(async () => {
  //     const a = await createManyProducts(105, jwtToken);
  //     if (typeof a == Error) console.error(a);
  //   });

  //   let lastId;

  //   it('should get feed with pagination', async () => {
  //     return request(app)
  //       .get('/api/feed/flat')
  //       .set('Authorization', anotherJwtToken)
  //       .expect(httpStatus.OK)
  //       .then(res => {
  //         const { data } = res.body;
  //         expect(data).toHaveLength(50);
  //         lastId = data[49]._id;
  //       });
  //   });

  //   it('should get feed with load more', async () => {
  //     return request(app)
  //       .get(`/api/feed/flat?lastId=${lastId}`)
  //       .set('Authorization', anotherJwtToken)
  //       .expect(httpStatus.OK)
  //       .then(res => {
  //         const { data } = res.body;
  //         expect(data[0]._id).not.toBe(lastId);
  //         expect(data).toHaveLength(50);
  //       });
  //   });
  // });
});
