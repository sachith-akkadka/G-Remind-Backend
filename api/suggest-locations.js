// ✅ Import Gemini helper
const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userInput, userLocation } = req.body || {};
    if (!userInput) return res.status(400).json({ error: "Missing userInput" });

    const makePrompt = (radiusKm, userLocStr) => {
      const nearLine = userLocStr ? `User is near (lat,lng): ${userLocStr}` : "User location not provided";
      return `
You are a smart assistant that suggests real-world locations related to a task.

Task: "${userInput}"
${nearLine}
Search radius: ${radiusKm} km

Return ONLY valid JSON in this exact format:
{
  "locations": [
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
    };

    // Logging to help debug
    console.log("[suggest-locations] request", { userInput, userLocation });

    // If coords provided, try expanding radius: 20, 30, 40, ... up to maxRadiusKm
    if (userLocation) {
      const start = 20;
      const step = 10;
      const maxRadiusKm = 100; // adjust as needed
      for (let radius = start; radius <= maxRadiusKm; radius += step) {
        const prompt = makePrompt(radius, userLocation);
        console.log(`[suggest-locations] calling model radius=${radius}km`);

        let result;
        try {
          result = await callGemini("gemini-2.0-flash", prompt, { json: true });
        } catch (err) {
          console.error("[suggest-locations] callGemini failed:", err);
          // try next radius — don't crash the whole loop
          continue;
        }

        // Defensive: ensure we get an array
        const locations = Array.isArray(result?.locations) ? result.locations : [];
        console.log(`[suggest-locations] model returned ${locations.length} locations for radius=${radius}`);

        if (locations.length > 0) {
          return res.json({ success: true, data: locations.slice(0, 3) });
        }
        // else continue increasing radius
      }

      // exhausted radii, return empty
      console.log("[suggest-locations] exhausted radii, returning empty list");
      return res.json({ success: true, data: [] });
    } else {
      // No coords — single try
      const prompt = makePrompt("no coords provided", null);
      let result;
      try {
        result = await callGemini("gemini-2.0-flash", prompt, { json: true });
      } catch (err) {
        console.error("[suggest-locations] callGemini failed (no coords):", err);
        return res.status(500).json({ error: "LLM call failed" });
      }
      const locations = Array.isArray(result?.locations) ? result.locations : [];
      return res.json({ success: true, data: locations.slice(0, 3) });
    }
  } catch (e) {
    console.error("suggest-locations error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
};
