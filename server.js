import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import mongoose from 'mongoose';

dotenv.config();

const app = express();
// Render usually provides a port, otherwise use 5005
const PORT = process.env.PORT || 5005;

// --- MIDDLEWARE ---
// This is the "Open Door" policy that allows your phone and Vercel to connect
app.use(cors());
app.use(express.json());

// --- CONNECT TO MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas!'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// --- MONGODB SCHEMA ---
const userStatsSchema = new mongoose.Schema({
  clerkUserId: { type: String, required: true, unique: true },
  stats: { 
    type: Object, 
    default: { quizzesTaken: 0, avgScore: 0, streak: 1, totalQuestions: 0, totalCorrect: 0, lastActiveDate: "" } 
  },
  topicStats: { type: Object, default: {} }
});

const UserStats = mongoose.model('UserStats', userStatsSchema);

// --- ROUTES ---

// 1. Connection Test Route (Visit https://eduprep-ms15.onrender.com/api/test to check)
app.get('/api/test', (req, res) => {
  res.json({ message: "Backend is alive and reaching /api route!" });
});

// 2. Fetch User Stats
app.get('/api/user-stats/:clerkUserId', async (req, res) => {
  try {
    const { clerkUserId } = req.params;
    const userData = await UserStats.findOne({ clerkUserId });
    if (userData) {
      res.json(userData);
    } else {
      res.status(404).json({ message: "No cloud data found for this user." });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// 3. Save Score to MongoDB
app.post('/api/save-score', async (req, res) => {
  try {
    const { clerkUserId, stats, topicStats } = req.body;
    if (!clerkUserId) return res.status(400).json({ error: "Missing User ID" });

    const updatedUser = await UserStats.findOneAndUpdate(
      { clerkUserId: clerkUserId },
      { stats, topicStats },
      { new: true, upsert: true }
    );
    res.json({ message: "✅ Score saved to MongoDB!", user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Failed to save score" });
  }
});

// 4. Generate AI Quiz (Gemini API)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/generate', async (req, res) => {
  try {
    const { notes, stream, subject, topic, difficulty, count } = req.body;

    if (!notes) return res.status(400).json({ error: "No notes provided" });

    // FIXED MODEL NAME: gemini-1.5-flash is the stable production name
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Act as an expert engineering professor. Generate EXACTLY ${count || 10} MCQs based on these notes:
    Stream: ${stream}, Subject: ${subject}, Topic: ${topic}, Difficulty: ${difficulty}.
    
    Return STRICTLY a JSON array of objects. No markdown. No "json" labels. 
    Format: [{"question": "", "options": ["", "", "", ""], "answer": "", "explanation": "", "type": "", "difficulty": ""}]
    
    Notes: ${notes}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Clean potential markdown from AI response
    let cleanedText = responseText.replace(/```json/gi, "").replace(/```/gi, "").trim();
    const quizData = JSON.parse(cleanedText);

    res.json(quizData);
  } catch (error) {
    console.error("AI Generation Error:", error);
    res.status(500).json({ error: "AI failed to generate quiz." });
  }
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 EduPrep Backend live on port ${PORT}`);
});