const crypto = require('crypto');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.ORDERS_REPO || 'jerrylearnscoding/news-radar-data';
const ORDERS_FILE = 'orders.json';

async function getOrders() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${ORDERS_FILE}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'clawberg' }
    });
    if (res.status === 404) return { data: [], sha: null };
    const d = await res.json();
    return { data: JSON.parse(Buffer.from(d.content, 'base64').toString()), sha: d.sha };
  } catch { return { data: [], sha: null }; }
}

async function saveOrders(data, sha) {
  const body = { message: 'add order', content: Buffer.from(JSON.stringify(data)).toString('base64') };
  if (sha) body.sha = sha;
  await fetch(`https://api.github.com/repos/${REPO}/contents/${ORDERS_FILE}`, {
    method: 'PUT',
    headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'clawberg' },
    body: JSON.stringify(body)
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { data } = await getOrders();
    return res.status(200).json(data.map(({ apiKey, apiSecret, ...rest }) => rest));
  }
  if (req.method !== 'POST') return res.status(405).end();

  const { apiKey, apiSecret, symbol, side, quoteQty, newsId, newsTitle, testnet } = req.body || {};
  if (!apiKey || !apiSecret || !symbol || !side || !quoteQty) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const base = testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
  const params = { symbol: symbol.replace('/', ''), side: side.toUpperCase(), type: 'MARKET', quoteOrderQty: quoteQty, timestamp: Date.now(), recvWindow: 5000 };
  const query = new URLSearchParams(params).toString();
  params.signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');

  let orderResult;
  try {
    const r = await fetch(`${base}/api/v3/order?${new URLSearchParams(params).toString()}`, {
      method: 'POST', headers: { 'X-MBX-APIKEY': apiKey }
    });
    orderResult = { ok: r.ok, data: await r.json() };
  } catch (e) { return res.status(500).json({ error: e.message }); }

  const record = {
    id: Date.now().toString(36), timestamp: Date.now(),
    newsId, newsTitle, symbol, side, quoteQty, testnet: !!testnet,
    status: orderResult.ok ? 'filled' : 'failed',
    binanceOrderId: orderResult.data?.orderId || null,
    executedQty: orderResult.data?.executedQty || null,
    error: orderResult.ok ? null : (orderResult.data?.msg || 'Unknown')
  };

  const { data, sha } = await getOrders();
  data.unshift(record);
  if (data.length > 500) data.splice(500);
  await saveOrders(data, sha);
  res.status(orderResult.ok ? 200 : 400).json({ ok: orderResult.ok, order: record });
};
