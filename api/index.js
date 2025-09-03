import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai"; // ✅ FIXED: Use import instead of require

dotenv.config();
const app = express();

// ✅ FIXED: Initialize DeepSeek with import syntax
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
});

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

// ✅ SINGLE UNIFIED CHAT ENDPOINT (removed duplicate)
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

    let text;

 if (isPremium) {
  try {
    console.log('🚀 Calling DeepSeek API for Premium user...');
    console.log('🔑 API Key status:', process.env.DEEPSEEK_API_KEY ? 'SET' : 'MISSING');
    
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY not configured');
    }

    // ✅ CRITICAL FIX: Build messages array correctly
    const messages = [
      {
        role: "system",
        content: "You are AskBot AI, powered by DeepSeek. You are a helpful and knowledgeable assistant. Always identify yourself as AskBot powered by DeepSeek when asked who you are."
      }
    ];

    // Add conversation history properly
    conversationHistories[userId].forEach(msg => {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    });

    console.log('📤 Sending to DeepSeek - Message count:', messages.length);
    console.log('📤 Last message:', messages[messages.length - 1]);

    const completion = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: messages,
      max_tokens: 4000,
      temperature: 0.7,
      stream: false
    });

    text = completion.choices[0].message.content;
    console.log('✅ DeepSeek SUCCESS - Response length:', text.length);
    console.log('✅ DeepSeek Response Preview:', text.substring(0, 150));
    
  } catch (deepseekError) {
    console.error('❌ DEEPSEEK FAILED:', {
      message: deepseekError.message,
      status: deepseekError.status,
      code: deepseekError.code,
      response: deepseekError.response?.data
    });
    
    // Only fallback if absolutely necessary
    console.log('🔄 Falling back to Gemini due to DeepSeek failure');
    const prompt = conversationHistories[userId]
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
    const result = await model.generateContent(prompt);
    text = await result.response.text();
  }
} else {
      console.log('🌐 Calling Gemini API for Free user...');
      // Use Gemini for free users
      const prompt = conversationHistories[userId]
        .map(m => `${m.role}: ${m.content}`)
        .join("\n");
      
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
      const result = await model.generateContent(prompt);
      text = await result.response.text();
    }

    console.log('✅ Response received');
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

// Add this endpoint to test DeepSeek connection
app.get("/debug-deepseek", async (req, res) => {
  try {
    console.log('🧪 Testing DeepSeek API directly...');
    
    const completion = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { 
          role: "system", 
          content: "You are AskBot AI powered by DeepSeek. When asked who you are, always say you are AskBot powered by DeepSeek." 
        },
        { role: "user", content: "Who are you?" }
      ],
      max_tokens: 200,
      temperature: 0.7
    });
    
    res.json({
      success: true,
      response: completion.choices[0].message.content,
      usage: completion.usage,
      model: completion.model
    });
  } catch (error) {
    console.error('❌ DeepSeek test failed:', error);
    res.json({
      success: false,
      error: error.message,
      status: error.status,
      code: error.code,
      details: error.response?.data || 'No additional details'
    });
  }
});


// Export for Vercel serverless function
export default app;
