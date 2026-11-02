// Vercel serverless function: POST /api/early-access
// Validates -> de-duplicates -> stores (Upstash Redis) -> emails the owner (Resend).
// All secrets come from environment variables. Nothing sensitive reaches the browser.

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean = (v, max) => String(v ?? '').trim().slice(0, max);

async function redis(cmd) {
  const r = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('storage_failed');
  return (await r.json()).result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { OWNER_NOTIFICATION_EMAIL, RESEND_API_KEY, FROM_EMAIL,
          UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;
  if (!OWNER_NOTIFICATION_EMAIL || !RESEND_API_KEY || !FROM_EMAIL || !UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    console.error('Early-access backend is not configured. See README.md.');
    return res.status(503).json({ error: 'The sign-up service is not set up yet.' });
  }

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (b.website) return res.status(200).json({ ok: true }); // honeypot: silently drop bots

  const app = {
    name: clean(b.name, 120), email: clean(b.email, 200).toLowerCase(),
    company: clean(b.company, 160), role: clean(b.role, 120), message: clean(b.message, 2000),
    submittedAt: new Date().toISOString(),
  };
  if (!app.name) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(app.email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  try {
    // Duplicate guard: SET NX succeeds only the first time this email is seen.
    const isNew = await redis(['SET', `proofsold:email:${app.email}`, '1', 'NX']);
    if (isNew === null) return res.status(200).json({ ok: true, duplicate: true });

    // Store first, so the application is never lost even if email fails.
    await redis(['LPUSH', 'proofsold:applications', JSON.stringify(app)]);

    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL, to: [OWNER_NOTIFICATION_EMAIL], reply_to: app.email,
        subject: `New ProofSold early-access request: ${app.name}`,
        html: `<h2>New early-access request</h2>
          <p><b>Name:</b> ${esc(app.name)}<br><b>Email:</b> ${esc(app.email)}<br>
          <b>Company:</b> ${esc(app.company) || '-'}<br><b>Role:</b> ${esc(app.role) || '-'}</p>
          <p><b>How delivery failures affect them:</b><br>${esc(app.message).replace(/\n/g, '<br>') || '-'}</p>
          <p style="color:#777">${app.submittedAt}</p>`,
      }),
    });
    if (!mail.ok) console.error('Resend error', mail.status, await mail.text()); // stored already; don't fail the visitor
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'We could not save your request.' });
  }
}
