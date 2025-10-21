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
You are a precise assistant that suggests real-world locations (temples) relevant to a user's task.

Task: "${userInput}"
User is near (lat,lng): ${userLocation || "unknown"}

Return ONLY valid JSON in this exact format:
{
  "locations": [
    {
      "name": "Place name",
      "lat": 12.345678,
      "lng": 76.543210,
      "city": "City name" or null,
      "address": "Full address string",
      "distance_km": 3.2,
      "eta": "5 mins by car",
      "source": "Google Maps"
    }
  ]
}

Rules (follow exactly):
1. Return up to 5 nearest temples only (prefer temples; return other types only if no temples exist within the search radii).
2. Iterative radius: first search within 5 km. If no temples, increase radius by 10 km and retry (5 → 15 → 25 → 35 …) up to a maximum of 100 km. Stop when you find >=1 temple (return up to 5) and do not continue searching further.
3. If userLocation === "unknown", return up to 3 relevant temples (include city when known).
4. Use authoritative sources for lat/lng, city, address, distance_km and eta. Prefer "Google Maps" as the source if you have an integration available. If you do NOT have access to any external mapping API, do NOT invent exact lat/lng, distance_km, or eta — return { "locations": [] } instead.
5. distance_km must be numeric (kilometers) with one decimal place. lat/lng must be decimal with up to 6 places. eta must be a short human string (e.g., "6 mins by car").
6. Always include "city" (or null if unknown). Do not invent city names.
7. No markdown, no explanations, no extra fields — return only the JSON object above.

Example output:
{
  "locations": [
    {
      "name": "Sri Lakshmi Venkateshwara Temple",
      "lat": 12.777862,
      "lng": 75.185126,
      "city": "Kinnigoli",
      "address": "Area/street, Kinnigoli, Karnataka",
      "distance_km": 2.1,
      "eta": "6 mins by car",
      "source": "Google Maps"
    }
  ]
}
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
