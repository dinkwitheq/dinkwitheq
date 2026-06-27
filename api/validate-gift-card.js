const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Code is required' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase
      .from('gift_cards')
      .select('code, lessons_remaining, total_lessons, is_bonus')
      .eq('code', code.trim().toUpperCase())
      .single();

    if (error || !data) return res.status(404).json({ error: 'Invalid gift card code. Please check and try again.' });
    if (data.lessons_remaining <= 0) return res.status(400).json({ error: 'This gift card has been fully redeemed.' });

    res.status(200).json({
      valid: true,
      lessonsRemaining: data.lessons_remaining,
      totalLessons: data.total_lessons,
    });
  } catch (error) {
    console.error('Validate gift card error:', error);
    res.status(500).json({ error: 'Unable to validate code. Please try again.' });
  }
};
