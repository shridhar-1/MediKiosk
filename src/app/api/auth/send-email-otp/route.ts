import nodemailer from "nodemailer";

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return Response.json({ error: "Email and OTP are required" }, { status: 400 });
    }

    // Configure the transporter using your environment variables
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Send the email
    await transporter.sendMail({
      from: `"MediKiosk Authority" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Your Clinical Console Access Code",
      text: `Your MediKiosk secure access code is: ${otp}. Do not share this with anyone.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #1b1712;">
          <p style="font-size: 12px; text-transform: uppercase; color: #c9842a; letter-spacing: 2px;">MediKiosk Security</p>
          <h2>Facility Authentication</h2>
          <p>Your secure access code is:</p>
          <h1 style="font-size: 32px; letter-spacing: 5px; color: #08363a;">${otp}</h1>
          <p>Do not share this code with anyone. It will expire shortly.</p>
        </div>
      `,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Email Error:", error);
    return Response.json({ error: "Failed to send email" }, { status: 500 });
  }
}
