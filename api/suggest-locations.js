// api/suggest-locations.js

// ✅ Pull the Maps key we added earlier
const { GOOGLE_MAPS_KEY } = require("./_gemini_utils");

// --- Helpers ---
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

function parseCityFromAddress(addr) {
  if (!addr || typeof addr !== "string") return "";
  // Heuristic: take the second-to-last chunk as city (good enough without Place Details)
  const parts = addr.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || "";
}

function buildDescription(place, query) {
  const t = Array.isArray(place.types) && place.types.length
    ? place.types[0].replace(/_/g, " ")
    : null;
  const near = place.vicinity || place.formatted_address || "";
  return [t ? t : `match for "${query}"`, near].filter(Boolean).join(" • ");
}

module.exports = async (req, res) => {
  // Allow only POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!GOOGLE_MAPS_KEY) {
    return res.status(500).json({ error: "GOOGLE_MAPS_API_KEY missing on server" });
  }

  try {
    const { userInput, userLocation } = req.body || {};
    if (!userInput || !String(userInput).trim()) {
      return res.status(400).json({ error: "Missing userInput" });
    }

    // We MUST have a location for the 0–20 km constraint + sorting
    const origin = parseUserLocation(userLocation);
    if (!origin) {
      return res.status(400).json({ error: "Missing or invalid userLocation (lat,lng required)" });
    }

    const query = String(userInput).trim();

    // 🔎 Places Text Search within 20km of user
    const tsParams = new URLSearchParams({
      query,
      location: `${origin.lat},${origin.lng}`,
      radius: "20000", // 20 km hard limit
      key: GOOGLE_MAPS_KEY,
    });
    const tsUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?${tsParams.toString()}`;
    const ts = await fetchJSON(tsUrl);

    // If Text Search fails, return empty list (per your rule)
    if (ts.status !== "OK" || !Array.isArray(ts.results) || ts.results.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Keep top 20 candidates before distance check (API/latlng quality)
    const candidates = ts.results.slice(0, 20).map(p => {
      const lat = p.geometry?.location?.lat;
      const lng = p.geometry?.location?.lng;
      return lat != null && lng != null
        ? { raw: p, lat, lng }
        : null;
    }).filter(Boolean);

    if (candidates.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // 🧮 Batch distance + ETA with Distance Matrix (driving)
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
    if (!Array.isArray(elems)) {
      return res.json({ success: true, data: [] });
    }

    // Merge DM distances back into candidates
    const merged = candidates.map((c, i) => {
      const el = elems[i];
      const ok = el && el.status === "OK";
      return {
        place: c.raw,
        lat: c.lat,
        lng: c.lng,
        distanceMeters: ok ? el.distance?.value ?? Infinity : Infinity,
        distanceText: ok ? el.distance?.text ?? null : null,
        etaText: ok ? el.duration?.text ?? null : null,
      };
    });

    // Filter to ≤ 20 km
    const within20k = merged.filter(m => Number.isFinite(m.distanceMeters) && m.distanceMeters <= 20000);

    if (within20k.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Sort by distance (nearest first) and take up to 10
    within20k.sort((a, b) => a.distanceMeters - b.distanceMeters);
    const top = within20k.slice(0, 10);

    // Map to your required JSON shape
    const locations = top.map(m => {
      const address = m.place.formatted_address || m.place.vicinity || "";
      return {
        name: m.place.name,
        lat: Number(m.lat.toFixed(6)), // WGS84, 6 decimals
        lng: Number(m.lng.toFixed(6)),
        city: parseCityFromAddress(address),
        address,
        description: buildDescription(m.place, query),
        eta: m.etaText || "ETA unavailable",
      };
    });

    return res.json({ success: true, data: locations });
  } catch (e) {
    console.error("suggest-locations error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
};
