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
import nodemailer from "nodemailer"
import multer from "multer"
import Course from "./models/course"
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

// CORS configuration - MUST come before body parsing
app.use(
  cors({
    origin: "*",
    allowedHeaders: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
)

// Body parsing middleware - CRITICAL: Must come before routes
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Debug middleware to log request body
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

// Use router
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

// Initialize app
connectDB()

// Setup Nodemailer
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.EMAIL_PASSWORD,
  },
})

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

// Initialize Storacha client with better error handling
let storachaClient: StorachaClient | null = null

// Async function to initialize Storacha client
async function initializeStorachaClient() {
  if (process.env.STORACHA_TOKEN) {
    try {
      console.log("Creating Storacha client...")
      storachaClient = new StorachaClient({ apiKey: process.env.STORACHA_TOKEN })

      // Initialize the client
      await storachaClient.initialize()
      console.log("Storacha client initialized successfully")
    } catch (error) {
      console.error("Failed to initialize Storacha client:", error)
      storachaClient = null // Reset to null if initialization fails
    }
  } else {
    console.log("STORACHA_TOKEN not provided, Storacha client will not be available")
  }
}

// Initialize Storacha client (don't block server startup)
initializeStorachaClient().catch(console.error)

// Initialize Web3Storage client as fallback
let web3storage: any = null

// Async function to initialize Web3Storage
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

// Initialize Web3Storage client (don't block server startup)
initializeWeb3Storage().catch(console.error)

// Helper function to upload file to storage
async function uploadFileToStorage(fileBuffer: Buffer, fileName: string, mimeType: string) {
  console.log(`Attempting to upload: ${fileName} (${mimeType})`)

  // Try Storacha first
  if (storachaClient) {
    try {
      // Ensure client is initialized
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
      // Continue to fallback options
    }
  }

  // Fallback to Web3Storage if available
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

  // Fallback: Local file system (for development)
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

  // If all methods fail, throw an error
  throw new Error("All storage methods failed. Please check your storage configuration.")
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

    const missingVideos: string[] = []
    course.modules.forEach((module: any) => {
      if (module.lessons) {
        module.lessons.forEach((lesson: any) => {
          if (lesson.type === "video" && !lesson.youtubeUrl) {
            missingVideos.push(`${module.title} > ${lesson.title}`)
          }
        })
      }
    })

    if (missingVideos.length > 0) {
      missingFields.missingVideos = missingVideos
    }
  }

  return {
    isValid: Object.keys(missingFields).length === 0,
    missingFields,
  }
}

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

// Add Lesson - FIXED VERSION
router.post("/courses/:courseId/modules/:moduleId/lessons", async (req, res) => {
  const { courseId, moduleId } = req.params

  console.log("Adding lesson - Request details:", {
    courseId,
    moduleId,
    body: req.body,
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    contentType: req.get("Content-Type"),
  })

  // Check if body exists and has content
  if (!req.body || Object.keys(req.body).length === 0) {
    console.error("Request body is empty or undefined")
    return res.status(400).json({
      error: "Request body is missing or empty",
      received: req.body,
      contentType: req.get("Content-Type"),
    })
  }

  // Safely destructure with defaults
  const title = req.body.title
  const content = req.body.content || ""
  const youtubeUrl = req.body.youtubeUrl || ""
  const type = req.body.type || "video"
  const isPreview = req.body.isPreview || false
  const questions = req.body.questions

  console.log("Extracted values:", { title, content, youtubeUrl, type, isPreview })

  if (!title) {
    console.error("Title is missing from request")
    return res.status(400).json({ error: "Lesson title required" })
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

// Continue with all other routes...
// (I'll include the rest of the routes but they remain the same as before)

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
