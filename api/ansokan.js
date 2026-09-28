// Jobbansökningar från jobb.html -> mejl med CV som bilaga via Resend.
// CV skickas som base64 i JSON. Vercel tar max 4,5 MB request body, därför
// är taket 3 MB fil (base64 växer ~33%). Samma tak står i formuläret.

const TO = process.env.FORM_TO || 'nathalie@thw.se';
const FROM = process.env.FORM_FROM || 'Thai House Wok <noreply@synsnumedia.com>';
const MAX_BYTES = 3 * 1024 * 1024;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const {
    namn = '', telefon = '', email = '', kategori = '', restaurang = '',
    meddelande = '', gdpr = false, cv = null, botcheck = ''
  } = body;

  if (botcheck) return res.status(200).json({ ok: true });

  if (!String(namn).trim() || !String(meddelande).trim() || !String(telefon).trim()) {
    return res.status(400).json({ error: 'Namn, telefon och meddelande krävs' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim())) {
    return res.status(400).json({ error: 'Ogiltig e-postadress' });
  }
  if (!gdpr) {
    return res.status(400).json({ error: 'Samtycke krävs' });
  }

  const attachments = [];
  if (cv && cv.content) {
    const bytes = Math.floor(String(cv.content).length * 3 / 4);
    if (bytes > MAX_BYTES) {
      return res.status(400).json({ error: 'CV:t är för stort (max 3 MB)' });
    }
    attachments.push({
      filename: String(cv.filename || 'cv').replace(/[^\w.\- ]+/g, '_').slice(0, 120),
      content: String(cv.content)
    });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ error: 'E-post är inte konfigurerad' });

  const html = `
    <h2>Ny jobbansökan via thw.se</h2>
    <p><strong>Namn:</strong> ${esc(namn)}</p>
    <p><strong>Telefon:</strong> ${esc(telefon)}</p>
    <p><strong>E-post:</strong> ${esc(email)}</p>
    <p><strong>Roll:</strong> ${esc(kategori)}</p>
    <p><strong>Restaurang:</strong> ${esc(restaurang)}</p>
    <p><strong>Meddelande:</strong></p>
    <p>${esc(meddelande).replace(/\n/g, '<br>')}</p>
    <p><strong>CV:</strong> ${attachments.length ? esc(attachments[0].filename) + ' (bifogad)' : 'ingen fil bifogad'}</p>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: String(email).trim(),
        subject: `[Ansökan – ${String(kategori) || 'Okategoriserad'} – ${String(restaurang) || 'Spelar ingen roll'}] ${String(namn).trim()}`,
        html,
        ...(attachments.length ? { attachments } : {})
      })
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend svarade', r.status, detail);
      return res.status(502).json({ error: 'Kunde inte skicka ansökan' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Jobbansökan:', err);
    return res.status(502).json({ error: 'Kunde inte skicka ansökan' });
  }
};
