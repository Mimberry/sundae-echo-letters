const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

async function sendDueLetters() {
    console.log('Cron job running — checking for due letters...')

    const now = new Date().toISOString()

    const { data: letters, error } = await supabase
        .from('letters')
        .select('*')
        .eq('status', 'pending')
        .lte('delivery_date', now)

    if (error) {
        console.error('Error fetching letters:', error)
        process.exit(1)
    }

    console.log(`Found ${letters.length} letter(s) to send.`)

    for (const letter of letters) {
        try {
            await resend.emails.send({
                from: 'Sundae <hello@sundaemail.com>',
                to: letter.email,
                subject: `A message from your past self — ${letter.title}`,
                html: `
                    <h2>${letter.title}</h2>
                    <blockquote>${letter.scripture}</blockquote>
                    <p>${letter.reflection}</p>
                    <hr/>
                    <p><em>Here is what you wrote:</em></p>
                    <p>${letter.letter_text}</p>
                    <p style="color:#999;font-size:12px;">Sent with love from Sundae</p>
                `
            })

            await supabase
                .from('letters')
                .update({ status: 'sent' })
                .eq('id', letter.id)

            console.log(`Sent letter ${letter.id} to ${letter.email}`)

        } catch (err) {
            console.error(`Failed to send letter ${letter.id}:`, err)

            await supabase
                .from('letters')
                .update({ status: 'failed' })
                .eq('id', letter.id)
        }
    }

    console.log('Cron job complete.')
    process.exit(0)
}

sendDueLetters()