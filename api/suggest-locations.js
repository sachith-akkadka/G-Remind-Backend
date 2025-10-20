// ✅ Import Gemini helper
const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // Allow only POST
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

try {
const { userInput, userLocation } = req.body || {};
    if (!userInput) return res.status(400).json({ error: "Missing userInput" });
    if (!userInput)
      return res.status(400).json({ error: "Missing userInput" });

    const prompt = `Suggest up to 3 real-world locations relevant to this task: "${userInput}".
User is near: ${userLocation || "unknown"}.
Return JSON only with structure:
    // 🔥 Prompt (optimized for consistent JSON output)
    const prompt = `
You are a smart assistant that suggests **real-world locations** related to a task.

Task: "${userInput}"
User is near: ${userLocation || "unknown"}

Return ONLY valid JSON in this format:
{
 "locations": [
    { "name":"Place", "lat":12.34, "lng":56.78, "description":"short text" }
  ]
}`;

    const result = await callGemini("gemini-1.5-flash", prompt);
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch {
      parsed = { locations: [] };
    {
      "name": "Place name",
      "lat": 12.3456,
      "lng": 76.5432,
      "city": "City name",
      "description": "short reason why relevant",
      "eta": "10 mins by car"
   }
  ]
}

Rules:
- Return 3 items maximum.
- If userLocation is provided, return ONLY places within ${radiusKm} km of that lat,lng.
- If none are relevant within ${radiusKm} km, return { "locations": [] } for this attempt (do NOT invent places).
- Do NOT make up lat/lng values. If you are unsure of accurate coordinates, return an empty list.
- Always include the city field when available.
- Never include markdown, explanation text, or any output other than the JSON structure above.
`;

    // ✅ Gemini 2.0 Flash call
    const result = await callGemini("gemini-2.0-flash", prompt, { json: true });

    return res.json({ success: true, data: parsed.locations || [] });
    return res.json({
      success: true,
      data: result?.locations || [],
    });
} catch (e) {
console.error("suggest-locations error:", e);
    return res.status(500).json({ error: e.message || String(e) });
    return res.status(500).json({
      error: e.message || String(e),
    });
}
};
