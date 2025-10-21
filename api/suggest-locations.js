// ✅ Import Gemini helper
const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  // Allow only POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userInput, userLocation } = req.body || {};
    if (!userInput) {
      return res.status(400).json({ error: "Missing userInput" });
    }

  const prompt = `
You are a smart assistant that suggests **real nearby places** using **Google Maps data only** (Places API + Directions API). No made-up names or coordinates.

Task: "${userInput}"
User is near: ${userLocation || "unknown"}

Return ONLY valid JSON in this format:
{
 "locations": [
    {
      "name": "Place name",
      "lat": 12.345678,
      "lng": 76.543210,
      "city": "City name",
      "address": "Full address",
      "description": "Why it's relevant",
      "eta": "10 mins by car"
    }
  ]
}

Rules:
- Use **real Google Maps results** — no fake data.
- Get exact **lat/lng** from Google Maps (WGS84, 6 decimals).
- Show only places within **0–20 km**.
- **Sort by distance (nearest first)**.
- Include **up to 10** results.
- Compute **ETA** via Google Directions API if possible.
- If nothing found, return { "locations": [] }.
- Output must be **pure JSON**, no markdown or text.
`;
    // ✅ Call Gemini and ensure JSON mode
    const result = await callGemini("gemini-2.0-flash", prompt, { json: true });

    // Ensure we return consistent data
    const locations = Array.isArray(result?.locations)
      ? result.locations
      : Array.isArray(result?.data)
      ? result.data
      : [];

    return res.json({ success: true, data: locations });
  } catch (e) {
    console.error("suggest-locations error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
};
