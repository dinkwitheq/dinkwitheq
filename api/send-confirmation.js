const { Resend } = require("resend");
const { google } = require("googleapis");

// Parse a booking date/time string into an ISO string in Pacific time
// date: "June 22, 2026"  time: "10:00 AM"
function parseBookingDateTime(date, time) {
  // Parse hours and minutes from "8:30 AM" / "10:00 AM"
  const [rawTime, meridiem] = time.split(" ");
  let [hours, minutes] = rawTime.split(":").map(Number);
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  // Parse date parts from "June 22, 2026"
  const d = new Date(`${date}`);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");

  // Return as a local Pacific time string — Google Calendar timeZone field handles the rest
  return `${year}-${month}-${day}T${hh}:${mm}:00`;
}

async function addToGoogleCalendar({ name, email, date, time, lessonType, notes, paymentMethod, participants }) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  const calendar = google.calendar({ version: "v3", auth });
  const isCash = paymentMethod === "cash";
  const startLocal = parseBookingDateTime(date, time);
  // Build end time by incrementing the hour in the local string
  const endLocal = parseBookingDateTime(date, time).replace(
    /T(\d{2})/,
    (_, h) => `T${String(Number(h) + 1).padStart(2, "0")}`
  );

  const groupSize = participants && participants.length > 0 ? participants.length : null;
  const event = {
    summary: `${name} — ${lessonType}${groupSize ? ` (${groupSize + 1} players)` : ""} (${isCash ? "Cash" : "Paid"})`,
    description: [
      `Booked by: ${name}`,
      `Email: ${email}`,
      `Lesson: ${lessonType}`,
      groupSize ? `Group size: ${groupSize + 1} players (booker + ${groupSize} others)` : null,
      groupSize ? `Participants:\n  • ${name} (booker)\n  ${participants.map(p => `• ${p}`).join("\n  ")}` : null,
      `Payment: ${isCash ? "💵 Cash at lesson" : "💳 Paid online ($50)"}`,
      notes ? `Notes: ${notes}` : null,
    ].filter(Boolean).join("\n"),
    start: { dateTime: startLocal, timeZone: "America/Los_Angeles" },
    end: { dateTime: endLocal, timeZone: "America/Los_Angeles" },
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
  const { name, email, date, time, lessonType, notes, paymentMethod, participants } = req.body;
  const isCash = paymentMethod === "cash";
  const groupParticipants = Array.isArray(participants) ? participants.filter(p => p && p.trim()) : [];
  const isGroup = groupParticipants.length > 0;
  const totalPlayers = isGroup ? groupParticipants.length + 1 : null;

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
      subject: `🏓 New Booking: ${name} – ${lessonType} on ${date} at ${time}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>New Booking Alert 🏓</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee; width: 140px;">Booked by</td><td style="font-weight: bold;">${name}</td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Email</td><td><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Lesson Type</td><td style="font-weight: bold;">${lessonType}</td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Date</td><td>${date}</td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Time</td><td>${time}</td></tr>
            <tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Payment</td><td>${isCash ? "💵 Cash at lesson" : "💳 Paid online"}</td></tr>
            ${notes ? `<tr><td style="color: #6b7280; padding: 8px 0; border-bottom: 1px solid #eee;">Notes</td><td>${notes}</td></tr>` : ""}
          </table>

          ${isGroup ? `
          <div style="margin-top: 24px; background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; border-radius: 4px;">
            <h3 style="margin: 0 0 12px 0; color: #15803d;">👥 Group Clinic — ${totalPlayers} Players</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="background: #dcfce7;">
                <td style="padding: 6px 10px; font-weight: bold; color: #166534;">#</td>
                <td style="padding: 6px 10px; font-weight: bold; color: #166534;">Name</td>
                <td style="padding: 6px 10px; font-weight: bold; color: #166534;">Role</td>
              </tr>
              <tr>
                <td style="padding: 6px 10px; border-bottom: 1px solid #bbf7d0;">1</td>
                <td style="padding: 6px 10px; border-bottom: 1px solid #bbf7d0; font-weight: bold;">${name}</td>
                <td style="padding: 6px 10px; border-bottom: 1px solid #bbf7d0; color: #6b7280;">Booker</td>
              </tr>
              ${groupParticipants.map((p, i) => `
              <tr>
                <td style="padding: 6px 10px; border-bottom: 1px solid #bbf7d0;">${i + 2}</td>
                <td style="padding: 6px 10px; border-bottom: 1px solid #bbf7d0; font-weight: bold;">${p}</td>
                <td style="padding: 6px 10px; border-bottom: 1px solid #bbf7d0; color: #6b7280;">Participant</td>
              </tr>`).join("")}
            </table>
            <p style="margin: 10px 0 0 0; font-size: 13px; color: #15803d;">✅ Booker confirmed authority to sign waiver on behalf of all participants.</p>
          </div>
          ` : ""}
        </div>
      `,
    });

    // Add to Google Calendar
    try {
      await addToGoogleCalendar({ name, email, date, time, lessonType, notes, paymentMethod, participants: groupParticipants });
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
