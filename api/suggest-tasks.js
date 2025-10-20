const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userInput } = req.body || {};
    if (!userInput) return res.status(400).json({ error: "Missing userInput" });

    const prompt = `You are a helpful task assistant.
Based on this input: "${userInput}", suggest 3-5 short, clear task titles.

⚠️ Important: Return ONLY a valid JSON array of strings. 
Do not include explanations, numbering, or formatting. 
Example: ["Buy milk","Call plumber","Finish report"]`;


    const result = await callGemini("gemini-1.5-flash", prompt, { json: true });
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch {
      parsed = result
        .split("\n")
        .map((t) => t.replace(/^\d+[\).\s]*/, "").trim())
        .filter(Boolean);
    }

    return res.json({ success: true, data: parsed });
  } catch (e) {
    console.error("suggest-tasks error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
};
