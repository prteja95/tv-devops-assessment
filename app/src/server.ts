import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ✅ Health check route
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Existing routes
app.get("/", (_req, res) => {
  res.send("Hello World from Express + TypeScript!");
});

app.listen(port, () => {
  console.log(`🚀 Server is running at http://localhost:${port}`);
});
