// @flow

import request from 'supertest';
import httpStatus from 'http-status';

import app from '../index';
import { Order, Product, Review } from '../models';
import {
  beforeAllTests,
  createOrder,
  createProduct,
  createUserAndLogin,
  followUser,
  orderCompletedFieldsWithReview,
  productFields,
} from './utils';

// GET & PUT /api/users/<id>/reviews should only return these fields
const reviewFields = ['_id', 'id', 'order', 'fromUser', 'targetUser', 'text', 'rateNumber', 'lang', 'createdAt'];

describe('## Order APIs', () => {
  beforeAll(beforeAllTests);

  let user1 = {
    username: 'userfirst',
    emailAddress: 'userfirst@gmail.com',
    password: 'expressos',
    pushToken: 'userfirstPushToken',
    platform: 'android',
  };

  let user2 = {
    username: 'useranother',
    emailAddress: 'useranother@gmail.com',
    password: 'express2',
    pushToken: 'user2PushToken',
    platform: 'ios',
  };

  let nonActiveUser = {
    username: 'nonactiveuser',
    emailAddress: 'nonactiveuser@gmail.com',
    password: 'expressos',
  };

  let user4 = {
    username: 'userfour',
    emailAddress: 'userfour@gmail.com',
    password: 'expressos4',
  };

  let productBoots = {
    categoryIds: [1, 2, 3],
    typeIds: [1, 2, 3],
    tags: ['winter', 'spring2007'], // optional
    description: 'nice boots',
    // seller id is the user who creates the product
    photos: ['https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg'],
    price: '1100.99', // if no decimal points .00 will be added
    quantity: 1,
  };

  let productFlipflops = {
    categoryIds: [3],
    typeIds: [1, 3],
    tags: ['summer'],
    description: 'nice flipflops',
    photos: ['https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg'],
    price: '800.99',
    quantity: 1,
  };

  let productShorts = {
    categoryIds: [2],
    typeIds: [2, 3],
    description: 'nice shorts',
    photos: ['https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg'],
    price: '200.50',
    quantity: 1,
  };

  let reviewTwo = {
    text: 'great stuff',
    rateNumber: 5,
    lang: 'en',
  };

  let productBootsUuid, productBootsUuid2;
  let productFlipflopsUuid;
  let productShortsUser2Uuid, productShortsUser2Uuid2;
  let jwtToken1, jwtToken2, jwtToken4;
  let userNotActiveJwtToken;
  let ordersAndReviewsCountUser2 = 0;
  let ordersAndReviewsCountUser1 = 0;
  let ratingsTotalUserFirst = 0;
  let ratingsTotalUserAnother = 0;
  let reviewsCountUserFirst = 0;
  let reviewsCountUserAnother = 0;
  let user1LeftReviewsAsBuyer = 0;
  let user1ReceivedReviewsAsBuyer = 0;
  let user1OrdersAsSeller = 0;
  let user1OrdersAsBuyer = 0;
  let user2ReceivedReviewsAsSeller = 0;
  let user2LeftReviewsAsSeller = 0;
  let user2OrdersAsSeller = 0;
  let user2OrdersAsBuyer = 0;

  // create 3 users. 1 not activated
  beforeAll(async () => {
    const { user: resUser, jwtToken: token } = await createUserAndLogin(user1);
    user1._id = resUser._id;
    jwtToken1 = token;
    const { user: resUser2, jwtToken: token2 } = await createUserAndLogin(user2);
    user2._id = resUser2._id;
    jwtToken2 = token2;
    const { user: resUser4, jwtToken: token4 } = await createUserAndLogin(user4);
    user4._id = resUser4._id;
    jwtToken4 = token4;
    const { body } = await request(app)
      .post('/api/users')
      .send(nonActiveUser)
      .expect(httpStatus.CREATED);
    const resUser5 = body.data;
    expect(typeof resUser5._id).toBe('string');
    expect(resUser5.username).toBe(nonActiveUser.username);
    expect(resUser5.emailAddress).toBe(nonActiveUser.emailAddress);
    expect(resUser5.accountStatus).toBe('notverified');
    expect(resUser5).not.toHaveProperty('password');
    await request(app)
      .post('/api/auth/login')
      .send({
        emailAddress: nonActiveUser.emailAddress,
        password: nonActiveUser.password,
      })
      .expect(httpStatus.OK)
      .then(res => {
        expect(res.body).toHaveProperty('token');
        userNotActiveJwtToken = res.body.token;
      });
  });

  // create 5 products and delete 1 of them
  beforeAll(async () => {
    try {
      await createProduct(productBoots, jwtToken1).then(p => {
        productBootsUuid = p.uuid;
      });
      await createProduct(productBoots, jwtToken1).then(p => {
        productBootsUuid2 = p.uuid;
      });
      await createProduct(productShorts, jwtToken2).then(p => {
        productShortsUser2Uuid = p.uuid;
      });
      await createProduct(productShorts, jwtToken2).then(p => {
        productShortsUser2Uuid2 = p.uuid;
      });

      // create product and delete it
      const p = await createProduct(productFlipflops, jwtToken1);

      productFlipflopsUuid = p.uuid;
      const res = await request(app)
        .delete(`/api/products/${productFlipflopsUuid}`)
        .set('Authorization', jwtToken1)
        .expect(httpStatus.NO_CONTENT);
      expect(res.body).toMatchObject({});
    } catch (error) {
      console.error(error);
      throw new Error(error);
    }
  });

  describe('# POST /api/users/:userId/review', () => {
    let orderOne,
      orderTwo,
      // orderThreePending,
      orderSix;

    // user1 orders productShorts (from user2)  [orderOne]
    // user2 orders productBoots  (from user1)  [orderTwo] {reviewTwo}
    // ~user4 orders productShorts2 (from user2) [orderThreePending]~
    // user4 orders productBoots2  (from user1) [orderSix]
    beforeAll(async () => {
      try {
        orderOne = await createOrder(
          {
            uuid: productShortsUser2Uuid,
            price: productShorts.price,
          },
          jwtToken1
        );
        const o = await Order.updateOne({ _id: orderOne.id }, { $set: { status: 'completed' } });
        expect(o.nModified).toBe(1);
        ordersAndReviewsCountUser1++;
        ordersAndReviewsCountUser2++;

        orderTwo = await createOrder(
          {
            uuid: productBootsUuid,
            price: productBoots.price,
          },
          jwtToken2
        );
        const o2 = await Order.updateOne({ _id: orderTwo.id }, { $set: { status: 'completed' } });
        expect(o2.nModified).toBe(1);
        reviewTwo.orderId = orderTwo.id;
        ordersAndReviewsCountUser1++;
        ordersAndReviewsCountUser2++;

        // orderThreePending = await createOrder(
        //   {
        //     uuid: productShortsUser2Uuid2,
        //     price: productShorts.price,
        //   },
        //   jwtToken4
        // );
        orderSix = await createOrder(
          {
            uuid: productBootsUuid2,
            price: productBoots.price,
          },
          jwtToken4
        );
        const o6 = await Order.updateOne({ _id: orderSix.id }, { $set: { status: 'completed' } });
        expect(o6.nModified).toBe(1);
        ordersAndReviewsCountUser1++;
      } catch (error) {
        console.error(error);
      }
    });

    // user1 <-> user2 follow each other
    beforeAll(() => Promise.all([followUser(jwtToken1, user2._id), followUser(jwtToken2, user1._id)]));

    // user1 reviews user2 +5 [orderOne]
    it('should create a review by the buyer', () => {
      return request(app)
        .post(`/api/users/${user2._id}/reviews`)
        .set('Authorization', jwtToken1)
        .send({
          orderId: orderOne.id,
          text: 'great seller AAA+',
          rateNumber: 5,
          lang: 'en',
        })
        .expect(httpStatus.CREATED)
        .then(async res => {
          ratingsTotalUserAnother += 5;
          reviewsCountUserAnother++;
          const o = res.body.data;
          expect(Object.keys(o).sort()).toEqual(reviewFields.sort());
          expect(o.order.id).toBe(orderOne.id);
          expect(o.order.citySender).toBe('Київ');
          expect(o.order.cityRecipient).toBe('Київ');
          expect(o.fromUser).toBe(user1._id);
          expect(o.targetUser).toBe(user2._id);
          expect(o.text).toBe('great seller AAA+');
          expect(o.rateNumber).toBe(5);
          expect(o.lang).toBe('en');
        });
    });

    it('should NOT create a duplicate review for that order (as buyer)', () => {
      return request(app)
        .post(`/api/users/${user2._id}/reviews`)
        .set('Authorization', jwtToken1)
        .send({
          orderId: orderOne.id,
          text: 'great seller AAA+ dupe',
          rateNumber: 3,
          lang: 'en',
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('Duplicate review'));
    });

    // user2 reviews user1 +5 [orderOne]
    it('should create a review by the seller', () => {
      return request(app)
        .post(`/api/users/${user1._id}/reviews`)
        .set('Authorization', jwtToken2)
        .send({
          orderId: orderOne.id,
          text: 'great buyer AAA+',
          rateNumber: 5,
          lang: 'en',
        })
        .expect(httpStatus.CREATED)
        .then(res => {
          ratingsTotalUserFirst += 5;
          reviewsCountUserFirst++;
          const o = res.body.data;
          expect(Object.keys(o).sort()).toEqual(reviewFields.sort());
          expect(o.order.id).toBe(orderOne.id);
          expect(o.fromUser).toBe(user2._id);
          expect(o.targetUser).toBe(user1._id);
          expect(o.text).toBe('great buyer AAA+');
          expect(o.rateNumber).toBe(5);
          expect(o.lang).toBe('en');
        });
    });

    it('should NOT create a duplicate review for the same order (as seller)', () => {
      return request(app)
        .post(`/api/users/${user1._id}/reviews`)
        .set('Authorization', jwtToken2)
        .send({
          orderId: orderOne.id,
          text: 'great buyer AAA+ dupe',
          rateNumber: 5,
          lang: 'en',
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('Duplicate review'));
    });

    it('should NOT create a review with an invalid rateNumber', () => {
      return request(app)
        .post(`/api/users/${user1._id}/reviews`)
        .set('Authorization', jwtToken1)
        .send({
          ...reviewTwo,
          rateNumber: 9,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('must be less than or equal to 5'));
    });

    it('should NOT create a review without a verified account', () => {
      return request(app)
        .post(`/api/users/${user1._id}/reviews`)
        .set('Authorization', userNotActiveJwtToken)
        .send(reviewTwo)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('Please verify your account before creating a review'));
    });

    it('should NOT create a review with an invalid order', () => {
      return request(app)
        .post(`/api/users/${user1._id}/reviews`)
        .set('Authorization', jwtToken1)
        .send({
          ...reviewTwo,
          orderId: '5ad0d405091374a087a7ffff',
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toBe('Invalid order'));
    });

    it('should NOT create a review with an invalid lang', () => {
      return request(app)
        .post(`/api/users/${user1._id}/reviews`)
        .set('Authorization', jwtToken1)
        .send({
          ...reviewTwo,
          lang: 'po',
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('must be one of [uk, en, n/a]'));
    });

    it('should NOT create a review with an invalid text', () => {
      return request(app)
        .post(`/api/users/${user1._id}/reviews`)
        .set('Authorization', jwtToken1)
        .send({
          ...reviewTwo,
          text: 'gr',
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('must be at least 7 characters'));
    });

    it('should NOT create a review for an order I`m not part of', () => {
      return request(app)
        .post(`/api/users/${user2._id}/reviews`)
        .set('Authorization', jwtToken2)
        .send({
          ...reviewTwo,
          orderId: orderSix.id,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toBe('Invalid order'));
    });

    it("should NOT create a review for an order that's is pending", () => {
      return request(app)
        .post(`/api/users/${user2._id}/reviews`)
        .set('Authorization', jwtToken2)
        .send({
          ...reviewTwo,
          orderId: orderSix.id,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toBe('Invalid order'));
    });

    // user4 reviews user1 [orderSix]
    it('should create a review by the buyer', () => {
      return request(app)
        .post(`/api/users/${user1._id}/reviews`)
        .set('Authorization', jwtToken4)
        .send({
          ...reviewTwo,
          orderId: orderSix.id,
        })
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          expect(body.data.order.id).toBe(orderSix.id);
          ratingsTotalUserFirst += 5;
          reviewsCountUserFirst++;
        });
    });

    it('should have updated the number of reviews and rating of the buyer', () => {
      return request(app)
        .get(`/api/users/${user1._id}`)
        .set('Authorization', jwtToken4)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.ratingsTotal).toBe(ratingsTotalUserFirst);
          expect(body.reviewsCount).toBe(reviewsCountUserFirst);
          expect(body.ordersAndReviewsCount).toBe(ordersAndReviewsCountUser1);
        });
    });

    it('should have updated the number of reviews and rating of the seller', () => {
      return request(app)
        .get(`/api/users/${user2._id}`)
        .set('Authorization', jwtToken4)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.ratingsTotal).toBe(ratingsTotalUserAnother);
          expect(body.reviewsCount).toBe(reviewsCountUserAnother);
          expect(body.ordersAndReviewsCount).toBe(ordersAndReviewsCountUser2);
        });
    });
  });

  describe('# GET /api/users/:userId/review', () => {
    // delete all Product, Orders and Reviews
    beforeAll(done => {
      const collections = [Order.collection, Product.collection, Review.collection];

      let todo = collections.length;
      if (!todo) return done();

      collections.forEach(collection => {
        collection.deleteMany({}, { safe: true }, () => {
          if (--todo === 0) done();
        });
      });
    });

    let orderFour, orderFive, orderSix;

    // user1 lists product B
    // user2 lists product S
    // user2 lists product S2
    beforeAll(async () =>
      Promise.all([
        createProduct(productBoots, jwtToken1).then(p => {
          productBootsUuid = p.uuid;
        }),
        createProduct(productShorts, jwtToken2).then(p => {
          productShortsUser2Uuid = p.uuid;
        }),
        createProduct(productShorts, jwtToken2).then(p => {
          productShortsUser2Uuid2 = p.uuid;
        }),
      ])
    );

    /**
     * | from           | action     | target      | order     |
     * | -------------- | ---------- | ----------- | --------- |
     * | user1 (buyer)  | reviews -> | user2       | orderFour |
     * | user2 (seller) | reviews -> | user1       | orderFour | - completed
     * | user2 (buyer)  | buys    -> | user1       | orderFive | (no reviews) - completed
     * | user1 (buyer)  | buys    -> | user2       | orderSix  | (seller user2 cancels) - cancelled
     *
     * user 2
     *    2 orders as seller (orderFour and orderSix) (1 with review)
     *    1 orders as buyer (orderFive) (without review)
     * == 3 orders
     *
     * user 1
     *    1 orders as seller (orderFive)
     *    2 orders as buyer (orderFour and orderSix) (1 with review)
     * == 3 orders
     */
    beforeAll(async () => {
      try {
        orderFour = await createOrder({ ...productShorts, uuid: productShortsUser2Uuid }, jwtToken1);
        const o = await Order.updateOne({ _id: orderFour.id }, { $set: { status: 'completed' } });
        expect(o.nModified).toBe(1);
        user2OrdersAsSeller++;
        user1OrdersAsBuyer++;

        orderFive = await createOrder({ ...productBoots, uuid: productBootsUuid }, jwtToken2);
        const o2 = await Order.updateOne({ _id: orderFive.id }, { $set: { status: 'completed' } });
        expect(o2.nModified).toBe(1);
        user1OrdersAsSeller++;
        user2OrdersAsBuyer++;

        orderSix = await createOrder({ ...productShorts, uuid: productShortsUser2Uuid2 }, jwtToken1);
        const o3 = await Order.updateOne(
          { _id: orderSix.id },
          { $set: { status: 'cancelled', reason: 'i sold it somewhere else' } }
        );
        user2OrdersAsSeller++;
        user1OrdersAsBuyer++;
        expect(o3.nModified).toBe(1);
      } catch (error) {
        console.error(error);
      }
      await request(app)
        .post(`/api/users/${user2._id}/reviews`)
        .set('Authorization', jwtToken1)
        .send({
          orderId: orderFour.id,
          text: 'great seller AAA+',
          rateNumber: 5,
          lang: 'en',
        })
        .expect(httpStatus.CREATED)
        .then(res => {
          const o = res.body.data;
          expect(o.order.id).toBe(orderFour.id);
          expect(o.fromUser).toBe(user1._id);
          expect(o.targetUser).toBe(user2._id);
          expect(o.text).toBe('great seller AAA+');
          expect(o.rateNumber).toBe(5);
          expect(o.lang).toBe('en');
        });
      user1LeftReviewsAsBuyer++;
      user2ReceivedReviewsAsSeller++;

      await request(app)
        .post(`/api/users/${user1._id}/reviews`)
        .set('Authorization', jwtToken2)
        .send({
          orderId: orderFour.id,
          text: 'great buyer AAA+',
          rateNumber: 5,
          lang: 'en',
        })
        .expect(httpStatus.CREATED)
        .then(res => {
          const o = res.body.data;
          expect(o.order.id).toBe(orderFour.id);
          expect(o.fromUser).toBe(user2._id);
          expect(o.targetUser).toBe(user1._id);
          expect(o.text).toBe('great buyer AAA+');
          expect(o.rateNumber).toBe(5);
          expect(o.lang).toBe('en');
        });
      user1ReceivedReviewsAsBuyer++;
      user2LeftReviewsAsSeller++;
    });

    it('should get all the user2 orders with reviews', () => {
      return request(app)
        .get(`/api/users/${user2._id}/reviews`)
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.data).toHaveLength(user2OrdersAsSeller + user2OrdersAsBuyer);
          const o = res.body.data.find(o => o.id === orderFour.id);
          expect(Object.keys(o).sort()).toEqual(orderCompletedFieldsWithReview);
          expect(o.priceOfItem).toBe(productShorts.price);
          expect(Object.keys(o.product).sort()).toEqual([...productFields, 'comments'].sort());
          expect(Object.keys(o.buyer).sort()).toMatchSnapshot();
          expect(Object.keys(o.seller).sort()).toMatchSnapshot();
          expect(o.reviewFromBuyer.fromUser).toBe(user1._id);
          expect(o.reviewFromBuyer.targetUser).toBe(user2._id);
          expect(o.reviewFromBuyer.text).toBe('great seller AAA+');
          expect(o.reviewFromBuyer.rateNumber).toBe(5);
          expect(o.reviewFromBuyer.lang).toBe('en');
        });
    });

    it('should get all the user1 orders with reviews', () => {
      return request(app)
        .get(`/api/users/${user1._id}/reviews`)
        .set('Authorization', jwtToken2)
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.data).toHaveLength(user1OrdersAsSeller + user1OrdersAsBuyer);
          const o = res.body.data.find(o => o.id === orderFour.id);
          expect(Object.keys(o).sort()).toEqual(orderCompletedFieldsWithReview);
          expect(o.priceOfItem).toBe(productShorts.price);
          expect(o.reviewFromSeller.fromUser).toBe(user2._id);
          expect(o.reviewFromSeller.targetUser).toBe(user1._id);
          expect(o.reviewFromSeller.text).toBe('great buyer AAA+');
          expect(o.reviewFromSeller.rateNumber).toBe(5);
          expect(o.reviewFromSeller.lang).toBe('en');
        });
    });

    it('should get the orders with reviews that user2 received as a seller', () => {
      return request(app)
        .get(`/api/users/${user2._id}/reviews/?as=seller`)
        .set('Authorization', jwtToken2)
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.data).toHaveLength(user2OrdersAsSeller);
          expect(res.body.data.filter(o => o.reviewFromBuyer)).toHaveLength(user2ReceivedReviewsAsSeller);
          const o = res.body.data.find(o => o.id === orderFour.id);
          expect(Object.keys(o).sort()).toEqual(orderCompletedFieldsWithReview);
          expect(o.priceOfItem).toBe(productShorts.price);
          expect(o.reviewFromBuyer.fromUser).toBe(user1._id);
          expect(o.reviewFromBuyer.targetUser).toBe(user2._id);
          expect(o.reviewFromBuyer.text).toBe('great seller AAA+');
          expect(o.reviewFromBuyer.rateNumber).toBe(5);
          expect(o.reviewFromBuyer.lang).toBe('en');
        });
    });

    it('should get the reviews that user1 received as a buyer', () => {
      return request(app)
        .get(`/api/users/${user1._id}/reviews/?as=buyer`)
        .set('Authorization', jwtToken2)
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.data).toHaveLength(user1OrdersAsBuyer);
          const o = res.body.data.find(o => o.id === orderFour.id);
          expect(Object.keys(o).sort()).toEqual(orderCompletedFieldsWithReview);
          expect(o.priceOfItem).toBe(productShorts.price);
          expect(o.reviewFromSeller.fromUser).toBe(user2._id);
          expect(o.reviewFromSeller.targetUser).toBe(user1._id);
          expect(o.reviewFromSeller.text).toBe('great buyer AAA+');
          expect(o.reviewFromSeller.rateNumber).toBe(5);
          expect(o.reviewFromSeller.lang).toBe('en');
        });
    });

    it('should get the reviews that user1 received as a seller', () => {
      return request(app)
        .get(`/api/users/${user1._id}/reviews/?as=seller`)
        .set('Authorization', jwtToken2)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data).toHaveLength(1);
          const o = body.data.find(o => o.id === orderFive.id);
          expect(o.status).toBe('completed');
          expect(o.reviewFromSeller).toBeUndefined();
          expect(o.reviewFromBuyer).toBeUndefined();
        });
    });

    it('should get the reviews that user2 received as a buyer', () => {
      return request(app)
        .get(`/api/users/${user2._id}/reviews/?as=buyer`)
        .set('Authorization', jwtToken2)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data).toHaveLength(user2OrdersAsBuyer));
    });

    it('should NOT get the reviews of an invalid user', () => {
      return request(app)
        .get(`/api/users/5ad104f6d07421b88545ffff/reviews`)
        .set('Authorization', jwtToken2)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('Invalid userId'));
    });

    // user1's orders (as buyer and seller)
    it('should get all my orders with my review status', () => {
      return request(app)
        .get('/api/orders')
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(Array.isArray(o));
          expect(o).toHaveLength(3);
          const o4 = o.find(order => order.id == orderFour.id);
          const o5 = o.find(order => order.id == orderFive.id);
          expect(o4.id).toBe(orderFour.id);
          expect(typeof o4.reviewFromBuyer).toBe('string');
          expect(typeof o4.reviewFromSeller).toBe('string');
          expect(o5.id).toBe(orderFive.id);
          expect(o5.reviewFromBuyer).toBeUndefined();
          expect(o5.reviewFromSeller).toBeUndefined();
        });
    });
  });
});
