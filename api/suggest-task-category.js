const { callGemini } = require("./_gemini_utils");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { taskTitle } = req.body || {};
    if (!taskTitle) return res.status(400).json({ error: "Missing taskTitle" });

    const prompt = `Categorize this task: "${taskTitle}". 
Categories: Work, Personal, Shopping, Errands, Health, Other. 
Return only the category text.`;

    const result = await callGemini("ggemini-1.5-flash", prompt);
    const category = (result || "Other").split("\n")[0].trim();

    return res.json({ success: true, data: { category } });
  } catch (e) {
    console.error("suggest-task-category error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
};
