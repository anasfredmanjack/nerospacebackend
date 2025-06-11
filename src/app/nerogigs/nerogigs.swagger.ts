/**
 * @swagger
 * components:
 *   schemas:
 *     Package:
 *       type: object
 *       required:
 *         - title
 *         - description
 *         - price
 *         - deliveryTime
 *         - revisions
 *       properties:
 *         title:
 *           type: string
 *           description: The title of the package
 *         description:
 *           type: string
 *           description: The description of the package
 *         price:
 *           type: number
 *           minimum: 0
 *           description: The price of the package
 *         deliveryTime:
 *           type: number
 *           minimum: 1
 *           description: Delivery time in days
 *         revisions:
 *           type: number
 *           minimum: 0
 *           description: Number of revisions included
 *         features:
 *           type: array
 *           items:
 *             type: string
 *           description: List of features included in the package
 *
 *     Category:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         _id:
 *           type: string
 *           description: The category ID
 *         name:
 *           type: string
 *           description: The category name
 *         subcategories:
 *           type: array
 *           items:
 *             type: string
 *           description: List of subcategories
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     Tag:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         _id:
 *           type: string
 *           description: The tag ID
 *         name:
 *           type: string
 *           description: The tag name (lowercase)
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     Gig:
 *       type: object
 *       required:
 *         - title
 *         - description
 *       properties:
 *         _id:
 *           type: string
 *           description: The gig ID
 *         title:
 *           type: string
 *           minLength: 10
 *           maxLength: 120
 *           description: The title of the gig
 *         category:
 *           $ref: '#/components/schemas/Category'
 *           description: The category of the gig
 *         description:
 *           type: string
 *           minLength: 120
 *           description: The description of the gig
 *         tags:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Tag'
 *           description: Array of tags associated with the gig
 *         packages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Package'
 *           description: Array of packages offered in the gig
 *         thumbnailUrl:
 *           type: string
 *           description: URL of the gig thumbnail
 *         isPublished:
 *           type: boolean
 *           default: false
 *           description: Whether the gig is published
 *         hasGallery:
 *           type: boolean
 *           default: false
 *           description: Whether the gig has a gallery
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * tags:
 *   name: Gigs
 *   description: Gig management endpoints
 */

/**
 * @swagger
 * /nerogigs:
 *   post:
 *     summary: Create a new gig
 *     tags: [Gigs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 120
 *               category:
 *                 type: string
 *                 description: Category ID
 *               description:
 *                 type: string
 *                 minLength: 120
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of tag IDs
 *               packages:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Package'
 *     responses:
 *       201:
 *         description: The gig was successfully created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Gig'
 *       400:
 *         description: Invalid input data
 *
 *   get:
 *     summary: Get all gigs
 *     tags: [Gigs]
 *     parameters:
 *       - in: query
 *         name: isPublished
 *         schema:
 *           type: boolean
 *         description: Filter by published status
 *     responses:
 *       200:
 *         description: List of all gigs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Gig'
 */

/**
 * @swagger
 * /nerogigs/{id}:
 *   get:
 *     summary: Get a gig by ID
 *     tags: [Gigs]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The gig ID
 *     responses:
 *       200:
 *         description: The gig details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Gig'
 *       404:
 *         description: Gig not found
 */

/**
 * @swagger
 * /nerogigs/categories:
 *   get:
 *     summary: Get all gig categories
 *     tags: [Gigs]
 *     responses:
 *       200:
 *         description: List of all categories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Category'
 */

/**
 * @swagger
 * /nerogigs/categories/{category}:
 *   get:
 *     summary: Get gigs by category
 *     tags: [Gigs]
 *     parameters:
 *       - in: path
 *         name: category
 *         schema:
 *           type: string
 *         required: true
 *         description: The category ID
 *     responses:
 *       200:
 *         description: List of gigs in the specified category
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Gig'
 *       404:
 *         description: Category not found
 */

/**
 * @swagger
 * /nerogigs/tags:
 *   get:
 *     summary: Get all gig tags
 *     tags: [Gigs]
 *     responses:
 *       200:
 *         description: List of all tags
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Tag'
 */

/**
 * @swagger
 * /nerogigs/tags/{tag}:
 *   get:
 *     summary: Get gigs by tag
 *     tags: [Gigs]
 *     parameters:
 *       - in: path
 *         name: tag
 *         schema:
 *           type: string
 *         required: true
 *         description: The tag ID
 *     responses:
 *       200:
 *         description: List of gigs with the specified tag
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Gig'
 *       404:
 *         description: Tag not found
 */
