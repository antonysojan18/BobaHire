import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { evaluateMetaScreening } from '@/lib/meta-screening';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { getAppBaseUrl } from '@/lib/url';

/**
 * 1. META WEBHOOK VERIFICATION (GET)
 * Meta calls this endpoint with hub.challenge when you configure the Webhook URL in Meta App Dashboard.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'bobahire_secret_token_2026';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Meta Webhook verified successfully.');
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden - Verification token mismatch', { status: 403 });
}

/**
 * Helper to fetch full lead details from Meta Graph API using leadgen_id
 */
async function fetchMetaLeadDetails(leadgenId: string, pageAccessToken: string) {
  const url = `https://graph.facebook.com/v20.0/${leadgenId}?access_token=${pageAccessToken}&fields=created_time,id,ad_id,form_id,field_data`;
  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Meta Graph API error (${res.status}): ${errorText}`);
  }
  return await res.json();
}

/**
 * Helper to process a single candidate lead and dispatch email
 */
async function processCandidateLead(
  leadData: {
    name: string;
    email: string;
    phone?: string;
    roleInput?: string;
    metaLeadId?: string;
    homeState?: string;
    residingCity?: string;
    fields?: Record<string, any>;
  },
  req?: Request
) {
  const name = String(leadData.name || '').trim() || 'Candidate';
  const email = String(leadData.email || '').trim().toLowerCase();
  const phone = String(leadData.phone || '').trim();
  const roleInput = String(leadData.roleInput || 'Cafe Staff / Barista').trim();
  const metaLeadId = String(leadData.metaLeadId || '').trim();
  const homeState = String(leadData.homeState || 'Kerala').trim();
  const residingCity = String(leadData.residingCity || 'Kochi').trim();
  const fields = leadData.fields || {};

  if (!email || !email.includes('@')) {
    throw new Error('A valid candidate email address is required');
  }

  // Run Meta Lead Screening Evaluation Logic
  const screening = evaluateMetaScreening(roleInput, fields);

  // Build payload for Supabase database
  const payload: any = {
    name,
    email,
    phone: phone || null,
    role: screening.normalizedRole,
    residing_city: residingCity || 'Kochi',
    home_state: homeState || 'Kerala',
    meta_lead_id: metaLeadId || null,
    questionnaire_data: screening.questionnaire,
    pre_screen_passed: true,
    status: 'invited',
  };

  let candidateData: any = null;

  // 1. Check if candidate already exists in Supabase
  try {
    const { data: existingRecords } = await supabase
      .from('candidates')
      .select('*')
      .eq('email', email)
      .limit(1);

    if (existingRecords && existingRecords.length > 0) {
      candidateData = existingRecords[0];
    }
  } catch (checkErr) {
    console.warn('Pre-check candidate error:', checkErr);
  }

  // 2. If not found in DB, insert full payload
  if (!candidateData) {
    const { data: insertedFull, error: errFull } = await supabase
      .from('candidates')
      .insert([payload])
      .select();

    if (insertedFull && insertedFull.length > 0) {
      candidateData = insertedFull[0];
    } else {
      console.warn('Full payload insert warning:', errFull?.message);

      // 3. Fallback inserting core fields
      const fallbackPayload = {
        name,
        email,
        phone: phone || null,
        role: screening.normalizedRole,
        residing_city: residingCity || 'Kochi',
        status: 'invited',
      };

      const { data: insertedFallback } = await supabase
        .from('candidates')
        .insert([fallbackPayload])
        .select();

      if (insertedFallback && insertedFallback.length > 0) {
        candidateData = insertedFallback[0];
      } else {
        const { data: retryCheck } = await supabase
          .from('candidates')
          .select('*')
          .eq('email', email)
          .limit(1);

        if (retryCheck && retryCheck.length > 0) {
          candidateData = retryCheck[0];
        }
      }
    }
  }

  // Fallback virtual candidate ID if DB is unreachable
  if (!candidateData || !candidateData.id) {
    candidateData = {
      id: `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      email,
      role: screening.normalizedRole,
    };
  }

  // Dispatch CV upload invite email
  let emailDispatched = false;
  const baseUrl = getAppBaseUrl(req);
  const uploadUrl = `${baseUrl}/upload?id=${candidateData.id}&name=${encodeURIComponent(
    name
  )}&role=${encodeURIComponent(screening.normalizedRole)}`;

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
        Thank you for applying for the <strong>${screening.normalizedRole}</strong> position at BobaLive!
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">
        Please click the button below to upload your resume (PDF) so our AI recruitment team can evaluate your profile and schedule your interview:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${uploadUrl}" style="background-color: #a53861; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 10px rgba(165, 56, 97, 0.25);">
          Upload Your Resume
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
        If you did not apply for this position, you can safely ignore this email.
      </p>
    </div>
  `;

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (gmailUser && gmailPass) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      });

      await transporter.sendMail({
        from: `"BobaLive Hiring Team" <${gmailUser}>`,
        to: email,
        subject: `Next Step: Upload your CV for ${screening.normalizedRole}`,
        html: htmlContent,
      });
      emailDispatched = true;
    } catch (mailErr) {
      console.error('Nodemailer dispatch error:', mailErr);
    }
  } else {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      const { error: resendError } = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: `Next Step: Upload your CV for ${screening.normalizedRole}`,
        html: htmlContent,
      });
      if (!resendError) emailDispatched = true;
    }
  }

  return {
    candidateId: candidateData.id,
    emailDispatched,
    normalizedRole: screening.normalizedRole,
    questionnaire: screening.questionnaire,
  };
}

/**
 * 2. META LEAD INGESTION (POST)
 * Receives native Meta Webhook events or direct flat JSON leads
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON request payload' }, { status: 400 });
    }

    // A. Native Meta Webhook Event Format
    if (body.object === 'page' && Array.isArray(body.entry)) {
      const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
      const results = [];

      for (const entry of body.entry) {
        if (!Array.isArray(entry.changes)) continue;

        for (const change of entry.changes) {
          if (change.field === 'leadgen' && change.value?.leadgen_id) {
            const leadgenId = change.value.leadgen_id;
            console.log(`Received Meta Leadgen ID: ${leadgenId}`);

            if (!pageAccessToken) {
              console.warn('META_PAGE_ACCESS_TOKEN is missing. Cannot fetch lead details from Graph API.');
              continue;
            }

            try {
              const leadDetails = await fetchMetaLeadDetails(leadgenId, pageAccessToken);
              const fieldMap: Record<string, string> = {};

              if (Array.isArray(leadDetails.field_data)) {
                for (const field of leadDetails.field_data) {
                  fieldMap[field.name] = Array.isArray(field.values) ? field.values[0] : field.values;
                }
              }

              // Extract normalized values from field map
              const name =
                fieldMap.full_name ||
                fieldMap.name ||
                `${fieldMap.first_name || ''} ${fieldMap.last_name || ''}`.trim() ||
                'Candidate';
              const email = fieldMap.email || fieldMap.email_address || '';
              const phone = fieldMap.phone_number || fieldMap.phone || '';
              const roleInput =
                fieldMap.job_role ||
                fieldMap.position ||
                fieldMap.role ||
                fieldMap.form_name ||
                'Cafe Staff / Barista';
              const homeState = fieldMap.home_state || fieldMap.state || fieldMap.please_select_your_home_state || 'Kerala';
              const residingCity = fieldMap.residing_city || fieldMap.city || fieldMap.location || 'Kochi';

              if (email) {
                const processed = await processCandidateLead(
                  {
                    name,
                    email,
                    phone,
                    roleInput,
                    metaLeadId: leadgenId,
                    homeState,
                    residingCity,
                    fields: fieldMap,
                  },
                  req
                );
                results.push(processed);
              }
            } catch (fetchErr: any) {
              console.error(`Failed to fetch Meta lead ${leadgenId}:`, fetchErr.message);
            }
          }
        }
      }

      return NextResponse.json({ success: true, processedCount: results.length, leads: results });
    }

    // B. Direct JSON / Testing / Form export payload format
    const name = String(body.name || body.full_name || '').trim() || 'Candidate';
    const email = String(body.email || body.email_address || '').trim().toLowerCase();
    const phone = String(body.phone || body.phone_number || '').trim();
    const roleInput = String(body.role || body.job_title || body.form_name || body.ad_name || 'Cafe Staff / Barista').trim();
    const metaLeadId = String(body.meta_lead_id || body.lead_id || body.id || '').trim();
    const homeState = String(body.home_state || body.state || body.please_select_your_home_state || '').trim();
    const residingCity = String(body.residing_city || body.city || body.location || '').trim();
    const fields = body.fields || body.questionnaire || body;

    const result = await processCandidateLead(
      {
        name,
        email,
        phone,
        roleInput,
        metaLeadId,
        homeState,
        residingCity,
        fields,
      },
      req
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('Meta Webhook Error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
