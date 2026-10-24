import { supabase } from '@/lib/supabase';
import { evaluateMetaScreening } from '@/lib/meta-screening';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { getAppBaseUrl } from '@/lib/url';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export interface RawLeadData {
  name: string;
  email: string;
  phone?: string;
  roleInput?: string;
  metaLeadId?: string;
  homeState?: string;
  residingCity?: string;
  leadStatus?: string;
  fields?: Record<string, any>;
  sendInvites?: boolean;
}

export interface ProcessLeadResult {
  candidateId: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  isExisting: boolean;
  emailDispatched: boolean;
  whatsappDispatched: boolean;
  whatsappResult?: any;
  normalizedRole: string;
  questionnaire: Record<string, any>;
}

/**
 * Extracts the CSV export URL from any public or shared Google Sheets link.
 */
export function extractGoogleSheetExportUrl(inputUrl: string): {
  exportUrl: string;
  sheetId: string;
  gid: string;
} | null {
  try {
    const rawUrl = inputUrl.trim();
    if (!rawUrl.includes('docs.google.com/spreadsheets')) {
      return null;
    }

    // Match /d/{sheetId}
    const idMatch = rawUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch || !idMatch[1]) {
      return null;
    }
    const sheetId = idMatch[1];

    // Match gid (tab id) if present
    let gid = '0';
    const gidParamMatch = rawUrl.match(/[?&#]gid=([0-9]+)/);
    if (gidParamMatch && gidParamMatch[1]) {
      gid = gidParamMatch[1];
    }

    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    return { exportUrl, sheetId, gid };
  } catch (err) {
    console.error('Error extracting Google Sheet export URL:', err);
    return null;
  }
}

/**
 * Robust normalizer for rows coming from Meta Ads CSV exports, Meta CRM Google Sheets, or Zapier.
 * Handles diverse header names gracefully.
 */
export function normalizeMetaRow(row: Record<string, any>): {
  name: string;
  email: string;
  phone: string;
  roleInput: string;
  metaLeadId: string;
  homeState: string;
  residingCity: string;
  leadStatus: string;
  fields: Record<string, any>;
} {
  const getField = (...candidates: string[]): string => {
    const keys = Object.keys(row);
    for (const target of candidates) {
      const cleanTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = keys.find(
        (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget
      );
      if (match && row[match] !== undefined && row[match] !== null && String(row[match]).trim() !== '') {
        return String(row[match]).trim();
      }
    }
    // Partial substring fallback
    for (const target of candidates) {
      const cleanTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = keys.find((k) =>
        k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanTarget)
      );
      if (match && row[match] !== undefined && row[match] !== null && String(row[match]).trim() !== '') {
        return String(row[match]).trim();
      }
    }
    return '';
  };

  // Name extraction
  let name = getField('full_name', 'fullname', 'name', 'candidate_name', 'applicant_name');
  if (!name) {
    const firstName = getField('first_name', 'firstname');
    const lastName = getField('last_name', 'lastname');
    if (firstName || lastName) {
      name = `${firstName} ${lastName}`.trim();
    }
  }
  if (!name) name = 'Candidate';

  // Email extraction
  const email = getField('email', 'email_address', 'emailaddress', 'candidate_email').toLowerCase();

  // Phone extraction
  let phone = getField('phone_number', 'phonenumber', 'phone', 'mobile', 'contact_number', 'contact');
  // Clean phone number (keep leading + or digits)
  phone = phone.replace(/[^\d+]/g, '');

  // Role extraction
  const roleInput = getField(
    'job_role',
    'role',
    'position',
    'job_title',
    'form_name',
    'ad_name',
    'campaign_name',
    'what_position_are_you_applying_for'
  );

  // Meta Lead ID
  const metaLeadId = getField('id', 'lead_id', 'meta_lead_id', 'meta_id');

  // Location / State
  const homeState = getField('home_state', 'state', 'please_select_your_home_state') || 'Kerala';
  const residingCity = getField('residing_city', 'city', 'location', 'current_city') || 'Kochi';

  // Meta CRM Lead Status
  const leadStatus = getField('lead_status', 'leadstatus', 'meta_lead_status', 'status');

  return {
    name,
    email,
    phone,
    roleInput,
    metaLeadId,
    homeState,
    residingCity,
    leadStatus,
    fields: row,
  };
}

/**
 * Process a single candidate lead: evaluates screening, creates/updates in Supabase,
 * and sends email / WhatsApp invitations if requested.
 */
export async function processCandidateLead(
  leadData: RawLeadData,
  req?: Request
): Promise<ProcessLeadResult> {
  const name = String(leadData.name || '').trim() || 'Candidate';
  const email = String(leadData.email || '').trim().toLowerCase();
  const phone = String(leadData.phone || '').trim();
  const roleInput = String(leadData.roleInput || 'Cafe Staff').trim();
  const metaLeadId = String(leadData.metaLeadId || '').trim();
  const homeState = String(leadData.homeState || 'Kerala').trim();
  const residingCity = String(leadData.residingCity || 'Kochi').trim();
  const rawLeadStatus = String(leadData.leadStatus || '').trim().toUpperCase();
  const fields = leadData.fields || {};
  const shouldSendInvites = leadData.sendInvites !== false; // Default true

  if (!email || !email.includes('@')) {
    throw new Error('A valid candidate email address is required');
  }

  // Run Meta Lead Screening Evaluation Logic
  const screening = evaluateMetaScreening(roleInput, fields);
  if (rawLeadStatus) {
    screening.questionnaire.lead_status = rawLeadStatus;
    screening.questionnaire.meta_feedback_status = rawLeadStatus;
  }

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
  if (rawLeadStatus) {
    payload.meta_feedback_status = rawLeadStatus;
  }

  let candidateData: any = null;
  let isExisting = false;

  // 1. Check if candidate already exists in Supabase
  try {
    const { data: existingRecords } = await supabase
      .from('candidates')
      .select('*')
      .eq('email', email)
      .limit(1);

    if (existingRecords && existingRecords.length > 0) {
      candidateData = existingRecords[0];
      isExisting = true;

      // Update phone/meta_lead_id/lead_status if missing or changed
      const updateData: any = {};
      if (phone && candidateData.phone !== phone) updateData.phone = phone;
      if (metaLeadId && !candidateData.meta_lead_id) updateData.meta_lead_id = metaLeadId;
      if (rawLeadStatus) {
        const currQ = candidateData.questionnaire_data || {};
        updateData.questionnaire_data = {
          ...currQ,
          lead_status: rawLeadStatus,
          meta_feedback_status: rawLeadStatus,
        };
        updateData.meta_feedback_status = rawLeadStatus;
      }

      if (Object.keys(updateData).length > 0) {
        try {
          const { data: updatedRecord, error: updateErr } = await supabase
            .from('candidates')
            .update(updateData)
            .eq('id', candidateData.id)
            .select();

          if (updateErr) {
            delete updateData.meta_feedback_status;
            const { data: retryRecord } = await supabase
              .from('candidates')
              .update(updateData)
              .eq('id', candidateData.id)
              .select();
            if (retryRecord && retryRecord.length > 0) {
              candidateData = retryRecord[0];
            }
          } else if (updatedRecord && updatedRecord.length > 0) {
            candidateData = updatedRecord[0];
          }
        } catch (updateErr) {
          console.warn('Could not update existing candidate record:', updateErr);
        }
      }
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

      delete payload.meta_feedback_status;
      const { data: insertedFallbackQ } = await supabase
        .from('candidates')
        .insert([payload])
        .select();

      if (insertedFallbackQ && insertedFallbackQ.length > 0) {
        candidateData = insertedFallbackQ[0];
      } else {
        // Fallback inserting core fields
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
            isExisting = true;
          }
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

  const baseUrl = getAppBaseUrl(req);
  const uploadUrl = `${baseUrl}/upload?id=${candidateData.id}&name=${encodeURIComponent(
    name
  )}&role=${encodeURIComponent(screening.normalizedRole)}`;

  let emailDispatched = false;
  let whatsappDispatched = false;
  let whatsappResult: any = null;

  // Only dispatch invite if shouldSendInvites is enabled AND candidate is either newly created or doesn't have a resume yet
  const needsInvite = !candidateData.resume_url;

  if (shouldSendInvites && needsInvite) {
    // A. Dispatch CV upload invite email
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

    // B. Dispatch WhatsApp resume upload invite if phone number is available
    if (phone) {
      try {
        whatsappResult = await sendWhatsAppMessage({
          name,
          phone,
          role: screening.normalizedRole,
          uploadUrl,
          type: 'invite',
        });
        whatsappDispatched = !!whatsappResult?.success;
      } catch (waErr) {
        console.error('WhatsApp dispatch error during lead process:', waErr);
      }
    }
  }

  return {
    candidateId: candidateData.id,
    name,
    email,
    phone: phone || null,
    role: screening.normalizedRole,
    isExisting,
    emailDispatched,
    whatsappDispatched,
    whatsappResult,
    normalizedRole: screening.normalizedRole,
    questionnaire: screening.questionnaire,
  };
}
