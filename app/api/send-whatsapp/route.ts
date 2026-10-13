import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAppBaseUrl } from '@/lib/url';
import {
  sendWhatsAppMessage,
  normalizePhoneNumber,
  isValidPhoneNumber,
  buildDirectWhatsAppLink,
  buildResumeInviteMessage,
  buildResumeReminderMessage,
  buildCustomWhatsAppMessage,
  type WhatsAppSendResult,
} from '@/lib/whatsapp';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { error: 'Invalid JSON request payload' },
        { status: 400 }
      );
    }

    const baseUrl = getAppBaseUrl(req);

    // 1. Handle Batch Dispatch (array of candidateIds)
    if (Array.isArray(body.candidateIds) && body.candidateIds.length > 0) {
      const { candidateIds, action = 'reminder', customMessage } = body;

      const { data: candidates, error: fetchErr } = await supabase
        .from('candidates')
        .select('*')
        .in('id', candidateIds);

      if (fetchErr) {
        return NextResponse.json(
          { error: `Failed to fetch candidates: ${fetchErr.message}` },
          { status: 500 }
        );
      }

      const results: Array<{
        candidateId: string;
        name: string;
        phone: string;
        result: WhatsAppSendResult;
      }> = [];

      for (const candidate of candidates || []) {
        if (!candidate.phone) {
          results.push({
            candidateId: candidate.id,
            name: candidate.name,
            phone: '',
            result: {
              success: false,
              error: 'Candidate has no phone number on file',
            },
          });
          continue;
        }

        const uploadUrl = `${baseUrl}/upload?id=${candidate.id}&name=${encodeURIComponent(
          candidate.name
        )}&role=${encodeURIComponent(candidate.role || 'Open Position')}`;

        const sendResult = await sendWhatsAppMessage({
          name: candidate.name,
          phone: candidate.phone,
          role: candidate.role,
          uploadUrl,
          type: action === 'invite' ? 'invite' : 'reminder',
          customMessage,
        });

        results.push({
          candidateId: candidate.id,
          name: candidate.name,
          phone: candidate.phone,
          result: sendResult,
        });
      }

      const successCount = results.filter((r) => r.result.success).length;

      return NextResponse.json({
        success: true,
        total: results.length,
        sentCount: successCount,
        results,
      });
    }

    // 2. Handle Single Candidate Dispatch
    let candidateId = String(body.candidateId || '').trim();
    let name = String(body.name || '').trim();
    let phone = String(body.phone || '').trim();
    let role = String(body.role || '').trim();
    let action = String(body.action || 'invite').trim().toLowerCase() as 'invite' | 'reminder' | 'custom';
    let customMessage = String(body.customMessage || '').trim();
    let uploadUrl = String(body.uploadUrl || '').trim();

    // If candidateId is provided but details are missing, fetch candidate from Supabase
    if (candidateId && (!phone || !name || !role)) {
      const { data: candidateRecord } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .single();

      if (candidateRecord) {
        name = name || candidateRecord.name;
        phone = phone || candidateRecord.phone || '';
        role = role || candidateRecord.role;
      }
    }

    if (!phone) {
      return NextResponse.json(
        { error: 'Candidate phone number is required for WhatsApp dispatch' },
        { status: 400 }
      );
    }

    if (!isValidPhoneNumber(phone)) {
      return NextResponse.json(
        { error: `The phone number "${phone}" is not a valid WhatsApp mobile number.` },
        { status: 400 }
      );
    }

    // Auto-generate resume upload URL if candidateId exists and uploadUrl was not provided
    if (!uploadUrl && candidateId) {
      uploadUrl = `${baseUrl}/upload?id=${candidateId}&name=${encodeURIComponent(
        name || 'Candidate'
      )}&role=${encodeURIComponent(role || 'Open Position')}`;
    }

    const result = await sendWhatsAppMessage({
      name: name || 'Candidate',
      phone,
      role: role || 'Open Position',
      uploadUrl,
      type: action,
      customMessage: customMessage || undefined,
    });

    return NextResponse.json({
      candidateId: candidateId || undefined,
      ...result,
    });
  } catch (err: any) {
    console.error('API Send WhatsApp Error:', err);
    return NextResponse.json(
      { error: err.message || 'Server error processing WhatsApp request' },
      { status: 500 }
    );
  }
}
