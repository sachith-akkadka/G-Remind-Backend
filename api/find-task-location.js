const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userInput, userLocation } = req.body || {};
    if (!userInput) return res.status(400).json({ error: "Missing userInput" });

    const prompt = `Find the single most relevant real-world location for this task: "${userInput}".
User is near: ${userLocation || "unknown"}.
Return JSON only: { "name": "...", "lat": 12.34, "lng": 56.78, "description": "short" }`;

    const result = await callGemini("gemini-pro", prompt);
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch {
      parsed = null;
    }

    return res.json({ success: true, data: parsed });
  } catch (e) {
    console.error("find-task-location error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
};
