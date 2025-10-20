// api/test-env.js
module.exports = async (req, res) => {
  return res.json({
    envDetected: process.env.GEMINI_API_KEY ? "✅ Found in server env" : "❌ Missing",
  });
};
