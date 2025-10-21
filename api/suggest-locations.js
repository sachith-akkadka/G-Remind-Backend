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

    // ✅ Clean prompt
    const prompt = `
You are a smart assistant that finds **real-world locations** related to a given task using reliable geographic data (e.g., Google Maps).

Task: "${userInput}"
User is near: ${userLocation || "unknown"}

Return ONLY valid JSON in this format:
{
 "locations": [
    {
      "name": "Place name",
      "lat": 12.3456,
      "lng": 76.5432,
      "city": "City name",
      "address": "Address",
      "description": "short reason why relevant",
      "eta": "10 mins by car"
    }
  ]
}

Rules:
- Always use **real** and **verifiable** data sources (e.g., Google Maps or other real map listings). Do not invent places.
- Include only locations **within 0–20 km** of the user.
- Sort results by **distance from the user** — the **nearest** locations must appear **first**.
- Return **up to 10** results maximum.
- Never include markdown, commentary, or explanations — only the JSON output.
- If no suitable places are found, return: { "locations": [] }.
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
