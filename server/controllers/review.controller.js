// @flow

import httpStatus from 'http-status';
import request from 'request';
import differenceInCalendarDays from 'date-fns/difference_in_calendar_days';

import APIError from '../helpers/APIError';
import { Cities, Order, OrderDoc, Review, ReviewDoc, User, UserDoc } from '../models';

import config from '../config/config';
import Analytics from '../config/analytics';

declare class session$RequestList extends express$Request {
  order: OrderDoc;
  user: UserDoc;
  query: {
    as: string,
  };
  params: {
    userId: string,
  };
}

declare class session$RequestCreate extends express$Request {
  order: OrderDoc;
  user: UserDoc;
  body: {
    orderId: string,
    lang: string,
    rateNumber: number,
    text: string,
  };
}

/**
 * Get users's reviews
 *
 * GET /api/users/:userId/reviews
 *
 * @property {*} req - express session
 * @property {*} req.params - express session parameters
 * @property {MongoId} req.params.userId
 * @property {*} req.query - express session query
 * @property {string} req.query.as buyer|seller|both (default is both)
 */
async function list(req: session$RequestList, res: express$Response, next: express$NextFunction) {
  const { userId } = req.params;
  const { as } = req.query;
  // const { limit = 50, lastId } = req.query;
  // TODO: paginate inside list of reviews using limit & lastId

  // FIXME: embed review inside of Order model
  try {
    const user = await User.findById(userId);

    if (!user) throw new APIError('Invalid userId', httpStatus.BAD_REQUEST);

    // find all the orders with a finalised status
    // populate all those reviews

    let populate = 'product ';
    let query = {
      $or: [
        {
          status: { $in: ['completed', 'failed_by_buyer', 'failed_by_seller'] },
        },
        { status: 'cancelled', reason: { $exists: true } },
      ],
    };
    // const match = { targetUser: userId };

    if ('buyer' === as) {
      query = { ...query, buyer: userId };
      populate += 'reviewFromSeller';
    } else if ('seller' === as) {
      query = { ...query, seller: userId };
      populate += 'reviewFromBuyer';

      // the default
    } else if ('both' === as) {
      query = {
        ...query,
        $or: [{ buyer: userId }, { seller: userId }],
      };
      populate += 'reviewFromBuyer reviewFromSeller';
    }

    let orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .populate(populate)
      .populate({
        path: 'buyer seller',
        select: 'username',
      });
    // FIXME: only return productURIs from DB
    // .populate({
    //   path: 'product',
    //   select: 'photoURIs',
    // })

    // orders = orders.map(o => ({
    //   ...o,
    //   product: { photoURIs: o.product.photoURIs },
    // }));

    // sort by dateCompleted/dateFailed/dateCancelled
    // return res.json({
    //   data: orders.sort((a, b) => a.finalisedAt > b.finalisedAt),
    // });
    return res.json({ data: orders });
  } catch (err) {
    return next(err);
  }
}

/**
 * Create new review and create notification for the target
 *
 * POST /api/users/:userId/reviews
 *
 * @property {*} req Express request
 * @property {*} req.params Express params parameters
 * @property {string} req.params.userId The product userId (FIXME: remove param and rewrite API route using orderId)
 * @property {*} req.body Express body parameters
 * @property {string} req.body.orderId
 * @property {string} req.body.text
 * @property {number} req.body.rateNumber
 * @property {string} req.body.lang
 * @property {number} req.body
 */
async function create(req: session$RequestCreate, res: express$Response, next: express$NextFunction) {
  if (req.user.accountStatus !== 'verified') {
    const APIerr = new APIError('Please verify your account before creating a review.', httpStatus.BAD_REQUEST);
    return next(APIerr);
  }
  const { orderId, text, rateNumber, lang } = req.body;
  let order: OrderDoc;

  try {
    order = await Order.get(orderId, req.user._id.toString());

    if (['completed', 'failed_by_buyer', 'failed_by_seller'].indexOf(order.status) < 0) {
      throw new APIError(`Cannot create review on an order that is '${order.status}'`, httpStatus.BAD_REQUEST);
    }

    // let cities;
    // try {
    //   cities = await getValidTrackingNumberCities(
    //     trackingNumber
    //     // order.datePending
    //   );
    //   if (!cities) {
    //     const APIerr = new APIError(
    //       'The tracking number is not valid',
    //       httpStatus.BAD_REQUEST
    //     );
    //     return next(APIerr);
    //   }
    // } catch (err) {
    //   console.error(err);
    //   const APIerr = new APIError(
    //     'The tracking number is not valid',
    //     httpStatus.INTERNAL_SERVER_ERROR
    //   );
    //   return next(APIerr);
    // }

    const iAmTheSeller = req.user._id.toString() == order.seller._id.toString();
    const iAmTheBuyer = req.user._id.toString() == order.buyer._id.toString();
    const targetUser = iAmTheSeller ? order.buyer._id : order.seller._id;

    const review: ReviewDoc = new Review({
      fromUser: iAmTheSeller ? order.seller._id : order.buyer._id,
      targetUser,
      order: orderId,
      text,
      rateNumber,
      lang,
    });

    const savedReview = await review.save();

    await User.findByIdAndUpdate(targetUser, {
      $inc: { reviewsCount: 1, ratingsTotal: rateNumber },
    });

    const buyer = await User.findById(order.buyer);
    const seller = await User.findById(order.seller);

    const citySender = await Cities.findOne({
      id: seller.shippingAddress.city,
    });
    const cityRecipient = await Cities.findOne({
      id: buyer.shippingAddress.city,
    });

    order.citySender = citySender.uk;
    order.cityRecipient = cityRecipient.uk;

    if (iAmTheBuyer) {
      order.reviewFromBuyer = savedReview.id;
    } else {
      order.reviewFromSeller = savedReview.id;
    }
    await order.save();

    const data = { ...savedReview.toJSON(), order };

    if (config.env === 'production') {
      Analytics.track({
        userId: req.user._id.toString(),
        event: 'new_review',
        properties: {
          cityRecipient: order.cityRecipient,
          citySender: order.citySender,
          fromUser: savedReview.fromUser,
          fromSeller: iAmTheSeller,
          rateNumber: savedReview.rateNumber,
          targetUser: savedReview.targetUser,
          // trackingNumber: order.trackingNumber,
        },
      });
    }

    res.status(httpStatus.CREATED).json({ data });
  } catch (err) {
    next(err);
  }
}

/**
 * if the tracking number schedule delivery date is within 7 days from today
 * e.g.
 * differenceInCalendarDays(
 *   new Date(2018, 4, 11, 17, 0), // now
 *   new Date(2018, 4, 4, 17, 0),  // tracking number
 * )
 * 7
 * -> true
 *
 * differenceInCalendarDays(
 *  new Date(2018, 4, 12, 17, 0), // now
 *  new Date(2018, 4, 4, 17, 0),  // tracking number
 * )
 * 8
 * -> false
 */
async function getValidTrackingNumberCities(
  trackingNumber: string
  // orderDatePending: Date
): Promise<boolean | { citySender: string, cityRecipient: string }> {
  let data = {
    Number: '20450072617861',
    Redelivery: 0,
    RedeliverySum: '',
    RedeliveryNum: '',
    RedeliveryPayer: '',
    OwnerDocumentType: '',
    LastCreatedOnTheBasisDocumentType: '',
    LastCreatedOnTheBasisPayerType: '',
    LastCreatedOnTheBasisDateTime: '',
    LastTransactionStatusGM: '',
    LastTransactionDateTimeGM: '',
    DateCreated: '07-05-2018 12:41:31',
    CheckWeight: 0,
    SumBeforeCheckWeight: 0,
    PayerType: 'Recipient',
    RecipientFullName: '',
    RecipientDateTime: '08.05.2018 13:36:49',
    ScheduledDeliveryDate: '08-05-2018',
    PaymentMethod: 'Cash',
    CargoDescriptionString: '',
    CargoType: 'Parcel',
    CitySender: 'Львів',
    CityRecipient: 'Чернівці',
    WarehouseRecipient: 'Відділення №14 (до 30 кг на одне місце): вул. Небесної Сотні, 20',
    CounterpartyType: 'PrivatePerson',
    AfterpaymentOnGoodsCost: '',
    ServiceType: 'WarehouseWarehouse',
    UndeliveryReasonsSubtypeDescription: '',
    WarehouseRecipientNumber: 14,
    LastCreatedOnTheBasisNumber: '',
    WarehouseRecipientInternetAddressRef: '01ae25ec-e1c2-11e3-8c4a-0050568002cf',
    MarketplacePartnerToken: '***REMOVED***',
    ClientBarcode: '',
    SenderAddress: '',
    RecipientAddress: '',
    CounterpartySenderDescription: '',
    CounterpartyRecipientDescription: '',
    CounterpartySenderType: 'PrivatePerson',
    DateScan: '0001-01-01 00:00:00',
    PaymentStatus: 'PAYED',
    PaymentStatusDate: '06.05.2018 12:42:55',
    AmountToPay: 58,
    AmountPaid: 58,
    LastAmountTransferGM: '',
    LastAmountReceivedCommissionGM: '',
    DocumentCost: 58,
    DocumentWeight: 5,
    AnnouncedPrice: '',
    UndeliveryReasonsDate: '',
    RecipientWarehouseTypeRef: '841339c7-591a-42e2-8233-7a0a00f0ed6f',
    RedeliveryPaymentCardRef: '',
    RedeliveryPaymentCardDescription: '',
    OwnerDocumentNumber: '',
    InternationalDeliveryType: '',
    WarehouseSender: 'Відділення №15 (до 30 кг): вул. Героїв УПА, 6',
    WarehouseRecipientRef: '7ddcc4e5-c432-11e1-86b4-0026b97ed48a',
    Status: 'Відправлення отримано',
    StatusCode: '9',
    RefEW: 'acc06e3c-5111-11e8-aa3a-0025b501a04b',
    CreatedOnTheBasis: '',
    DatePayedKeeping: '',
  };
  return new Promise((resolve, reject) => {
    if (config.env === 'test') {
      return resolve({
        citySender: data.CitySender,
        cityRecipient: data.CityRecipient,
      });
    }
    request.post(
      'https://api.novaposhta.ua/v2.0/json/documentsTracking/',
      {
        json: {
          modelName: 'TrackingDocument',
          calledMethod: 'getStatusDocuments',
          methodProperties: {
            Documents: [
              {
                DocumentNumber: trackingNumber,
                Phone: '',
              },
            ],
          },
        },
      },
      (error, response, body) => {
        if (error) return reject(error);

        if (!body.success) return reject(body);

        const data = body.data[0];

        // Number not found
        if (data.StatusCode == '3' || !data.ScheduledDeliveryDate) return resolve(false);

        // e.g. convert `string` 08-05-2018 to a `Date` Tue May 08 2018
        const trackingNumberDate = new Date(data.ScheduledDeliveryDate.replace(/(\d{2})-(\d{2})-(\d{4})/, '$2/$1/$3'));
        // const orderDate = new Date(orderDatePending);

        if (
          differenceInCalendarDays(trackingNumberDate, new Date(Date.now())) <=
          config.settings.MAX_DAYS_TRACKING_NUMBER_VALID_FOR
        ) {
          return resolve({
            citySender: data.CitySender,
            cityRecipient: data.CityRecipient,
          });
        }
        resolve(false);
      }
    );
  });
}

export default {
  list,
  create,
};
