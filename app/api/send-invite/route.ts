import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

import { getAppBaseUrl } from '@/lib/url';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { error: 'Invalid JSON request payload' },
        { status: 400 }
      );
    }

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const role = String(body.role || '').trim();
    const location = String(body.location || '').trim();

    if (!name || !email || !role) {
      return NextResponse.json(
        { error: 'Name, email, and role are required' },
        { status: 400 }
      );
    }

    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    // 1. Save candidate entry to Supabase database (with location fallback)
    let candidateData: any = null;
    let dbError: any = null;

    const payloadWithLocation: any = {
      name,
      email,
      phone: phone || null,
      role,
      status: 'invited',
    };
    if (location) {
      payloadWithLocation.location = location;
    }

    const { data: c1, error: e1 } = await supabase
      .from('candidates')
      .insert([payloadWithLocation])
      .select()
      .single();

    if (e1 && e1.code === 'PGRST204') {
      // If location column doesn't exist in Supabase DB schema, insert without location
      delete payloadWithLocation.location;
      const { data: c2, error: e2 } = await supabase
        .from('candidates')
        .insert([payloadWithLocation])
        .select()
        .single();
      candidateData = c2;
      dbError = e2;
    } else {
      candidateData = c1;
      dbError = e1;
    }

    if (dbError || !candidateData) {
      console.error('Supabase Insert Error:', dbError);
      return NextResponse.json(
        { error: dbError?.message || 'Failed to create candidate entry in database' },
        { status: 500 }
      );
    }

    // 2. Build personalized URL using dynamic base URL
    const baseUrl = getAppBaseUrl(req);
    const uploadUrl = `${baseUrl}/upload?id=${candidateData.id}&name=${encodeURIComponent(
      name
    )}&role=${encodeURIComponent(role)}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e293b;">Hello ${name},</h2>
        <p style="color: #475569; line-height: 1.5;">
          Thank you for your interest in the <strong>${role}</strong> role! You have passed our initial preliminary screening.
        </p>
        <p style="color: #475569; line-height: 1.5;">
          Please click the button below to upload your resume (PDF) so our team can evaluate your qualifications:
        </p>
        <div style="margin: 25px 0;">
          <a href="${uploadUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
            Upload Your Resume
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">If you did not apply for this position, you can safely ignore this email.</p>
      </div>
    `;

    // 3. Dispatch email (Nodemailer Gmail with Resend fallback)
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
          subject: `Next Step: Upload your CV for the ${role} position`,
          html: htmlContent,
        });
      } catch (mailErr: any) {
        console.error('Nodemailer Error:', mailErr);
        return NextResponse.json(
          { error: `Email dispatch failed (Nodemailer): ${mailErr.message}` },
          { status: 500 }
        );
      }
    } else {
      // Fallback to Resend API if Gmail is not configured in .env.local
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
        subject: `Next Step: Upload your CV for the ${role} position`,
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

    return NextResponse.json({ success: true, candidateId: candidateData.id });
  } catch (err: any) {
    console.error('Send Invite Error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
