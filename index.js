import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import morgan from "morgan";

import routes from "./routes/index.js";

dotenv.config();

const app = express();

// ✅ CORS configuration (supports localhost + deployed frontend)
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      process.env.FRONTEND_URL
    ],
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

app.use(morgan("dev"));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  })
  .then(() => console.log("✅ DB Connected successfully"))
  .catch((err) => console.error("❌ Failed to connect to DB:", err));

const PORT = process.env.PORT || 5000;

// Health route
app.get("/", (req, res) => {
  res.status(200).json({ message: "TaskNest API running 🚀" });
});

// API routes
app.use("/api-v1", routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});