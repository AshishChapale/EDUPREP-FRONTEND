import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import mongoose from 'mongoose';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

// --- CONNECT TO MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas!'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));
  // ==========================================
// --- MONGODB SCHEMA (The Blueprint) ---
// ==========================================
const userStatsSchema = new mongoose.Schema({
  clerkUserId: { type: String, required: true, unique: true },
  stats: { 
    type: Object, 
    default: { quizzesTaken: 0, avgScore: 0, streak: 1, totalQuestions: 0, totalCorrect: 0 } 
  },
  topicStats: { type: Object, default: {} }
});

// ==========================================

// ==========================================

// Create the model
const UserStats = mongoose.model('UserStats', userStatsSchema);

// ==========================================
// --- NEW ROUTE: SAVE SCORE TO DATABASE ---
// ==========================================
app.post('/api/save-score', async (req, res) => {
  try {
    const { clerkUserId, stats, topicStats } = req.body;

    if (!clerkUserId) {
      return res.status(400).json({ error: "Missing User ID" });
    }

    // "findOneAndUpdate" with "upsert: true" is magic: 
    // It finds the user and updates them. If they don't exist yet, it creates them!
    const updatedUser = await UserStats.findOneAndUpdate(
      { clerkUserId: clerkUserId },
      { stats: stats, topicStats: topicStats },
      { new: true, upsert: true }
    );

    res.json({ message: "✅ Score saved securely to MongoDB!", user: updatedUser });
  } catch (error) {
    console.error("Database Save Error:", error);
    res.status(500).json({ error: "Failed to save score" });
  }
});
// --- NEW ROUTE: FETCH USER STATS ---
// ==========================================
app.get('/api/user-stats/:clerkUserId', async (req, res) => {
  try {
    const { clerkUserId } = req.params;
    
    // Search the vault for this specific user
    const userData = await UserStats.findOne({ clerkUserId: clerkUserId });

    if (userData) {
      res.json(userData); // Send the stats back to React!
    } else {
      res.status(404).json({ message: "No cloud data found yet for this user." });
    }
  } catch (error) {
    console.error("Database Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});
// ==========================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/generate', async (req, res) => {
  try {
    const { notes, stream, subject, topic, difficulty, count } = req.body;

    if (!notes) {
      return res.status(400).json({ error: "Please provide context notes." });
    }

    console.log(`Generating ${count} advanced questions for ${subject}...`);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Act as an expert engineering professor. Based on the provided notes, generate EXACTLY ${count || 10} multiple-choice questions. 

    CONSTRAINTS:
    - Target Stream: ${stream || 'Engineering'}
    - Subject: ${subject || 'General'}
    - Topic: ${topic || 'General concepts from the notes'}
    - Difficulty Level: ${difficulty || 'Medium'}. 

    You MUST return the response strictly as a JSON array of objects. Do not include any markdown formatting, do not include the word "json", and do not include any introductory text. 

    The JSON format must strictly follow this advanced structure:
    [
      {
        "question": "Question text here",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "answer": "The exact text of the correct option",
        "explanation": "A concise 1-2 sentence explanation of WHY this is the correct answer and why others are wrong.",
        "type": "Categorize as one of: Conceptual, Application, or Numerical",
        "difficulty": "Categorize as: Easy, Medium, or Hard"
      }
    ]

    Notes to process:
    ${notes}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    let cleanedText = responseText.replace(/```json/gi, "").replace(/```/gi, "").trim();
    const quizData = JSON.parse(cleanedText);

    res.json(quizData);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: "Failed to generate content." });
  }
});

// This is the crucial part that keeps the server awake!
app.listen(PORT, () => {
  console.log(`EduPrep Advanced Backend running securely on http://localhost:${PORT}`);
});