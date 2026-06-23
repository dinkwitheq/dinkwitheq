const { Resend } = require("resend");
const { google } = require("googleapis");

// Parse a booking date/time string into a JS Date
// date: "June 22, 2026"  time: "10:00 AM"
function parseBookingDateTime(date, time) {
  return new Date(`${date} ${time}`);
}

async function addToGoogleCalendar({ name, email, date, time, lessonType, notes, paymentMethod }) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  const calendar = google.calendar({ version: "v3", auth });
  const isCash = paymentMethod === "cash";
  const start = parseBookingDateTime(date, time);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour

  const event = {
    summary: `${name} — ${lessonType} (${isCash ? "Cash" : "Paid"})`,
    description: [
      `Student: ${name}`,
      `Email: ${email}`,
      `Lesson: ${lessonType}`,
      `Payment: ${isCash ? "💵 Cash at lesson" : "💳 Paid online ($50)"}`,
      notes ? `Notes: ${notes}` : null,
    ].filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString(), timeZone: "America/Los_Angeles" },
    end: { dateTime: end.toISOString(), timeZone: "America/Los_Angeles" },
    colorId: isCash ? "5" : "2", // 5 = yellow (cash), 2 = green (paid)
  };

  await calendar.events.insert({
    calendarId: "eddiequan2@gmail.com",
    resource: event,
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { name, email, date, time, lessonType, notes, paymentMethod } = req.body;
  const isCash = paymentMethod === "cash";

  try {
    // Email to student
    await resend.emails.send({
      from: "Coach EQ <bookings@dinkwitheq.com>",
      to: email,
      subject: `✅ Booking Confirmed – ${lessonType} on ${date}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0F1A0A; color: #ffffff; padding: 32px; border-radius: 12px;">
          <h1 style="color: #C8F542; font-size: 28px; margin-bottom: 4px;">DinkWithEQ</h1>
          <p style="color: #9ca3af; margin-top: 0;">Pickleball Coaching</p>
          <hr style="border-color: #C8F542; margin: 20px 0;" />
          <h2 style="color: #ffffff;">Your Lesson is Confirmed! 🎉</h2>
          <p>Hey ${name},</p>
          <p>Your pickleball lesson has been booked. Here are your details:</p>
          <div style="background: #1B3A1A; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="color: #9ca3af; padding: 6px 0;">Lesson Type</td><td style="color: #ffffff; font-weight: bold;">${lessonType}</td></tr>
              <tr><td style="color: #9ca3af; padding: 6px 0;">Date</td><td style="color: #ffffff; font-weight: bold;">${date}</td></tr>
              <tr><td style="color: #9ca3af; padding: 6px 0;">Time</td><td style="color: #ffffff; font-weight: bold;">${time}</td></tr>
              <tr><td style="color: #9ca3af; padding: 6px 0;">Amount</td><td style="color: #C8F542; font-weight: bold;">$50.00 ${isCash ? "(due at lesson)" : "(paid)"}</td></tr>
              ${notes ? `<tr><td style="color: #9ca3af; padding: 6px 0;">Notes</td><td style="color: #ffffff;">${notes}</td></tr>` : ""}
            </table>
          </div>
          ${isCash
            ? '<p style="color: #C8F542;">💵 Please bring $50 cash to your lesson.</p>'
            : '<p style="color: #C8F542;">✅ Payment received. You\'re all set!</p>'
          }
          <p>If you need to cancel or reschedule, please give at least 24 hours notice.</p>
          <p>See you on the court! 🏓</p>
          <p style="color: #C8F542; font-weight: bold;">— Coach EQ</p>
          <hr style="border-color: #1B3A1A; margin: 20px 0;" />
          <p style="color: #6b7280; font-size: 12px;">DinkWithEQ · PPR Certified Pickleball Coaching · Oregon</p>
        </div>
      `,
    });

    // Notification email to Coach EQ
    await resend.emails.send({
      from: "DinkWithEQ Bookings <bookings@dinkwitheq.com>",
      to: "dinkwitheq@gmail.com",
      subject: `🏓 New Booking: ${name} – ${date} at ${time}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>New Booking Alert 🏓</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Student</td><td style="font-weight: bold;">${name}</td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Email</td><td><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Lesson Type</td><td>${lessonType}</td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Date</td><td>${date}</td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Time</td><td>${time}</td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Payment</td><td>${isCash ? "💵 Cash at lesson" : "💳 Paid online"}</td></tr>
            ${notes ? `<tr><td style="color: #6b7280; padding: 8px 0;">Notes</td><td>${notes}</td></tr>` : ""}
          </table>
        </div>
      `,
    });

    // Add to Google Calendar
    try {
      await addToGoogleCalendar({ name, email, date, time, lessonType, notes, paymentMethod });
    } catch (calErr) {
      console.error("Google Calendar error:", calErr);
      // Don't fail the whole request if calendar fails
    }

    res.status(200).json({ success: true, message: "Confirmation sent" });
  } catch (error) {
    console.error("Confirmation error:", error);
    res.status(500).json({ error: error.message });
  }
};
