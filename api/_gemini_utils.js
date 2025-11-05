// api/_gemini_utils.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ✅ Load Gemini API key
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.warn("⚠️ GEMINI_API_KEY not set in env");
}
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

// ✅ Load Google Maps API key (added)
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!GOOGLE_MAPS_KEY) {
  console.warn("⚠️ GOOGLE_MAPS_API_KEY not set in env");
}

// Safe wrapper with better JSON extraction
async function callGemini(modelName, prompt, { json = false } = {}) {
  const model = genAI.getGenerativeModel({ model: modelName });

  const resp = await model.generateContent(prompt);
  const text = resp.response.text();

  if (json) {
    // Try to safely extract any JSON-like content
    try {
      const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.warn("⚠️ JSON parse failed:", err, "\nResponse was:", text);
    }
  }

  return text.trim();
}

// ✅ Export Google Maps key as well (optional)
module.exports = { callGemini, GOOGLE_MAPS_KEY };
