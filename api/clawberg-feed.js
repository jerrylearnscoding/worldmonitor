module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const r = await fetch('https://clawberg-app.vercel.app/api/feed');
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
