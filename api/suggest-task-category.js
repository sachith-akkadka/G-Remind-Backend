// ✅ Import Gemini helper
const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  // Allow only POST
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { taskTitle } = req.body || {};
    if (!taskTitle)
      return res.status(400).json({ error: "Missing taskTitle" });

    // 🔥 Clean prompt for single-category output
    const prompt = `
You are a task categorizer.
Categorize this task: "${taskTitle}"
Choose **only one** of the following categories:
Work, Personal, Shopping, Errands, Health, or Other.

Return JSON only:
{ "category": "Work" }
`;

    const result = await callGemini("gemini-2.0-flash", prompt, { json: true });

    return res.json({
      success: true,
      data: result || { category: "Other" },
    });
  } catch (e) {
    console.error("suggest-task-category error:", e);
    return res.status(500).json({
      error: e.message || String(e),
    });
  }
};
