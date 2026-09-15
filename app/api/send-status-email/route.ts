import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

function formatUtcIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function generateIcsContent({
  uid,
  name,
  email,
  role,
  startDate,
  endDate,
  organizerEmail,
  formattedDate,
  phone,
  location,
}: {
  uid: string;
  name: string;
  email: string;
  role: string;
  startDate: Date;
  endDate: Date;
  organizerEmail: string;
  formattedDate: string;
  phone?: string;
  location?: string;
}): string {
  const dtStamp = formatUtcIcsDate(new Date());
  const dtStart = formatUtcIcsDate(startDate);
  const dtEnd = formatUtcIcsDate(endDate);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BobaLive//Recruitment System//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Interview: ${name} — ${role} (BobaLive)`,
    `DESCRIPTION:Job Interview for ${role} position at BobaLive.\\nCandidate: ${name}\\nEmail: ${email}${phone ? `\\nPhone: ${phone}` : ''}${location ? `\\nLocation: ${location}` : ''}\\nScheduled Time: ${formattedDate}`,
    `LOCATION:${location || 'BobaLive Outlet / Online Interview'}`,
    'STATUS:CONFIRMED',
    `ORGANIZER;CN="BobaLive Recruitment":mailto:${organizerEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN="${name}":mailto:${email}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=CHAIR;PARTSTAT=ACCEPTED;CN="BobaLive HR":mailto:${organizerEmail}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: Interview with ${name} (${role}) in 30 minutes`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: Interview with ${name} (${role}) in 10 minutes`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

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
    const phone = String(body.phone || '').trim();
    const location = String(body.location || '').trim();
    const role = String(body.role || '').trim();
    const action = String(body.action || '').trim().toLowerCase(); // 'shortlist' | 'interview' | 'reject'
    const interviewDateTime = String(body.interviewDateTime || '').trim();

    const customSubject = String(body.customSubject || '').trim();
    const customMessage = String(body.customMessage || '').trim();

    if (!name || !email || !action) {
      return NextResponse.json(
        { error: 'Missing candidate name, email, or action type' },
        { status: 400 }
      );
    }

    const gmailUser = process.env.GMAIL_USER || 'resume.ai2026@gmail.com';
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    const hrNotificationEmail = process.env.HR_NOTIFICATION_EMAIL || process.env.HR_EMAIL || gmailUser;

    let subject = '';
    let htmlContent = '';
    let icsContent = '';

    if (action === 'custom' || action === 'message') {
      if (!customMessage) {
        return NextResponse.json(
          { error: 'Message content cannot be empty' },
          { status: 400 }
        );
      }

      const escapeHtml = (str: string) =>
        str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

      subject = customSubject || `Message regarding your application for ${role} at BobaLive`;

      const formattedParagraphs = customMessage
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => `<p style="color: #334155; line-height: 1.6; font-size: 15px; margin: 0 0 14px 0;">${escapeHtml(p)}</p>`)
        .join('');

      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="border-bottom: 2px solid #5f7f7a; padding-bottom: 12px; margin-bottom: 18px;">
            <h2 style="color: #1e293b; margin: 0; font-size: 20px;">BobaLive Recruitment</h2>
            <p style="color: #5f7f7a; font-size: 13px; font-weight: bold; margin: 4px 0 0 0;">Position: ${escapeHtml(role)}</p>
          </div>
          
          <div style="margin: 16px 0;">
            ${formattedParagraphs}
          </div>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Best regards,<br/>
            <strong style="color: #475569;">BobaLive Recruitment Team</strong>
          </p>
        </div>
      `;
    } else if (action === 'shortlist') {
      subject = `Great news regarding your application for ${role} at BobaLive`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #1e293b; margin-top: 0;">Hello ${name},</h2>
          <p style="color: #475569; line-height: 1.6; font-size: 15px;">
            Great news! Our hiring team has reviewed your background and qualifications, and we are pleased to inform you that you have been <strong>shortlisted</strong> for the <strong>${role}</strong> position at BobaLive.
          </p>
          <p style="color: #475569; line-height: 1.6; font-size: 15px;">
            Our recruitment team is finalizing interview schedules and will reach out shortly with your interview invitation and calendar invite.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Best regards,<br/>
            <strong style="color: #475569;">BobaLive Recruitment Team</strong>
          </p>
        </div>
      `;
    } else if (action === 'interview') {
      subject = `Interview Invitation: ${role} Position — BobaLive`;

      const startDate = interviewDateTime ? new Date(interviewDateTime) : new Date();
      const endDate = new Date(startDate.getTime() + 45 * 60 * 1000); // 45-minute interview duration

      const formattedDate = !isNaN(startDate.getTime())
        ? startDate.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
        : interviewDateTime;

      const eventUid = `bobalive-interview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@bobalive.com`;

      icsContent = generateIcsContent({
        uid: eventUid,
        name,
        email,
        role,
        startDate,
        endDate,
        organizerEmail: gmailUser,
        formattedDate,
        phone,
        location,
      });

      const gcalStart = formatUtcIcsDate(startDate);
      const gcalEnd = formatUtcIcsDate(endDate);
      const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
        `Interview: ${name} — ${role} (BobaLive)`
      )}&dates=${gcalStart}/${gcalEnd}&details=${encodeURIComponent(
        `Job Interview for ${role} at BobaLive.\nCandidate: ${name}\nEmail: ${email}\nScheduled: ${formattedDate}`
      )}&location=${encodeURIComponent(location || 'BobaLive Outlet')}`;

      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="border-bottom: 2px solid #5f7f7a; padding-bottom: 12px; margin-bottom: 18px;">
            <h2 style="color: #1e293b; margin: 0; font-size: 20px;">Interview Invitation — BobaLive</h2>
            <p style="color: #5f7f7a; font-size: 13px; font-weight: bold; margin: 4px 0 0 0;">Position: ${role}</p>
          </div>
          
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">
            Hello <strong>${name}</strong>,
          </p>
          <p style="color: #475569; line-height: 1.6; font-size: 14px;">
            We are excited to invite you for an interview for the <strong>${role}</strong> position with BobaLive!
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 18px; border-radius: 10px; margin: 20px 0;">
            <p style="margin: 0 0 6px 0; color: #475569; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
              📅 Scheduled Interview Date & Time
            </p>
            <p style="margin: 0; color: #0f172a; font-size: 17px; font-weight: 800;">
              ${formattedDate}
            </p>
            ${location ? `<p style="margin: 8px 0 0 0; color: #64748b; font-size: 13px;">📍 Location: <strong>${location}</strong></p>` : ''}
          </div>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${gcalUrl}" target="_blank" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              📅 Add to Google Calendar
            </a>
          </div>

          <p style="color: #64748b; line-height: 1.5; font-size: 13px;">
            A calendar invitation file (<code>.ics</code>) has also been attached to this email. It will automatically add this event and reminder to your Google / Apple Calendar.
          </p>
          <p style="color: #64748b; line-height: 1.5; font-size: 13px;">
            If you have any questions or need to request a reschedule, please reply directly to this email.
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Best regards,<br/>
            <strong style="color: #475569;">BobaLive Recruitment Team</strong>
          </p>
        </div>
      `;
    } else if (action === 'reject') {
      subject = `Update regarding your application for ${role} at BobaLive`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #1e293b; margin-top: 0;">Hello ${name},</h2>
          <p style="color: #475569; line-height: 1.6; font-size: 15px;">
            Thank you for taking the time to apply and share your background with us for the <strong>${role}</strong> position at BobaLive.
          </p>
          <p style="color: #475569; line-height: 1.6; font-size: 15px;">
            After careful review of all applications against our current store requirements, we have decided to proceed with other candidates at this time.
          </p>
          <p style="color: #475569; line-height: 1.6; font-size: 14px;">
            We appreciate your interest in BobaLive and will keep your profile in our talent pool for future openings that match your skills.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Best regards,<br/>
            <strong style="color: #475569;">BobaLive Recruitment Team</strong>
          </p>
        </div>
      `;
    } else {
      return NextResponse.json({ error: 'Invalid action type' }, { status: 400 });
    }

    // Email dispatch (Nodemailer Gmail with calendar invite attachment and automatic HR sync)
    if (gmailUser && gmailPass) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailUser,
            pass: gmailPass,
          },
        });

        // 1. Send Interview Email to Candidate
        const candidateMailOptions: any = {
          from: `"BobaLive Recruitment" <${gmailUser}>`,
          to: email,
          subject,
          html: htmlContent,
        };

        if (action === 'interview' && icsContent) {
          candidateMailOptions.icalEvent = {
            filename: 'interview-invitation.ics',
            method: 'REQUEST',
            content: icsContent,
          };
          candidateMailOptions.alternatives = [
            {
              contentType: 'text/calendar; charset="utf-8"; method=REQUEST',
              content: icsContent,
            },
          ];
        }

        await transporter.sendMail(candidateMailOptions);

        // 2. Automatically sync to HR Google Calendar if an interview was scheduled
        if (action === 'interview' && icsContent) {
          const hrSubject = `📅 [Interview Scheduled] ${name} — ${role}`;
          const hrHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 560px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
              <h3 style="color: #0f172a; margin-top: 0;">🔔 New Interview Scheduled</h3>
              <p style="color: #475569; font-size: 14px;">An interview has been scheduled for candidate <strong>${name}</strong>.</p>
              
              <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; margin: 15px 0; font-size: 14px;">
                <p style="margin: 0 0 6px 0;"><strong>Candidate:</strong> ${name}</p>
                <p style="margin: 0 0 6px 0;"><strong>Role:</strong> ${role}</p>
                <p style="margin: 0 0 6px 0;"><strong>Candidate Email:</strong> ${email}</p>
                ${phone ? `<p style="margin: 0 0 6px 0;"><strong>Phone:</strong> ${phone}</p>` : ''}
                ${location ? `<p style="margin: 0 0 6px 0;"><strong>Location:</strong> ${location}</p>` : ''}
                <p style="margin: 8px 0 0 0; color: #2563eb; font-weight: bold;">📅 Time: ${interviewDateTime ? new Date(interviewDateTime).toLocaleString('en-US') : interviewDateTime}</p>
              </div>

              <p style="color: #64748b; font-size: 12px;">
                ✅ This event has been attached as an iCalendar request and will automatically sync with your Google Calendar with reminders set for 30 min and 10 min prior.
              </p>
            </div>
          `;

          await transporter.sendMail({
            from: `"BobaLive Recruitment" <${gmailUser}>`,
            to: hrNotificationEmail,
            subject: hrSubject,
            html: hrHtml,
            icalEvent: {
              filename: 'interview-invitation.ics',
              method: 'REQUEST',
              content: icsContent,
            },
            alternatives: [
              {
                contentType: 'text/calendar; charset="utf-8"; method=REQUEST',
                content: icsContent,
              },
            ],
          });
        }
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
          { error: 'Email service not configured. Please configure GMAIL_USER and GMAIL_APP_PASSWORD.' },
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
