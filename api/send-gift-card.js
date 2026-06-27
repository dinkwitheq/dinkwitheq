const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'DINK';
  for (let i = 0; i < 2; i++) {
    code += '-';
    for (let j = 0; j < 4; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return code;
}

async function getUniqueCode(supabase) {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const { data } = await supabase.from('gift_cards').select('code').eq('code', code).maybeSingle();
    if (!data) return code;
  }
  throw new Error('Could not generate unique code');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { purchaserName, purchaserEmail, recipientName, recipientEmail, lessons } = req.body;
    const lessonCount = parseInt(lessons);
    if (![1, 3, 6].includes(lessonCount)) return res.status(400).json({ error: 'Invalid lesson count' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const resend = new Resend(process.env.RESEND_API_KEY);

    const mainCode = await getUniqueCode(supabase);
    const bonusCode = lessonCount === 6 ? await getUniqueCode(supabase) : null;
    const amountPaid = lessonCount * 50;
    const deliverTo = recipientEmail || purchaserEmail;
    const deliverName = recipientName || purchaserName;
    const isGift = recipientEmail && recipientEmail !== purchaserEmail;

    const rows = [
      {
        code: mainCode,
        total_lessons: lessonCount,
        lessons_remaining: lessonCount,
        purchaser_name: purchaserName,
        purchaser_email: purchaserEmail,
        recipient_name: deliverName,
        recipient_email: deliverTo,
        amount_paid: amountPaid,
        is_bonus: false,
      },
    ];
    if (bonusCode) {
      rows.push({
        code: bonusCode,
        total_lessons: 1,
        lessons_remaining: 1,
        purchaser_name: purchaserName,
        purchaser_email: purchaserEmail,
        recipient_name: deliverName,
        recipient_email: deliverTo,
        amount_paid: 0,
        is_bonus: true,
      });
    }

    const { error: dbError } = await supabase.from('gift_cards').insert(rows);
    if (dbError) throw new Error('Failed to save gift card: ' + dbError.message);

    // Email to recipient
    await resend.emails.send({
      from: 'Coach EQ <bookings@dinkwitheq.com>',
      to: deliverTo,
      subject: `🎁 Your DinkwithEQ Gift Card${bonusCode ? 's Are' : ' Is'} Ready!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0F1A0A; color: #ffffff; padding: 32px; border-radius: 12px;">
          <h1 style="color: #C8F542; font-size: 28px; margin-bottom: 4px;">DinkwithEQ</h1>
          <p style="color: #9ca3af; margin-top: 0;">Pickleball Coaching · Eugene, OR</p>
          <hr style="border-color: #C8F542; margin: 20px 0;" />
          <h2 style="color: #ffffff; margin-bottom: 6px;">🎁 ${isGift ? `${purchaserName} sent you a gift!` : 'Your gift card is ready!'}</h2>
          <p>Hey ${deliverName}, ${isGift ? `you've been gifted` : 'you purchased'} <strong style="color: #C8F542;">${lessonCount} pickleball lesson${lessonCount > 1 ? 's' : ''}</strong> with Coach EQ.</p>

          <div style="background: #1B3A1A; border-radius: 12px; padding: 24px; margin: 24px 0; border: 2px solid #C8F542; text-align: center;">
            <div style="font-size: 36px; margin-bottom: 8px;">🏓</div>
            <div style="color: #C8F542; font-size: 14px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 4px;">${lessonCount}-Lesson Gift Card · $${amountPaid} Value</div>
            <div style="background: #0F1A0A; border-radius: 8px; padding: 20px; margin: 16px 0;">
              <div style="color: #9ca3af; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 8px;">Your Code</div>
              <div style="color: #C8F542; font-size: 30px; font-weight: 900; letter-spacing: 0.25em; font-family: 'Courier New', monospace;">${mainCode}</div>
              <div style="color: #9ca3af; font-size: 12px; margin-top: 10px;">${lessonCount} lesson${lessonCount > 1 ? 's' : ''} · Use at checkout · Never expires</div>
            </div>
          </div>

          ${bonusCode ? `
          <div style="background: #1a1508; border-radius: 12px; padding: 24px; margin: 20px 0; border: 2px dashed #f59e0b; text-align: center;">
            <div style="font-size: 28px; margin-bottom: 8px;">🎉</div>
            <div style="color: #f59e0b; font-size: 14px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px;">BONUS — Free Extra Lesson!</div>
            <div style="color: #9ca3af; font-size: 12px; margin-bottom: 16px;">A special thank-you for purchasing the 6-lesson bundle</div>
            <div style="background: #0F1A0A; border-radius: 8px; padding: 16px; margin: 0 0 0 0;">
              <div style="color: #9ca3af; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 8px;">Bonus Code</div>
              <div style="color: #f59e0b; font-size: 30px; font-weight: 900; letter-spacing: 0.25em; font-family: 'Courier New', monospace;">${bonusCode}</div>
              <div style="color: #9ca3af; font-size: 12px; margin-top: 10px;">1 bonus lesson · Use separately at checkout</div>
            </div>
          </div>
          ` : ''}

          <div style="background: #1B3A1A; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <div style="color: #C8F542; font-weight: 700; margin-bottom: 10px;">How to Redeem</div>
            <ol style="color: #9ca3af; margin: 0; padding-left: 20px; line-height: 2; font-size: 13px;">
              <li>Go to <a href="https://www.dinkwitheq.com" style="color: #C8F542;">dinkwitheq.com</a> → Book</li>
              <li>Pick your lesson time(s)</li>
              <li>On the payment step, choose <strong style="color: #fff;">Gift Card</strong></li>
              <li>Enter your code — lessons deducted automatically</li>
            </ol>
            <p style="color: #6b7280; font-size: 12px; margin: 12px 0 0;">You don't have to use all lessons at once. Each booking deducts from your balance.</p>
          </div>

          <p style="color: #C8F542; font-weight: bold; margin-top: 24px;">— Coach EQ 🏓</p>
          <hr style="border-color: #1B3A1A; margin: 20px 0;" />
          <p style="color: #6b7280; font-size: 12px;">DinkwithEQ · PPR Certified Pickleball Coaching · Eugene, OR</p>
        </div>
      `,
    });

    // Coach notification
    await resend.emails.send({
      from: 'DinkwithEQ Bookings <bookings@dinkwitheq.com>',
      to: 'dinkwitheq@gmail.com',
      subject: `🎁 Gift Card Sale: ${purchaserName} — ${lessonCount} Lesson${lessonCount > 1 ? 's' : ''}${bonusCode ? ' + Bonus' : ''}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>🎁 New Gift Card Purchase</h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee; width: 160px;">Purchaser</td><td style="font-weight: bold;">${purchaserName}</td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Purchaser Email</td><td><a href="mailto:${purchaserEmail}">${purchaserEmail}</a></td></tr>
            ${isGift ? `<tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Gift Recipient</td><td style="font-weight: bold;">${deliverName} &lt;${deliverTo}&gt;</td></tr>` : ''}
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Lessons Purchased</td><td style="font-weight: bold;">${lessonCount}${bonusCode ? ' + 1 bonus' : ''}</td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Amount Paid</td><td style="font-weight: bold; color: #15803d;">$${amountPaid}.00</td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Main Code</td><td style="font-family: monospace; font-size: 18px; font-weight: bold; color: #15803d;">${mainCode}</td></tr>
            ${bonusCode ? `<tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Bonus Code</td><td style="font-family: monospace; font-size: 18px; font-weight: bold; color: #b45309;">${bonusCode} <span style="font-size:11px; color:#6b7280;">(1 free lesson)</span></td></tr>` : ''}
          </table>
        </div>
      `,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Send gift card error:', error);
    res.status(500).json({ error: error.message });
  }
};
