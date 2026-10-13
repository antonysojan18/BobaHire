/**
 * WhatsApp Business Cloud API & Messaging Integration Service for BobaLive (BobaHire)
 * 
 * Supports:
 * 1. Meta WhatsApp Cloud API (Graph API v21.0) for automated background message dispatch.
 * 2. Automatic phone number normalization (supports E.164, India local 10-digit, international prefixes).
 * 3. Structured resume upload invitation & reminder templates with link previews.
 * 4. Fallback wa.me direct links for one-click manual recruiter messaging or local dev.
 */

export interface WhatsAppSendOptions {
  name: string;
  phone: string;
  role: string;
  uploadUrl: string;
  type?: 'invite' | 'reminder' | 'custom';
  customMessage?: string;
  templateName?: string;
  templateLanguage?: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  notConfigured?: boolean;
  channel?: 'cloud_api' | 'wa_link';
  messageId?: string;
  phone?: string;
  waLink?: string;
  messageText?: string;
  error?: string;
  details?: any;
}

/**
 * Normalizes any phone number into clean E.164 digits format (without '+').
 * Examples:
 *   "+91 98765-43210" -> "919876543210"
 *   "9876543210" (10 digits) -> "919876543210" (defaulting to country code 91)
 *   "09876543210" -> "919876543210"
 *   "p:+919876543210" -> "919876543210"
 */
export function normalizePhoneNumber(rawPhone: string, defaultCountryCode?: string): string {
  if (!rawPhone) return '';

  const defaultCc = (defaultCountryCode || process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');

  // Strip prefixes like "p:", "tel:", whitespace, and non-digit characters except '+'
  let cleaned = rawPhone.trim().replace(/^(?:p:|tel:)/i, '');
  cleaned = cleaned.replace(/[^\d+]/g, '');

  // If starts with '+', remove it
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // If starts with '00' (international call prefix), remove it
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }

  // If 11 digits starting with 0 (e.g. 09876543210 in India), drop leading 0 and add default country code
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = defaultCc + cleaned.substring(1);
  }

  // If 10 digits without country code, prepend default country code (e.g. 91 for India)
  if (cleaned.length === 10) {
    cleaned = defaultCc + cleaned;
  }

  return cleaned;
}

/**
 * Validates whether a phone number appears to be a plausible WhatsApp number.
 */
export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  // E.164 numbers are typically 10 to 15 digits
  return /^\d{10,15}$/.test(normalized);
}

/**
 * Generates the WhatsApp invitation message text with link.
 */
export function buildResumeInviteMessage(name: string, role: string, uploadUrl: string): string {
  const candidateName = (name || 'Candidate').trim();
  const position = (role || 'Open Position').trim();

  return (
    `Hello *${candidateName}*! 🧋\n\n` +
    `Thank you for applying for the *${position}* position at *BobaLive*!\n\n` +
    `To move forward with your application, please click the link below to upload your resume (PDF):\n` +
    `👉 ${uploadUrl}\n\n` +
    `Our AI recruitment system will evaluate your qualifications and guide you through the next steps.\n\n` +
    `_Best regards,_\n` +
    `*BobaLive Recruitment Team*`
  );
}

/**
 * Generates the WhatsApp reminder message text with link.
 */
export function buildResumeReminderMessage(name: string, role: string, uploadUrl: string): string {
  const candidateName = (name || 'Candidate').trim();
  const position = (role || 'Open Position').trim();

  return (
    `Hello *${candidateName}*! ⏰\n\n` +
    `This is a quick reminder regarding your application for the *${position}* position at *BobaLive*.\n\n` +
    `We noticed you haven't uploaded your resume yet. Please click the link below to upload your CV (PDF) to proceed:\n` +
    `👉 ${uploadUrl}\n\n` +
    `_Best regards,_\n` +
    `*BobaLive Recruitment Team*`
  );
}

/**
 * Generates a custom WhatsApp message with optional resume upload link.
 */
export function buildCustomWhatsAppMessage(
  name: string,
  role: string,
  customMessage: string,
  uploadUrl?: string
): string {
  const candidateName = (name || 'Candidate').trim();
  let text = `Hello *${candidateName}*,\n\n${customMessage.trim()}\n`;

  if (uploadUrl) {
    text += `\n📄 *Resume Upload Link:*\n👉 ${uploadUrl}\n`;
  }

  text += `\n_Best regards,_\n*BobaLive Recruitment Team*`;
  return text;
}

/**
 * Builds a direct 'wa.me' click-to-chat URL with prefilled encoded text.
 */
export function buildDirectWhatsAppLink(phone: string, messageText: string): string {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return '';
  return `https://wa.me/${normalized}?text=${encodeURIComponent(messageText)}`;
}

/**
 * Sends a WhatsApp message via Meta WhatsApp Cloud API.
 * Automatically handles text message with link preview or template fallback.
 */
export async function sendWhatsAppMessage(options: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
  const {
    name,
    phone,
    role,
    uploadUrl,
    type = 'invite',
    customMessage,
    templateName,
    templateLanguage = 'en_US',
  } = options;

  const normalizedPhone = normalizePhoneNumber(phone);

  if (!normalizedPhone || !isValidPhoneNumber(normalizedPhone)) {
    return {
      success: false,
      error: `Invalid phone number: "${phone}"`,
      phone: normalizedPhone,
    };
  }

  // Construct message text based on action type
  let messageText = '';
  if (type === 'reminder') {
    messageText = buildResumeReminderMessage(name, role, uploadUrl);
  } else if (type === 'custom' && customMessage) {
    messageText = buildCustomWhatsAppMessage(name, role, customMessage, uploadUrl);
  } else {
    messageText = buildResumeInviteMessage(name, role, uploadUrl);
  }

  const waLink = buildDirectWhatsAppLink(normalizedPhone, messageText);

  // Retrieve Meta WhatsApp Cloud API Credentials
  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    process.env.META_PHONE_NUMBER_ID ||
    '';
  const token =
    process.env.WHATSAPP_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    process.env.META_ACCESS_TOKEN ||
    '';

  // If credentials are not configured, return fallback status with ready-to-use waLink
  if (!phoneNumberId || !token) {
    return {
      success: false,
      notConfigured: true,
      channel: 'wa_link',
      phone: normalizedPhone,
      waLink,
      messageText,
      error:
        'WhatsApp Cloud API credentials (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN) are not configured. Direct WhatsApp link generated.',
    };
  }

  const graphApiUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  // Determine whether to use Template or Text message
  const activeTemplate = templateName || process.env.WHATSAPP_TEMPLATE_NAME;

  try {
    // 1. If template is configured, try sending via Template first
    if (activeTemplate) {
      try {
        const templatePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: 'template',
          template: {
            name: activeTemplate,
            language: { code: templateLanguage },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: name || 'Candidate' },
                  { type: 'text', text: role || 'Cafe Staff' },
                  { type: 'text', text: uploadUrl },
                ],
              },
            ],
          },
        };

        const tplRes = await fetch(graphApiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(templatePayload),
        });

        const tplData = await tplRes.json();

        if (tplRes.ok && tplData.messages?.[0]?.id) {
          return {
            success: true,
            channel: 'cloud_api',
            messageId: tplData.messages[0].id,
            phone: normalizedPhone,
            waLink,
            messageText,
            details: tplData,
          };
        }

        console.warn('WhatsApp template dispatch did not succeed, falling back to direct text:', tplData);
      } catch (templateErr) {
        console.warn('WhatsApp template request error, falling back to text:', templateErr);
      }
    }

    // 2. Dispatch via Direct Text Message with URL preview
    const textPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'text',
      text: {
        preview_url: true,
        body: messageText,
      },
    };

    const textRes = await fetch(graphApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(textPayload),
    });

    const textData = await textRes.json();

    if (!textRes.ok) {
      const errMsg = textData.error?.message || `WhatsApp API error (${textRes.status})`;
      console.error('Meta WhatsApp Cloud API error:', textData);
      return {
        success: false,
        channel: 'cloud_api',
        error: errMsg,
        details: textData,
        phone: normalizedPhone,
        waLink,
        messageText,
      };
    }

    return {
      success: true,
      channel: 'cloud_api',
      messageId: textData.messages?.[0]?.id,
      phone: normalizedPhone,
      waLink,
      messageText,
      details: textData,
    };
  } catch (err: any) {
    console.error('WhatsApp send exception:', err);
    return {
      success: false,
      error: err.message || 'Network error while calling Meta WhatsApp API',
      phone: normalizedPhone,
      waLink,
      messageText,
    };
  }
}
