const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { lessons, purchaserName, purchaserEmail } = req.body;
    const lessonCount = parseInt(lessons);
    const validAmounts = { 1: 5000, 3: 15000, 6: 30000 };
    if (!validAmounts[lessonCount]) return res.status(400).json({ error: 'Invalid lesson count' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: validAmounts[lessonCount],
      currency: 'usd',
      metadata: { type: 'gift_card', lessons: lessonCount, purchaserName, purchaserEmail },
      receipt_email: purchaserEmail,
      description: `DinkwithEQ Gift Card — ${lessonCount} Lesson${lessonCount > 1 ? 's' : ''}${lessonCount === 6 ? ' + 1 Bonus Lesson' : ''}`,
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Gift card payment error:', error);
    res.status(500).json({ error: error.message });
  }
};
