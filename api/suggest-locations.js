// ✅ Import Gemini helper
const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  // Allow only POST
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userInput, userLocation } = req.body || {};
    if (!userInput)
      return res.status(400).json({ error: "Missing userInput" });

    // 🔥 Prompt (optimized for consistent JSON output)
    const prompt = `
You are a smart assistant that suggests **real-world locations** related to a task.

Task: "${userInput}"
User is near (lat,lng): ${userLocation || "unknown"}

Return ONLY JSON:
{
  "locations": [
    {
      "name": "Place name",
      "lat": 12.3456,
      "lng": 76.5432,
      "city": "Mysore",
      "description": "short reason why relevant",
      "eta": "10 mins by car"
    }
  ]
}

Rules:
- If `userLocation` is "unknown", return up to 3 general results clearly labeled with city.
- If `userLocation` is provided, **return only places within 20 km of that lat,lng**.
- If no relevant places within radius, return { "locations": [] }.
- Do not invent lat/lng — if unsure, return empty list.
- Do not include markdown or extra text.

`;

    // ✅ Gemini 2.0 Flash call
    const result = await callGemini("gemini-2.0-flash", prompt, { json: true });

    return res.json({
      success: true,
      data: result?.locations || [],
    });
  } catch (e) {
    console.error("suggest-locations error:", e);
    return res.status(500).json({
      error: e.message || String(e),
    });
  }
};
