// api/suggest-locations.js

const { GOOGLE_MAPS_KEY } = require("./_gemini_utils");

// ---------- helpers ----------
async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${text || r.statusText}`);
  }
  return r.json();
}

function parseUserLocation(userLocation) {
  if (!userLocation) return null;
  if (typeof userLocation === "string") {
    const [latStr, lngStr] = userLocation.split(",").map(s => s.trim());
    const lat = Number(latStr), lng = Number(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  }
  if (typeof userLocation === "object" && userLocation !== null) {
    const { lat, lng } = userLocation;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

// Strip filler like "go to", "find a", "near me", etc. Keep it generic.
function extractKeyword(q) {
  const cleaned = String(q || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const stopPhrases = [
    "go to", "find me", "find a", "find", "search", "look for",
    "near me", "nearby", "closest", "nearest", "around me", "around"
  ];
  let s = cleaned;
  for (const p of stopPhrases) {
    if (s.startsWith(p + " ")) {
      s = s.slice(p.length).trim();
      break;
    }
  }
  return s || cleaned;
}

function parseCityFromAddress(addr) {
  if (!addr || typeof addr !== "string") return "";
  const parts = addr.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || "";
}

// ---------- route ----------
module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  if (!GOOGLE_MAPS_KEY)
    return res.status(500).json({ error: "GOOGLE_MAPS_API_KEY missing on server" });

  try {
    const { userInput, userLocation } = req.body || {};
    if (!userInput || !String(userInput).trim())
      return res.status(400).json({ error: "Missing userInput" });

    const origin = parseUserLocation(userLocation);
    if (!origin)
      return res.status(400).json({ error: "Missing or invalid userLocation (lat,lng required)" });

    const keyword = extractKeyword(userInput);
    if (!keyword)
      return res.json({ success: true, data: [] });

    // 1️⃣ Try Nearby Search (rank by distance)
    const nsParams = new URLSearchParams({
      location: `${origin.lat},${origin.lng}`,
      rankby: "distance",
      keyword,
      key: GOOGLE_MAPS_KEY,
    });
    const nsUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${nsParams.toString()}`;
    let searchResults = await fetchJSON(nsUrl);

    // 🔍 Debug log for Nearby Search
    console.log("NearbySearch:", {
      status: searchResults.status,
      error_message: searchResults.error_message,
      results_length: searchResults.results?.length || 0
    });

    // 2️⃣ Fallback to Text Search if no results
    if (searchResults.status !== "OK" || !Array.isArray(searchResults.results) || searchResults.results.length === 0) {
      const tsParams = new URLSearchParams({
        query: keyword,
        location: `${origin.lat},${origin.lng}`,
        radius: "20000",
        key: GOOGLE_MAPS_KEY,
      });
      const tsUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?${tsParams.toString()}`;
      searchResults = await fetchJSON(tsUrl);

      // 🔍 Debug log for Text Search
      console.log("TextSearch:", {
        status: searchResults.status,
        error_message: searchResults.error_message,
        results_length: searchResults.results?.length || 0
      });

      if (searchResults.status !== "OK" || !Array.isArray(searchResults.results) || searchResults.results.length === 0) {
        return res.json({
          success: true,
          data: [],
          meta: {
            source: "textsearch",
            status: searchResults.status,
            msg: searchResults.error_message || null
          }
        });
      }
    }

    // ✅ Take up to 20 candidates
    const candidates = searchResults.results.slice(0, 20).map(p => {
      const lat = p.geometry?.location?.lat;
      const lng = p.geometry?.location?.lng;
      return lat != null && lng != null ? { raw: p, lat, lng } : null;
    }).filter(Boolean);

    if (candidates.length === 0)
      return res.json({ success: true, data: [] });

    // 3️⃣ Just return these (skip DM for now to isolate problem)
    const locations = candidates.map(c => {
      const address = c.raw.formatted_address || c.raw.vicinity || "";
      return {
        name: c.raw.name,
        lat: Number(c.lat.toFixed(6)),
        lng: Number(c.lng.toFixed(6)),
        address,
        city: parseCityFromAddress(address),
        description: address ? `near ${parseCityFromAddress(address)}` : "near you",
      };
    });

    return res.json({ success: true, data: locations });
  } catch (e) {
    console.error("suggest-locations error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
};
