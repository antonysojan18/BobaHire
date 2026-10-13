import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAppBaseUrl } from '@/lib/url';
import {
  sendWhatsAppMessage,
  normalizePhoneNumber,
} from '@/lib/whatsapp';

/**
 * 1. WHATSAPP WEBHOOK VERIFICATION (GET)
 * Meta calls this when configuring the Webhook URL in Meta App Dashboard > WhatsApp > Configuration
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN =
    process.env.WHATSAPP_VERIFY_TOKEN ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    'bobahire_secret_token_2026';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WhatsApp Webhook verified successfully.');
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden - WhatsApp verification token mismatch', { status: 403 });
}

/**
 * 2. WHATSAPP EVENT INGESTION (POST)
 * Receives delivery status updates (sent, delivered, read, failed)
 * and incoming candidate messages.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // Meta sends: { object: 'whatsapp_business_account', entry: [...] }
    if (body.object === 'whatsapp_business_account' && Array.isArray(body.entry)) {
      const baseUrl = getAppBaseUrl(req);

      for (const entry of body.entry) {
        if (!Array.isArray(entry.changes)) continue;

        for (const change of entry.changes) {
          const value = change.value;
          if (!value) continue;

          // A. Handle Message Delivery Status Updates (sent, delivered, read, failed)
          if (Array.isArray(value.statuses)) {
            for (const statusObj of value.statuses) {
              const { id: messageId, status, recipient_id, errors } = statusObj;
              console.log(`WhatsApp Status Update: Message ${messageId} to ${recipient_id} is now [${status}]`);
              if (errors && errors.length > 0) {
                console.warn(`WhatsApp Delivery Error for ${recipient_id}:`, errors);
              }
            }
          }

          // B. Handle Incoming Messages (Candidate texting BobaLive WhatsApp)
          if (Array.isArray(value.messages)) {
            for (const message of value.messages) {
              const fromPhone = message.from; // e.g. "919876543210"
              const messageText = message.text?.body?.trim() || '';
              console.log(`Received WhatsApp message from ${fromPhone}: "${messageText}"`);

              // Try to locate candidate by phone number
              try {
                const normalized = normalizePhoneNumber(fromPhone);
                const { data: candidates } = await supabase
                  .from('candidates')
                  .select('*')
                  .or(`phone.eq.${fromPhone},phone.eq.${normalized},phone.ilike.%${fromPhone.slice(-10)}%`)
                  .limit(1);

                const candidate = candidates?.[0];

                if (candidate && !candidate.resume_url) {
                  // Candidate hasn't uploaded their resume yet — reply with their resume upload link!
                  const uploadUrl = `${baseUrl}/upload?id=${candidate.id}&name=${encodeURIComponent(
                    candidate.name
                  )}&role=${encodeURIComponent(candidate.role || 'Cafe Staff')}`;

                  await sendWhatsAppMessage({
                    name: candidate.name,
                    phone: fromPhone,
                    role: candidate.role,
                    uploadUrl,
                    type: 'invite',
                  });

                  console.log(`Auto-replied to candidate ${candidate.name} with resume upload link via WhatsApp.`);
                }
              } catch (candidateErr) {
                console.error('Error finding candidate for incoming WhatsApp message:', candidateErr);
              }
            }
          }
        }
      }

      // Meta requires 200 OK response with 'EVENT_RECEIVED' or similar confirmation
      return new Response('EVENT_RECEIVED', { status: 200 });
    }

    return NextResponse.json({ status: 'ignored' }, { status: 200 });
  } catch (err: any) {
    console.error('WhatsApp Webhook Error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
