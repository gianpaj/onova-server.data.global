import express from 'express';

import authRoutes from './auth.route';
import blockRoutes from './block.route';
import feedRoutes from './feed.route';
import followRoutes from './follow.route';
import orderRoutes from './order.route';
import productRoutes from './product.route';
import commentRoutes from './comment.route';
import reportRoutes from './report.route';
import searchRoutes from './search.route';
import shippingRoutes from './shipping.route';
import suggestedUsersRoutes from './suggestedUsers.route';
import userRoutes from './user.route';
import photosRoutes from './photos.route';
import reviewRoutes from './review.route';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/block', blockRoutes);

// mount /feed/flat
// AND
// mount /feed/drops
router.use('/feed', feedRoutes);

// Check service health
router.get('/health-check', (req, res) => res.send('OK'));

// Check service health with JSON return type
router.get('/health-check/json', (req, res) => res.json({ ok: true }));

// mount user follow routes at /users/:userId/[follow/unfollow]
router.use('/users', followRoutes);

router.use('/orders', orderRoutes);
router.use('/products', productRoutes);

// mount product routes at /products/:uuid/comment
router.use('/products', commentRoutes);

router.use('/report', reportRoutes);
router.use('/search', searchRoutes);

router.use('/shipping', shippingRoutes);

// mount user routes at /users
// AND
// mount user notifications routes at /users/notifications
router.use('/users', userRoutes);

router.use('/suggested-users', suggestedUsersRoutes);

// mount users reviews routes at /users/:userId/reviews
router.use('/users', reviewRoutes);

router.use('/photos', photosRoutes);

export default router;
