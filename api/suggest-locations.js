// serverless/suggest-locations.js
const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userInput, userLocation } = req.body || {};
    if (!userInput) {
      return res.status(400).json({ error: "Missing userInput" });
    }

    // Sanitize inputs so stray backticks or weird chars don't break the prompt
    const safeUserInput = String(userInput).replace(/`/g, "'").trim();
    const safeUserLocation = userLocation ? String(userLocation).replace(/`/g, "'").trim() : null;

    function makePrompt(radiusKm, userLocStr) {
      // Build prompt using concatenation (no backticks inside)
      let p = "";
      p += "You are a smart assistant that suggests real-world locations related to a task.\n\n";
      p += 'Task: "' + safeUserInput + '"\n';
      if (userLocStr) {
        p += "User is near (lat,lng): " + userLocStr + "\n";
      } else {
        p += "User location not provided\n";
      }
      p += "Search radius: " + radiusKm + " km\n\n";

      p += "Return ONLY valid JSON in this exact format:\n";
      p += "{\n";
      p += '  "locations": [\n';
      p += '    {\n';
      p += '      "name": "Place name",\n';
      p += "      \"lat\": 12.3456,\n";
      p += "      \"lng\": 76.5432,\n";
      p += '      "city": "City name",\n';
      p += '      "description": "short reason why relevant",\n';
      p += '      "eta": "10 mins by car"\n';
      p += "    }\n";
      p += "  ]\n";
      p += "}\n\n";

      p += "Rules:\n";
      p += "- Return 3 items maximum.\n";
      p += "- If userLocation is provided, return ONLY places within " + radiusKm + " km of that lat,lng.\n";
      p += '- If none are relevant within ' + radiusKm + ' km, return { "locations": [] } for this attempt (do NOT invent places).\n';
      p += "- Do NOT make up lat/lng values. If you are unsure of accurate coordinates, return an empty list.\n";
      p += "- Always include the city field when available.\n";
      p += "- Never include markdown, explanation text, or any output other than the JSON structure above.\n";

      return p;
    }

    console.log("[suggest-locations] request:", { userInput: safeUserInput, userLocation: safeUserLocation });

    // If we have coords, try radii 20, 30, 40, ... (20 + 10*k)
    if (safeUserLocation) {
      const start = 20;
      const step = 10;
      const maxRadiusKm = 100; // change if you want a different ceiling

      for (let radius = start; radius <= maxRadiusKm; radius += step) {
        const prompt = makePrompt(radius, safeUserLocation);
        console.log(`[suggest-locations] calling model (radius=${radius}km)`);

        let llmRaw;
        try {
          // callGemini expected to return parsed json if { json: true } supported; be defensive
          llmRaw = await callGemini("gemini-2.0-flash", prompt, { json: true });
        } catch (err) {
          console.error("[suggest-locations] callGemini threw:", err);
          // try next radius instead of crashing
          continue;
        }

        // Defensive parsing: if llmRaw is a string, try to JSON.parse it.
        let parsed = llmRaw;
        if (typeof llmRaw === "string") {
          try {
            parsed = JSON.parse(llmRaw);
          } catch (err) {
            // If raw string contains extra text, try to extract first JSON substring
            const m = llmRaw.match(/\{[\s\S]*\}/);
            if (m) {
              try {
                parsed = JSON.parse(m[0]);
              } catch (err2) {
                parsed = null;
              }
            } else {
              parsed = null;
            }
          }
        }

        const locations = Array.isArray(parsed?.locations) ? parsed.locations : [];
        console.log(`[suggest-locations] model returned ${locations.length} locations for radius=${radius}`);

        if (locations.length > 0) {
          // success: return first non-empty result
          return res.json({ success: true, data: locations.slice(0, 3) });
        }

        // else: loop and increase radius
      }

      // exhausted radii -> empty
      console.log("[suggest-locations] exhausted radii; returning empty list");
      return res.json({ success: true, data: [] });
    } else {
      // No coords provided: single attempt
      const prompt = makePrompt("no coords provided", null);
      let llmRaw;
      try {
        llmRaw = await callGemini("gemini-2.0-flash", prompt, { json: true });
      } catch (err) {
        console.error("[suggest-locations] callGemini threw (no coords):", err);
        return res.status(500).json({ error: "LLM call failed" });
      }

      let parsed = llmRaw;
      if (typeof llmRaw === "string") {
        try {
          parsed = JSON.parse(llmRaw);
        } catch (err) {
          const m = llmRaw.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              parsed = JSON.parse(m[0]);
            } catch (err2) {
              parsed = null;
            }
          } else {
            parsed = null;
          }
        }
      }

      const locations = Array.isArray(parsed?.locations) ? parsed.locations : [];
      console.log("[suggest-locations] model returned (no coords) count:", locations.length);
      return res.json({ success: true, data: locations.slice(0, 3) });
    }
  } catch (e) {
    console.error("suggest-locations error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
};
