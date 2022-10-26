const express = require('express');

const { check } = require('express-validator');
const { handleValidationErrors } = require('../../utils/validation.js');

const { requireAuth, restoreUser } = require('../../utils/auth.js');
const { Spot, User, Review, SpotImage, ReviewImage, Sequelize, Booking } = require('../../db/models');
const { Model } = require('sequelize');

const router = express.Router();

/*-------------------------------------------------------------------------------------------------------*/
/*--------------------------------------------Validations------------------------------------------------*/
/*-------------------------------------------------------------------------------------------------------*/

const validateSpot = [
  check('address').exists({ checkFalsy: true }).notEmpty().withMessage('Street address is required'),
  check('city').exists({ checkFalsy: true }).notEmpty().withMessage('City is required'),
  check('state').exists({ checkFalsy: true }).notEmpty().withMessage('State is required'),
  check('country').exists({ checkFalsy: true }).notEmpty().withMessage('Country is required'),
  check('lat').exists({ checkFalsy: true }).isNumeric().withMessage('Latitude is not valid'),
  check('lng').exists({ checkFalsy: true }).isNumeric().withMessage('Longitude is not valid'),
  check('name').exists({ checkFalsy: true }).isLength({ max: 49 }).withMessage('Name must be less than 50 characters'),
  check('description').exists({ checkFalsy: true }).notEmpty().withMessage('Description is required'),
  check('price').exists({ checkFalsy: true }).notEmpty().isNumeric().withMessage('Price per day is required'),
  handleValidationErrors
];

const validateReview = [
  check('review').exists({ checkFalsy: true }).notEmpty().withMessage('Review text is required'),
  check('stars')
    .exists({ checkFalsy: true })
    .isFloat({ min: 1, max: 5 })
    .withMessage('Stars must be an integer from 1 to 5'),
  handleValidationErrors
];

/*-------------------------------------------------------------------------------------------------------*/
/*------------------------------------------Route Handlers-----------------------------------------------*/
/*-------------------------------------------------------------------------------------------------------*/

// Get all Spots owned by the Current User
router.get('/current', requireAuth, async (req, res, _next) => {
  const { user } = req;

  const currentUserSpots = await Spot.findAll({
    include: [
      { model: Review, attributes: [] },
      {
        model: SpotImage,
        where: { preview: true },
        attributes: [],
        required: false
      }
    ],
    attributes: {
      include: [
        [Sequelize.fn('ROUND', Sequelize.fn('AVG', Sequelize.col('Reviews.stars')), 1), 'avgRating'],
        [Sequelize.col('SpotImages.url'), 'previewImage']
      ]
    },
    group: ['Spot.id', 'previewImage'],
    where: {
      ownerId: user.id
    }
  });

  if (currentUserSpots.length) {
    res.json({ Spots: currentUserSpots });
  } else {
    res.json({
      message: `${user.firstName} ${user.lastName} does not currently have any listed Spots`
    });
  }
});

// Get all Reviews by a Spot's id
router.get('/:spotId/reviews', async (req, res, next) => {
  const spot = await Spot.findByPk(req.params.spotId);

  if (spot) {
    const spotReviews = await Review.findAll({
      where: { spotId: req.params.spotId },
      include: [
        { model: User, attributes: ['id', 'firstName', 'lastName'] },
        { model: ReviewImage, attributes: ['id', 'url'] }
      ]
    });

    res.json(
      spotReviews.length
        ? { Reviews: spotReviews }
        : { message: `${spot.name} doesn't have any reviews yet. Book a stay and let the owners know what you think!` }
    );
  } else {
    const err = new Error("Spot couldn't be found");
    err.status = 404;
    next(err);
  }
});

// Get details for a Spot from an id
router.get('/:spotId', async (req, res, next) => {
  const spot = await Spot.findByPk(req.params.spotId, {
    include: [
      {
        model: SpotImage,
        attributes: ['id', 'url', 'preview'],
        required: false
      },
      {
        model: User,
        as: 'Owner',
        attributes: ['id', 'firstName', 'lastName'],
        required: false
      },
      { model: Review, attributes: [], required: false }
    ],
    attributes: {
      include: [
        [Sequelize.fn('COUNT', Sequelize.col('Reviews.id')), 'numReviews'],
        [Sequelize.fn('ROUND', Sequelize.fn('AVG', Sequelize.col('Reviews.stars')), 1), 'avgStarRating']
      ]
    },
    group: ['SpotImages.id', 'Spot.id', 'Owner.id']
  });

  if (spot) {
    res.json(spot);
  } else {
    const err = new Error("Spot couldn't be found");
    err.status = 404;
    next(err);
  }
});

// Get all Spots
router.get('/', async (_req, res, _next) => {
  const allSpots = await Spot.findAll({
    include: [
      { model: Review, attributes: [] },
      {
        model: SpotImage,
        where: { preview: true },
        attributes: [],
        required: false
      }
    ],
    attributes: {
      include: [
        [Sequelize.fn('ROUND', Sequelize.fn('AVG', Sequelize.col('Reviews.stars')), 1), 'avgRating'],
        [Sequelize.col('SpotImages.url'), 'previewImage']
      ]
    },
    group: ['Spot.id', 'previewImage']
  });

  res.json({ Spots: allSpots });
});

// Create a Review for a Spot based on the Spot's id
router.post('/:spotId/reviews', validateReview, requireAuth, async (req, res, next) => {
  const { review, stars } = req.body;
  const spot = await Spot.findByPk(req.params.spotId);
  console.log(spot);

  if (spot) {
    try {
      const newSpotReview = await Review.create({
        userId: +req.user.id,
        spotId: +req.params.spotId,
        review,
        stars
      });

      res.status(201).json(newSpotReview);
    } catch (e) {
      const err = new Error('User already has a review for this spot');
      err.status = 403;
      next(err);
    }
  } else {
    const err = new Error("Spot couldn't be found");
    err.status = 404;
    next(err);
  }
});

// Add an Image to a Spot based on the Spot's id
router.post('/:spotId/images', requireAuth, async (req, res, next) => {
  const { url, preview } = req.body;
  const spot = await Spot.findByPk(req.params.spotId);

  if (spot && +spot.ownerId !== +req.user.id) {
    const err = new Error('Unauthorized');
    err.status = 401;
    return next(err);
  }

  if (spot) {
    const newSpotImage = await SpotImage.create({
      spotId: +req.params.spotId,
      url,
      preview
    });

    res.json({
      id: newSpotImage.id,
      url: newSpotImage.url,
      preview: newSpotImage.preview
    });
  } else {
    const err = new Error("Spot couldn't be found");
    err.status = 404;
    next(err);
  }
});

// Get all Bookings for a Spot based on the Spot's id
router.get('/:spotId/bookings', requireAuth, async (req, res, next) => {
  const spot = await Spot.findByPk(req.params.spotId);

  if (spot && +spot.ownerId === +req.user.id) {
    const bookings = await Booking.findAll({
      where: {
        spotId: req.params.spotId
      },
      include: [
        { model: User,
          attributes: ['id', 'firstName', 'lastName'] }
      ]
    });
    res.json({ Bookings: bookings });
  } else if (spot && +spot.ownerId !== +req.user.id) {
    const bookings = await Booking.findAll({
      where: {
        spotId: req.params.spotId
      },
      attributes: ['spotId', 'startDate', 'endDate']
    });
    res.json({ Bookings: bookings });
  } else {
    const err = new Error("Spot couldn't be found");
    err.status = 404;
    next(err);
  }
});

// Create a Spot
router.post('/', validateSpot, requireAuth, async (req, res, _next) => {
  const { address, city, state, country, lat, lng, name, description, price } = req.body;

  const { user } = req;

  const newSpot = await Spot.create({
    ownerId: user.id,
    address,
    city,
    state,
    country,
    lat,
    lng,
    name,
    description,
    price
  });

  res.status(201).json(newSpot);
});

// Edit a Spot
router.put('/:spotId', validateSpot, requireAuth, async (req, res, next) => {
  const { address, city, state, country, lat, lng, name, description, price } = req.body;
  const spot = await Spot.findByPk(req.params.spotId);

  if (spot && +spot.ownerId !== +req.user.id) {
    const err = new Error('Unauthorized');
    err.status = 401;
    return next(err);
  }

  if (spot) {
    await spot.update({
      address,
      city,
      state,
      country,
      lat,
      lng,
      name,
      description,
      price
    });

    res.json(spot);
  } else {
    const err = new Error("Spot couldn't be found");
    err.status = 404;
    next(err);
  }
});

// Delete a Spot
router.delete('/:spotId', requireAuth, async (req, res, next) => {
  const spot = await Spot.findByPk(req.params.spotId);

  if (spot && +spot.ownerId !== +req.user.id) {
    const err = new Error('Unauthorized');
    err.status = 401;
    return next(err);
  }

  if (spot) {
    spot.destroy();
    res.json({ message: 'Succssfully deleted', statusCode: 200 });
  } else {
    const err = new Error("Spot couldn't be found");
    err.status = 404;
    next(err);
  }
});

module.exports = router;
