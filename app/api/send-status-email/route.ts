import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const role = String(body.role || '').trim();
    const action = String(body.action || '').trim(); // 'shortlist' | 'interview' | 'reject'
    const interviewDateTime = String(body.interviewDateTime || '').trim();

    if (!name || !email || !action) {
      return NextResponse.json(
        { error: 'Missing candidate name, email, or action type' },
        { status: 400 }
      );
    }

    let subject = '';
    let htmlContent = '';

    if (action === 'shortlist') {
      subject = `Great news regarding your application for ${role}`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1e293b;">Hello ${name},</h2>
          <p style="color: #475569; line-height: 1.5;">
            Great news! Our hiring team has reviewed your qualifications and we are pleased to inform you that you have been <strong>shortlisted</strong> for the <strong>${role}</strong> position.
          </p>
          <p style="color: #475569; line-height: 1.5;">
            Our recruitment team is currently finalizing interview schedules and will be in touch with you shortly regarding the next steps.
          </p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">Best regards,<br/>Hiring Team</p>
        </div>
      `;
    } else if (action === 'interview') {
      subject = `Interview Invitation: ${role} Position`;
      const formattedDate = interviewDateTime
        ? new Date(interviewDateTime).toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short',
          })
        : interviewDateTime;

      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1e293b;">Hello ${name},</h2>
          <p style="color: #475569; line-height: 1.5;">
            We would love to invite you for an interview for the <strong>${role}</strong> position!
          </p>
          <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 0; color: #1e293b; font-weight: bold;">📅 Scheduled Date & Time:</p>
            <p style="margin: 5px 0 0 0; color: #2563eb; font-size: 16px; font-weight: bold;">${formattedDate}</p>
          </div>
          <p style="color: #475569; line-height: 1.5;">
            Please reply to this email if you need to reschedule or have any questions beforehand. We look forward to speaking with you!
          </p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">Best regards,<br/>Recruitment Team</p>
        </div>
      `;
    } else if (action === 'reject') {
      subject = `Update on your application for ${role}`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1e293b;">Hello ${name},</h2>
          <p style="color: #475569; line-height: 1.5;">
            Thank you so much for taking the time to share your background and resume with us for the <strong>${role}</strong> position.
          </p>
          <p style="color: #475569; line-height: 1.5;">
            After careful consideration, we have decided to move forward with other candidates whose experience more closely matches our immediate requirements for this particular opening.
          </p>
          <p style="color: #475569; line-height: 1.5;">
            We were genuinely impressed by your background and appreciate the effort you put into your application. We will keep your profile in our talent network and will reach out if a relevant opportunity opens up in the future.
          </p>
          <p style="color: #475569; line-height: 1.5;">
            We wish you the very best in your job search and professional journey.
          </p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">Warm regards,<br/>Hiring Team</p>
        </div>
      `;
    } else {
      return NextResponse.json({ error: 'Invalid action type' }, { status: 400 });
    }

    // Email dispatch (Nodemailer Gmail with Resend fallback)
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (gmailUser && gmailPass) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailUser,
            pass: gmailPass,
          },
        });

        await transporter.sendMail({
          from: `"Recruitment Team" <${gmailUser}>`,
          to: email,
          subject,
          html: htmlContent,
        });
      } catch (mailErr: any) {
        console.error('Nodemailer Error:', mailErr);
        return NextResponse.json(
          { error: `Email dispatch failed: ${mailErr.message}` },
          { status: 500 }
        );
      }
    } else {
      const resendApiKey = process.env.RESEND_API_KEY;
      if (!resendApiKey) {
        return NextResponse.json(
          { error: 'Email service not configured. Please configure GMAIL or RESEND_API_KEY.' },
          { status: 500 }
        );
      }
      const resend = new Resend(resendApiKey);

      const { error: resendError } = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject,
        html: htmlContent,
      });

      if (resendError) {
        console.error('Resend Error:', resendError);
        return NextResponse.json(
          { error: `Email dispatch failed: ${resendError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Send Status Email Error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
