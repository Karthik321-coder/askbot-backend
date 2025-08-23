import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ BULLETPROOF CORS CONFIGURATION
app.use(cors({
  origin: "*", // Allow all origins for now
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

// Ensure API_KEY exists
if (!process.env.API_KEY) {
  console.error("❌ ERROR: API_KEY not found in .env file");
  process.exit(1);
}

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

// Root route
app.get("/", (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AskBot backend running on 0.0.0.0:${PORT}`);
  console.log(`🌍 Backend URL: https://askbot-backend-cfl7.onrender.com`);
});
