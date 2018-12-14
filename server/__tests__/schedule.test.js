// @flow

import request from 'supertest';
import httpStatus from 'http-status';
import path from 'path';
import addDays from 'date-fns/add_days';
import BSON from 'bson';

import app from '../index';

import { Notification, Product, User } from '../models';
import { i18n } from '../controllers/schedule.controller';
import {
  clearJobs,
  createUserAndLogin,
  beforeAllTests,
  findJobs,
} from './utils';
import config from '../config/config';

jest.setTimeout(15000);

// if server.push is NOT running
const schedulerIsRunning = process.env.SCHEDULER_IS_RUNNING !== 'true';

if (!schedulerIsRunning) {
  console.warn('skipping tests with scheduler (server.push)');
}

describe('## Schedule APIs', () => {
  beforeAll(beforeAllTests);

  // $FlowFixMe
  let user1: UserDoc = {
    username: 'firstperson',
    emailAddress: 'gianpa+test@gmail.com',
    password: 'expressos',
    pushToken: 'testpushTokenpushToken',
  };

  // $FlowFixMe
  let user2: UserDoc = {
    username: 'secondperson',
    emailAddress: 'gianpa+test2@gmail.com',
    password: 'express2',
    pushToken: 'testpushTokenpushToken',
  };

  // $FlowFixMe
  let user3: UserDoc = {
    username: 'thirdperson',
    emailAddress: 'gianpa+test3@gmail.com',
    password: 'express3',
  };

  // $FlowFixMe
  let user4: UserDoc = {
    username: 'forthperson',
    emailAddress: 'gianpa+test4@gmail.com',
    password: 'express4',
  };

  let product = {
    categoryIds: [1, 2, 3],
    date: new Date(Date.now() + 12000), // 12 seconds
    typeIds: [1, 2, 3],
    tags: ['winter', 'spring2007'], // optional
    description: 'nice boots',
    price: '1100.99',
    photos: ['http://storage.googleapis.com/1527232263107'],
  };

  let jwtToken1, jwtToken2, jwtToken3, jwtToken4;

  // let productsCounter = 0;

  // create 4 users/sellers (2 without shipping address)
  beforeAll(async () => {
    const { user: resUser, jwtToken: token } = await createUserAndLogin(user1);
    user1._id = resUser._id;
    jwtToken1 = token;
    const { user: resUser2, jwtToken: token2 } = await createUserAndLogin(
      user2
    );
    user2._id = resUser2._id;
    jwtToken2 = token2;
    const { user: resUser3, jwtToken: token3 } = await createUserAndLogin(
      user3
    );
    user3._id = resUser3._id;
    jwtToken3 = token3;
    const { user: resUser4, jwtToken: token4 } = await createUserAndLogin(
      user4
    );
    user4._id = resUser4._id;
    jwtToken4 = token4;
    await Promise.all([
      request(app)
        .put(`/api/users/${user1._id}`)
        .set('Authorization', jwtToken1)
        .attach('profilePic', path.join(__dirname, 'images/profilepic.jpg'))
        .expect(httpStatus.OK),
      request(app)
        .put(`/api/users/${user3._id}`)
        .set('Authorization', jwtToken3)
        .send({ shippingAddress: {} })
        .expect(httpStatus.OK),
      User.updateOne({ _id: user4._id }, { $unset: { paymentInfo: '' } }),
    ]);
  });

  // describe('# POST /api/schedule', () => {
  //   it("should NOT scheduled an item to FB if user doesn't have a FB token", () => {
  //     return request(app)
  //       .post('/api/schedule')
  //       .set('Authorization', jwtToken)
  //       .send(product)
  //       .expect(httpStatus.BAD_REQUEST)
  //       .then(({ body }) =>
  //         expect(body.message).toContain('Please authorize with Facebook')
  //       );
  //   });
  // });

  describe('# POST /api/schedule', () => {
    beforeAll(() => {
      return request(app)
        .post('/api/photos/upload')
        .set('Authorization', jwtToken1)
        .attach('photo', path.join(__dirname, 'images/boots-larger.jpeg'))
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          expect(body.data).toContain(
            'https://storage.googleapis.com/temp-uploads.onova.co/'
          );
          product.photos = [body.data];
        });
    });

    beforeEach(() => {
      return Promise.all([
        Product.collection.deleteMany({}, { safe: true }),
        Notification.collection.deleteMany({}, { safe: true }),
        clearJobs(),
      ]);
    });

    it('should NOT schedule a drop invalid images', () => {
      return request(app)
        .post('/api/schedule')
        .set('Authorization', jwtToken1)
        .send({
          ...product,
          dropId: new BSON.ObjectId(),
          photos: ['http://asdfasd'],
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('Invalid photos'));
    });

    it('should NOT schedule a drop with a price to low', () => {
      return request(app)
        .post('/api/schedule')
        .set('Authorization', jwtToken1)
        .send({
          ...product,
          dropId: new BSON.ObjectId(),
          price: (config.settings.minPrice - 10).toString(),
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain(
            'Invalid product price. The minimum price is'
          )
        );
    });

    it(`should NOT schedule a drop if seller doesn't have a shipping address`, () => {
      return request(app)
        .post('/api/schedule')
        .set('Authorization', jwtToken3)
        .send({ ...product, dropId: new BSON.ObjectId() })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain('Please enter your shipping address')
        );
    });

    it(`should NOT schedule a drop if seller doesn't have payment info`, () => {
      return request(app)
        .post('/api/schedule')
        .set('Authorization', jwtToken4)
        .send({ ...product, dropId: new BSON.ObjectId() })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain('Please enter your payment info')
        );
    });

    it('should schedule listings in order', async done => {
      const dropDate = Date.now(); // in milliseconds
      const dropId = new BSON.ObjectId();
      let uuids;
      const promises = [
        request(app)
          .post('/api/schedule')
          .set('Authorization', jwtToken1)
          .send({
            ...product,
            dropId,
            date: new Date(dropDate + 500),
          })
          .expect(httpStatus.CREATED)
          .then(({ body }) => {
            const p = body.data.data.product;
            expect(p.categoryIds.sort()).toEqual(product.categoryIds);
            expect(p.createdAt).toBe(new Date(dropDate + 500).toISOString());
            expect(p.description).toBe(product.description);
            expect(p.dropId).toBe(dropId.toHexString());
            return p.uuid;
          }),
        request(app)
          .post('/api/schedule')
          .set('Authorization', jwtToken1)
          .send({
            ...product,
            dropId,
            date: new Date(dropDate),
          })
          .expect(httpStatus.CREATED)
          .then(({ body }) => {
            const p = body.data.data.product;
            expect(p.categoryIds.sort()).toEqual(product.categoryIds);
            expect(p.createdAt).toBe(new Date(dropDate).toISOString());
            expect(p.description).toBe(product.description);
            expect(p.dropId).toBe(dropId.toHexString());
            return p.uuid;
          }),
      ];
      try {
        uuids = await Promise.all(promises);
      } catch (error) {
        console.error(error);
        return done(error);
      }

      if (!schedulerIsRunning) return done();

      const waitFor = 15 * 1000; // seconds
      const interval = Math.floor(waitFor / 100);
      let totalTime = interval;

      // Check every 150ms for up to 15 seconds
      const timer = setInterval(async () => {
        totalTime += interval;

        const res = await request(app)
          .get(`/api/products/?userid=${user1._id}`)
          .expect(httpStatus.OK);
        const p = res.body.data;
        if (p.length) {
          expect(p).toHaveLength(2);
          // the first item will appear 2nd
          expect(p.map(p => p.uuid)).toEqual(uuids);
          done();
          clearInterval(timer);
          return;
        }
        if (totalTime >= waitFor) {
          clearInterval(timer);
          throw new Error('timeout');
        }
      }, interval);
    });

    it('should schedule a listing very soon', done => {
      const dropId = new BSON.ObjectId();
      request(app)
        .post('/api/schedule')
        .set('Authorization', jwtToken1)
        .send({ ...product, dropId })
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const p = body.data.data.product;
          expect(body.data.nextRunAt).toBe(product.date.toISOString());
          expect(Object.keys(body.data).sort()).toMatchSnapshot();
          expect(p.categoryIds.sort()).toEqual(product.categoryIds);
          expect(p.currency).toBe('UAH');
          expect(p.description).toBe(product.description);
          expect(p.photoURIs[0]).toContain('/products/');
          expect(p.price).toBe(product.price);
          expect(p.seller).toBe(user1._id);
          expect(p.status).toBe('forsale');
          expect(Array.isArray(p.tags));
          expect(p.tags).toEqual(product.tags);
          expect(p.typeIds.sort()).toEqual(product.typeIds);
          expect(Object.keys(p).sort()).toMatchSnapshot();

          if (!schedulerIsRunning) return done();

          const productUuid = p.uuid;
          const waitFor = 15 * 1000; // seconds
          const interval = Math.floor(waitFor / 100);
          let totalTime = interval;

          // Check every 150ms up to 15 seconds that
          // a Product has been created
          // a Notification has been created to the seller
          // a Push notification has been scheduled to the seller
          const timer = setInterval(async () => {
            totalTime += interval;
            const prod = await Product.findOne({ uuid: productUuid });
            const notif = await Notification.findOne({
              notifI18n: i18n.listedDrop,
            });

            if (prod && notif) {
              expect(notif.data.product.uuid).toBe(productUuid);

              expect(prod.uuid).toBe(productUuid);
              expect(p.photoURIs[0]).toContain('/products/');

              const jobs = await findJobs(config.JOBNAMES.PUSH_DROP_LISTED, {
                dropId,
              });

              if (jobs.length) {
                expect(jobs).toHaveLength(1);
                expect(jobs[0].message).toBe(i18n.listedDrop);
                done();
                clearInterval(timer);
                return;
              }
            }
            if (totalTime >= waitFor) {
              clearInterval(timer);
              throw new Error('timeout');
            }
          }, interval);
        });
    });

    it('should notify the seller once for a number of items in one Drop', async done => {
      const dropId = new BSON.ObjectId();
      const datetime = new Date();
      await Promise.all([
        request(app)
          .post('/api/schedule')
          .set('Authorization', jwtToken1)
          .send({
            ...product,
            dropId,
            price: '150',
            date: datetime,
          })
          .expect(httpStatus.CREATED)
          .then(({ body }) => {
            const p = body.data.data.product;
            expect(p.categoryIds.sort()).toEqual(product.categoryIds);
            expect(p.description).toBe(product.description);
            expect(p.price).toBe('150.00');
            expect(p.seller).toBe(user1._id);
            expect(p.status).toBe('forsale');
            expect(p.typeIds.sort()).toEqual(product.typeIds);
          }),
        request(app)
          .post('/api/schedule')
          .set('Authorization', jwtToken1)
          .send({
            ...product,
            dropId,
            price: '200',
            date: new Date(datetime + 500),
          })
          .expect(httpStatus.CREATED)
          .then(({ body }) => {
            const p = body.data.data.product;
            expect(p.price).toBe('200.00');
            expect(p.seller).toBe(user1._id);
            expect(p.status).toBe('forsale');
          }),
      ]);

      if (!schedulerIsRunning) return done();

      // const productUuid = p.uuid;
      const waitFor = 15 * 1000; // seconds
      const interval = Math.floor(waitFor / 100);
      let totalTime = interval;

      // Check every 150ms up to 15 seconds that
      // a Product has been created
      // a 1 Notification has been created to the seller
      // a 1 Push notification has been scheduled to the seller
      const timer = setInterval(async () => {
        totalTime += interval;
        const jobs = await findJobs(config.JOBNAMES.PUSH_DROP_LISTED, {
          dropId,
        });

        if (jobs.length) {
          const notif = await Notification.find({
            'data.product.dropId': dropId,
            notifI18n: i18n.listedDrop,
          });
          expect(notif).toHaveLength(1);
          expect(jobs).toHaveLength(1);
          expect(jobs[0].message).toBe(i18n.listedDrop);
          done();
          clearInterval(timer);
          return;
        }
        if (totalTime >= waitFor) {
          clearInterval(timer);
          throw new Error('timeout');
        }
      }, interval);
    });

    it('should NOT schedule a listing in the past', () => {
      return request(app)
        .post('/api/schedule')
        .set('Authorization', jwtToken1)
        .send({
          ...product,
          date: new Date('2018-05-28T20:23:20.000Z'),
          dropId: new BSON.ObjectId(),
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain('must be larger than or equal')
        );
    });

    it('should schedule a listing at 00:00:00 today', () => {
      return request(app)
        .post('/api/schedule')
        .set('Authorization', jwtToken1)
        .send({
          ...product,
          date: new Date(new Date(new Date().setHours(0, 0, 0, 0))),
          dropId: new BSON.ObjectId(),
        })
        .expect(httpStatus.CREATED)
        .then(({ body }) =>
          expect(body.data.data.product.description).toBe(product.description)
        );
    });

    it('should NOT scheduled an item after 3 months from today', () => {
      return request(app)
        .post('/api/schedule')
        .set('Authorization', jwtToken1)
        .send({
          ...product,
          date: addDays(new Date(Date.now()), 91),
          dropId: new BSON.ObjectId(),
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain('Cannot schedule listings after 90')
        );
    });
  });

  describe('# GET /api/schedule', () => {
    beforeAll(async () => {
      try {
        product.photos = [
          'https://storage.googleapis.com/temp-uploads.onova.co/',
        ];

        await Promise.all([
          clearJobs(),
          request(app)
            .post('/api/schedule')
            .set('Authorization', jwtToken1)
            .send({ ...product, dropId: new BSON.ObjectId() })
            .expect(httpStatus.CREATED),
          request(app)
            .post('/api/schedule')
            .set('Authorization', jwtToken2)
            .send({ ...product, dropId: new BSON.ObjectId() })
            .expect(httpStatus.CREATED),
        ]);
      } catch (error) {
        console.error(error);
      }
    });

    it('should NOT get scheduled listings without auth', () => {
      return request(app)
        .get('/api/schedule')
        .expect(httpStatus.UNAUTHORIZED);
    });

    it('should get my scheduled listings', () => {
      return request(app)
        .get('/api/schedule')
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          const firstDrop = body.data[Object.keys(body.data)[0]];
          expect(Object.keys(body.data).length).toBe(1);
          expect(firstDrop.length).toBe(1);
          expect(firstDrop[0].seller).toBe(user1._id);
        });
    });

    it('should get user2 scheduled listings', () => {
      return request(app)
        .get(`/api/schedule/?username=${user2.username}`)
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          const firstDrop = body.data[Object.keys(body.data)[0]];
          expect(Object.keys(body.data).length).toBe(1);
          expect(firstDrop.length).toBe(1);
          expect(firstDrop[0].seller).toBe(user2._id);
        });
    });

    it("should get NOT non-existant user's scheduled listings", () => {
      return request(app)
        .get('/api/schedule/?username=IDONTEXIST')
        .set('Authorization', jwtToken1)
        .expect(httpStatus.NOT_FOUND)
        .then(({ body }) => {
          expect(body.message).toBe('User not found');
        });
    });

    it('should get 0 scheduled listings', () => {
      return request(app)
        .get('/api/schedule')
        .set('Authorization', jwtToken3)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(Object.keys(body.data).length).toBe(0);
        });
    });
  });

  describe('# GET /api/schedule', () => {
    beforeAll(async () => {
      const drop1 = new BSON.ObjectId();
      product.photos = [
        'https://storage.googleapis.com/temp-uploads.onova.co/',
      ];
      try {
        await clearJobs();
        await Promise.all([
          request(app)
            .post('/api/schedule')
            .set('Authorization', jwtToken1)
            .send({ ...product, dropId: drop1 })
            .expect(httpStatus.CREATED),
          request(app)
            .post('/api/schedule')
            .set('Authorization', jwtToken2)
            .send({ ...product, dropId: drop1 })
            .expect(httpStatus.CREATED),
          request(app)
            .post('/api/schedule')
            .set('Authorization', jwtToken2)
            .send({ ...product, dropId: new BSON.ObjectId() })
            .expect(httpStatus.CREATED),
        ]);
      } catch (error) {
        console.error(error);
      }
    });

    it('should get my scheduled listings', () => {
      return request(app)
        .get('/api/schedule')
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          const firstDrop = body.data[Object.keys(body.data)[0]];
          expect(Object.keys(body.data).length).toBe(1);
          expect(firstDrop.length).toBe(1);
          expect(firstDrop[0].seller).toBe(user1._id);
        });
    });

    it('should get user2 scheduled listings', () => {
      return request(app)
        .get(`/api/schedule/?username=${user2.username}`)
        .set('Authorization', jwtToken1)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          const firstDrop = body.data[Object.keys(body.data)[0]];
          expect(Object.keys(body.data).length).toBe(2);
          expect(firstDrop.length).toBe(1); // 1 product in first drop
          expect(firstDrop[0].seller).toBe(user2._id);
        });
    });
  });
});
