import mongoose from "mongoose"
import { Schema } from "mongoose"

const CourseSubscriptionSchema = new Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  subscribedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  monthlyPrice: { type: Number, required: true },
  autoRenew: { type: Boolean, default: true },
  status: { type: String, enum: ["active", "cancelled", "expired"], default: "active" },
})

const SubscriptionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },

    // Platform-wide subscription (for unlimited access)
    platformPlan: { type: String, enum: ["free", "premium", "pro"], default: "free" },
    platformStatus: { type: String, enum: ["active", "cancelled", "expired"], default: "active" },
    platformStartDate: { type: Date },
    platformEndDate: { type: Date },
    platformPaymentAmount: { type: Number, default: 0 },
    platformPaymentTxHash: { type: String, default: "" },

    // Course-specific subscriptions
    courseSubscriptions: [CourseSubscriptionSchema],

    // Usage tracking for free tier
    coursesAccessed: { type: Number, default: 0 },
    monthlyLimit: { type: Number, default: 3 }, // for free tier

    // Billing
    billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    nextBillingDate: { type: Date },
    paymentMethod: { type: String, enum: ["minipay", "wallet"], default: "minipay" },
  },
  { timestamps: true },
)

// Compound indexes for efficient queries
SubscriptionSchema.index({ userId: 1, "courseSubscriptions.courseId": 1 })
SubscriptionSchema.index({ userId: 1, platformStatus: 1 })

module.exports = mongoose.model("Subscription", SubscriptionSchema)
