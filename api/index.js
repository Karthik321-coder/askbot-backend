
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

// Initialize Gemini client
let genAI;
if (process.env.API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.API_KEY);
} else {
  console.warn("⚠️ WARNING: API_KEY not found in environment variables");
}

// In-memory conversation store
const conversationHistories = {};

// Utility to get tomorrow's date string
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
      chat: "/api/chat"
    }
  });
});

// Test endpoint
app.get("/test", (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.json({ 
    message: "Backend is working!",
    timestamp: new Date().toISOString()
  });
});

// Unified chat endpoint for both free and premium
app.post("/api/chat", async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    console.log('🔍 === NEW REQUEST ===');
    console.log('📥 Request body:', JSON.stringify(req.body, null, 2));

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

    const { message, isPremium } = req.body;
    console.log('📝 Received message:', message);
    console.log('🎯 Premium status:', isPremium);

    if (!message || typeof message !== 'string') {
      console.error('❌ Invalid message format');
      return res.status(400).json({ 
        error: "'message' must be a string" 
      });
    }

    // Append user message to conversation history
    conversationHistories[userId].push({ role: 'user', content: message });

    // Limit history size
    if (conversationHistories[userId].length > 20) {
      conversationHistories[userId] = conversationHistories[userId].slice(-20);
    }

    // Build prompt from conversation history
    const prompt = conversationHistories[userId]
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");
    
    console.log('🤖 Prompt to send to Gemini:', prompt);

    // Call Gemini API
    console.log('🌐 Calling Gemini API...');
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
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
    console.error("❌ FULL ERROR in /api/chat:", error);
    console.error("❌ Error stack:", error.stack);
    return res.status(500).json({ 
      error: "Backend error: " + error.message,
      details: error.toString()
    });
  }
});

// Enhanced chat endpoint with image support
app.post("/api/chat/vision", async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    console.log('🔍 === NEW VISION REQUEST ===');
    console.log('📥 Request body keys:', Object.keys(req.body));

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

    const { message, isPremium, files } = req.body;
    console.log('📝 Received message:', message);
    console.log('🎯 Premium status:', isPremium);
    console.log('📎 Files count:', files ? files.length : 0);

    // Check if there are images
    const hasImages = files && files.some(f => f.type.startsWith('image/'));
    
    if (hasImages) {
      console.log('🖼️ Processing request with images...');
      
      // Use Gemini Pro Vision for image analysis
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      
      // Prepare content array for multimodal input
      const parts = [];
      
      // Add text message if present
      if (message && message.trim()) {
        parts.push({ text: message });
      }
      
      // Add images
      files.forEach(file => {
        if (file.type.startsWith('image/')) {
          // Convert base64 data URL to just base64
          const base64Data = file.data.split(',')[1] || file.data;
          parts.push({
            inlineData: {
              mimeType: file.type,
              data: base64Data
            }
          });
        }
      });
      
      console.log('🤖 Sending multimodal request to Gemini...');
      const result = await model.generateContent(parts);
      const text = await result.response.text();
      
      console.log('✅ Gemini vision response received');
      console.log('📄 Response length:', text ? text.length : 0);
      
      // Append to conversation history
      conversationHistories[userId].push({ 
        role: 'user', 
        content: message + (files.length > 0 ? ` [with ${files.length} file(s)]` : '') 
      });
      conversationHistories[userId].push({ role: 'assistant', content: text });
      
      // Limit history size
      if (conversationHistories[userId].length > 20) {
        conversationHistories[userId] = conversationHistories[userId].slice(-20);
      }
      
      return res.status(200).json({ reply: text });
      
    } else {
      // No images, use regular text model
      console.log('📝 Processing text-only request...');
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ 
          error: "'message' must be a string" 
        });
      }

      // Append user message to conversation history
      conversationHistories[userId].push({ role: 'user', content: message });

      // Limit history size
      if (conversationHistories[userId].length > 20) {
        conversationHistories[userId] = conversationHistories[userId].slice(-20);
      }

      // Build prompt from conversation history
      const prompt = conversationHistories[userId]
        .map(m => `${m.role}: ${m.content}`)
        .join("\n");
      
      console.log('🤖 Using text model for non-image request...');
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
      const result = await model.generateContent(prompt);
      const text = await result.response.text();

      // Append AI response to conversation history
      conversationHistories[userId].push({ role: 'assistant', content: text });

      return res.status(200).json({ reply: text });
    }

  } catch (error) {
    console.error("❌ FULL ERROR in /api/chat/vision:", error);
    console.error("❌ Error stack:", error.stack);
    return res.status(500).json({ 
      error: "Backend error: " + error.message,
      details: error.toString()
    });
  }
});


// Export for Vercel serverless function
export default app;
