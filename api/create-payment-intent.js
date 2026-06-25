const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { amount, name, email, slots, lessonType } = req.body;
    const lessonCount = Array.isArray(slots) ? slots.length : 1;
    const firstSlot = Array.isArray(slots) && slots.length > 0 ? slots[0] : { date: 'N/A', time: 'N/A' };
    const description = lessonCount > 1
      ? `DinkWithEQ - ${lessonCount}x ${lessonType} (${slots.map(s => `${s.date} ${s.time}`).join(', ')})`
      : `DinkWithEQ - ${lessonType} on ${firstSlot.date} at ${firstSlot.time}`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount || 5000,
      currency: 'usd',
      metadata: { name, email, lessonType, lessonCount, firstDate: firstSlot.date, firstTime: firstSlot.time },
      receipt_email: email,
      description,
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
};
