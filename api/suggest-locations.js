const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userInput, userLocation } = req.body || {};
    if (!userInput) return res.status(400).json({ error: "Missing userInput" });

    const prompt = `Suggest up to 3 real-world locations relevant to this task: "${userInput}".
User is near: ${userLocation || "unknown"}.
Return JSON only with structure:
{
  "locations": [
    { "name":"Place", "lat":12.34, "lng":56.78, "description":"short text" }
  ]
}`;

    const result = await callGemini("gemini-pro", prompt);
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch {
      parsed = { locations: [] };
    }

    return res.json({ success: true, data: parsed.locations || [] });
  } catch (e) {
    console.error("suggest-locations error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
};
