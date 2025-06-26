import mongoose from "mongoose"
import { Schema } from "mongoose"

const ProgressSchema = new Schema({
  lessonId: { type: mongoose.Schema.Types.ObjectId, required: true },
  completedAt: { type: Date, default: Date.now },
  timeSpent: { type: Number, default: 0 }, // in seconds
  quizScore: { type: Number, default: 0 }, // for quiz lessons
})

const EnrollmentSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    enrolledAt: { type: Date, default: Date.now },

    // Payment info
    paymentType: { type: String, enum: ["free", "paid", "subscription"], required: true },
    paymentAmount: { type: Number, default: 0 },
    paymentTxHash: { type: String, default: "" },
    paymentStatus: { type: String, enum: ["pending", "completed", "failed"], default: "completed" },

    // Progress tracking
    progress: [ProgressSchema],
    completionPercentage: { type: Number, default: 0 },
    completedAt: { type: Date },
    certificateIssued: { type: Boolean, default: false },
    certificateId: { type: String, default: "" },

    // Learning stats
    totalTimeSpent: { type: Number, default: 0 }, // in seconds
    lastAccessedAt: { type: Date, default: Date.now },
    currentLessonId: { type: mongoose.Schema.Types.ObjectId },

    status: { type: String, enum: ["active", "completed", "dropped"], default: "active" },
  },
  { timestamps: true },
)

// Compound index for efficient queries
EnrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true })
EnrollmentSchema.index({ userId: 1, status: 1 })

module.exports = mongoose.model("Enrollment", EnrollmentSchema)
