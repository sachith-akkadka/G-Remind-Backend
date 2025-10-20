// ✅ Import Gemini helper
const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  // Allow only POST
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userInput } = req.body || {};
    if (!userInput)
      return res.status(400).json({ error: "Missing userInput" });

    // 🔥 Tight prompt to guarantee JSON array output
    const prompt = `
You are a helpful task assistant.
Based on this input: "${userInput}", suggest 3-5 short, clear, natural-sounding task titles.

Return ONLY a JSON array of strings (no markdown, no text around it):
["Buy milk", "Call plumber", "Finish report"]
`;

    const result = await callGemini("gemini-2.0-flash", prompt, { json: true });

    return res.json({
      success: true,
      data: Array.isArray(result) ? result : [],
    });
  } catch (e) {
    console.error("suggest-tasks error:", e);
    return res.status(500).json({
      error: e.message || String(e),
    });
  }
};
