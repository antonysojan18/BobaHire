import { NextResponse } from 'next/server';

/**
 * 1. META WEBHOOK VERIFICATION (GET)
 * Meta calls this endpoint with hub.challenge when you configure the Webhook URL in Meta App Dashboard.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN =
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    'bobahire_secret_token_2026';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Meta / WhatsApp Webhook verified successfully.');
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

import { processCandidateLead } from '@/lib/lead-processor';

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

    // Support WhatsApp Business Account events if unified with page webhook
    if (body.object === 'whatsapp_business_account') {
      return new Response('EVENT_RECEIVED', { status: 200 });
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
                fieldMap.job_title ||
                '';
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
    const roleInput = String(body.role || body.job_title || body.form_name || body.ad_name || '').trim();
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
