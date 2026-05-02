const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const app = express();
const cors = require('cors')
app.use(cors())
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

app.post('/submit', async (req, res) => {
  const { email, letter_text, delivery_window, is_public } = req.body;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a warm and faithful assistant for Sundae Publishing, a Christian community.

A person has written about an incident where the person saw God show up in their life. Your job is to:
1. Give this moment a short, meaningful title (max 8 words)
2. Find one well known Bible scripture that fits this moment of God's faithfulness, provision or timing
3. Write 2-3 sentences that gently hold the person's story and connect it to the scripture. Do not preach. Just reflect warmly.

Return your response in this exact format:
TITLE: [title here]
SCRIPTURE_REF: [e.g. Jeremiah 29:11 NIV]
SCRIPTURE_TEXT: [the actual verse text]
REFLECTION: [your 2-3 sentences]

Here is the story:
${letter_text}`
      }]
    });

    const raw = message.content[0].text;
    const title = raw.match(/TITLE: (.+)/)?.[1]?.trim();
    const scripture_ref = raw.match(/SCRIPTURE_REF: (.+)/)?.[1]?.trim();
    const scripture_text = raw.match(/SCRIPTURE_TEXT: (.+)/)?.[1]?.trim();
    const reflection = raw.match(/REFLECTION: ([\s\S]+)/)?.[1]?.trim();
    const scripture = `${scripture_ref} — "${scripture_text}"`;

    const delivery_date = new Date();
    if (delivery_window === 'month') delivery_date.setMonth(delivery_date.getMonth() + 1);
    else if (delivery_window === 'random') delivery_date.setDate(delivery_date.getDate() + Math.floor(Math.random() * 14) + 1);
    else delivery_date.setFullYear(delivery_date.getFullYear() + 1);

    const { data, error } = await supabase.from('letters').insert([{
      email,
      letter_text,
      title,
      scripture,
      reflection,
      delivery_date: delivery_date.toISOString(),
      delivery_window,
      status: 'pending',
      is_public: is_public || false,
      public_excerpt: letter_text.substring(0, 150)
    }]);

    if (error) throw error;

    await resend.emails.send({
      from: 'Sundae <hello@sundaemail.com>',
      to: email,
      subject: `A message from your past self — ${title}`,
      scheduledAt: delivery_date.toISOString(),
      html: `
        <h2>${title}</h2>
        <blockquote>${scripture}</blockquote>
        <p>${reflection}</p>
        <hr/>
        <p><em>Here is what you wrote:</em></p>
        <p>${letter_text}</p>
        <p style="color:#999;font-size:12px;">Sent with love from Sundae</p>
      `
    });

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));