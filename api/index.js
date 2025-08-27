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

// In-memory conversation store keyed by user ID or session
const conversationHistories = {};

// Utility to get tomorrow's date string (YYYY-MM-DD)
function getTomorrowDateStr() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
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

// AI generation endpoint with memory and date handling
app.post("/generate", async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    if (!genAI) {
      return res.status(500).json({ 
        error: "API_KEY not configured. Please set API_KEY environment variable." 
      });
    }

    const userId = req.headers['x-user-id'] || 'default'; // Ideally from auth/session
    if (!conversationHistories[userId]) {
      conversationHistories[userId] = [];
    }

    const { messages } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ 
        error: "'messages' must be an array of objects [{role, content}]" 
      });
    }

    // Append incoming messages to conversation history
    conversationHistories[userId].push(...messages);

    // Limit history size, keep last 20 messages to avoid token limit issues
    if (conversationHistories[userId].length > 20) {
      conversationHistories[userId] = conversationHistories[userId].slice(-20);
    }

    // Detect date-related queries and inject date info
    const userMessage = messages[messages.length - 1].content.toLowerCase();
    if (userMessage.includes("tomorrow")) {
      conversationHistories[userId].push({ role: 'system', content: `Note: Tomorrow's date is ${getTomorrowDateStr()}. Use this for date-related answers.` });
    }

    // Build prompt from conversation history
    const prompt = conversationHistories[userId]
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");

    // Call Gemini API - using gemini-2.0-flash-exp for example
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    const result = await model.generateContent(prompt);
    const text = await result.response.text();

    // Append AI response to conversation history
    conversationHistories[userId].push({ role: 'assistant', content: text });

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
