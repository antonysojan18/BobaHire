import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { candidateId, email, metaLeadId, status, sheetUrl, sheetUpdateUrl } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const normalizedStatus = String(status).trim().toUpperCase();
    if (!['QUALIFIED', 'CONVERTED', 'NOT_INTERESTED', 'NOT INTERESTED'].includes(normalizedStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // 1. Update candidate record in Supabase
    let candidateRecord: any = null;
    if (candidateId) {
      const { data } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .single();
      candidateRecord = data;
    } else if (email) {
      const { data } = await supabase
        .from('candidates')
        .select('*')
        .eq('email', email.trim().toLowerCase())
        .limit(1);
      if (data && data.length > 0) candidateRecord = data[0];
    }

    if (candidateRecord) {
      const currentQ = candidateRecord.questionnaire_data || {};
      const updatedQ = {
        ...currentQ,
        lead_status: normalizedStatus,
        meta_feedback_status: normalizedStatus,
      };

      // Try updating with meta_feedback_status column
      const { error: errUpdate } = await supabase
        .from('candidates')
        .update({
          meta_feedback_status: normalizedStatus,
          questionnaire_data: updatedQ,
        })
        .eq('id', candidateRecord.id);

      // If column meta_feedback_status not present in table schema, update questionnaire_data
      if (errUpdate) {
        await supabase
          .from('candidates')
          .update({
            questionnaire_data: updatedQ,
          })
          .eq('id', candidateRecord.id);
      }
    }

    // 2. Dispatch to Google Apps Script Web App (if provided or configured)
    const scriptUrl =
      (sheetUpdateUrl && String(sheetUpdateUrl).trim()) ||
      process.env.GOOGLE_SHEET_UPDATE_URL ||
      '';

    const targetEmail = (email || candidateRecord?.email || '').trim().toLowerCase();
    const targetLeadId = (metaLeadId || candidateRecord?.meta_lead_id || candidateRecord?.questionnaire_data?.id || '').trim();

    if (scriptUrl) {
      try {
        const scriptRes = await fetch(scriptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            metaLeadId: targetLeadId,
            email: targetEmail,
            status: normalizedStatus,
            sheetUrl: sheetUrl || '',
          }),
          redirect: 'follow',
        });

        const scriptData = await scriptRes.json().catch(() => ({}));
        return NextResponse.json({
          success: true,
          status: normalizedStatus,
          sheetUpdated: scriptData.success !== false,
          scriptResponse: scriptData,
        });
      } catch (scriptErr: any) {
        console.warn('Google Sheet update webhook error:', scriptErr);
        return NextResponse.json({
          success: true,
          status: normalizedStatus,
          sheetUpdated: false,
          sheetError: scriptErr?.message || 'Failed to connect to Google Sheet web app',
        });
      }
    }

    // If no script URL is configured yet
    return NextResponse.json({
      success: true,
      status: normalizedStatus,
      sheetUpdated: false,
      needsSetup: true,
      message: 'Status saved in database. Connect Google Apps Script to auto-sync directly into your Google Sheet column.',
    });
  } catch (err: any) {
    console.error('Error updating lead status:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to update lead status' },
      { status: 500 }
    );
  }
}
