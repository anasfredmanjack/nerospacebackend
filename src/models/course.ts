import mongoose from "mongoose";
import { Schema } from "mongoose";

const LessonSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["video", "text", "quiz"], default: "video" },
    content: { type: String, default: "" },
    youtubeUrl: { type: String, default: "" },
    videoUrl: { type: String, default: "" }, // full URL to video
    isPreview: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    questions: [
      {
        question: String,
        options: [String],
        correctOption: Number,
      },
    ],
  },
  { timestamps: true }
);

const ModuleSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    lessons: [LessonSchema],
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const CourseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, lowercase: true, trim: true },
    description: { type: String, default: "" },
    instructorAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    thumbnail: { type: String, default: "" },
    category: { type: String, default: "" },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "expert"],
      default: "beginner",
    },
    tags: [String],
    modules: [ModuleSchema],

    // Pricing
    priceType: {
      type: String,
      enum: ["free", "paid", "subscription"],
      default: "paid",
    },
    price: { type: Number, default: 0 },

    // Status
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    publishedAt: { type: Date },

    // Course details
    requirements: { type: String, default: "" },
    outcomes: { type: String, default: "" },
    language: { type: String, default: "en" },
    totalDuration: { type: String, default: "" },

    // Settings
    enableCertificate: { type: Boolean, default: true },
    enableDiscussions: { type: Boolean, default: true },
    enablePreview: { type: Boolean, default: true },
    completionCriteria: {
      type: String,
      enum: ["all-lessons", "all-quizzes", "final-quiz", "custom"],
      default: "all-lessons",
    },
    visibility: {
      type: String,
      enum: ["public", "unlisted", "private", "draft"],
      default: "public",
    },

    // SEO
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },

    // Stats
    enrolledCount: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Generate slug from title before saving
CourseSchema.pre("save", function (next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, "-");
  }
  next();
});

module.exports = mongoose.model("Course", CourseSchema);
