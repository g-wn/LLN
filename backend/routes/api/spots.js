const express = require('express');

const { check } = require('express-validator');
const { handleValidationErrors } = require('../../utils/validation.js');

const { requireAuth, restoreUser } = require('../../utils/auth.js');
const {
  Spot,
  User,
  Review,
  SpotImage,
  ReviewImage,
  Sequelize
} = require('../../db/models');
const { Model } = require('sequelize');

const router = express.Router();

/*-------------------------------------------------------------------------------------------------------*/
/*--------------------------------------------Validations------------------------------------------------*/
/*-------------------------------------------------------------------------------------------------------*/

const validateSpot = [
  check('address')
    .exists({ checkFalsy: true })
    .notEmpty()
    .withMessage('Street address is required'),
  check('city')
    .exists({ checkFalsy: true })
    .notEmpty()
    .withMessage('City is required'),
  check('state')
    .exists({ checkFalsy: true })
    .notEmpty()
    .withMessage('State is required'),
  check('country')
    .exists({ checkFalsy: true })
    .notEmpty()
    .withMessage('Country is required'),
  check('lat')
    .exists({ checkFalsy: true })
    .isNumeric()
    .withMessage('Latitude is not valid'),
  check('lng')
    .exists({ checkFalsy: true })
    .isNumeric()
    .withMessage('Longitude is not valid'),
  check('name')
    .exists({ checkFalsy: true })
    .isLength({ max: 49 })
    .withMessage('Name must be less than 50 characters'),
  check('description')
    .exists({ checkFalsy: true })
    .notEmpty()
    .withMessage('Description is required'),
  check('price')
    .exists({ checkFalsy: true })
    .notEmpty()
    .isNumeric()
    .withMessage('Price per day is required'),
  handleValidationErrors
];

/*-------------------------------------------------------------------------------------------------------*/
/*------------------------------------------Route Handlers-----------------------------------------------*/
/*-------------------------------------------------------------------------------------------------------*/

// Get all Spots owned by the Current User
router.get('/current', requireAuth, async (req, res, _next) => {
  const { user } = req;

  const currentUserSpots = await Spot.findAll({
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

// Get details for a Spot from an id
router.get('/:spotId', async (req, res, _next) => {
  const spot = await Spot.findByPk(req.params.spotId, {
    include: [
      { model: SpotImage, attributes: ['id', 'url', 'preview'] },
      { model: User, as: 'Owner', attributes: ['id', 'firstName', 'lastName'] },
      { model: Review, attributes: [] }
    ],
    attributes: {
      include: [
        [Sequelize.fn('COUNT', Sequelize.col('Reviews.id')), 'numReviews'],
        [Sequelize.fn('ROUND', Sequelize.fn('AVG', Sequelize.col('Reviews.stars')), 1), 'avgStarRating']
      ]
    },
    group: ['SpotImages.id', 'Spot.id', 'Owner.id']
  });

  res.json(spot);
});

// Get all Spots
router.get('/', async (_req, res, _next) => {
  const allSpots = await Spot.findAll({
    include: [
      { model: Review, attributes: [] },
      { model: SpotImage, where: { preview: true }, attributes: [] }
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

// Create a Spot
router.post('/', validateSpot, requireAuth, async (req, res, _next) => {
  const { address, city, state, country, lat, lng, name, description, price } =
    req.body;

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

module.exports = router;
