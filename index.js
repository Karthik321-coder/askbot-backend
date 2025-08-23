import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000; // ✅ Render default port

// Middlewares
app.use(cors());
app.use(express.json());

// Add this to your index.js CORS configuration
app.use(cors({
  origin: [
    'http://localhost:10000',
    'https://askbot-2-o.vercel.app',  // ✅ Add your Vercel domain
    'https://*.vercel.app'            // ✅ Allow all Vercel preview deployments
  ]
}));


// Ensure API_KEY exists
if (!process.env.API_KEY) {
  console.error("❌ ERROR: API_KEY not found in .env file");
  process.exit(1);
}

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

// ✅ ROOT ROUTE - Fixes "Cannot GET /" 
app.get("/", (req, res) => {
  res.json({ 
    message: "AskBot Backend API is running! 🤖",
    status: "online",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/api/hello",
      users: "/api/users", 
      chat: "/generate"
    }
  });
});

// Health check endpoint
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from the backend!" });
});

app.get("/api/users", (req, res) => {
  res.json([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]);
});

// AI generation endpoint
app.post("/generate", async (req, res) => {
  try {
    const { messages } = req.body;

    // Validate input
    if (!Array.isArray(messages)) {
      return res
        .status(400)
        .json({ error: "'messages' must be an array of objects [{role, content}]" });
    }

    // Convert to prompt format
    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = await result.response.text();

    return res.status(200).json({ reply: text });
  } catch (error) {
    console.error("❌ Gemini API error:", error);
    return res
      .status(500)
      .json({ error: "Gemini API failed: " + (error?.message || "Unknown error") });
  }
});

// ✅ CRITICAL: Bind to 0.0.0.0 for Render deployment
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AskBot backend running on 0.0.0.0:${PORT}`);
});
