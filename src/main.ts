// @ts-nocheck
import "module-alias/register";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { NerogigsModule } from "@/app/nerogigs/nerogigs.module";
import mongoose from "mongoose";
import dotenv from "dotenv";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import nodemailer from "nodemailer";
import multer from "multer";
import fs from "fs";
import path from "path";
import Course from "./models/course";
import Userprofiles from "./models/userprofiles";
import Notifications from "./models/notifications";
import { welcomeEmail } from "./utils/newusermailtemplate";

// Import the StorachaClient
import StorachaClient from "./utils/storacha-client";
// Fallback to Web3Storage if Storacha fails
const { Web3Storage } = require("web3.storage");

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 4000;

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
  apis: ["./src/**/*.ts", "./src/app/nerogigs/*.swagger.ts"], // Updated to include swagger directory
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Request logging middleware
app.use(morgan("dev")); // Logs: :method :url :status :response-time ms

// CORS + JSON body parsing with improved mobile support
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increased limit for mobile uploads
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

export const router = express.Router();

// Use router
app.use("/", router);

router.get("/", (req, res) => {
  res.send("Hello World");
});

// Initialize nerogigs module
new NerogigsModule(router);

// MongoDB connect options
const mongooseOptions = {
  autoIndex: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

// Connect to MongoDB
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
    console.log("Connected to MongoDB successfully");

    // Start the server only after successful database connection
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(
        `Swagger documentation available at http://localhost:${PORT}/api-docs`
      );
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1); // Exit with failure
  }
};

// Initialize app
connectDB();

// Setup Nodemailer
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// Multer for in-memory file parsing with better mobile support
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for video uploads
  },
  fileFilter: (req, file, cb) => {
    console.log(
      `Processing file: ${file.fieldname} - ${file.originalname} (${file.mimetype})`
    );

    if (file.fieldname === "video") {
      // Check file type for videos
      if (
        file.mimetype === "video/mp4" ||
        file.mimetype === "video/webm" ||
        file.mimetype === "video/quicktime"
      ) {
        cb(null, true);
      } else {
        cb(
          new Error("Only .mp4, .webm and .mov formats are allowed for videos")
        );
      }
    } else if (file.fieldname === "thumbnail") {
      // Check file type for images
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed for thumbnails"));
      }
    } else {
      cb(null, true);
    }
  },
});

// Initialize Storacha client
const storacha = new StorachaClient({ apiKey: process.env.STORACHA_TOKEN });

// Initialize Web3Storage client as fallback
const web3storage = process.env.WEB3STORAGE_TOKEN
  ? new Web3Storage({ token: process.env.WEB3STORAGE_TOKEN })
  : null;

// Helper function to upload file to storage
async function uploadFileToStorage(fileBuffer, fileName, mimeType) {
  try {
    // Try uploading with Storacha first
    const uploadResponse = await storacha.upload({
      data: fileBuffer,
      filename: fileName,
      contentType: mimeType,
    });

    return {
      cid: uploadResponse.cid,
      name: fileName,
      url: uploadResponse.url,
    };
  } catch (storageError) {
    console.error("Storacha upload failed", storageError);

    // Fallback to Web3Storage if available
    if (web3storage) {
      try {
        const file = new File([fileBuffer], fileName, { type: mimeType });
        const cid = await web3storage.put([file], { wrapWithDirectory: false });
        return {
          cid: cid,
          name: fileName,
          url: `https://${cid}.ipfs.w3s.link/${fileName}`,
        };
      } catch (web3Error) {
        console.error("Web3Storage upload failed", web3Error);
        throw new Error("Failed to upload file to storage");
      }
    } else {
      throw new Error("No storage provider available");
    }
  }
}

// Validate course data for publishing
function validateCourseForPublishing(course) {
  const missingFields = {};

  if (!course.title || course.title.trim() === "") {
    missingFields.title = true;
  }

  if (!course.description || course.description.trim() === "") {
    missingFields.description = true;
  }

  if (!course.category) {
    missingFields.category = true;
  }

  if (!course.level) {
    missingFields.level = true;
  }

  if (!course.instructorAddress) {
    missingFields.instructorAddress = true;
  }

  // Check if course has modules
  if (!course.modules || course.modules.length === 0) {
    missingFields.modules = true;
  } else {
    // Check if any module is empty (has no lessons)
    const emptyModules = course.modules.filter(
      (module) => !module.lessons || module.lessons.length === 0
    );
    if (emptyModules.length > 0) {
      missingFields.emptyModules = emptyModules.map(
        (m) => m.title || "Untitled module"
      );
    }

    // Check if any video lessons are missing video files
    const missingVideos = [];
    course.modules.forEach((module) => {
      if (module.lessons) {
        module.lessons.forEach((lesson) => {
          if (
            lesson.type === "video" &&
            (!lesson.videoUrl || !lesson.videoCid)
          ) {
            missingVideos.push(`${module.title} > ${lesson.title}`);
          }
        });
      }
    });

    if (missingVideos.length > 0) {
      missingFields.missingVideos = missingVideos;
    }
  }

  return {
    isValid: Object.keys(missingFields).length === 0,
    missingFields,
  };
}

// API Routes

// Create Course
router.post("/courses", upload.single("thumbnail"), async (req, res) => {
  try {
    const data = req.body;

    // Minimal validation for course creation
    if (!data.title) {
      return res.status(400).json({ error: "Course title is required" });
    }

    if (!data.instructorAddress) {
      return res.status(400).json({ error: "Instructor address is required" });
    }

    // Process tags if provided as string
    if (data.tags && typeof data.tags === "string") {
      try {
        data.tags = JSON.parse(data.tags);
      } catch (e) {
        console.error("Error parsing tags:", e);
        data.tags = [];
      }
    }

    // Handle thumbnail upload
    if (req.file) {
      try {
        const fileData = await uploadFileToStorage(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );
        data.thumbnail = fileData.url;
      } catch (uploadError) {
        console.error("Error uploading thumbnail:", uploadError);
        // Continue without thumbnail if upload fails
        data.thumbnail = "";
        data.thumbnailCid = "";
      }
    }

    // Set status to draft by default
    data.status = "draft";

    // Add timestamps
    data.createdAt = new Date();
    data.updatedAt = new Date();

    // Create the course
    const course = await Course.create(data);

    res.json({ status: "ok", course });
  } catch (e) {
    console.error("Error creating course:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// Save Draft - Updates an existing course or creates a new one if it doesn't exist
router.post("/courses/draft", upload.single("thumbnail"), async (req, res) => {
  try {
    const data = req.body;
    let course;

    // Check if we have a course ID
    if (data._id) {
      // Try to find the existing course
      const existingCourse = await Course.findById(data._id);

      if (existingCourse) {
        // Process tags if provided as string
        if (data.tags && typeof data.tags === "string") {
          try {
            data.tags = JSON.parse(data.tags);
          } catch (e) {
            console.error("Error parsing tags:", e);
            data.tags = existingCourse.tags || [];
          }
        }

        // Handle thumbnail upload
        if (req.file) {
          try {
            const fileData = await uploadFileToStorage(
              req.file.buffer,
              req.file.originalname,
              req.file.mimetype
            );
            data.thumbnail = fileData.url;
          } catch (uploadError) {
            console.error("Error uploading thumbnail:", uploadError);
            // Keep existing thumbnail
            data.thumbnail = existingCourse.thumbnail;
          }
        }

        // Ensure status is draft
        data.status = "draft";

        // Update timestamp
        data.updatedAt = new Date();

        // Update the course
        course = await Course.findByIdAndUpdate(
          data._id,
          { $set: data },
          { new: true }
        );

        res.json({
          status: "ok",
          course,
          message: "Draft updated successfully",
        });
      } else {
        // Course ID provided but not found, create new course
        // Remove the invalid _id
        delete data._id;

        // Create new course as draft
        return createNewDraft(data, req, res);
      }
    } else {
      // No course ID provided, create new course
      return createNewDraft(data, req, res);
    }
  } catch (e) {
    console.error("Error saving draft:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// Helper function to create a new draft
async function createNewDraft(data, req, res) {
  // Minimal validation for course creation
  if (!data.title) {
    return res.status(400).json({ error: "Course title is required" });
  }

  if (!data.instructorAddress) {
    return res.status(400).json({ error: "Instructor address is required" });
  }

  // Process tags if provided as string
  if (data.tags && typeof data.tags === "string") {
    try {
      data.tags = JSON.parse(data.tags);
    } catch (e) {
      console.error("Error parsing tags:", e);
      data.tags = [];
    }
  }

  // Handle thumbnail upload
  if (req.file) {
    try {
      const fileData = await uploadFileToStorage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      data.thumbnail = fileData.url;
    } catch (uploadError) {
      console.error("Error uploading thumbnail:", uploadError);
      // Continue without thumbnail
      data.thumbnail = "";
      data.thumbnailCid = "";
    }
  }

  // Set status to draft
  data.status = "draft";

  // Add timestamps
  data.createdAt = new Date();
  data.updatedAt = new Date();

  // Create the course
  const course = await Course.create(data);

  res.json({ status: "ok", course, message: "New draft created successfully" });
}

// Add Lesson with enhanced video upload handling
router.post(
  "/courses/:courseId/modules/:moduleId/lessons",
  upload.single("video"),
  async (req, res) => {
    const { courseId, moduleId } = req.params;
    const {
      title,
      content,
      type = "video",
      duration,
      isPreview = false,
      questions,
    } = req.body;

    // Set appropriate timeout for mobile uploads
    req.setTimeout(300000); // 5 minutes timeout for large uploads

    console.log(
      `Adding lesson: ${title} (type: ${type}) to module ${moduleId} in course ${courseId}`
    );

    if (!title) {
      return res.status(400).json({ error: "Lesson title required" });
    }

    // Validate based on lesson type
    if (type === "video" && !req.file) {
      return res
        .status(400)
        .json({ error: "Video file required for video lessons" });
    }

    try {
      // Find the course and module first
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      const moduleIndex = course.modules.findIndex(
        (m) => m._id.toString() === moduleId
      );
      if (moduleIndex === -1) {
        return res.status(404).json({ error: "Module not found" });
      }

      // Create lesson object with common fields
      const lesson = {
        _id: new mongoose.Types.ObjectId(),
        title,
        type,
        isPreview: isPreview === "true" || isPreview === true,
        order: course.modules[moduleIndex].lessons.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Add type-specific fields
      if (type === "video") {
        // Parse duration to seconds if provided as MM:SS
        if (duration) {
          if (typeof duration === "number") {
            lesson.duration = duration;
          } else {
            const parts = duration.split(":");
            if (parts.length === 2) {
              const minutes = Number.parseInt(parts[0], 10);
              const seconds = Number.parseInt(parts[1], 10);
              if (!isNaN(minutes) && !isNaN(seconds)) {
                lesson.duration = minutes * 60 + seconds;
              } else {
                lesson.duration = 0;
              }
            } else {
              lesson.duration = Number.parseInt(duration, 10) || 0;
            }
          }
        } else {
          lesson.duration = 0;
        }

        // Upload video if provided
        if (req.file) {
          try {
            console.log(
              `Uploading video: ${req.file.originalname} (${req.file.size} bytes)`
            );
            const fileData = await uploadFileToStorage(
              req.file.buffer,
              req.file.originalname,
              req.file.mimetype
            );
            lesson.videoCid = fileData.cid;
            lesson.videoName = fileData.name;
            lesson.videoUrl = fileData.url;
            console.log("Video uploaded successfully:", fileData.url);
          } catch (uploadError) {
            console.error("Error uploading video:", uploadError);
            return res.status(500).json({
              error: "Failed to upload video",
              message: uploadError.message,
            });
          }
        }
      } else if (type === "text") {
        // For text lessons, store the content
        lesson.content = content || "";
      } else if (type === "quiz") {
        // For quiz lessons, parse and store questions
        try {
          lesson.questions = questions ? JSON.parse(questions) : [];
        } catch (e) {
          console.error("Error parsing quiz questions:", e);
          return res
            .status(400)
            .json({ error: "Invalid quiz questions format" });
        }
      }

      // Push lesson to the module
      const modPath = `modules.${moduleIndex}.lessons`;
      const updated = await Course.findOneAndUpdate(
        { _id: courseId },
        {
          $push: { [modPath]: lesson },
          $set: { updatedAt: new Date() },
        },
        { new: true }
      );

      console.log("Lesson added successfully:", lesson._id);

      res.json({
        status: "ok",
        lesson,
        modules: updated.modules,
      });
    } catch (e) {
      console.error("Error adding lesson:", e);
      res.status(500).json({ error: "Server error", message: e.message });
    }
  }
);

// Update Lesson with enhanced video upload handling
router.put(
  "/courses/:courseId/modules/:moduleId/lessons/:lessonId",
  upload.single("video"),
  async (req, res) => {
    const { courseId, moduleId, lessonId } = req.params;
    const { title, content, type, duration, isPreview, questions } = req.body;

    console.log(
      `Updating lesson: ${lessonId} in module ${moduleId} of course ${courseId}`
    );

    if (!title) {
      return res.status(400).json({ error: "Lesson title required" });
    }

    try {
      // Find the course and module first
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      const moduleIndex = course.modules.findIndex(
        (m) => m._id.toString() === moduleId
      );
      if (moduleIndex === -1) {
        return res.status(404).json({ error: "Module not found" });
      }

      const lessonIndex = course.modules[moduleIndex].lessons.findIndex(
        (l) => l._id.toString() === lessonId
      );
      if (lessonIndex === -1) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Create update object with common fields
      const updateData = {
        [`modules.${moduleIndex}.lessons.${lessonIndex}.title`]: title,
        [`modules.${moduleIndex}.lessons.${lessonIndex}.updatedAt`]: new Date(),
        updatedAt: new Date(),
      };

      if (type !== undefined) {
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.type`] = type;
      }

      if (isPreview !== undefined) {
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.isPreview`] =
          isPreview === "true" || isPreview === true;
      }

      // Add type-specific fields
      const currentType =
        type || course.modules[moduleIndex].lessons[lessonIndex].type;

      if (currentType === "video") {
        // Parse duration to seconds if provided as MM:SS
        if (duration) {
          if (typeof duration === "number") {
            updateData[
              `modules.${moduleIndex}.lessons.${lessonIndex}.duration`
            ] = duration;
          } else {
            const parts = duration.split(":");
            if (parts.length === 2) {
              const minutes = Number.parseInt(parts[0], 10);
              const seconds = Number.parseInt(parts[1], 10);
              if (!isNaN(minutes) && !isNaN(seconds)) {
                updateData[
                  `modules.${moduleIndex}.lessons.${lessonIndex}.duration`
                ] = minutes * 60 + seconds;
              }
            } else {
              updateData[
                `modules.${moduleIndex}.lessons.${lessonIndex}.duration`
              ] = Number.parseInt(duration, 10) || 0;
            }
          }
        }

        // Upload new video if provided
        if (req.file) {
          try {
            console.log(
              `Uploading new video: ${req.file.originalname} (${req.file.size} bytes)`
            );
            const fileData = await uploadFileToStorage(
              req.file.buffer,
              req.file.originalname,
              req.file.mimetype
            );
            updateData[
              `modules.${moduleIndex}.lessons.${lessonIndex}.videoCid`
            ] = fileData.cid;
            updateData[
              `modules.${moduleIndex}.lessons.${lessonIndex}.videoName`
            ] = fileData.name;
            updateData[
              `modules.${moduleIndex}.lessons.${lessonIndex}.videoUrl`
            ] = fileData.url;
            console.log("New video uploaded successfully:", fileData.url);
          } catch (uploadError) {
            console.error("Error uploading video:", uploadError);
            return res.status(500).json({
              error: "Failed to upload video",
              message: uploadError.message,
            });
          }
        }

        // Clear fields from other lesson types
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.content`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.questions`] =
          [];
      } else if (currentType === "text") {
        // For text lessons, update the content
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.content`] =
          content || "";

        // Clear fields from other lesson types
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoCid`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoName`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoUrl`] =
          "";
        updateData[
          `modules.${moduleIndex}.lessons.${lessonIndex}.duration`
        ] = 0;
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.questions`] =
          [];
      } else if (currentType === "quiz") {
        // For quiz lessons, parse and update questions
        try {
          updateData[
            `modules.${moduleIndex}.lessons.${lessonIndex}.questions`
          ] = questions ? JSON.parse(questions) : [];
        } catch (e) {
          console.error("Error parsing quiz questions:", e);
          return res
            .status(400)
            .json({ error: "Invalid quiz questions format" });
        }

        // Clear fields from other lesson types
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.content`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoCid`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoName`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoUrl`] =
          "";
        updateData[
          `modules.${moduleIndex}.lessons.${lessonIndex}.duration`
        ] = 0;
      }

      // Update the lesson
      const updated = await Course.findOneAndUpdate(
        { _id: courseId },
        { $set: updateData },
        { new: true }
      );

      console.log("Lesson updated successfully:", lessonId);

      res.json({
        status: "ok",
        lesson: updated.modules[moduleIndex].lessons[lessonIndex],
        modules: updated.modules,
      });
    } catch (e) {
      console.error("Error updating lesson:", e);
      res.status(500).json({ error: "Server error", message: e.message });
    }
  }
);

// Get all courses (with optional filters)
router.get("/courses", async (req, res) => {
  try {
    const {
      category,
      level,
      status,
      instructorAddress,
      search,
      limit,
      skip,
      sort,
    } = req.query;

    // Build query
    const query = {};
    if (category) query.category = category;
    if (level) query.level = level;
    if (status) query.status = status;
    if (instructorAddress) query.instructorAddress = instructorAddress;

    // Add search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    // Build sort options
    let sortOptions = { updatedAt: -1 }; // Default sort by last updated
    if (sort) {
      const [field, order] = sort.split(":");
      sortOptions = { [field]: order === "asc" ? 1 : -1 };
    }

    // Count total matching documents for pagination
    const total = await Course.countDocuments(query);

    // Apply pagination
    const limitValue = Number.parseInt(limit) || 10;
    const skipValue = Number.parseInt(skip) || 0;

    const courses = await Course.find(query)
      .sort(sortOptions)
      .limit(limitValue)
      .skip(skipValue)
      .select("-__v"); // Exclude version field

    res.json({
      status: "ok",
      courses,
      pagination: {
        total,
        limit: limitValue,
        skip: skipValue,
        hasMore: total > skipValue + limitValue,
      },
    });
  } catch (e) {
    console.error("Error fetching courses:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// Get course by ID
router.get("/courses/:courseId", async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json({ status: "ok", course });
  } catch (e) {
    console.error("Error fetching course:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// Update Course
router.put(
  "/courses/:courseId",
  upload.single("thumbnail"),
  async (req, res) => {
    try {
      const { courseId } = req.params;
      const updateData = req.body;

      // Find the course first to verify it exists
      const existingCourse = await Course.findById(courseId);
      if (!existingCourse) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Don't allow changing the instructor
      delete updateData.instructorAddress;

      // Process tags if provided as string
      if (updateData.tags && typeof updateData.tags === "string") {
        try {
          updateData.tags = JSON.parse(updateData.tags);
        } catch (e) {
          console.error("Error parsing tags:", e);
          // Keep existing tags if parsing fails
          updateData.tags = existingCourse.tags;
        }
      }

      // Handle thumbnail upload
      if (req.file) {
        try {
          const fileData = await uploadFileToStorage(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype
          );
          updateData.thumbnail = fileData.url;
        } catch (uploadError) {
          console.error("Error uploading thumbnail:", uploadError);
          // Keep existing thumbnail if upload fails
        }
      }

      // Add updated timestamp
      updateData.updatedAt = new Date();

      const course = await Course.findByIdAndUpdate(
        courseId,
        { $set: updateData },
        { new: true }
      );

      res.json({ status: "ok", course });
    } catch (e) {
      console.error("Error updating course:", e);
      res.status(500).json({ error: "Server error", message: e.message });
    }
  }
);

// Delete Course
router.delete("/courses/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findByIdAndDelete(courseId);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    console.log("Course deleted successfully:", courseId);

    res.json({ status: "ok", message: "Course deleted successfully" });
  } catch (e) {
    console.error("Error deleting course:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// Add Module
router.post("/courses/:courseId/modules", async (req, res) => {
  const { courseId } = req.params;
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Module title required" });
  }

  try {
    // Find the course first to verify it exists
    const courseExists = await Course.findById(courseId);
    if (!courseExists) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Create a new module with MongoDB ObjectId
    const newModule = {
      _id: new mongoose.Types.ObjectId(),
      title,
      description: description || "",
      lessons: [],
      order: courseExists.modules ? courseExists.modules.length : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add the module to the course
    const course = await Course.findByIdAndUpdate(
      courseId,
      {
        $push: { modules: newModule },
        $set: { updatedAt: new Date() },
      },
      { new: true }
    );

    res.json({ status: "ok", modules: course.modules });
  } catch (e) {
    console.error("Error adding module:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// Update Module
router.put("/courses/:courseId/modules/:moduleId", async (req, res) => {
  const { courseId, moduleId } = req.params;
  const { title, description, order } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Module title required" });
  }

  try {
    // Find the course and module first
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const moduleIndex = course.modules.findIndex(
      (m) => m._id.toString() === moduleId
    );
    if (moduleIndex === -1) {
      return res.status(404).json({ error: "Module not found" });
    }

    // Update module fields
    const updateData = {
      [`modules.${moduleIndex}.title`]: title,
      [`modules.${moduleIndex}.description`]: description || "",
      [`modules.${moduleIndex}.updatedAt`]: new Date(),
      updatedAt: new Date(),
    };

    if (order !== undefined) {
      updateData[`modules.${moduleIndex}.order`] = order;
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { $set: updateData },
      { new: true }
    );

    res.json({ status: "ok", modules: updatedCourse.modules });
  } catch (e) {
    console.error("Error updating module:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// Delete Module
router.delete("/courses/:courseId/modules/:moduleId", async (req, res) => {
  const { courseId, moduleId } = req.params;

  try {
    // Find the course first
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Remove the module
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      {
        $pull: { modules: { _id: moduleId } },
        $set: { updatedAt: new Date() },
      },
      { new: true }
    );

    res.json({ status: "ok", modules: updatedCourse.modules });
  } catch (e) {
    console.error("Error deleting module:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// Add Lesson with type-specific handling
router.post(
  "/courses/:courseId/modules/:moduleId/lessons",
  upload.single("video"),
  async (req, res) => {
    const { courseId, moduleId } = req.params;
    const {
      title,
      content,
      type = "video",
      duration,
      isPreview = false,
      questions,
    } = req.body;

    // Set appropriate timeout for mobile uploads
    req.setTimeout(300000); // 5 minutes timeout for large uploads

    if (!title) {
      return res.status(400).json({ error: "Lesson title required" });
    }

    // Validate based on lesson type
    if (type === "video" && !req.file) {
      return res
        .status(400)
        .json({ error: "Video file required for video lessons" });
    }

    try {
      // Find the course and module first
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      const moduleIndex = course.modules.findIndex(
        (m) => m._id.toString() === moduleId
      );
      if (moduleIndex === -1) {
        return res.status(404).json({ error: "Module not found" });
      }

      // Create lesson object with common fields
      const lesson = {
        _id: new mongoose.Types.ObjectId(),
        title,
        type,
        isPreview: isPreview === "true" || isPreview === true,
        order: course.modules[moduleIndex].lessons.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Add type-specific fields
      if (type === "video") {
        // Parse duration to seconds if provided as MM:SS
        if (duration) {
          if (typeof duration === "number") {
            lesson.duration = duration;
          } else {
            const parts = duration.split(":");
            if (parts.length === 2) {
              const minutes = Number.parseInt(parts[0], 10);
              const seconds = Number.parseInt(parts[1], 10);
              if (!isNaN(minutes) && !isNaN(seconds)) {
                lesson.duration = minutes * 60 + seconds;
              } else {
                lesson.duration = 0;
              }
            } else {
              lesson.duration = Number.parseInt(duration, 10) || 0;
            }
          }
        } else {
          lesson.duration = 0;
        }

        // Upload video if provided
        if (req.file) {
          try {
            const fileData = await uploadFileToStorage(
              req.file.buffer,
              req.file.originalname,
              req.file.mimetype
            );
            lesson.videoCid = fileData.cid;
            lesson.videoName = fileData.name;
            lesson.videoUrl = fileData.url;
          } catch (uploadError) {
            console.error("Error uploading video:", uploadError);
            return res.status(500).json({
              error: "Failed to upload video",
              message: uploadError.message,
            });
          }
        }
      } else if (type === "text") {
        // For text lessons, store the content
        lesson.content = content || "";
      } else if (type === "quiz") {
        // For quiz lessons, parse and store questions
        try {
          lesson.questions = questions ? JSON.parse(questions) : [];
        } catch (e) {
          console.error("Error parsing quiz questions:", e);
          return res
            .status(400)
            .json({ error: "Invalid quiz questions format" });
        }
      }

      // Push lesson to the module
      const modPath = `modules.${moduleIndex}.lessons`;
      const updated = await Course.findOneAndUpdate(
        { _id: courseId },
        {
          $push: { [modPath]: lesson },
          $set: { updatedAt: new Date() },
        },
        { new: true }
      );

      res.json({
        status: "ok",
        lesson,
        modules: updated.modules,
      });
    } catch (e) {
      console.error("Error adding lesson:", e);
      res.status(500).json({ error: "Server error", message: e.message });
    }
  }
);

// Update Lesson with type-specific handling
router.put(
  "/courses/:courseId/modules/:moduleId/lessons/:lessonId",
  upload.single("video"),
  async (req, res) => {
    const { courseId, moduleId, lessonId } = req.params;
    const { title, content, type, duration, isPreview, questions } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Lesson title required" });
    }

    try {
      // Find the course and module first
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      const moduleIndex = course.modules.findIndex(
        (m) => m._id.toString() === moduleId
      );
      if (moduleIndex === -1) {
        return res.status(404).json({ error: "Module not found" });
      }

      const lessonIndex = course.modules[moduleIndex].lessons.findIndex(
        (l) => l._id.toString() === lessonId
      );
      if (lessonIndex === -1) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Create update object with common fields
      const updateData = {
        [`modules.${moduleIndex}.lessons.${lessonIndex}.title`]: title,
        [`modules.${moduleIndex}.lessons.${lessonIndex}.updatedAt`]: new Date(),
        updatedAt: new Date(),
      };

      if (type !== undefined) {
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.type`] = type;
      }

      if (isPreview !== undefined) {
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.isPreview`] =
          isPreview === "true" || isPreview === true;
      }

      // Add type-specific fields
      const currentType =
        type || course.modules[moduleIndex].lessons[lessonIndex].type;

      if (currentType === "video") {
        // Parse duration to seconds if provided as MM:SS
        if (duration) {
          if (typeof duration === "number") {
            updateData[
              `modules.${moduleIndex}.lessons.${lessonIndex}.duration`
            ] = duration;
          } else {
            const parts = duration.split(":");
            if (parts.length === 2) {
              const minutes = Number.parseInt(parts[0], 10);
              const seconds = Number.parseInt(parts[1], 10);
              if (!isNaN(minutes) && !isNaN(seconds)) {
                updateData[
                  `modules.${moduleIndex}.lessons.${lessonIndex}.duration`
                ] = minutes * 60 + seconds;
              }
            } else {
              updateData[
                `modules.${moduleIndex}.lessons.${lessonIndex}.duration`
              ] = Number.parseInt(duration, 10) || 0;
            }
          }
        }

        // Upload new video if provided
        if (req.file) {
          try {
            const fileData = await uploadFileToStorage(
              req.file.buffer,
              req.file.originalname,
              req.file.mimetype
            );
            updateData[
              `modules.${moduleIndex}.lessons.${lessonIndex}.videoCid`
            ] = fileData.cid;
            updateData[
              `modules.${moduleIndex}.lessons.${lessonIndex}.videoName`
            ] = fileData.name;
            updateData[
              `modules.${moduleIndex}.lessons.${lessonIndex}.videoUrl`
            ] = fileData.url;
          } catch (uploadError) {
            console.error("Error uploading video:", uploadError);
            return res.status(500).json({
              error: "Failed to upload video",
              message: uploadError.message,
            });
          }
        }

        // Clear fields from other lesson types
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.content`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.questions`] =
          [];
      } else if (currentType === "text") {
        // For text lessons, update the content
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.content`] =
          content || "";

        // Clear fields from other lesson types
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoCid`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoName`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoUrl`] =
          "";
        updateData[
          `modules.${moduleIndex}.lessons.${lessonIndex}.duration`
        ] = 0;
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.questions`] =
          [];
      } else if (currentType === "quiz") {
        // For quiz lessons, parse and update questions
        try {
          updateData[
            `modules.${moduleIndex}.lessons.${lessonIndex}.questions`
          ] = questions ? JSON.parse(questions) : [];
        } catch (e) {
          console.error("Error parsing quiz questions:", e);
          return res
            .status(400)
            .json({ error: "Invalid quiz questions format" });
        }

        // Clear fields from other lesson types
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.content`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoCid`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoName`] =
          "";
        updateData[`modules.${moduleIndex}.lessons.${lessonIndex}.videoUrl`] =
          "";
        updateData[
          `modules.${moduleIndex}.lessons.${lessonIndex}.duration`
        ] = 0;
      }

      // Update the lesson
      const updated = await Course.findOneAndUpdate(
        { _id: courseId },
        { $set: updateData },
        { new: true }
      );

      res.json({
        status: "ok",
        lesson: updated.modules[moduleIndex].lessons[lessonIndex],
        modules: updated.modules,
      });
    } catch (e) {
      console.error("Error updating lesson:", e);
      res.status(500).json({ error: "Server error", message: e.message });
    }
  }
);

// Delete Lesson
router.delete(
  "/courses/:courseId/modules/:moduleId/lessons/:lessonId",
  async (req, res) => {
    const { courseId, moduleId, lessonId } = req.params;

    try {
      // Find the course first
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      const moduleIndex = course.modules.findIndex(
        (m) => m._id.toString() === moduleId
      );
      if (moduleIndex === -1) {
        return res.status(404).json({ error: "Module not found" });
      }

      // Remove the lesson
      const updatePath = `modules.${moduleIndex}.lessons`;
      const updatedCourse = await Course.findByIdAndUpdate(
        courseId,
        {
          $pull: { [updatePath]: { _id: lessonId } },
          $set: { updatedAt: new Date() },
        },
        { new: true }
      );

      res.json({ status: "ok", modules: updatedCourse.modules });
    } catch (e) {
      console.error("Error deleting lesson:", e);
      res.status(500).json({ error: "Server error", message: e.message });
    }
  }
);

// Course Settings
router.get("/courses/:courseId/settings", async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Extract settings from course
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
    };

    res.json({ status: "ok", settings });
  } catch (e) {
    console.error("Error fetching course settings:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

router.put("/courses/:courseId/settings", async (req, res) => {
  try {
    const { courseId } = req.params;
    const settings = req.body;

    // Find the course first to verify it exists
    const courseExists = await Course.findById(courseId);
    if (!courseExists) {
      return res.status(404).json({ error: "Course not found" });
    }

    const course = await Course.findByIdAndUpdate(
      courseId,
      {
        $set: {
          language: settings.language,
          requirements: settings.requirements,
          outcomes: settings.outcomes,
          enableCertificate: settings.enableCertificate,
          enableDiscussions: settings.enableDiscussions,
          enablePreview: settings.enablePreview,
          completionCriteria: settings.completionCriteria,
          visibility: settings.visibility,
          slug: settings.slug,
          seoTitle: settings.seoTitle,
          seoDescription: settings.seoDescription,
          isFeatured: settings.isFeatured,
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    res.json({ status: "ok", settings });
  } catch (e) {
    console.error("Error updating course settings:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// Publish Course
router.put("/courses/:courseId/publish", async (req, res) => {
  try {
    const { courseId } = req.params;

    // Find the course
    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Validate course has all required fields for publishing
    const validation = validateCourseForPublishing(course);

    if (!validation.isValid) {
      console.log("Course validation failed:", validation.missingFields);
      return res.status(400).json({
        error: "Course cannot be published due to missing information",
        missingFields: validation.missingFields,
      });
    }

    // Calculate total duration
    let totalDurationSeconds = 0;
    course.modules.forEach((module) => {
      module.lessons.forEach((lesson) => {
        if (lesson.type === "video" && lesson.duration) {
          // If duration is stored as seconds (number)
          if (typeof lesson.duration === "number") {
            totalDurationSeconds += lesson.duration;
          }
          // If duration is stored as string (MM:SS)
          else if (typeof lesson.duration === "string") {
            const parts = lesson.duration.split(":");
            if (parts.length === 2) {
              const minutes = Number.parseInt(parts[0], 10);
              const seconds = Number.parseInt(parts[1], 10);
              if (!isNaN(minutes) && !isNaN(seconds)) {
                totalDurationSeconds += minutes * 60 + seconds;
              }
            } else {
              // Try to parse as seconds
              const seconds = Number.parseInt(lesson.duration, 10);
              if (!isNaN(seconds)) {
                totalDurationSeconds += seconds;
              }
            }
          }
        }
      });
    });

    // Format total duration
    const totalDurationMinutes = totalDurationSeconds / 60;
    let totalDuration;
    if (totalDurationMinutes < 60) {
      totalDuration = `${Math.round(totalDurationMinutes)} minutes`;
    } else {
      const hours = Math.floor(totalDurationMinutes / 60);
      const minutes = Math.round(totalDurationMinutes % 60);
      totalDuration = `${hours} hour${hours > 1 ? "s" : ""}${
        minutes > 0 ? ` ${minutes} min` : ""
      }`;
    }

    // Update the course
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      {
        $set: {
          status: "published",
          totalDuration,
          publishedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    // Create notification for the instructor
    try {
      await Notifications.findOneAndUpdate(
        { address: course.instructorAddress },
        {
          $push: {
            items: {
              type: "Course Published",
              desc: `Your course "${course.title}" has been published successfully.`,
              createdAt: new Date(),
              read: false,
              courseId: course._id,
            },
          },
        },
        { upsert: true }
      );
    } catch (notifError) {
      console.error("Error creating notification:", notifError);
      // Continue even if notification fails
    }

    res.json({ status: "ok", course: updatedCourse });
  } catch (e) {
    console.error("Error publishing course:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// Check slug availability
router.get("/courses/check-slug", async (req, res) => {
  try {
    const { slug, courseId } = req.query;

    if (!slug) {
      return res.status(400).json({ error: "Slug parameter is required" });
    }

    const query = { slug: slug.toLowerCase() };

    // If courseId is provided, exclude that course from the check
    if (courseId) {
      query._id = { $ne: mongoose.Types.ObjectId(courseId) };
    }

    const existingCourse = await Course.findOne(query);

    res.json({ available: !existingCourse });
  } catch (e) {
    console.error("Error checking slug availability:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// Duplicate course
router.post("/courses/:courseId/duplicate", async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title } = req.body;

    // Find the original course
    const originalCourse = await Course.findById(courseId);
    if (!originalCourse) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Create a new course object based on the original
    const newCourse = originalCourse.toObject();

    // Remove _id to create a new document
    delete newCourse._id;

    // Update fields for the duplicate
    newCourse.title = title || `${originalCourse.title} (Copy)`;
    newCourse.status = "draft";
    newCourse.publishedAt = null;
    newCourse.enrolledCount = 0;
    newCourse.createdAt = new Date();
    newCourse.updatedAt = new Date();

    // Generate a new slug
    if (newCourse.slug) {
      newCourse.slug = `${newCourse.slug}-copy-${Date.now()
        .toString()
        .slice(-6)}`;
    }

    // Assign new IDs to modules and lessons
    if (newCourse.modules) {
      newCourse.modules = newCourse.modules.map((module) => {
        const newModule = { ...module, _id: new mongoose.Types.ObjectId() };

        if (newModule.lessons) {
          newModule.lessons = newModule.lessons.map((lesson) => ({
            ...lesson,
            _id: new mongoose.Types.ObjectId(),
          }));
        }

        return newModule;
      });
    }

    // Create the new course
    const duplicatedCourse = await Course.create(newCourse);

    res.json({ status: "ok", course: duplicatedCourse });
  } catch (e) {
    console.error("Error duplicating course:", e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// ─── POST /checkuserprofile ─────────────────────────────────────────────────────
router.post("/checkuserprofile", async (req, res) => {
  const userwalletaddress = req.body.address;
  const ip = req.ip;
  const ua = req.get("User-Agent") || "unknown";

  if (!userwalletaddress) {
    return res.status(400).json({ error: "Wallet address is required" });
  }

  try {
    const userExists = await Userprofiles.findOne({
      address: userwalletaddress,
    });

    // Log login history in Notifications
    await Notifications.findOneAndUpdate(
      { address: userwalletaddress },
      { $push: { loginHistory: { ip, userAgent: ua, timestamp: new Date() } } },
      { upsert: true }
    );
    console.log("user profile checked user");
    return res.json({ status: userExists ? "registered" : "new" });
  } catch (err) {
    console.log("Error checking user profile:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", message: err.message });
  }
});

// ─── POST /newuser ────────────────────────────────────────────────────────────────
router.post("/newuser", async (req, res) => {
  const userwalletaddress = req.body.address;
  const email = req.body.email;
  const preferences = req.body.preferences;

  if (!userwalletaddress || !email || !Array.isArray(preferences)) {
    return res
      .status(400)
      .json({ error: "address, email and preferences are required" });
  }

  try {
    // 1) Upsert user profile
    const updatedUser = await Userprofiles.findOneAndUpdate(
      { address: userwalletaddress },
      {
        $set: {
          email,
          preferences,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 2) Send welcome email (don't await to avoid delaying response too long)
    transporter.sendMail(
      {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: "Welcome to Nerospace!",
        html: welcomeEmail(userwalletaddress),
      },
      (err, info) => {
        if (err) console.error("Error sending mail:", err);
        else console.log("Welcome email sent:", info.response);
      }
    );

    // 3) Log profile creation in Notifications
    await Notifications.findOneAndUpdate(
      { address: userwalletaddress },
      {
        $push: {
          items: {
            type: "Profile Creation",
            desc: "created new profile on signup",
            createdAt: new Date(),
            read: false,
          },
        },
      },
      { upsert: true }
    );

    // 4) Respond once with the updated user
    return res.json({ status: "ok", user: updatedUser });
  } catch (err) {
    console.error("Error in /newuser:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", message: err.message });
  }
});

// ─── POST /notifications ─────────────────────────────────────────────────────────
router.post("/notifications", async (req, res) => {
  const { address, type, desc } = req.body;
  if (!address || !type || !desc) {
    return res.status(400).json({ error: "address, type and desc required" });
  }
  try {
    const doc = await Notifications.findOneAndUpdate(
      { address },
      {
        $push: {
          items: {
            type,
            desc,
            createdAt: new Date(),
            read: false,
          },
        },
      },
      { upsert: true, new: true }
    );
    return res.json({ status: "ok", notifications: doc.items });
  } catch (err) {
    console.error("Error in /notifications:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", message: err.message });
  }
});

// ─── GET /notifications/:address ────────────────────────────────────────────────
router.get("/notifications/:address", async (req, res) => {
  const address = req.params.address;
  try {
    const doc = await Notifications.findOne({ address });
    return res.json({ items: doc ? doc.items : [] });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", message: err.message });
  }
});

// ─── PUT /notifications/:address/:itemId/read ──────────────────────────────────
router.put("/notifications/:address/:itemId/read", async (req, res) => {
  const { address, itemId } = req.params;
  try {
    const doc = await Notifications.findOneAndUpdate(
      { address, "items._id": itemId },
      { $set: { "items.$.read": true } },
      { new: true }
    );
    return res.json({ items: doc.items });
  } catch (err) {
    console.error("Error marking notification read:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", message: err.message });
  }
});

// ─── GET /activity/:address ─────────────────────────────────────────────────────
router.get("/activity/:address", async (req, res) => {
  const address = req.params.address;
  try {
    const doc = await Notifications.findOne({ address });
    if (!doc) {
      return res.json({ activities: [] });
    }

    const notifs = doc.items.map((item) => ({
      kind: "notification",
      id: item._id,
      type: item.type,
      desc: item.desc,
      read: item.read,
      date: item.createdAt,
      courseId: item.courseId,
    }));

    const logins = doc.loginHistory.map((login) => ({
      kind: "login",
      ip: login.ip,
      userAgent: login.userAgent,
      date: login.timestamp,
    }));

    const activities = [...notifs, ...logins].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return res.json({ activities });
  } catch (err) {
    console.error("Error in /activity:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", message: err.message });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// // ─── CONNECT & START ────────────────────────────────────────────────────────────
// mongoose
//   .connect(process.env.DB_URI)
//   .then(() => {
//     console.log("Connected to database");
//     router.listen(PORT, () => console.log(`Server running on port ${PORT}`));
//   })
//   .catch((err) => console.error("Error connecting to DB:", err));

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  mongoose.connection.close(false, () => {
    console.log("MongoDB connection closed");
    process.exit(0);
  });
});
