// api/find-task-location.js

// ✅ Pull the Maps key exported from _gemini_utils
const { GOOGLE_MAPS_KEY } = require("./_gemini_utils");

// Small helper: fetch JSON with proper errors
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

function buildDescription(place) {
  const pieces = [];
  if (place.types && place.types.length) {
    const t = place.types[0].replace(/_/g, " ");
    pieces.push(t);
  }
  if (place.vicinity) pieces.push(place.vicinity);
  else if (place.formatted_address) pieces.push(place.formatted_address);
  return pieces.length ? pieces.join(" • ") : "Top match based on rating and proximity";
}

async function getETA(origin, dest) {
  if (!origin) return null;
  const params = new URLSearchParams({
    origins: `${origin.lat},${origin.lng}`,
    destinations: `${dest.lat},${dest.lng}`,
    mode: "driving",
    key: GOOGLE_MAPS_KEY,
  });
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`;
  const data = await fetchJSON(url);
  const row = data.rows?.[0]?.elements?.[0];
  if (row && row.status === "OK") return row.duration?.text || null;
  return null;
}

module.exports = async (req, res) => {
  // ✅ Restrict to POST requests only
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  if (!GOOGLE_MAPS_KEY) {
    return res.status(500).json({ error: "GOOGLE_MAPS_API_KEY missing on server" });
  }

  try {
    // ✅ Read input safely
    const { userInput, userLocation, radiusMeters } = req.body || {};
    if (!userInput || typeof userInput !== "string" || !userInput.trim()) {
      return res.status(400).json({ error: "Missing userInput" });
    }
    const query = userInput.trim();

    // Parse/validate location if provided
    const origin = parseUserLocation(userLocation);

    // ✅ Use Places Text Search; bias by user location if available
    // Radius: sensible default 15km near user; global search if no location
    const params = new URLSearchParams({
      query,
      key: GOOGLE_MAPS_KEY,
    });
    if (origin) {
      params.set("location", `${origin.lat},${origin.lng}`);
      params.set("radius", String(
        Number.isFinite(radiusMeters) && radiusMeters > 0 ? Math.min(radiusMeters, 50000) : 15000
      ));
    }

    const placesURL = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
    const places = await fetchJSON(placesURL);

    if (places.status !== "OK" || !Array.isArray(places.results) || places.results.length === 0) {
      // Try a fallback using Find Place if Text Search is empty
      const fpURL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json?" +
        new URLSearchParams({
          input: query,
          inputtype: "textquery",
          fields: "name,geometry,formatted_address,types,place_id",
          key: GOOGLE_MAPS_KEY,
        }).toString();
      const fp = await fetchJSON(fpURL);
      if (fp.status !== "OK" || !fp.candidates?.length) {
        return res.status(404).json({ error: "No matching locations found" });
      }
      const c = fp.candidates[0];
      const lat = c.geometry?.location?.lat;
      const lng = c.geometry?.location?.lng;
      const eta = origin && Number.isFinite(lat) && Number.isFinite(lng)
        ? await getETA(origin, { lat, lng })
        : null;

      return res.json({
        success: true,
        data: {
          name: c.name,
          lat,
          lng,
          description: buildDescription(c),
          eta: eta || "ETA unavailable",
        },
      });
    }

    // ✅ Rank results: combine rating, ratings volume, and proximity if origin present
    const scored = places.results.map(p => {
      const rating = Number(p.rating) || 0;
      const count = Number(p.user_ratings_total) || 0;

      // Score by quality signal
      let score = rating * (1 + Math.log10(1 + count));

      // Slight boost if it's open now
      if (p.opening_hours?.open_now) score += 0.25;

      // Proximity boost if origin exists
      if (origin && p.geometry?.location) {
        const dLat = (p.geometry.location.lat - origin.lat);
        const dLng = (p.geometry.location.lng - origin.lng);
        // rough meters (not exact, good enough for ranking)
        const approxMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111_000;
        const proximityBoost = Math.max(0, 1.5 - (approxMeters / 15_000)); // up to +1.5 within ~15km
        score += proximityBoost;
      }

      return { place: p, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0].place;

    const dest = {
      lat: best.geometry?.location?.lat,
      lng: best.geometry?.location?.lng,
    };

    const eta = (origin && Number.isFinite(dest.lat) && Number.isFinite(dest.lng))
      ? await getETA(origin, dest)
      : null;

    return res.json({
      success: true,
      data: {
        name: best.name,
        lat: dest.lat,
        lng: dest.lng,
        description: buildDescription(best),
        eta: eta || "ETA unavailable",
      },
    });
  } catch (e) {
    console.error("find-task-location error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
};
