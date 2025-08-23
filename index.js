import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ FIXED CORS CONFIGURATION - Include your exact Vercel URL
app.use(cors({
  origin: [
    "https://askbot-2-o-hmif.vercel.app",  // ✅ Your exact Vercel frontend URL
    "http://localhost:3000",                // Local development
    "http://localhost:3001"                 // Alternative local port
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Ensure API_KEY exists
if (!process.env.API_KEY) {
  console.error("❌ ERROR: API_KEY not found in .env file");
  process.exit(1);
}

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

// Root route
app.get("/", (req, res) => {
  res.json({ 
    message: "AskBot Backend API is running! 🤖",
    status: "online",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/api/hello",
      chat: "/generate"
    }
  });
});

// Health check endpoint
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from the backend!" });
});

// AI generation endpoint
app.post("/generate", async (req, res) => {
  try {
    console.log("📝 Received request from origin:", req.get('origin'));
    
    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({ 
        error: "'messages' must be an array of objects [{role, content}]" 
      });
    }

    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = await result.response.text();

    console.log("✅ Sending response:", { reply: text.substring(0, 50) + "..." });

    return res.status(200).json({ reply: text });
  } catch (error) {
    console.error("❌ Gemini API error:", error);
    return res.status(500).json({ 
      error: "Gemini API failed: " + (error?.message || "Unknown error") 
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AskBot backend running on 0.0.0.0:${PORT}`);
});
