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
You are a smart assistant that suggests **real-world locations** related to a task.

Task: "${userInput}"
User is near: ${userLocation || "unknown"}

You are a precise location assistant that suggests real-world places (temples) relevant to a user's task.

Task: "${userInput}"
User is near (lat,lng): ${userLocation || "unknown"}   // if unknown, use the literal string "unknown"

Objective:
Return up to 4 nearby temples that are most relevant to the task and as close as possible to the user's coordinates.

Behavior rules (must follow exactly):
1. Always return ONLY valid JSON (no markdown, no explanatory text). The JSON must match the exact structure below.
2. Prioritize *temples* (religious places). Only return other place types if there are no temples within the search radius.
3. Use authoritative sources for coordinates, address, and ETA. Prefer Google Maps / Google Places + Directions for lat/lng, city, address, distance (km) and ETA (by car and walking) when you have a tool/integration to query them.
   - If you have direct access to Google Maps or another mapping API as a tool, use it to obtain precise lat/lng, city, address, distance_km and ETA.
   - If you do NOT have access to any external mapping API, then only invent exact lat/lng or ETA.
4. Iterative radius rule:
   - First search within 5 km.
   - If no relevant temples are found within 5 km, increase radius by 10 km and retry (5 → 15 → 25 → 35 …) until you find results or reach 100 km maximum.
   - Stop and return as soon as you have at least one relevant temple (up to 5); do not keep searching further once you have results.
5. Sorting and formatting:
   - Sort returned locations by ascending distance_km (nearest first).
   - Latitude and longitude must be decimal numbers with up to 6 decimal places.
   - distance_km must be a number (kilometers) with one decimal place.
   - eta must be a short string like "3 mins by car" or "12 mins walking".
6. Required fields for every location: name, lat, lng, city, address, distance_km, eta, source.
   - source must indicate the authoritative source used (e.g., "Google Maps", "OpenStreetMap", "YourPlacesDB").
7. If a location's city cannot be determined, set "city": null (do not invent).
8. If no relevant temples are found across all radii, return { "locations": [] }.

Exact JSON schema to return:
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

Example (valid) output when matches are found:
{
  "locations": [
    {
      "name": "Sri Lakshmi Venkateshwara Temple",
      "lat": 12.777862,
      "lng": 75.185126,
      "city": "Kinnigoli",
      "address": "Street / area / locality, Kinnigoli, Karnataka",
      "distance_km": 2.1,
      "eta": "6 mins by car",
      "source": "Google Maps"
    },
    ...
  ]
}

Example (no results):
{ "locations": [] }

Important: do not include any other keys or wrapper objects. Return only the JSON above and nothing else.
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
