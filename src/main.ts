import "module-alias/register";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { NerogigsModule } from "@/app/nerogigs/nerogigs.module";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 4000;

// Request logging middleware
app.use(morgan("dev")); // Logs: :method :url :status :response-time ms

// CORS + JSON body parsing with improved mobile support
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increased limit for mobile uploads
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

export const router = express.Router();

// Use router
app.use("/api", router);

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
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1); // Exit with failure
  }
};

// Initialize app
connectDB();
