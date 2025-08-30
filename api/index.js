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
app.post("/generate", async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    console.log('🔍 === NEW REQUEST ===');
    console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
    console.log('📥 Request headers:', JSON.stringify(req.headers, null, 2));

    if (!genAI) {
      console.error('❌ genAI not initialized - API_KEY missing');
      return res.status(500).json({ 
        error: "API_KEY not configured. Please set API_KEY environment variable." 
      });
    }

    const userId = req.headers['x-user-id'] || 'default';
    if (!conversationHistories[userId]) {
      conversationHistories[userId] = [];
    }

    const { messages } = req.body;
    console.log('📝 Received messages:', JSON.stringify(messages, null, 2));

    if (!Array.isArray(messages)) {
      console.error('❌ Messages not array:', typeof messages, messages);
      return res.status(400).json({ 
        error: "'messages' must be an array of objects [{role, content}]" 
      });
    }

    // Append incoming messages to conversation history
    conversationHistories[userId].push(...messages);

    // Limit history size
    if (conversationHistories[userId].length > 20) {
      conversationHistories[userId] = conversationHistories[userId].slice(-20);
    }

    // Detect date-related queries
    const userMessage = messages[messages.length - 1].content.toLowerCase();
    if (userMessage.includes("tomorrow")) {
      conversationHistories[userId].push({ 
        role: 'system', 
        content: `Note: Tomorrow's date is ${getTomorrowDateStr()}. Use this for date-related answers.` 
      });
    }

    // Build prompt
    const prompt = conversationHistories[userId]
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");
    
    console.log('🤖 Prompt to send to Gemini:', prompt);
    console.log('🔑 API_KEY exists:', !!process.env.API_KEY);
    console.log('🔑 API_KEY length:', process.env.API_KEY ? process.env.API_KEY.length : 0);

    // Call Gemini API
    console.log('🌐 Calling Gemini API...');
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    const result = await model.generateContent(prompt);
    const text = await result.response.text();

    console.log('✅ Gemini response received');
    console.log('📄 Response length:', text ? text.length : 0);
    console.log('📄 Response preview:', text ? text.substring(0, 200) + '...' : 'EMPTY');

    // Append AI response to conversation history
    conversationHistories[userId].push({ role: 'assistant', content: text });

    const responseData = { reply: text };
    console.log('📤 Sending response:', JSON.stringify(responseData, null, 2));

    return res.status(200).json(responseData);

  } catch (error) {
    console.error("❌ FULL ERROR in /generate:", error);
    console.error("❌ Error stack:", error.stack);
    return res.status(500).json({ 
      error: "Backend error: " + error.message,
      details: error.toString()
    });
  }
});


// Export for Vercel serverless function
export default app;
