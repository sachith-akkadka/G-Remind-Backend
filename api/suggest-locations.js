// api/suggest-locations.js

const { GOOGLE_MAPS_KEY } = require("./_gemini_utils");

// ---------- helpers ----------
async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text().catch(() => "");
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Bad JSON from ${url}: ${text?.slice(0, 200) || "no body"}`);
  }
  if (!r.ok) {
    const msg = json?.error_message || json?.status || r.statusText;
    throw new Error(`HTTP ${r.status}: ${msg}`);
  }
  return json;
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

function haversineMeters(a, b) {
  // a: {lat,lng}, b: {lat,lng}
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
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

    // 1) Nearby Search (rank by distance) with keyword only
    const nsParams = new URLSearchParams({
      location: `${origin.lat},${origin.lng}`,
      rankby: "distance",
      keyword,
      key: GOOGLE_MAPS_KEY,
    });
    const nsUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${nsParams.toString()}`;
    let searchResults = await fetchJSON(nsUrl);

    // Fallback to Text Search (20km) if Nearby returns nothing
    if (searchResults.status !== "OK" || !Array.isArray(searchResults.results) || searchResults.results.length === 0) {
      const tsParams = new URLSearchParams({
        query: keyword,
        location: `${origin.lat},${origin.lng}`,
        radius: "20000",
        key: GOOGLE_MAPS_KEY,
      });
      const tsUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?${tsParams.toString()}`;
      searchResults = await fetchJSON(tsUrl);

      if (searchResults.status !== "OK" || !Array.isArray(searchResults.results) || searchResults.results.length === 0) {
        // Surface Google status to help debugging instead of silent []
        return res.json({ success: true, data: [], meta: { source: "textsearch", status: searchResults.status, msg: searchResults.error_message || null } });
      }
    }

    // Take up to 20 candidates with coordinates
    let candidates = searchResults.results.slice(0, 20).map(p => {
      const lat = p.geometry?.location?.lat;
      const lng = p.geometry?.location?.lng;
      return lat != null && lng != null ? { raw: p, lat, lng } : null;
    }).filter(Boolean);

    if (candidates.length === 0)
      return res.json({ success: true, data: [] });

    // Pre-filter by Haversine ≤ 20km (in case DM fails later)
    candidates = candidates
      .map(c => ({ ...c, approxMeters: haversineMeters(origin, { lat: c.lat, lng: c.lng }) }))
      .filter(c => Number.isFinite(c.approxMeters) && c.approxMeters <= 20000);

    if (candidates.length === 0)
      return res.json({ success: true, data: [] });

    // 2) Try Distance Matrix for driving distance + ETA
    let merged;
    try {
      const destinations = candidates.map(c => `${c.lat},${c.lng}`).join("|");
      const dmParams = new URLSearchParams({
        origins: `${origin.lat},${origin.lng}`,
        destinations,
        mode: "driving",
        key: GOOGLE_MAPS_KEY,
      });
      const dmUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?${dmParams.toString()}`;
      const dm = await fetchJSON(dmUrl);

      const row = dm.rows?.[0];
      const elems = row?.elements;

      if (!Array.isArray(elems) || dm.status !== "OK") {
        throw new Error(dm.error_message || dm.status || "Distance Matrix unavailable");
      }

      merged = candidates.map((c, i) => {
        const el = elems[i];
        const ok = el && el.status === "OK";
        return {
          place: c.raw,
          lat: c.lat,
          lng: c.lng,
          distanceMeters: ok ? el.distance?.value ?? c.approxMeters : c.approxMeters,
          etaText: ok ? el.duration?.text ?? null : null,
        };
      });
    } catch (dmErr) {
      // 🔥 Fallback: use haversine distance only (no ETA)
      merged = candidates.map(c => ({
        place: c.raw,
        lat: c.lat,
        lng: c.lng,
        distanceMeters: c.approxMeters,
        etaText: null,
      }));
    }

    // Sort by distance and cap to 10
    merged.sort((a, b) => a.distanceMeters - b.distanceMeters);
    const top = merged.slice(0, 10);

    const locations = top.map(m => {
      const address = m.place.formatted_address || m.place.vicinity || (m.place.plus_code?.compound_code || "");
      return {
        name: m.place.name,
        lat: Number(m.lat.toFixed(6)),
        lng: Number(m.lng.toFixed(6)),
        city: parseCityFromAddress(address),
        address,
        description: address ? `near ${parseCityFromAddress(address) || "you"}` : "near you",
        eta: m.etaText || "ETA unavailable",
      };
    });

    return res.json({ success: true, data: locations });
  } catch (e) {
    console.error("suggest-locations error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
};
