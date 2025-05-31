import { seedCategories } from "./categories";
import { seedTags } from "./tags";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function seed() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    await mongoose.connect(mongoUri);
    console.log("📦 Connected to MongoDB");

    // Run seeders
    await seedCategories();
    await seedTags();

    console.log("✅ Database seeding completed successfully");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
  }
}

// Run the seed function
seed();
