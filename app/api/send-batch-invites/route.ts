import { NextResponse } from 'next/server';
import { sendEmailWithRetry } from '@/lib/mail';
import { getAppBaseUrl } from '@/lib/url';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || !Array.isArray(body.candidates) || body.candidates.length === 0) {
      return NextResponse.json(
        { error: 'Invalid payload: candidates array is required' },
        { status: 400 }
      );
    }

    const candidates = body.candidates as Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      phone?: string;
      location?: string;
    }>;

    const action = String(body.action || 'invite').trim().toLowerCase();
    const isReminder = action === 'reminder';

    const baseUrl = getAppBaseUrl(req);
    const gmailUser = process.env.GMAIL_USER || 'resume.ai2026@gmail.com';

    let sentCount = 0;
    const failedList: Array<{ name: string; email: string; error: string }> = [];

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const name = String(c.name || 'Candidate').trim();
      const email = String(c.email || '').trim().toLowerCase();
      const role = String(c.role || 'Open Position').trim();

      if (!email || !email.includes('@')) {
        failedList.push({ name, email, error: 'Invalid email address' });
        continue;
      }

      // Mandatory pacing delay between emails to avoid Google SMTP rate limits (454 / 421)
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }

      const uploadUrl = `${baseUrl}/upload?id=${c.id}&name=${encodeURIComponent(name)}&role=${encodeURIComponent(role)}`;

      const subject = isReminder
        ? `Reminder: Please upload your CV for ${role} — BobaLive`
        : `Next Step: Upload your CV for ${role} — BobaLive`;

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #a53861; margin: 0; font-size: 24px;">BobaLive Careers</h2>
            <p style="color: #64748b; margin: 4px 0 0 0; font-size: 14px;">Next Generation Hospitality Hiring</p>
          </div>
          <p style="color: #334155; font-size: 16px; line-height: 1.6;">
            Hello <strong>${name}</strong>,
          </p>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">
            ${
              isReminder
                ? `This is a reminder regarding your application for the <strong>${role}</strong> position at BobaLive.`
                : `Thank you for your interest in the <strong>${role}</strong> position at BobaLive!`
            }
          </p>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">
            Please click the button below to upload your resume (PDF) so our recruitment team can evaluate your profile and schedule your interview:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${uploadUrl}" style="background-color: #a53861; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 10px rgba(165, 56, 97, 0.25);">
              Upload Your Resume
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            If you did not apply for this position or have already submitted your CV, you can safely ignore this email.
          </p>
        </div>
      `;

      try {
        await sendEmailWithRetry({
          from: `"BobaLive Recruitment" <${gmailUser}>`,
          to: email,
          subject,
          html: htmlContent,
        });
        sentCount++;
      } catch (err: any) {
        console.error(`Failed to send email to ${email}:`, err);
        failedList.push({
          name,
          email,
          error: err?.message || 'SMTP delivery failed',
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: candidates.length,
      sentCount,
      failedCount: failedList.length,
      failedCandidates: failedList,
    });
  } catch (err: any) {
    console.error('Batch Invite API Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to process batch email invites' },
      { status: 500 }
    );
  }
}
