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
You are a smart assistant that finds **real-world locations** related to a given task using authoritative map data (preferably Google Maps Places API and Directions API). Use real, verifiable place entries only — do NOT invent or approximate places or coordinates.

Task: "${userInput}"
User is near: ${userLocation || "unknown"}

Return ONLY valid JSON in this exact format (no extra keys, no markdown, no commentary):
{
 "locations": [
    {
      "name": "Place name",
      "lat": 12.345678,        // required: WGS84 decimal degrees, minimum 6 decimal places
      "lng": 76.543210,        // required: WGS84 decimal degrees, minimum 6 decimal places
      "city": "City name",
      "address": "Full street address as returned by the map provider",
      "description": "short reason why relevant",
      "eta": "10 mins by car"  // computed using actual driving time from Directions API when possible
    }
  ]
}

Mandatory rules (enforce these strictly):
- Use **real** map provider data (Google Maps Places + Directions APIs recommended). If using another provider, it must be an authoritative map/place service.
- **Coordinates (lat, lng)** must come directly from the map provider's place record (WGS84, decimal degrees) and include at least 6 decimal digits. Do not fabricate or round to low precision.
- If the place has multiple location entries, use the canonical place's coordinates returned by the provider.
- Only include places within **0–20 km** of the user's location (compute great-circle distance; use road distance only to filter if you have reliable routing data). If the user's location is unknown, return **{ "locations": [] }**.
- **Sort results by proximity ascending** (nearest first).
- Return a maximum of **10** items.
- Compute **ETA** using driving directions where possible (Directions API). If driving ETA cannot be obtained, return best estimate in minutes and indicate the mode as part of the string (e.g., "15 mins by car", "25 mins walking").
- The **address** field must be the full formatted address returned by the map provider (not a short label).
- If no results meet the criteria, return exactly: **{ "locations": [] }**.
- Do not include any keys other than the ones shown above. Do not include URLs, API keys, or raw provider responses in the output.
- Validate output JSON strictly before returning it: all numeric fields must be numbers, strings must be strings, and arrays/objects must be properly typed.

Implementation notes for your system (not part of the JSON output):
- Prefer using Google Maps Places API (Place Search / Nearby Search / Text Search) to find candidates and use the Place Details response for exact "lat"/"lng" and "formatted_address".
- Use the Directions API (origin = user location, destination = place) to compute driving ETA; fall back to estimated driving time based on distance and local speed assumptions only if Directions data is unavailable.
- Use the provider's measured coordinates; never substitute with geocoding approximations you generate yourself.
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
