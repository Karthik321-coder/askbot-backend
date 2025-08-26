import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const app = express();

// CORS Configuration
app.use(cors({
  origin: "*",
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).send();
});

app.use(express.json());

// Initialize Gemini client (don't exit if API_KEY missing in production)
let genAI;
if (process.env.API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.API_KEY);
} else {
  console.warn("⚠️ WARNING: API_KEY not found in environment variables");
}

// Root route
app.get("/", (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.json({ 
    message: "AskBot Backend API is running! 🤖",
    status: "online",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/test",
      chat: "/generate"
    }
  });
});

// Test endpoint
app.get("/test", (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.json({ message: "CORS test successful!", origin: req.get('origin') });
});

// AI generation endpoint
app.post("/generate", async (req, res) => {
  // Set CORS headers manually
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  try {
    console.log("📝 POST /generate called");
    console.log("📝 Request origin:", req.get('origin'));
    console.log("📝 Request body:", req.body);
    
    // Check if API_KEY exists
    if (!genAI) {
      return res.status(500).json({ 
        error: "API_KEY not configured. Please set API_KEY environment variable." 
      });
    }
    
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
    console.log("✅ AI Response generated successfully");
    
    return res.status(200).json({ reply: text });
    
  } catch (error) {
    console.error("❌ Error in /generate:", error);
    return res.status(500).json({ 
      error: "Backend error: " + error.message 
    });
  }
});

// Export for Vercel serverless function
export default app;
