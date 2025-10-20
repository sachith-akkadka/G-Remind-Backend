// ✅ Import Gemini helper
const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  // ✅ Restrict to POST requests only
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    // ✅ Read input safely
    const { userInput, userLocation } = req.body || {};
    if (!userInput)
      return res.status(400).json({ error: "Missing userInput" });

    // ✅ Stronger prompt for consistent JSON output
    const prompt = `
You are a helpful AI that finds the *most relevant real-world location* for a given task.

Task: "${userInput}"
User is near: ${userLocation || "unknown"}

Rules:
- Always respond with **pure JSON only**, no text before or after.
- JSON structure:
{
  "name": "Place name",
  "lat": 12.34,
  "lng": 56.78,
  "description": "short 1-line about why relevant"
}
`;

    // ✅ Call Gemini with JSON extraction mode enabled
    const result = await callGemini("gemini-2.0-flash", prompt, { json: true });

    // ✅ Return parsed data (result will already be JSON if extraction worked)
    return res.json({ success: true, data: result });
  } catch (e) {
    console.error("find-task-location error:", e);
    return res
      .status(500)
      .json({ error: e.message || String(e) });
  }
};
