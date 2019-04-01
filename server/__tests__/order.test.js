// @flow

import httpStatus from 'http-status';
import path from 'path';
import request from 'supertest';
import superagent from 'superagent';
import mockSuperagent from 'superagent-mock';

import { agenda } from '../config/express';
import config from '../config/config';

import app from '../index';

import { Tag, Order } from '../models';
import { i18n } from '../controllers/order.controller';
import {
  beforeAllTests,
  confirmOrder,
  createOrder,
  createProduct,
  createUserAndLogin,
  mock,
  orderFields,
  payOrder,
} from './utils';
import {
  buyerNeedsToPay,
  buyerPaidDeal,
  buyerPaymentCVCFailure,
  buyerPaymentFailure,
  dealConfirmationResp,
  sellerCancelsAPaidDeal,
  sellerConfirmedResponse,
} from '../helpers/shipping';

const photos = {
  photos: [
    'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
  ],
};

describe('## Order APIs', () => {
  beforeAll(beforeAllTests);

  let firstUser = {
    username: 'firstperson',
    emailAddress: 'gianpa+test@gmail.com',
    password: 'expressos',
    mobileNumber: '380677929197',
  };

  let anotherUser = {
    username: 'anotherperson',
    emailAddress: 'gianpa+test2@gmail.com',
    password: 'express2',
    pushToken: 'anotherpersonPushToken',
    platform: 'ios',
    mobileNumber: '380977414301',
  };

  let nonActiveUser = {
    username: 'thirdperson',
    emailAddress: 'gianpa+test3@gmail.com',
    password: 'expressos',
  };

  let forthUser = {
    username: 'forthperson',
    emailAddress: 'gianpa+test4@gmail.com',
    password: 'expressos4',
  };

  let productA = {
    categoryIds: [1, 2, 3],
    typeIds: [1, 2, 3],
    tags: ['winter', 'spring2007'], // optional
    description: 'nice boots',
    // seller id is the user who creates the product
    price: '1190.99', // if no decimal points .00 will be added
    ...photos,
  };

  let productB = {
    categoryIds: [3],
    typeIds: [1, 3],
    tags: ['summer'],
    description: 'nice flipflops',
    price: '190.99',
    ...photos,
  };

  let productC = {
    categoryIds: [2],
    typeIds: [2, 3],
    description: 'nice shorts',
    price: '200.50',
    ...photos,
  };

  let firstUserProductAUuid,
    firstUserProductBUuid2,
    anotherUserProductUuid,
    anotherUserProductUuid2,
    anotherUserProductUuid3;
  let firstUserJwtToken,
    anotherJwtToken,
    nonActiveUserJwtToken,
    forthJwtToken,
    userWebToken1,
    userWebToken2;
  let ordersByFirstUser = 0,
    ordersToFirstUser = 0,
    ordersByAnotherUser = 0,
    ordersToAnotherUser = 0;

  let superagentMock;
  let mailJetParams;

  const mailjetServerEndPoint = 'https://api.mailjet.com/v3';

  beforeAll(() => {
    superagentMock = mockSuperagent(superagent, [
      {
        pattern: `${mailjetServerEndPoint}`,
        fixtures: (match, params) => {
          mailJetParams = params;
          return {};
        },
        post: (match, data) => ({ body: data }),
      },
    ]);
  });

  // create 3 users. 1 not activated + 2 web users
  beforeAll(async () => {
    const { user: resUser, jwtToken: token } = await createUserAndLogin(
      firstUser
    );
    firstUser._id = resUser._id;
    firstUserJwtToken = token;
    await Promise.all([
      request(app)
        .put(`/api/users/${firstUser._id}`)
        .set('Authorization', firstUserJwtToken)
        .attach('profilePic', path.join(__dirname, 'images/profilepic.jpg'))
        .expect(httpStatus.OK),
      Tag.create([{ _id: 'winter' }, { _id: 'summer' }]),
    ]);
    const { user: resUser2, jwtToken: token2 } = await createUserAndLogin(
      anotherUser
    );
    anotherUser._id = resUser2._id;
    anotherJwtToken = token2;
    const { user: resUser4, jwtToken: token4 } = await createUserAndLogin(
      forthUser
    );
    forthUser._id = resUser4._id;
    forthJwtToken = token4;
    await request(app)
      .post('/api/users')
      .send(nonActiveUser)
      .expect(httpStatus.CREATED)
      .then(res => {
        const resUser = res.body.data;
        expect(typeof resUser._id).toBe('string');
        expect(resUser.username).toBe(nonActiveUser.username);
        expect(resUser.emailAddress).toBe(nonActiveUser.emailAddress);
        expect(resUser.accountStatus).toBe('notverified');
        expect(resUser).not.toHaveProperty('password');
        expect(typeof res.body.token).toBe('string');
        nonActiveUserJwtToken = res.body.token;
        // flow-disable-next-line
        nonActiveUser._id = resUser._id;
      });
    const {
      body: { token: token5 },
    } = await request(app)
      .post('/api/users-web')
      .expect(httpStatus.CREATED);
    userWebToken1 = token5;
    const {
      body: { token: token6 },
    } = await request(app)
      .post('/api/users-web')
      .expect(httpStatus.CREATED);
    userWebToken2 = token6;
  });

  // create 4 products and delete 1 of them
  beforeAll(done => {
    let Promises = [];
    Promises.push(
      createProduct(productA, firstUserJwtToken).then(p => {
        firstUserProductAUuid = p.uuid;
      })
    );
    Promises.push(
      createProduct(productC, anotherJwtToken).then(p => {
        anotherUserProductUuid = p.uuid;
      })
    );
    Promises.push(
      createProduct(productC, anotherJwtToken).then(p => {
        anotherUserProductUuid2 = p.uuid;
      })
    );
    Promises.push(
      createProduct(productC, anotherJwtToken).then(p => {
        anotherUserProductUuid3 = p.uuid;
      })
    );

    // create product and delete it
    Promises.push(
      createProduct(productB, firstUserJwtToken).then(p =>
        request(app)
          .delete(`/api/products/${p.uuid}`)
          .set('Authorization', firstUserJwtToken)
          .expect(httpStatus.NO_CONTENT)
          .then(res => {
            expect(res.body).toMatchObject({});
            ordersByFirstUser++;
            firstUserProductBUuid2 = p.uuid;
          })
      )
    );

    Promise.all(Promises)
      .then(() => done())
      .catch(e => console.error(e));
  });

  afterAll(() => {
    superagentMock.unset();
  });

  describe('# POST /api/orders', () => {
    it('should create an order for a product under 1000', () => {
      return request(app)
        .post('/api/orders')
        .set('Authorization', firstUserJwtToken)
        .send({ product: anotherUserProductUuid })
        .expect(httpStatus.CREATED)
        .then(res => {
          const o = res.body.data;
          expect(Object.keys(o).sort()).toEqual(orderFields);
          expect(o.status).toBe('pending');
          expect(o.currency).toBe('UAH');
          expect(o.onovaFee).toBe((productC.price * 0.085).toString()); // 8.5 %
          expect(o.total).toBe(parseFloat(productC.price).toString()); // for buyer
          expect(o.transactionFee).toBe(
            parseFloat(productC.price * 0.015 + 10).toString()
          ); // for seller
          expect(o.priceOfItem).toBe(productC.price);
          ordersToAnotherUser++;
        });
    });

    it('should create an order for a product over 1000', () => {
      const price = parseFloat(productA.price);
      return request(app)
        .post('/api/orders')
        .set('Authorization', anotherJwtToken)
        .send({ product: firstUserProductAUuid })
        .expect(httpStatus.CREATED)
        .then(res => {
          const o = res.body.data;
          expect(Object.keys(o).sort()).toEqual(orderFields);
          expect(o.status).toBe('pending');
          expect(o.currency).toBe('UAH');
          expect(o.onovaFee).toBe((price * 0.035).toString()); // 3.5 %
          expect(o.total).toBe(price.toString()); // for buyer
          expect(o.transactionFee).toBe((price * 0.015 + 10).toString()); // for seller
          expect(o.priceOfItem).toBe(productA.price);
          ordersToFirstUser++;
          ordersByAnotherUser++;
        });
    });

    it('should NOT create a duplicate order for the same product and buyer', () => {
      return request(app)
        .post('/api/orders')
        .set('Authorization', firstUserJwtToken)
        .send({ product: anotherUserProductUuid })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.message).toContain('Duplicate order');
        });
    });

    it('should NOT allow another buyer to order for the same product', () => {
      return request(app)
        .post('/api/orders')
        .set('Authorization', forthJwtToken)
        .send({ product: anotherUserProductUuid })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe(
            'This product is not longer for sale or is reserved.'
          );
        });
    });

    it('should NOT create an order with an invalid product', () => {
      return request(app)
        .post('/api/orders')
        .set('Authorization', firstUserJwtToken)
        .send({ product: '5a7ae9c687bc431aba38f9daz' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toContain('fails to match the required');
        });
    });

    it('should NOT create an order if the product does not exist', () => {
      return request(app)
        .post('/api/orders')
        .set('Authorization', firstUserJwtToken)
        .send({ product: 'ABCxsPOL7G' })
        .expect(httpStatus.NOT_FOUND)
        .then(res => {
          expect(res.body.message).toBe('Product not found');
        });
    });

    it('should NOT create an order if the product is not for sale', () => {
      return request(app)
        .post('/api/orders')
        .set('Authorization', anotherJwtToken)
        .send({ product: firstUserProductBUuid2 })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe(
            'This product is not longer for sale or is reserved.'
          );
        });
    });

    it('should NOT create an order if the buyer is not verified', () => {
      return request(app)
        .post('/api/orders')
        .set('Authorization', nonActiveUserJwtToken)
        .send({ product: firstUserProductAUuid })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe(
            'Please verify your account before buying a product.'
          );
        });
    });

    it('should NOT create an order to my own product', () => {
      return request(app)
        .post('/api/orders')
        .set('Authorization', firstUserJwtToken)
        .send({ product: firstUserProductAUuid })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe('You cannot buy your own items');
        });
    });
  });

  describe('# GET /api/orders', () => {
    const productGET1OfAnother = {
      categoryIds: [1],
      typeIds: [1, 2],
      description: 'nice bo0ts',
      price: '900.99',
      ...photos,
    };
    let orderGET1;

    const productGET2 = {
      categoryIds: [1],
      typeIds: [1],
      description: 'shiny shoes',
      price: '440.99',
      ...photos,
    };

    beforeAll(done => {
      Promise.all([
        createProduct(productGET1OfAnother, anotherJwtToken).then(product =>
          createOrder(
            { ...product, ...productGET1OfAnother },
            firstUserJwtToken
          ).then(o => {
            expect(o.priceOfItem).toBe(productGET1OfAnother.price);
            orderGET1 = o.id;
            ordersByFirstUser++;
            ordersToAnotherUser++;
          })
        ),
        createProduct(productGET2, firstUserJwtToken).then(product =>
          createOrder({ ...product, ...productGET2 }, anotherJwtToken).then(
            o => {
              expect(o.priceOfItem).toBe(productGET2.price);
              ordersByAnotherUser++;
              ordersToFirstUser++;
            }
          )
        ),
      ])
        .then(() => done())
        .catch(err => {
          console.error(err);
          done(err);
        });
    });

    it('should get my order', () => {
      return request(app)
        .get(`/api/orders/${orderGET1}`)
        .set('Authorization', firstUserJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(Object.keys(o).sort()).toEqual(orderFields);
          expect(o.id).toBe(orderGET1);
          expect(o.status).toBe('pending');
          expect(o.currency).toBe('UAH');
          expect(o.priceOfItem).toBe(productGET1OfAnother.price);
        });
    });

    it('should NOT get an order that`s not mine', () => {
      return request(app)
        .get(`/api/orders/${orderGET1}`)
        .set('Authorization', forthJwtToken)
        .expect(httpStatus.UNAUTHORIZED)
        .then(res => {
          expect(res.body.message).toBe('Unauthorized');
          expect(res.body.ok).toBe(false);
        });
    });

    it('should get my order as a seller', () => {
      return request(app)
        .get(`/api/orders/${orderGET1}`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(Object.keys(o).sort()).toEqual(orderFields);
          expect(o.id).toBe(orderGET1);
          expect(o.status).toBe('pending');
          expect(o.currency).toBe('UAH');
          expect(o.priceOfItem).toBe(productGET1OfAnother.price);
        });
    });

    it('should get my orders (as seller and buyer)', () => {
      return request(app)
        .get('/api/orders')
        .set('Authorization', firstUserJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(Array.isArray(o));
          expect(o.length).toBe(ordersByFirstUser + ordersToFirstUser);
          expect(Object.keys(o[0]).sort()).toEqual(orderFields);
          expect(Object.keys(o[0].buyer).sort()).toMatchSnapshot();
          // this user didn't upload a profilePic
          expect(Object.keys(o[0].seller).sort()).toMatchSnapshot();
        });
    });

    it('should NOT get other people`s orders (as seller and buyer)', () => {
      return request(app)
        .get('/api/orders')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(Array.isArray(o));
          expect(Object.keys(o[0]).sort()).toEqual(orderFields);
          expect(o.length).toBe(ordersByAnotherUser + ordersToAnotherUser);
        });
    });
  });

  describe('# PUT /api/orders', () => {
    const productPOST1 = {
      categoryIds: [2],
      typeIds: [1, 3],
      description: 'best bo0ts',
      price: '1900.59',
      ...photos,
    };
    const productPOST2 = {
      categoryIds: [2],
      typeIds: [1],
      description: 'my old panties',
      price: '99900.59',
      ...photos,
    };
    let orderPOST1, orderPOST2, orderPOST3;

    beforeAll(done => {
      const Promises = [];
      Promises.push(
        createProduct(productPOST1, anotherJwtToken).then(product =>
          createOrder({ ...product, ...productPOST1 }, firstUserJwtToken).then(
            o => {
              expect(o.priceOfItem).toBe(productPOST1.price);
              orderPOST1 = o.id;
            }
          )
        )
      );

      Promises.push(
        createProduct(productPOST2, firstUserJwtToken).then(product =>
          createOrder({ ...product, ...productPOST2 }, anotherJwtToken).then(
            o => {
              expect(o.priceOfItem).toBe(productPOST2.price);
              orderPOST2 = o.id;
            }
          )
        )
      );

      Promises.push(
        createProduct(productPOST2, firstUserJwtToken).then(product =>
          createOrder({ ...product, ...productPOST2 }, anotherJwtToken).then(
            o => {
              expect(o.priceOfItem).toBe(productPOST2.price);
              orderPOST3 = o.id;
            }
          )
        )
      );

      Promise.all(Promises).then(() => done());
    });

    it('should NOT cancel an order that`s not mine', () => {
      return request(app)
        .put(`/api/orders/${orderPOST2}`)
        .set('Authorization', forthJwtToken)
        .send({ status: 'cancelled' })
        .expect(httpStatus.UNAUTHORIZED)
        .then(res => {
          expect(res.body.message).toBe('Unauthorized');
          expect(res.body.ok).toBe(false);
        });
    });

    it('should NOT cancel an invalid order', () => {
      return request(app)
        .put('/api/orders/BJCxsPOLGBJCxsPOLG')
        .set('Authorization', firstUserJwtToken)
        .send({ status: 'cancelled' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe('Invalid order');
          expect(res.body.ok).toBe(false);
        });
    });

    it('should NOT set an order status to `shipped`', () => {
      return request(app)
        .put(`/api/orders/${orderPOST1}`)
        .set('Authorization', firstUserJwtToken)
        .send({ status: 'shipped' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe(
            '"status" must be one of [confirmed, cancelled]'
          );
          expect(res.body.ok).toBe(false);
        });
    });

    it('should NOT allow the seller to cancel the order without a reason', () => {
      return request(app)
        .put(`/api/orders/${orderPOST2}`)
        .set('Authorization', firstUserJwtToken)
        .send({ status: 'cancelled' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe('"reason" is required');
          expect(res.body.ok).toBe(false);
        });
    });

    it('should allow the seller to cancel the order', () => {
      return request(app)
        .put(`/api/orders/${orderPOST2}`)
        .set('Authorization', firstUserJwtToken)
        .send({ status: 'cancelled', reason: 'it`s already sold' })
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(Object.keys(o).sort()).toMatchSnapshot();
          expect(o.priceOfItem).toBe(productPOST2.price);
          expect(o.status).toBe('cancelled');
          expect(o.reason).toBe('it`s already sold');
        });
    });

    it('should allow the buyer to cancel the order without a reason', () => {
      return request(app)
        .put(`/api/orders/${orderPOST3}`)
        .set('Authorization', anotherJwtToken)
        .send({ status: 'cancelled' })
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(Object.keys(o).sort()).toMatchSnapshot();
          expect(o.priceOfItem).toBe(productPOST2.price);
          expect(o.status).toBe('cancelled');
        });
    });

    it('should NOT set an order status from `cancelled` to `shipped`, etc.', () => {
      return request(app)
        .put(`/api/orders/${orderPOST2}`)
        .set('Authorization', anotherJwtToken)
        .send({ status: 'shipped' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe(
            '"status" must be one of [confirmed, cancelled]'
          );
          expect(res.body.ok).toBe(false);
        });
    });

    it('should NOT set an order to an invalid status', () => {
      return request(app)
        .put(`/api/orders/${orderPOST1}`)
        .set('Authorization', firstUserJwtToken)
        .send({ status: 'paidz' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe(
            '"status" must be one of [confirmed, cancelled]'
          );
          expect(res.body.ok).toBe(false);
        });
    });

    it.skip('should change the paymentMethod to `paypal`', () => {
      return request(app)
        .put(`/api/orders/${orderPOST1}`)
        .set('Authorization', firstUserJwtToken)
        .send({ paymentMethod: 'paypal' })
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(Object.keys(o).sort()).toMatchSnapshot();
          expect(o.priceOfItem).toBe(productPOST1.price);
          expect(o.paymentMethod).toBe('paypal');
        });
    });

    it('should NOT change the paymentMethod if invalid', () => {
      return request(app)
        .put(`/api/orders/${orderPOST1}`)
        .set('Authorization', firstUserJwtToken)
        .send({ paymentMethod: 'paypalz' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe(
            '"paymentMethod" must be one of [paypal, uapay]'
          );
          expect(res.body.ok).toBe(false);
        });
    });

    it('should NOT archive an order and change status', () => {
      return request(app)
        .put(`/api/orders/${orderPOST1}`)
        .set('Authorization', firstUserJwtToken)
        .send({ archive: true, status: 'cancelled' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe(
            'cannot change the status and archive at the same time'
          );
        });
    });

    it('should archive an order (as buyer)', () => {
      return request(app)
        .put(`/api/orders/${orderPOST1}`)
        .set('Authorization', firstUserJwtToken)
        .send({ archive: true })
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(o.priceOfItem).toBe(productPOST1.price);
          expect(o.archivedByBuyer).toBe(true);
        });
    });

    it('should archive an order (as seller)', () => {
      return request(app)
        .put(`/api/orders/${orderPOST1}`)
        .set('Authorization', anotherJwtToken)
        .send({ archive: true })
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(o.priceOfItem).toBe(productPOST1.price);
          expect(o.archivedByBuyer).toBe(true);
        });
    });
  });

  describe('# PUT /api/orders (more)', () => {
    const productPOST2 = {
      categoryIds: [2],
      typeIds: [1],
      description: 'my old panties',
      price: '99900.59',
      ...photos,
    };
    let orderPOST3, orderPOST4, orderPOST5;
    let orderPOST3ProdUUID, orderPOST4ProdUUID;

    beforeAll(async () => {
      await createProduct(productPOST2, firstUserJwtToken).then(product =>
        createOrder({ ...product, ...productPOST2 }, anotherJwtToken).then(
          o => {
            expect(o.priceOfItem).toBe(productPOST2.price);
            orderPOST3ProdUUID = product.uuid;
            orderPOST3 = o.id;
          }
        )
      );

      await createProduct(productPOST2, firstUserJwtToken).then(product =>
        createOrder({ ...product, ...productPOST2 }, anotherJwtToken).then(
          o => {
            expect(o.priceOfItem).toBe(productPOST2.price);
            // orderPOST4ProdUUID = product.uuid;
            orderPOST4 = o.id;
          }
        )
      );

      // TODO: mock UAPAY API for making payments
      await Order.updateOne({ _id: orderPOST4 }, { status: 'paid' });

      await createProduct(productPOST2, firstUserJwtToken).then(product =>
        createOrder({ ...product, ...productPOST2 }, anotherJwtToken).then(
          o => {
            expect(o.priceOfItem).toBe(productPOST2.price);
            orderPOST5 = o.id;
          }
        )
      );
    });

    it('should allow the buyer to cancel an order', async () => {
      await request(app)
        .get(`/api/products/${orderPOST3ProdUUID}`)
        .expect(httpStatus.OK)
        .then(res => {
          const p = res.body.data;
          expect(p.status).toBe('reserved');
        });
      await request(app)
        .put(`/api/orders/${orderPOST3}`)
        .set('Authorization', anotherJwtToken)
        .send({ status: 'cancelled' })
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(Object.keys(o).sort()).toMatchSnapshot();
          expect(o.priceOfItem).toBe(productPOST2.price);
          expect(o.status).toBe('cancelled');
        });
      await request(app)
        .get(`/api/products/${orderPOST3ProdUUID}`)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data.status).toBe('forsale'));
    });

    it('should allow another buyer to create an order for the same product (after the previous order cancellation)', () => {
      return request(app)
        .post(`/api/orders`)
        .set('Authorization', forthJwtToken)
        .send({ product: orderPOST3ProdUUID })
        .expect(httpStatus.CREATED)
        .then(res => {
          const o = res.body.data;
          expect(o.buyer).toBe(forthUser._id);
        });
    });

    it('should NOT allow the buyer to confirm the order', () => {
      return request(app)
        .put(`/api/orders/${orderPOST4}`)
        .set('Authorization', anotherJwtToken)
        .send({ status: 'confirmed' })
        .expect(httpStatus.UNAUTHORIZED)
        .then(res => {
          expect(res.body.message).toBe('Unauthorized');
          expect(res.body.ok).toBe(false);
        });
    });

    it('should NOT confirm an order that is not paid', () => {
      return request(app)
        .put(`/api/orders/${orderPOST5}`)
        .set('Authorization', firstUserJwtToken)
        .send({ status: 'confirmed' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe(
            'cannot confirm an order that is not paid'
          );
          expect(res.body.ok).toBe(false);
        });
    });
  });

  describe.skip('# Web Payments', () => {
    let orderIdWeb1, orderIdWeb2;

    const UserWeb = {
      emailAddress: 'gianpa+autotestwebuser1@gmail.com',
      paymentInfoPayload:
        '2zNu7MwoGb5ovdnwctMmaCsTHRAJetjVertfZk3ta62znkhvtwAPeFZj2dngnAngXgqECAuEJAddghgVm6SWCJn584GVghQjf4uyqHRvPgw34PiCWx',
      shippingAddress: {
        firstName: 'Джанфранко',
        lastName: 'Палумбо',
        // Київ
        city: '8d5a980d-391c-11dd-90d9-001a92567626',
        // Відділення №1: вул. Червонопрапорна, 34 (Корчувате)
        departmentNovaposhta: '1ec09d88-e1c2-11e3-8c4a-0050568002cf',
      },
    };

    test('a web user creates an order', () => {
      const price = parseFloat(productC.price);
      return request(app)
        .post('/api/orders')
        .set('Authorization', userWebToken1)
        .send({ product: anotherUserProductUuid2 })
        .expect(httpStatus.CREATED)
        .then(res => {
          const o = res.body.data;
          expect(Object.keys(o).sort()).toEqual(orderFields);
          expect(o.status).toBe('pending');
          expect(o.currency).toBe('UAH');
          expect(o.onovaFee).toBe((price * 0.085).toString()); // 8.5 %
          expect(o.total).toBe(price.toString()); // for buyer
          expect(o.transactionFee).toBe((price * 0.015 + 10).toString()); // for seller
          expect(o.priceOfItem).toBe(productC.price);
          orderIdWeb1 = o.id;
          ordersToAnotherUser++;
        });
    });

    test('a seller confirms the order from the web', async done => {
      const dealID = '9B27M6F';

      await request(app)
        .put('/api/users-web/me')
        .set('Authorization', userWebToken1)
        .send(UserWeb)
        .expect(httpStatus.OK);
      await payOrder(orderIdWeb1, userWebToken1, dealID);

      expect(mailJetParams.Messages[0].Subject).toBe(i18n.orderPaidForSeller);
      expect(mailJetParams.Messages[0].To[0].Email).toBe(
        anotherUser.emailAddress
      );

      // FIXME:
      // setTimeout(() => {
      //   expect(mailJetParams.Messages[0].Subject).toBe(i18n.orderPaidForBuyer);
      //   expect(mailJetParams.Messages[0].To[0].Email).toBe(
      //     UserWeb.emailAddress
      //   );
      // }, 50);

      await confirmOrder(orderIdWeb1, anotherJwtToken, dealID);
      await request(app)
        .get(`/api/products/${anotherUserProductUuid2}`)
        .expect(httpStatus.OK)
        .then(res => expect(res.body.data.status).toBe('sold'));

      expect(mailJetParams.Messages[0].To[0].Email).toBe(UserWeb.emailAddress);
      expect(mailJetParams.Messages[0].Subject).toContain(
        i18n.orderConfirmed.slice(0, -20)
      );

      // order confirmation should schedule a System message
      setTimeout(() => {
        agenda.jobs({ name: config.JOBNAMES.SYSTEM_MSG }, (err, jobs) => {
          if (err) return done(err);
          expect(jobs).toHaveLength(1);
          const { data } = jobs.map(j => j.attrs)[0];
          expect(data.order._id.toString()).toBe(orderIdWeb1);
          expect(data.order.shippingProvider).toBe('novaposhta');
          expect(data.order.trackingNumber).toBe(
            sellerConfirmedResponse.data.handler.waybillNumber.toString()
          );
          expect(data.message).toContain(i18n.orderConfirmed.slice(0, 30));
          done();
        });
      }, 10);
    });

    test('a seller cancels the order from the web', async () => {
      const dealID = '7B27M6A';

      const UserWeb2 = {
        ...UserWeb,
        emailAddress: 'gianpa+autotestwebuser2@gmail.com',
      };

      await request(app)
        .post('/api/orders')
        .set('Authorization', userWebToken2)
        .send({ product: anotherUserProductUuid3 })
        .expect(httpStatus.CREATED)
        .then(res => {
          const o = res.body.data;
          expect(o.status).toBe('pending');
          expect(o.priceOfItem).toBe(productC.price);
          orderIdWeb2 = o.id;
          ordersToAnotherUser++;
        });

      await request(app)
        .put('/api/users-web/me')
        .set('Authorization', userWebToken2)
        .send(UserWeb2)
        .expect(httpStatus.OK);
      await payOrder(orderIdWeb2, userWebToken2, dealID);

      expect(mailJetParams.Messages[0].Subject).toBe(i18n.orderPaidForSeller);
      expect(mailJetParams.Messages[0].To[0].Email).toBe(
        anotherUser.emailAddress
      );

      mock
        .onPost(`/deals/${dealID}/rejections`)
        .reply(200, sellerCancelsAPaidDeal);
      await request(app)
        .put(`/api/orders/${orderIdWeb2}`)
        .set('Authorization', anotherJwtToken)
        .send({ status: 'cancelled', reason: 'already sold on the dark web' })
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(o.status).toBe('cancelled');
          expect(o.transactionStatus).toBe('ua-finished');
          expect(o.transactionId).toBe(dealID);
          expect(typeof o.dateCancelled).toBe('string');
          expect(o.reason).toBe('already sold on the dark web');
        });

      expect(mailJetParams.Messages[0].To[0].Email).toBe(UserWeb2.emailAddress);
      expect(mailJetParams.Messages[0].Subject).toContain(i18n.orderCancelled);
    });
  });

  describe('# PUT /api/orders/:orderId/pay', () => {
    const productPOST2 = {
      categoryIds: [2],
      typeIds: [1],
      description: 'my old panties',
      price: '1000.00',
      ...photos,
    };
    let orderId, orderId2, orderId3, orderId4;
    let order2ProdUUID, order3ProdUUID;

    beforeAll(async () => {
      await createProduct(productPOST2, firstUserJwtToken).then(product =>
        createOrder({ ...product, ...productPOST2 }, anotherJwtToken).then(
          o => {
            expect(o.priceOfItem).toBe(productPOST2.price);
            orderId = o.id;
          }
        )
      );
      await createProduct(productPOST2, firstUserJwtToken).then(product =>
        createOrder({ ...product, ...productPOST2 }, anotherJwtToken).then(
          o => {
            expect(o.priceOfItem).toBe(productPOST2.price);
            order2ProdUUID = product.uuid;
            orderId2 = o.id;
          }
        )
      );
      await createProduct(productPOST2, firstUserJwtToken).then(product =>
        createOrder({ ...product, ...productPOST2 }, anotherJwtToken).then(
          o => {
            expect(o.priceOfItem).toBe(productPOST2.price);
            order3ProdUUID = product.uuid;
            orderId3 = o.id;
          }
        )
      );
      await createProduct(productPOST2, firstUserJwtToken).then(product =>
        createOrder({ ...product, ...productPOST2 }, anotherJwtToken).then(
          o => {
            expect(o.priceOfItem).toBe(productPOST2.price);
            orderId4 = o.id;
          }
        )
      );
    });

    it('should NOT allow another buyer to pay for an order', () => {
      return request(app)
        .post(`/api/orders/${orderId}/pay`)
        .set('Authorization', forthJwtToken)
        .send({ cvc: '123' })
        .expect(httpStatus.UNAUTHORIZED)
        .then(res => {
          expect(res.body.message).toBe('Unauthorized');
          expect(res.body.ok).toBe(false);
        });
    });

    it('should NOT pay with an invalid CVC', () => {
      return request(app)
        .post(`/api/orders/${orderId}/pay`)
        .set('Authorization', anotherJwtToken)
        .send({ cvc: 'abc' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe('Invalid CVC');
          expect(res.body.ok).toBe(false);
        });
    });

    it('should create a payment for an order', async () => {
      const dealID = '9B27M6A';
      mock.onPost('/carts').reply(200, { data: { id: 574, deals: [] } });
      mock.onPost('/deals').reply(200, { data: { id: dealID } });
      mock.onPost(`/deals/${dealID}/payments`).reply(200);
      mock.onGet(`/deals/${dealID}`).reply(200, buyerNeedsToPay);
      mock
        .onGet('/handlers/NovaPoshta/costs')
        .reply(200, { data: { handlerPrice: 2500 } });

      const { confirmation } = buyerNeedsToPay.data.productPayment.details;
      await request(app)
        .post(`/api/orders/${orderId}/pay`)
        .set('Authorization', anotherJwtToken)
        .send({ cvc: '123' })
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          expect(body.data.order.status).toBe('pending');
          expect(body.data.payment.redirectUrl).toBe(confirmation.redirectUrl);
          expect(body.data.payment.url).toContain(confirmation.url);
          expect(body.data.payment.PaReq).toBe(confirmation.form.PaReq);
          expect(Object.keys(body.data.payment).sort()).toMatchSnapshot();
        });

      return request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data.id).toBe(orderId);
          expect(body.data.status).toBe('pending');
          expect(body.data.transactionStatus).toBe('ua-pending');
          expect(body.data.currency).toBe('UAH');
          expect(body.data.priceOfItem).toBe(productPOST2.price);
          expect(body.data.shippingFee).toBe('25.00');
        });
    });

    it('should NOT create a payment for an order if payment info', () => {
      const dealID = '9B27M6B';
      mock.onPost('/carts').reply(200, { data: { id: 575, deals: [] } });
      mock.onPost('/deals').reply(200, { data: { id: dealID } });
      mock.onPost(`/deals/${dealID}/payments`).reply(200);
      mock.onGet(`/deals/${dealID}`).reply(200, buyerPaymentFailure);
      return request(app)
        .post(`/api/orders/${orderId}/pay`)
        .set('Authorization', anotherJwtToken)
        .send({ cvc: '123' })
        .expect(httpStatus.INTERNAL_SERVER_ERROR)
        .then(({ body }) => {
          expect(body.message).toBe('Internal server error'); // coming from UAPAY
        });
    });

    it('should return wrong CVC error', () => {
      mock.onPost('/carts').reply(200, { data: { id: 575, deals: [] } });
      mock.onPost('/deals').reply(200, { data: { id: '9B27M6E' } });
      mock.onPost(`/deals/9B27M6E/payments`).reply(200);
      mock.onGet(`/deals/9B27M6E`).reply(200, buyerPaymentCVCFailure);
      return request(app)
        .post(`/api/orders/${orderId}/pay`)
        .set('Authorization', anotherJwtToken)
        .send({ cvc: '123' })
        .expect(httpStatus.INTERNAL_SERVER_ERROR)
        .then(({ body }) => {
          expect(body.message).toBe('Wrong CVV2 value');
        });
    });

    test('a seller should cancel an order that has been paid', async () => {
      const dealID = '9B27M6E';
      await payOrder(orderId2, anotherJwtToken, dealID);

      // FYI: we're skipping the step where the seller confirms the order

      mock
        .onPost(`/deals/${dealID}/rejections`)
        .reply(200, sellerCancelsAPaidDeal);
      await request(app)
        .put(`/api/orders/${orderId2}`)
        .set('Authorization', firstUserJwtToken)
        .send({ status: 'cancelled', reason: 'i already sold this elsewhere' })
        .expect(httpStatus.OK)
        .then(res => {
          const o = res.body.data;
          expect(o.priceOfItem).toBe(productPOST2.price);
          expect(o.status).toBe('cancelled');
          expect(o.transactionStatus).toBe('ua-finished');
          expect(o.transactionId).toBe(dealID);
          expect(typeof o.dateCancelled).toBe('string');
          expect(o.reason).toBe('i already sold this elsewhere');
        });

      await request(app)
        .get(`/api/products/${order2ProdUUID}`)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data.status).toBe('forsale'));
    });

    test('a buyer should NOT cancel an order that has been paid', async () => {
      await payOrder(orderId4, anotherJwtToken, '9B27M6A');

      // FYI: we're skipping the step where the seller confirms the order

      await request(app)
        .put(`/api/orders/${orderId4}`)
        .set('Authorization', anotherJwtToken)
        .send({ status: 'cancelled' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe('cannot cancel a paid order');
          expect(res.body.ok).toBe(false);
        });
    });

    test('a seller should confirm an order that has been paid', async done => {
      const dealID = '9B27M6F';
      await payOrder(orderId3, anotherJwtToken, dealID);

      // FYI: we're skipping the step where the seller confirms the order

      mock
        .onPost(`/deals/${dealID}/confirmations`)
        .reply(200, dealConfirmationResp);
      mock.onGet(`/deals/${dealID}`).reply(200, sellerConfirmedResponse);
      await confirmOrder(orderId3, firstUserJwtToken, dealID);
      await request(app)
        .get(`/api/products/${order3ProdUUID}`)
        .expect(httpStatus.OK)
        .then(res => expect(res.body.data.status).toBe('sold'));

      // order confirmation should schedule a System message
      setTimeout(() => {
        agenda.jobs({ name: config.JOBNAMES.SYSTEM_MSG }, (err, jobs) => {
          if (err) return done(err);
          expect(jobs).toHaveLength(1);
          const { data } = jobs.map(j => j.attrs)[0];
          expect(data.order._id.toString()).toBe(orderId3);
          expect(data.order.shippingProvider).toBe('novaposhta');
          expect(data.order.trackingNumber).toBe(
            sellerConfirmedResponse.data.handler.waybillNumber.toString()
          );
          expect(data.message).toContain(i18n.orderConfirmed.slice(0, 30));
          done();
        });
      }, 10);
    });
  });

  describe('# GET /api/orders/:orderId/paymentStatus', () => {
    const product2 = {
      categoryIds: [2],
      typeIds: [1],
      description: 'my old panties',
      price: '1000.00',
      ...photos,
    };
    let orderId;

    beforeAll(async () => {
      await createProduct(product2, firstUserJwtToken).then(product =>
        createOrder({ ...product, ...product2 }, anotherJwtToken).then(o => {
          expect(o.priceOfItem).toBe(product2.price);
          orderId = o.id;
        })
      );
    });

    it('should NOT allow another buyer to get the Order payment status', () => {
      return request(app)
        .get(`/api/orders/${orderId}/paymentStatus`)
        .set('Authorization', forthJwtToken)
        .expect(httpStatus.UNAUTHORIZED)
        .then(res => {
          expect(res.body.message).toBe('Unauthorized');
          expect(res.body.ok).toBe(false);
        });
    });

    it('should NOT allow the seller to get the Order payment status', () => {
      return request(app)
        .get(`/api/orders/${orderId}/paymentStatus`)
        .set('Authorization', firstUserJwtToken)
        .expect(httpStatus.UNAUTHORIZED)
        .then(res => {
          expect(res.body.message).toBe('Unauthorized');
          expect(res.body.ok).toBe(false);
        });
    });

    it("should return if the Order doesn't have a payment (transactionId)", () => {
      return request(app)
        .get(`/api/orders/${orderId}/paymentStatus`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.data.rawStatus).toBe('none');
          expect(res.body.data.status).toBe('none');
        });
    });

    describe('get a payment finished status', () => {
      const dealID = '9B27M6E';
      beforeAll(() => {
        // start payment
        mock.onPost('/carts').reply(200, { data: { id: 576, deals: [] } });
        mock.onPost('/deals').reply(200, { data: { id: dealID } });
        mock.onPost(`/deals/${dealID}/payments`).reply(200);
        mock.onGet(`/deals/${dealID}`).reply(200, buyerNeedsToPay);
        return request(app)
          .post(`/api/orders/${orderId}/pay`)
          .set('Authorization', anotherJwtToken)
          .send({ cvc: '123' })
          .expect(httpStatus.CREATED)
          .then(({ body }) => {
            expect(body.data.order).toBeTruthy();
            expect(body.data.payment.redirectUrl).toContain(
              '.uapay.ua/api/payments/'
            );
            expect(body.data.payment.PaReq.length).toBeGreaterThan(400);
          });
      });

      it('should get payment status', () => {
        mock.onGet(`/deals/${dealID}`).reply(200, buyerPaidDeal);
        return request(app)
          .get(`/api/orders/${orderId}/paymentStatus`)
          .set('Authorization', anotherJwtToken)
          .expect(httpStatus.OK)
          .then(({ body }) => {
            expect(body.data.status).toBe('ua-finished');
            expect(body.data.rawStatus).toBe('FINISHED');
          });
      });
    });
  });
});
