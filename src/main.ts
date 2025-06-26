// @ts-nocheck
import "module-alias/register"
import express from "express"
import cors from "cors"
import morgan from "morgan"
import { NerogigsModule } from "@/app/nerogigs/nerogigs.module"
import mongoose from "mongoose"
import dotenv from "dotenv"
import swaggerJsdoc from "swagger-jsdoc"
import swaggerUi from "swagger-ui-express"
import multer from "multer"
import Course from "./models/course"
const Enrollment = require("./models/enrollment")
const Subscription = require("./models/subscription")
import StorachaClient from "./utils/storacha-client"

dotenv.config()

export const app = express()
const PORT = process.env.PORT || 4000

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "NeroSpace API Documentation",
      version: "1.0.0",
      description: "API documentation for NeroSpace platform",
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: "Development server",
      },
    ],
  },
  apis: ["./src/**/*.ts", "./src/app/nerogigs/*.swagger.ts"],
}

const swaggerDocs = swaggerJsdoc(swaggerOptions)
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs))

// Request logging middleware
app.use(morgan("dev"))

// CORS configuration
app.use(
  cors({
    origin: "*",
    allowedHeaders: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
)

// Body parsing middleware
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Debug middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, {
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    contentType: req.get("Content-Type"),
    bodySize: req.body ? JSON.stringify(req.body).length : 0,
  })
  next()
})

export const router = express.Router()
app.use("/", router)

router.get("/", (req, res) => {
  res.send("Hello World")
})

// Initialize nerogigs module
new NerogigsModule(router)

// MongoDB connect options
const mongooseOptions = {
  autoIndex: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
}

// Connect to MongoDB
const connectDB = async (): Promise<void> => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not defined in environment variables")
    }

    await mongoose.connect(process.env.MONGODB_URI, mongooseOptions)
    console.log("Connected to MongoDB successfully")

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`)
      console.log(`Swagger documentation available at http://localhost:${PORT}/docs`)
    })
  } catch (error) {
    console.error("Error connecting to MongoDB:", error)
    process.exit(1)
  }
}

connectDB()

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log(`Processing file: ${file.fieldname} - ${file.originalname} (${file.mimetype})`)

    if (file.fieldname === "video") {
      if (file.mimetype === "video/mp4" || file.mimetype === "video/webm" || file.mimetype === "video/quicktime") {
        cb(null, true)
      } else {
        cb(new Error("Only .mp4, .webm and .mov formats are allowed for videos"))
      }
    } else if (file.fieldname === "thumbnail") {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true)
      } else {
        cb(new Error("Only image files are allowed for thumbnails"))
      }
    } else {
      cb(null, true)
    }
  },
})

// Initialize Storacha client
let storachaClient: StorachaClient | null = null
let web3storage: any = null

async function initializeStorachaClient() {
  if (process.env.STORACHA_TOKEN) {
    try {
      console.log("Creating Storacha client...")
      storachaClient = new StorachaClient({ apiKey: process.env.STORACHA_TOKEN })
      await storachaClient.initialize()
      console.log("Storacha client initialized successfully")
    } catch (error) {
      console.error("Failed to initialize Storacha client:", error)
      storachaClient = null
    }
  }
}

async function initializeWeb3Storage() {
  if (process.env.WEB3STORAGE_TOKEN) {
    try {
      const { Web3Storage } = await import("web3.storage")
      web3storage = new Web3Storage({ token: process.env.WEB3STORAGE_TOKEN })
      console.log("Web3Storage client initialized successfully")
    } catch (error) {
      console.error("Failed to initialize Web3Storage client:", error)
    }
  }
}

initializeStorachaClient().catch(console.error)
initializeWeb3Storage().catch(console.error)

// Helper function to upload file to storage
async function uploadFileToStorage(fileBuffer: Buffer, fileName: string, mimeType: string) {
  console.log(`Attempting to upload: ${fileName} (${mimeType})`)

  if (storachaClient) {
    try {
      if (!storachaClient.isReady()) {
        await storachaClient.initialize()
      }

      console.log("Trying Storacha upload...")
      const result = await storachaClient.upload({
        data: fileBuffer,
        filename: fileName,
        contentType: mimeType,
      })

      console.log("Storacha upload successful:", result.cid)
      return result
    } catch (storachaError) {
      console.error("Storacha upload failed:", storachaError instanceof Error ? storachaError.message : "Unknown error")
    }
  }

  if (web3storage) {
    try {
      console.log("Trying Web3Storage upload...")
      const file = new File([fileBuffer], fileName, { type: mimeType })
      const cid = await web3storage.put([file], { wrapWithDirectory: false })

      const result = {
        cid: cid,
        name: fileName,
        url: `https://${cid}.ipfs.w3s.link/${fileName}`,
        size: fileBuffer.length,
        type: mimeType,
      }

      console.log("Web3Storage upload successful:", result.cid)
      return result
    } catch (web3Error) {
      console.error("Web3Storage upload failed:", web3Error)
    }
  }

  if (process.env.NODE_ENV === "development") {
    try {
      console.log("Using local file system fallback...")
      const fs = await import("fs")
      const path = await import("path")

      const uploadsDir = path.join(process.cwd(), "uploads")
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
      }

      const uniqueFileName = `${Date.now()}-${fileName}`
      const filePath = path.join(uploadsDir, uniqueFileName)

      fs.writeFileSync(filePath, fileBuffer)

      const result = {
        cid: `local-${Date.now()}`,
        name: fileName,
        url: `/uploads/${uniqueFileName}`,
        size: fileBuffer.length,
        type: mimeType,
      }

      console.log("Local file system upload successful:", result.url)
      return result
    } catch (localError) {
      console.error("Local file system upload failed:", localError)
    }
  }

  throw new Error("All storage methods failed. Please check your storage configuration.")
}

// Validate lesson data before saving
function validateLessonData(lesson: any) {
  const errors: string[] = []

  if (!lesson.title || lesson.title.trim() === "") {
    errors.push("Lesson title is required")
  }

  if (!lesson.type || !["video", "text", "quiz"].includes(lesson.type)) {
    errors.push("Valid lesson type is required (video, text, or quiz)")
  }

  if (lesson.type === "video") {
    if (!lesson.youtubeUrl || lesson.youtubeUrl.trim() === "") {
      errors.push("YouTube URL is required for video lessons")
    } else {
      // Validate YouTube URL format
      const youtubeRegex =
        /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/|m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/
      if (!youtubeRegex.test(lesson.youtubeUrl.trim())) {
        errors.push("Invalid YouTube URL format")
      }
    }
  }

  if (lesson.type === "text") {
    if (!lesson.content || lesson.content.trim().length < 10) {
      errors.push("Text content is required and must be at least 10 characters long")
    }
  }

  if (lesson.type === "quiz") {
    if (!lesson.questions || !Array.isArray(lesson.questions) || lesson.questions.length === 0) {
      errors.push("At least one question is required for quiz lessons")
    } else {
      lesson.questions.forEach((question: any, index: number) => {
        if (!question.question || question.question.trim() === "") {
          errors.push(`Question ${index + 1} text is required`)
        }
        if (!question.options || !Array.isArray(question.options) || question.options.length < 2) {
          errors.push(`Question ${index + 1} must have at least 2 options`)
        } else {
          question.options.forEach((option: string, optIndex: number) => {
            if (!option || option.trim() === "") {
              errors.push(`Question ${index + 1}, option ${optIndex + 1} text is required`)
            }
          })
        }
        if (
          typeof question.correctOption !== "number" ||
          question.correctOption < 0 ||
          question.correctOption >= question.options.length
        ) {
          errors.push(`Question ${index + 1} must have a valid correct answer`)
        }
      })
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

// Validate course data for publishing
function validateCourseForPublishing(course: any) {
  const missingFields: any = {}

  if (!course.title || course.title.trim() === "") {
    missingFields.title = true
  }

  if (!course.description || course.description.trim() === "") {
    missingFields.description = true
  }

  if (!course.category) {
    missingFields.category = true
  }

  if (!course.level) {
    missingFields.level = true
  }

  if (!course.instructorAddress) {
    missingFields.instructorAddress = true
  }

  if (!course.modules || course.modules.length === 0) {
    missingFields.modules = true
  } else {
    const emptyModules = course.modules.filter((module: any) => !module.lessons || module.lessons.length === 0)
    if (emptyModules.length > 0) {
      missingFields.emptyModules = emptyModules.map((m: any) => m.title || "Untitled module")
    }

    const invalidLessons: string[] = []
    course.modules.forEach((module: any) => {
      if (module.lessons) {
        module.lessons.forEach((lesson: any) => {
          const validation = validateLessonData(lesson)
          if (!validation.isValid) {
            invalidLessons.push(`${module.title} > ${lesson.title}: ${validation.errors.join(", ")}`)
          }
        })
      }
    })

    if (invalidLessons.length > 0) {
      missingFields.invalidLessons = invalidLessons
    }
  }

  return {
    isValid: Object.keys(missingFields).length === 0,
    missingFields,
  }
}

// COURSE BROWSING ROUTES

// Browse all published courses with filtering
router.get("/courses/browse", async (req, res) => {
  try {
    console.log("Browse courses request:", req.query)

    const {
      category,
      level,
      priceType,
      search,
      page = 1,
      limit = 12,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query

    const query: any = { status: "published" }

    // Apply filters
    if (category && category !== "all") query.category = category
    if (level && level !== "all") query.level = level
    if (priceType && priceType !== "all") query.priceType = priceType
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search as string, "i")] } },
      ]
    }

    console.log("Query:", query)

    const skip = (Number(page) - 1) * Number(limit)
    const sortOptions: any = {}
    sortOptions[sortBy as string] = sortOrder === "desc" ? -1 : 1

    const courses = await Course.find(query)
      .select(
        "title description thumbnail category level tags priceType price enrolledCount createdAt instructorAddress",
      )
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit))

    const total = await Course.countDocuments(query)

    console.log(`Found ${courses.length} courses out of ${total} total`)

    res.json({
      status: "ok",
      courses,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    })
  } catch (e) {
    console.error("Error browsing courses:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Get featured courses
router.get("/courses/featured", async (req, res) => {
  try {
    console.log("Fetching featured courses...")

    const courses = await Course.find({
      status: "published",
      isFeatured: true,
    })
      .select(
        "title description thumbnail category level tags priceType price enrolledCount createdAt instructorAddress",
      )
      .sort({ createdAt: -1 })
      .limit(6)

    console.log(`Found ${courses.length} featured courses`)

    res.json({ status: "ok", courses })
  } catch (e) {
    console.error("Error fetching featured courses:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Get course details for browsing (public view)
router.get("/courses/:courseId/details", async (req, res) => {
  try {
    const { courseId } = req.params
    const { userId } = req.query

    console.log("Fetching course details:", { courseId, userId })

    const course = await Course.findOne({
      _id: courseId,
      status: "published",
    })

    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    // Check if user is enrolled
    let enrollment = null
    if (userId) {
      enrollment = await Enrollment.findOne({
        userId,
        courseId: courseId,
      })
    }

    // Filter lessons based on preview settings and enrollment
    const filteredCourse = {
      ...course.toObject(),
      modules: course.modules.map((module) => ({
        ...module.toObject(),
        lessons: module.lessons.map((lesson) => {
          const isAccessible = enrollment || lesson.isPreview || course.enablePreview

          return {
            ...lesson.toObject(),
            youtubeUrl: isAccessible ? lesson.youtubeUrl : "",
            content: isAccessible ? lesson.content : "",
            questions: isAccessible ? lesson.questions : [],
            isLocked: !isAccessible,
          }
        }),
      })),
    }

    res.json({
      status: "ok",
      course: filteredCourse,
      isEnrolled: !!enrollment,
      enrollment: enrollment || null,
    })
  } catch (e) {
    console.error("Error fetching course details:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Enhanced course details endpoint for instructor view
router.get("/courses/:courseId/instructor-view", async (req, res) => {
  try {
    const { courseId } = req.params
    const { instructorAddress } = req.query

    console.log("Fetching instructor course view:", { courseId, instructorAddress })

    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    // Verify instructor ownership
    if (instructorAddress && course.instructorAddress.toLowerCase() !== instructorAddress.toLowerCase()) {
      return res.status(403).json({ error: "Access denied: Not the course instructor" })
    }

    // Get enrollment statistics
    const enrollmentStats = await Enrollment.aggregate([
      { $match: { courseId: new mongoose.Types.ObjectId(courseId) } },
      {
        $group: {
          _id: null,
          totalEnrollments: { $sum: 1 },
          totalEarnings: { $sum: "$paymentAmount" },
          averageCompletion: { $avg: "$completionPercentage" },
          activeStudents: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, 1, 0],
            },
          },
          completedStudents: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
            },
          },
        },
      },
    ])

    // Get recent enrollments
    const recentEnrollments = await Enrollment.find({ courseId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("userId completionPercentage status createdAt lastAccessedAt")

    const stats = enrollmentStats[0] || {
      totalEnrollments: 0,
      totalEarnings: 0,
      averageCompletion: 0,
      activeStudents: 0,
      completedStudents: 0,
    }

    const enhancedCourse = {
      ...course.toObject(),
      stats: {
        enrollmentCount: stats.totalEnrollments,
        totalEarnings: stats.totalEarnings,
        averageRating: 4.5, // TODO: Implement rating system
        totalLessons: course.modules.reduce((total, module) => total + module.lessons.length, 0),
        averageCompletion: Math.round(stats.averageCompletion || 0),
        activeStudents: stats.activeStudents,
        completedStudents: stats.completedStudents,
      },
      recentEnrollments,
    }

    res.json({
      status: "ok",
      course: enhancedCourse,
    })
  } catch (e) {
    console.error("Error fetching instructor course view:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// ENROLLMENT ROUTES

// Enroll in a course
router.post("/courses/:courseId/enroll", async (req, res) => {
  try {
    const { courseId } = req.params
    const { userId, paymentTxHash, paymentAmount } = req.body

    console.log("Enrollment request:", { courseId, userId, paymentTxHash, paymentAmount })

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" })
    }

    const course = await Course.findOne({
      _id: courseId,
      status: "published",
    })

    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({
      userId,
      courseId,
    })

    if (existingEnrollment) {
      return res.status(400).json({ error: "Already enrolled in this course" })
    }

    // Validate payment for paid courses
    if (course.priceType === "paid" && course.price > 0) {
      if (!paymentTxHash || !paymentAmount) {
        return res.status(400).json({ error: "Payment information required for paid courses" })
      }

      if (Number(paymentAmount) < course.price) {
        return res.status(400).json({ error: "Insufficient payment amount" })
      }
    }

    // Check subscription for subscription-only courses
    if (course.priceType === "subscription") {
      const subscription = await Subscription.findOne({
        userId,
        $or: [
          {
            platformPlan: { $ne: "free" },
            platformStatus: "active",
            platformEndDate: { $gt: new Date() },
          },
          {
            "courseSubscriptions.courseId": courseId,
            "courseSubscriptions.status": "active",
            "courseSubscriptions.expiresAt": { $gt: new Date() },
          },
        ],
      })

      if (!subscription) {
        return res.status(400).json({ error: "Active subscription required for this course" })
      }
    }

    // Create enrollment
    const enrollment = await Enrollment.create({
      userId,
      courseId,
      paymentType: course.priceType,
      paymentAmount: course.priceType === "paid" ? paymentAmount : 0,
      paymentTxHash: paymentTxHash || "",
      paymentStatus: "completed",
      progress: [],
      completionPercentage: 0,
      totalTimeSpent: 0,
      lastAccessedAt: new Date(),
      status: "active",
    })

    // Update course enrollment count
    await Course.findByIdAndUpdate(courseId, {
      $inc: { enrolledCount: 1 },
    })

    console.log("Enrollment created successfully:", enrollment._id)

    res.json({
      status: "ok",
      enrollment,
      message: "Successfully enrolled in course",
    })
  } catch (e) {
    console.error("Error enrolling in course:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Get user's enrolled courses
router.get("/users/:userId/enrollments", async (req, res) => {
  try {
    const { userId } = req.params
    const { status = "active" } = req.query

    console.log("Fetching enrollments for user:", { userId, status })

    // Normalize userId to lowercase for consistent matching
    const normalizedUserId = userId.toLowerCase()

    const query: any = { userId: normalizedUserId }
    if (status !== "all") {
      query.status = status
    }

    console.log("Enrollment query:", query)

    const enrollments = await Enrollment.find(query)
      .populate({
        path: "courseId",
        select: "title description thumbnail category level tags instructorAddress modules status",
        match: { status: { $ne: null } }, // Only populate courses that exist
      })
      .sort({ lastAccessedAt: -1 })

    console.log(`Found ${enrollments.length} enrollments for user ${userId}`)

    // Filter out enrollments where course was deleted and enrich with stats
    const enrichedEnrollments = enrollments
      .filter((enrollment) => enrollment.courseId) // Filter out enrollments with deleted courses
      .map((enrollment) => {
        const course = enrollment.courseId as any

        const totalLessons =
          course.modules?.reduce((total: number, module: any) => {
            return total + (module.lessons?.length || 0)
          }, 0) || 0

        return {
          ...enrollment.toObject(),
          course: {
            ...course.toObject(),
            totalLessons,
            completedLessons: enrollment.progress?.length || 0,
          },
        }
      })

    console.log(`Returning ${enrichedEnrollments.length} valid enrollments`)

    res.json({ status: "ok", enrollments: enrichedEnrollments })
  } catch (e) {
    console.error("Error fetching enrollments:", e)
    res.status(500).json({
      error: "Server error",
      message: e instanceof Error ? e.message : "Unknown error",
      details: "Failed to fetch user enrollments",
    })
  }
})

// Update lesson progress
router.post("/enrollments/:enrollmentId/progress", async (req, res) => {
  try {
    const { enrollmentId } = req.params
    const { lessonId, timeSpent, quizScore } = req.body

    const enrollment = await Enrollment.findById(enrollmentId).populate("courseId")

    if (!enrollment) {
      return res.status(404).json({ error: "Enrollment not found" })
    }

    // Check if lesson already completed
    const existingProgress = enrollment.progress.find((p) => p.lessonId.toString() === lessonId)

    if (!existingProgress) {
      // Add new progress entry
      enrollment.progress.push({
        lessonId,
        completedAt: new Date(),
        timeSpent: timeSpent || 0,
        quizScore: quizScore || 0,
      })
    } else {
      // Update existing progress
      existingProgress.timeSpent = Math.max(existingProgress.timeSpent, timeSpent || 0)
      if (quizScore !== undefined) {
        existingProgress.quizScore = Math.max(existingProgress.quizScore, quizScore)
      }
    }

    // Calculate completion percentage
    const course = enrollment.courseId as any
    const totalLessons = course.modules.reduce((total: number, module: any) => total + module.lessons.length, 0)

    const completionPercentage = Math.round((enrollment.progress.length / totalLessons) * 100)

    // Update enrollment
    enrollment.completionPercentage = completionPercentage
    enrollment.totalTimeSpent = enrollment.progress.reduce((total, p) => total + p.timeSpent, 0)
    enrollment.lastAccessedAt = new Date()
    enrollment.currentLessonId = lessonId

    // Check if course is completed
    if (completionPercentage >= 100 && !enrollment.completedAt) {
      enrollment.completedAt = new Date()
      enrollment.status = "completed"
    }

    await enrollment.save()

    res.json({
      status: "ok",
      enrollment,
      message: "Progress updated successfully",
    })
  } catch (e) {
    console.error("Error updating progress:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// SUBSCRIPTION ROUTES

// Get user subscription (updated to include course subscriptions)
router.get("/users/:userId/subscription", async (req, res) => {
  try {
    const { userId } = req.params
    const { courseId } = req.query

    console.log("Fetching subscription for user:", { userId, courseId })

    const subscription = await Subscription.findOne({ userId })

    if (!subscription) {
      // Return default free subscription
      return res.json({
        status: "ok",
        subscription: {
          userId,
          platformPlan: "free",
          platformStatus: "active",
          coursesAccessed: 0,
          monthlyLimit: 3,
          courseSubscriptions: [],
        },
      })
    }

    // If checking for specific course subscription
    if (courseId) {
      const courseSubscription = subscription.courseSubscriptions.find(
        (sub) => sub.courseId.toString() === courseId && sub.status === "active" && sub.expiresAt > new Date(),
      )

      return res.json({
        status: "ok",
        subscription,
        courseSubscription: courseSubscription || null,
        hasAccess: !!(
          (subscription.platformPlan !== "free" && subscription.platformStatus === "active") ||
          courseSubscription
        ),
      })
    }

    res.json({ status: "ok", subscription })
  } catch (e) {
    console.error("Error fetching subscription:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Subscribe to specific course
router.post("/courses/:courseId/subscribe", async (req, res) => {
  try {
    const { courseId } = req.params
    const { userId, paymentTxHash, paymentAmount } = req.body

    console.log("Course subscription request:", { courseId, userId, paymentTxHash, paymentAmount })

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" })
    }

    // Get course details to check if it's subscription-based
    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    if (course.priceType !== "subscription") {
      return res.status(400).json({ error: "Course is not subscription-based" })
    }

    // Validate payment
    if (!paymentTxHash || !paymentAmount) {
      return res.status(400).json({ error: "Payment information required" })
    }

    if (Number(paymentAmount) < course.price) {
      return res.status(400).json({ error: "Insufficient payment amount" })
    }

    // Find or create user subscription
    let subscription = await Subscription.findOne({ userId })
    if (!subscription) {
      subscription = new Subscription({ userId })
    }

    // Check if already subscribed to this course
    const existingSubscription = subscription.courseSubscriptions.find(
      (sub) => sub.courseId.toString() === courseId && sub.status === "active" && sub.expiresAt > new Date(),
    )

    if (existingSubscription) {
      return res.status(400).json({ error: "Already subscribed to this course" })
    }

    // Add course subscription (1 month from now)
    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + 1)

    subscription.courseSubscriptions.push({
      courseId: courseId,
      subscribedAt: new Date(),
      expiresAt: expiresAt,
      monthlyPrice: course.price,
      autoRenew: true,
      status: "active",
    })

    await subscription.save()

    // Update course subscription count
    await Course.findByIdAndUpdate(courseId, {
      $inc: { subscriberCount: 1 },
    })

    console.log("Course subscription created successfully")

    res.json({
      status: "ok",
      subscription,
      message: "Successfully subscribed to course",
    })
  } catch (e) {
    console.error("Error subscribing to course:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Platform subscription (for unlimited access)
router.post("/users/:userId/platform-subscription", async (req, res) => {
  try {
    const { userId } = req.params
    const { plan, paymentTxHash, paymentAmount, billingCycle = "monthly" } = req.body

    console.log("Platform subscription request:", { userId, plan, paymentTxHash, paymentAmount, billingCycle })

    if (!plan || !["premium", "pro"].includes(plan)) {
      return res.status(400).json({ error: "Valid platform subscription plan is required" })
    }

    // Platform subscription pricing
    const planDetails = {
      premium: { monthlyPrice: 12, yearlyPrice: 120 },
      pro: { monthlyPrice: 25, yearlyPrice: 240 },
    }

    const planInfo = planDetails[plan as keyof typeof planDetails]
    const expectedPrice = billingCycle === "yearly" ? planInfo.yearlyPrice : planInfo.monthlyPrice

    // Validate payment
    if (!paymentTxHash || !paymentAmount) {
      return res.status(400).json({ error: "Payment information required" })
    }

    if (Number(paymentAmount) < expectedPrice) {
      return res.status(400).json({ error: "Insufficient payment amount" })
    }

    // Calculate subscription period
    const startDate = new Date()
    const endDate = new Date()
    if (billingCycle === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1)
    } else {
      endDate.setMonth(endDate.getMonth() + 1)
    }

    const subscriptionData = {
      platformPlan: plan,
      platformStatus: "active",
      platformStartDate: startDate,
      platformEndDate: endDate,
      platformPaymentAmount: expectedPrice,
      platformPaymentTxHash: paymentTxHash,
      billingCycle,
      nextBillingDate: endDate,
      paymentMethod: "minipay",
    }

    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      { $set: subscriptionData },
      { upsert: true, new: true },
    )

    console.log("Platform subscription updated successfully")

    res.json({
      status: "ok",
      subscription,
      message: "Platform subscription updated successfully",
    })
  } catch (e) {
    console.error("Error updating platform subscription:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Check course access
router.get("/courses/:courseId/access/:userId", async (req, res) => {
  try {
    const { courseId, userId } = req.params

    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    // Free courses are always accessible
    if (course.priceType === "free") {
      return res.json({ status: "ok", hasAccess: true, accessType: "free" })
    }

    // Check enrollment for paid courses
    if (course.priceType === "paid") {
      const enrollment = await Enrollment.findOne({ userId, courseId })
      return res.json({
        status: "ok",
        hasAccess: !!enrollment,
        accessType: enrollment ? "enrolled" : "none",
      })
    }

    // Check subscription for subscription-based courses
    if (course.priceType === "subscription") {
      const subscription = await Subscription.findOne({ userId })

      if (!subscription) {
        return res.json({ status: "ok", hasAccess: false, accessType: "none" })
      }

      // Check platform subscription (unlimited access)
      if (
        subscription.platformPlan !== "free" &&
        subscription.platformStatus === "active" &&
        subscription.platformEndDate > new Date()
      ) {
        return res.json({ status: "ok", hasAccess: true, accessType: "platform" })
      }

      // Check course-specific subscription
      const courseSubscription = subscription.courseSubscriptions.find(
        (sub) => sub.courseId.toString() === courseId && sub.status === "active" && sub.expiresAt > new Date(),
      )

      return res.json({
        status: "ok",
        hasAccess: !!courseSubscription,
        accessType: courseSubscription ? "course-subscription" : "none",
        subscription: courseSubscription || null,
      })
    }

    res.json({ status: "ok", hasAccess: false, accessType: "none" })
  } catch (e) {
    console.error("Error checking course access:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// INSTRUCTOR ROUTES

// Get instructor's courses
router.get("/instructors/:instructorAddress/courses", async (req, res) => {
  try {
    const { instructorAddress } = req.params
    const { status } = req.query

    console.log("Fetching instructor courses:", { instructorAddress, status })

    // Normalize the instructor address to lowercase for consistent matching
    const normalizedAddress = instructorAddress.toLowerCase()

    const query: any = { instructorAddress: normalizedAddress }
    if (status && status !== "all") {
      query.status = status
    }

    console.log("Query being executed:", query)

    const courses = await Course.find(query).sort({ updatedAt: -1 })

    console.log(`Found ${courses.length} courses for instructor ${instructorAddress}`)

    // Add enrollment stats for each course
    const coursesWithStats = await Promise.all(
      courses.map(async (course) => {
        try {
          const enrollmentCount = await Enrollment.countDocuments({
            courseId: course._id,
          })

          const totalEarnings = await Enrollment.aggregate([
            { $match: { courseId: course._id, paymentStatus: "completed" } },
            { $group: { _id: null, total: { $sum: "$paymentAmount" } } },
          ])

          const totalLessons = course.modules.reduce((total, module) => total + (module.lessons?.length || 0), 0)

          return {
            ...course.toObject(),
            stats: {
              enrollmentCount,
              totalEarnings: totalEarnings[0]?.total || 0,
              averageRating: 4.5, // TODO: Implement rating system
              totalLessons,
            },
          }
        } catch (error) {
          console.error(`Error calculating stats for course ${course._id}:`, error)
          return {
            ...course.toObject(),
            stats: {
              enrollmentCount: 0,
              totalEarnings: 0,
              averageRating: 0,
              totalLessons: course.modules.reduce((total, module) => total + (module.lessons?.length || 0), 0),
            },
          }
        }
      }),
    )

    res.json({ status: "ok", courses: coursesWithStats })
  } catch (e) {
    console.error("Error fetching instructor courses:", e)
    res.status(500).json({
      error: "Server error",
      message: e instanceof Error ? e.message : "Unknown error",
      details: "Failed to fetch instructor courses",
    })
  }
})

// Debug endpoint to check course data
router.get("/debug/courses/:instructorAddress", async (req, res) => {
  try {
    const { instructorAddress } = req.params

    console.log("Debug: Checking courses for instructor:", instructorAddress)

    // Check with original address
    const coursesOriginal = await Course.find({ instructorAddress })
    console.log("Courses with original address:", coursesOriginal.length)

    // Check with lowercase address
    const coursesLower = await Course.find({ instructorAddress: instructorAddress.toLowerCase() })
    console.log("Courses with lowercase address:", coursesLower.length)

    // Get all courses and their instructor addresses
    const allCourses = await Course.find({}).select("title instructorAddress status")
    console.log(
      "All courses:",
      allCourses.map((c) => ({ title: c.title, instructor: c.instructorAddress, status: c.status })),
    )

    res.json({
      status: "ok",
      debug: {
        requestedAddress: instructorAddress,
        coursesWithOriginal: coursesOriginal.length,
        coursesWithLowercase: coursesLower.length,
        allCourses: allCourses.map((c) => ({
          title: c.title,
          instructor: c.instructorAddress,
          status: c.status,
        })),
      },
    })
  } catch (e) {
    console.error("Debug error:", e)
    res.status(500).json({ error: "Debug failed" })
  }
})

// EXISTING COURSE MANAGEMENT ROUTES (from previous implementation)

// Get Course by ID
router.get("/courses/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params
    console.log("Fetching course:", courseId)

    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    res.json({ status: "ok", course })
  } catch (e) {
    console.error("Error fetching course:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Create Course
router.post("/courses", upload.single("thumbnail"), async (req, res) => {
  try {
    console.log("Creating course with data:", req.body)
    const data = req.body

    if (!data.title) {
      return res.status(400).json({ error: "Course title is required" })
    }

    if (!data.instructorAddress) {
      return res.status(400).json({ error: "Instructor address is required" })
    }

    if (data.tags && typeof data.tags === "string") {
      try {
        data.tags = JSON.parse(data.tags)
      } catch (e) {
        console.error("Error parsing tags:", e)
        data.tags = []
      }
    }

    if (req.file) {
      try {
        const fileData = await uploadFileToStorage(req.file.buffer, req.file.originalname, req.file.mimetype)
        data.thumbnail = fileData.url
        data.thumbnailCid = fileData.cid
      } catch (uploadError) {
        console.error("Error uploading thumbnail:", uploadError)
        data.thumbnail = ""
        data.thumbnailCid = ""
      }
    }

    data.status = "draft"
    data.createdAt = new Date()
    data.updatedAt = new Date()
    data.enrolledCount = 0

    const course = await Course.create(data)

    res.json({ status: "ok", course })
  } catch (e) {
    console.error("Error creating course:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Save Draft
router.post("/courses/draft", upload.single("thumbnail"), async (req, res) => {
  try {
    console.log("Saving draft with data:", req.body)
    const data = req.body
    let course

    if (data._id) {
      const existingCourse = await Course.findById(data._id)

      if (existingCourse) {
        if (data.tags && typeof data.tags === "string") {
          try {
            data.tags = JSON.parse(data.tags)
          } catch (e) {
            console.error("Error parsing tags:", e)
            data.tags = existingCourse.tags || []
          }
        }

        if (req.file) {
          try {
            const fileData = await uploadFileToStorage(req.file.buffer, req.file.originalname, req.file.mimetype)
            data.thumbnail = fileData.url
            data.thumbnailCid = fileData.cid
          } catch (uploadError) {
            console.error("Error uploading thumbnail:", uploadError)
            data.thumbnail = existingCourse.thumbnail
            data.thumbnailCid = existingCourse.thumbnailCid
          }
        }

        data.status = "draft"
        data.updatedAt = new Date()

        course = await Course.findByIdAndUpdate(data._id, { $set: data }, { new: true })

        res.json({
          status: "ok",
          course,
          message: "Draft updated successfully",
        })
      } else {
        delete data._id
        return createNewDraft(data, req, res)
      }
    } else {
      return createNewDraft(data, req, res)
    }
  } catch (e) {
    console.error("Error saving draft:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Helper function to create a new draft
async function createNewDraft(data: any, req: express.Request, res: express.Response) {
  if (!data.title) {
    return res.status(400).json({ error: "Course title is required" })
  }

  if (!data.instructorAddress) {
    return res.status(400).json({ error: "Instructor address is required" })
  }

  if (data.tags && typeof data.tags === "string") {
    try {
      data.tags = JSON.parse(data.tags)
    } catch (e) {
      console.error("Error parsing tags:", e)
      data.tags = []
    }
  }

  if (req.file) {
    try {
      const fileData = await uploadFileToStorage(req.file.buffer, req.file.originalname, req.file.mimetype)
      data.thumbnail = fileData.url
      data.thumbnailCid = fileData.cid
    } catch (uploadError) {
      console.error("Error uploading thumbnail:", uploadError)
      data.thumbnail = ""
      data.thumbnailCid = ""
    }
  }

  data.status = "draft"
  data.createdAt = new Date()
  data.updatedAt = new Date()
  data.enrolledCount = 0

  const course = await Course.create(data)

  res.json({ status: "ok", course, message: "New draft created successfully" })
}

// Add Module
router.post("/courses/:courseId/modules", async (req, res) => {
  const { courseId } = req.params
  const { title, description } = req.body

  console.log("Adding module:", { courseId, title, description, body: req.body })

  if (!title) {
    return res.status(400).json({ error: "Module title required" })
  }

  try {
    const courseExists = await Course.findById(courseId)
    if (!courseExists) {
      return res.status(404).json({ error: "Course not found" })
    }

    const newModule = {
      _id: new mongoose.Types.ObjectId(),
      title,
      description: description || "",
      lessons: [],
      order: courseExists.modules ? courseExists.modules.length : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const course = await Course.findByIdAndUpdate(
      courseId,
      {
        $push: { modules: newModule },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    )

    res.json({ status: "ok", modules: course.modules })
  } catch (e) {
    console.error("Error adding module:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Add Lesson with proper validation
router.post("/courses/:courseId/modules/:moduleId/lessons", upload.none(), async (req, res) => {
  const { courseId, moduleId } = req.params

  console.log("Adding lesson - Request details:", {
    courseId,
    moduleId,
    body: req.body,
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    contentType: req.get("Content-Type"),
  })

  if (!req.body || Object.keys(req.body).length === 0) {
    console.error("Request body is empty or undefined")
    return res.status(400).json({
      error: "Request body is missing or empty",
      received: req.body,
      contentType: req.get("Content-Type"),
    })
  }

  const title = req.body.title
  const content = req.body.content || ""
  const youtubeUrl = req.body.youtubeUrl || ""
  const type = req.body.type || "video"
  const isPreview = req.body.isPreview || false
  const questions = req.body.questions

  console.log("Extracted values:", { title, content, youtubeUrl, type, isPreview })

  // Validate lesson data
  const lessonData = {
    title,
    type,
    content,
    youtubeUrl,
    isPreview,
    questions: questions ? (typeof questions === "string" ? JSON.parse(questions) : questions) : [],
  }

  const validation = validateLessonData(lessonData)
  if (!validation.isValid) {
    return res.status(400).json({
      error: "Lesson validation failed",
      details: validation.errors,
      type: type,
    })
  }

  try {
    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    const moduleIndex = course.modules.findIndex((m) => m._id.toString() === moduleId)
    if (moduleIndex === -1) {
      return res.status(404).json({ error: "Module not found" })
    }

    const lesson: any = {
      _id: new mongoose.Types.ObjectId(),
      title,
      type,
      youtubeUrl: youtubeUrl || "",
      isPreview: isPreview === "true" || isPreview === true,
      order: course.modules[moduleIndex].lessons.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Add type-specific fields
    if (type === "text") {
      lesson.content = content || ""
      lesson.questions = []
    } else if (type === "quiz") {
      try {
        lesson.questions = questions ? (typeof questions === "string" ? JSON.parse(questions) : questions) : []
      } catch (e) {
        console.error("Error parsing quiz questions:", e)
        return res.status(400).json({ error: "Invalid quiz questions format" })
      }
      lesson.content = ""
    } else {
      // Default to video type
      lesson.content = ""
      lesson.questions = []
    }

    const modPath = `modules.${moduleIndex}.lessons`
    const updated = await Course.findOneAndUpdate(
      { _id: courseId },
      {
        $push: { [modPath]: lesson },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    )

    console.log("Lesson added successfully:", lesson._id)

    res.json({
      status: "ok",
      lesson,
      modules: updated.modules,
    })
  } catch (e) {
    console.error("Error adding lesson:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Publish Course with enhanced validation
router.put("/courses/:courseId/publish", async (req, res) => {
  try {
    const { courseId } = req.params
    console.log("Publishing course:", courseId)

    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    // Validate course for publishing
    const validation = validateCourseForPublishing(course)
    if (!validation.isValid) {
      return res.status(400).json({
        error: "Course validation failed",
        missingFields: validation.missingFields,
      })
    }

    // Update course status to published
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      {
        $set: {
          status: "published",
          publishedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { new: true },
    )

    console.log("Course published successfully:", courseId)

    res.json({
      status: "ok",
      course: updatedCourse,
      message: "Course published successfully",
    })
  } catch (e) {
    console.error("Error publishing course:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Course Settings Routes
router.get("/courses/:courseId/settings", async (req, res) => {
  try {
    const { courseId } = req.params
    console.log("Fetching course settings:", courseId)

    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    const settings = {
      language: course.language || "en",
      requirements: course.requirements || "",
      outcomes: course.outcomes || "",
      enableCertificate: course.enableCertificate ?? true,
      enableDiscussions: course.enableDiscussions ?? true,
      enablePreview: course.enablePreview ?? true,
      completionCriteria: course.completionCriteria || "all-lessons",
      visibility: course.visibility || "public",
      slug: course.slug || "",
      seoTitle: course.seoTitle || "",
      seoDescription: course.seoDescription || "",
      isFeatured: course.isFeatured ?? false,
    }

    res.json(settings)
  } catch (e) {
    console.error("Error fetching course settings:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

router.put("/courses/:courseId/settings", async (req, res) => {
  try {
    const { courseId } = req.params
    const settings = req.body
    console.log("Updating course settings:", courseId, settings)

    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      {
        $set: {
          ...settings,
          updatedAt: new Date(),
        },
      },
      { new: true },
    )

    res.json({
      status: "ok",
      course: updatedCourse,
      message: "Settings updated successfully",
    })
  } catch (e) {
    console.error("Error updating course settings:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Check Slug Availability
router.get("/check-slug", async (req, res) => {
  try {
    const { slug, courseId } = req.query
    console.log("Checking slug availability:", { slug, courseId })

    if (!slug) {
      return res.status(400).json({ error: "Slug is required" })
    }

    const existingCourse = await Course.findOne({
      slug: slug,
      _id: { $ne: courseId },
    })

    const available = !existingCourse

    res.json({
      available,
      slug,
      message: available ? "Slug is available" : "Slug is already taken",
    })
  } catch (e) {
    console.error("Error checking slug:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Update Lesson
router.put("/courses/:courseId/modules/:moduleId/lessons/:lessonId", upload.none(), async (req, res) => {
  try {
    const { courseId, moduleId, lessonId } = req.params
    const updateData = req.body

    console.log("Updating lesson:", { courseId, moduleId, lessonId, updateData })

    // Validate lesson data
    const validation = validateLessonData(updateData)
    if (!validation.isValid) {
      return res.status(400).json({
        error: "Lesson validation failed",
        details: validation.errors,
        type: updateData.type,
      })
    }

    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    const moduleIndex = course.modules.findIndex((m) => m._id.toString() === moduleId)
    if (moduleIndex === -1) {
      return res.status(404).json({ error: "Module not found" })
    }

    const lessonIndex = course.modules[moduleIndex].lessons.findIndex((l) => l._id.toString() === lessonId)
    if (lessonIndex === -1) {
      return res.status(404).json({ error: "Lesson not found" })
    }

    const lessonPath = `modules.${moduleIndex}.lessons.${lessonIndex}`
    const updateFields: any = {
      [`${lessonPath}.title`]: updateData.title,
      [`${lessonPath}.type`]: updateData.type,
      [`${lessonPath}.updatedAt`]: new Date(),
      updatedAt: new Date(),
    }

    // Add type-specific fields
    if (updateData.type === "video") {
      updateFields[`${lessonPath}.youtubeUrl`] = updateData.youtubeUrl || ""
      updateFields[`${lessonPath}.isPreview`] = updateData.isPreview === "true" || updateData.isPreview === true
      updateFields[`${lessonPath}.content`] = ""
      updateFields[`${lessonPath}.questions`] = []
    } else if (updateData.type === "text") {
      updateFields[`${lessonPath}.content`] = updateData.content || ""
      updateFields[`${lessonPath}.youtubeUrl`] = ""
      updateFields[`${lessonPath}.questions`] = []
    } else if (updateData.type === "quiz") {
      try {
        updateFields[`${lessonPath}.questions`] = updateData.questions
          ? typeof updateData.questions === "string"
            ? JSON.parse(updateData.questions)
            : updateData.questions
          : []
      } catch (e) {
        return res.status(400).json({ error: "Invalid quiz questions format" })
      }
      updateFields[`${lessonPath}.content`] = ""
      updateFields[`${lessonPath}.youtubeUrl`] = ""
    }

    const updatedCourse = await Course.findByIdAndUpdate(courseId, { $set: updateFields }, { new: true })

    const updatedLesson = updatedCourse.modules[moduleIndex].lessons[lessonIndex]

    res.json({
      status: "ok",
      lesson: updatedLesson,
      message: "Lesson updated successfully",
    })
  } catch (e) {
    console.error("Error updating lesson:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Delete Lesson
router.delete("/courses/:courseId/modules/:moduleId/lessons/:lessonId", async (req, res) => {
  try {
    const { courseId, moduleId, lessonId } = req.params

    console.log("Deleting lesson:", { courseId, moduleId, lessonId })

    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    const moduleIndex = course.modules.findIndex((m) => m._id.toString() === moduleId)
    if (moduleIndex === -1) {
      return res.status(404).json({ error: "Module not found" })
    }

    const lessonIndex = course.modules[moduleIndex].lessons.findIndex((l) => l._id.toString() === lessonId)
    if (lessonIndex === -1) {
      return res.status(404).json({ error: "Lesson not found" })
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      {
        $pull: { [`modules.${moduleIndex}.lessons`]: { _id: lessonId } },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    )

    res.json({
      status: "ok",
      message: "Lesson deleted successfully",
      modules: updatedCourse.modules,
    })
  } catch (e) {
    console.error("Error deleting lesson:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Delete Module
router.delete("/courses/:courseId/modules/:moduleId", async (req, res) => {
  try {
    const { courseId, moduleId } = req.params

    console.log("Deleting module:", { courseId, moduleId })

    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    const moduleExists = course.modules.some((m) => m._id.toString() === moduleId)
    if (!moduleExists) {
      return res.status(404).json({ error: "Module not found" })
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      {
        $pull: { modules: { _id: moduleId } },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    )

    res.json({
      status: "ok",
      message: "Module deleted successfully",
      modules: updatedCourse.modules,
    })
  } catch (e) {
    console.error("Error deleting module:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Add this route after the existing course routes

// Delete Course
router.delete("/courses/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params
    const { instructorAddress } = req.query

    console.log("Deleting course:", { courseId, instructorAddress })

    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    // Verify instructor ownership if instructorAddress is provided
    if (instructorAddress && course.instructorAddress.toLowerCase() !== instructorAddress.toLowerCase()) {
      return res.status(403).json({ error: "Access denied: Not the course instructor" })
    }

    // Check if course has enrollments
    const enrollmentCount = await Enrollment.countDocuments({ courseId })

    if (enrollmentCount > 0) {
      // If course has enrollments, archive it instead of deleting
      const updatedCourse = await Course.findByIdAndUpdate(
        courseId,
        {
          $set: {
            status: "archived",
            archivedAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { new: true },
      )

      console.log("Course archived due to existing enrollments:", courseId)

      return res.json({
        status: "ok",
        course: updatedCourse,
        message: "Course archived successfully (had existing enrollments)",
        action: "archived",
      })
    } else {
      // If no enrollments, safe to delete
      await Course.findByIdAndDelete(courseId)

      console.log("Course deleted successfully:", courseId)

      res.json({
        status: "ok",
        message: "Course deleted successfully",
        action: "deleted",
      })
    }
  } catch (e) {
    console.error("Error deleting course:", e)
    res.status(500).json({ error: "Server error", message: e instanceof Error ? e.message : "Unknown error" })
  }
})

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    storage: {
      storacha: storachaClient && storachaClient.isReady() ? "ready" : "unavailable",
      web3storage: web3storage ? "available" : "unavailable",
      fallback: process.env.NODE_ENV === "development" ? "local filesystem" : "none",
    },
    environment: process.env.NODE_ENV || "development",
  })
})

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully")
  mongoose.connection.close(() => {
    console.log("MongoDB connection closed")
    process.exit(0)
  })
})
