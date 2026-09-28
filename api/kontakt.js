// Kontaktformuläret på startsidan -> mejl till Thai House Wok via Resend.
// Mottagare styrs av FORM_TO i Vercel-projektets env, med fallback i koden.

const TO = process.env.FORM_TO || 'nathalie@thw.se';
const FROM = process.env.FORM_FROM || 'Thai House Wok <noreply@synsnumedia.com>';

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
  const { name = '', email = '', subject = '', message = '', botcheck = '' } = body;

  // Honeypot: bottar fyller i fältet, människor ser det aldrig.
  if (botcheck) return res.status(200).json({ ok: true });

  if (!String(name).trim() || !String(message).trim()) {
    return res.status(400).json({ error: 'Namn och meddelande krävs' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim())) {
    return res.status(400).json({ error: 'Ogiltig e-postadress' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ error: 'E-post är inte konfigurerad' });

  const rubrik = String(subject).trim() || 'Meddelande från thw.se';

  const html = `
    <h2>Nytt meddelande från thw.se</h2>
    <p><strong>Namn:</strong> ${esc(name)}</p>
    <p><strong>E-post:</strong> ${esc(email)}</p>
    <p><strong>Ämne:</strong> ${esc(rubrik)}</p>
    <p><strong>Meddelande:</strong></p>
    <p>${esc(message).replace(/\n/g, '<br>')}</p>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: String(email).trim(),
        subject: `[thw.se] ${rubrik}`,
        html
      })
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend svarade', r.status, detail);
      return res.status(502).json({ error: 'Kunde inte skicka meddelandet' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Kontaktformulär:', err);
    return res.status(502).json({ error: 'Kunde inte skicka meddelandet' });
  }
};
