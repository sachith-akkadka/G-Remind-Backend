// api/_gemini_utils.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.warn("⚠️ GEMINI_API_KEY not set in env");
}
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

// safe wrapper
async function callGemini(modelName, prompt, { json = false } = {}) {
  const model = genAI.getGenerativeModel({ model: modelName });

  const resp = await model.generateContent(prompt);
  const text = resp.response.text();

  if (json) {
    try {
      const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}
  }
  return text;
}

module.exports = { callGemini };
