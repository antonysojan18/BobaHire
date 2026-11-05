import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import {
  extractGoogleSheetExportUrl,
  normalizeMetaRow,
  processCandidateLead,
} from '@/lib/lead-processor';

/**
 * Fetch and parse CSV from a Google Sheets public or view-shared URL
 * with multi-strategy fallback (Standard CSV Export, GViz CSV, and gid fallbacks)
 */
async function fetchGoogleSheetRows(sheetUrl: string): Promise<Record<string, any>[]> {
  const exportInfo = extractGoogleSheetExportUrl(sheetUrl);
  if (!exportInfo) {
    throw new Error(
      'Invalid Google Sheet link. Please provide a standard Google Sheets URL (e.g. https://docs.google.com/spreadsheets/d/...)'
    );
  }

  const urlsToTry =
    exportInfo.candidateUrls && exportInfo.candidateUrls.length > 0
      ? exportInfo.candidateUrls
      : [exportInfo.exportUrl];

  let lastStatus: number | null = null;
  let lastErrorMsg = '';
  let csvText = '';
  let fetchSucceeded = false;

  for (const targetUrl of urlsToTry) {
    try {
      const sep = targetUrl.includes('?') ? '&' : '?';
      const freshUrl = `${targetUrl}${sep}_ts=${Date.now()}`;

      const res = await fetch(freshUrl, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/csv,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        cache: 'no-store',
        redirect: 'follow',
      });

      lastStatus = res.status;

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          lastErrorMsg =
            'Cannot access the Google Sheet. Please ensure sharing is set to "Anyone with the link can view".';
        } else if (res.status === 400) {
          lastErrorMsg =
            'Google Sheets responded with error code 400 (Bad Request). Please check that the sheet link is valid and the selected tab exists.';
        } else if (res.status === 404) {
          lastErrorMsg =
            'Google Sheet not found (404). Please verify that the sheet ID is correct and the spreadsheet has not been deleted.';
        } else {
          lastErrorMsg = `Google Sheets responded with error code: ${res.status}`;
        }
        continue;
      }

      const text = await res.text();

      // If redirected to Google accounts login page
      if (
        text.includes('accounts.google.com') &&
        (text.includes('ServiceLogin') || text.includes('Sign in') || text.includes('identifier'))
      ) {
        lastErrorMsg =
          'Google Sheet requires login. Please click "Share" in Google Sheets and select "Anyone with the link can view".';
        continue;
      }

      // If Google Docs returned an HTML error page instead of tabular CSV content
      if (
        text.includes('<!DOCTYPE html>') &&
        (text.includes('Google Docs - Error') ||
          text.includes('Error 400') ||
          text.includes("We're sorry...") ||
          text.includes('Page Not Found'))
      ) {
        lastErrorMsg =
          'Google Sheets returned an error page. Please ensure the link is public and the sheet exists.';
        continue;
      }

      // Valid CSV text obtained
      csvText = text;
      fetchSucceeded = true;
      break;
    } catch (err: any) {
      lastErrorMsg = err?.message || 'Network error fetching Google Sheet';
    }
  }

  if (!fetchSucceeded) {
    if (lastStatus === 400) {
      throw new Error(
        'Google Sheets responded with error code 400. Please ensure the Google Sheet link is correct, the tab exists, and sharing is set to "Anyone with the link can view".'
      );
    }
    throw new Error(
      lastErrorMsg ||
        'Cannot access the Google Sheet. Please ensure sharing is set to "Anyone with the link can view".'
    );
  }

  // Parse CSV text with XLSX
  const workbook = XLSX.read(csvText, { type: 'string' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
  return rows;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'sync'; // 'preview' | 'sync'
    const sendInvites = body.sendInvites !== false; // default true
    const sheetUrl = body.sheetUrl ? String(body.sheetUrl).trim() : '';
    const roleOverride = body.role ? String(body.role).trim() : '';

    let rawRows: Record<string, any>[] = [];

    // 1. If raw rows were provided directly (from client CSV parse or Google Apps Script push)
    if (Array.isArray(body.rows) && body.rows.length > 0) {
      rawRows = body.rows;
    } else if (body.row && typeof body.row === 'object') {
      rawRows = [body.row];
    } else if (sheetUrl) {
      // 2. Fetch from Google Sheets URL
      rawRows = await fetchGoogleSheetRows(sheetUrl);
    } else {
      return NextResponse.json(
        { error: 'Please provide either a valid Google Sheet URL or row data.' },
        { status: 400 }
      );
    }

    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json({
        success: true,
        totalRows: 0,
        newLeadsCount: 0,
        existingCount: 0,
        leads: [],
        message: 'No candidate rows found in the sheet.',
      });
    }

    // 3. Normalize rows into lead objects
    const normalizedLeads = rawRows
      .map((row) => normalizeMetaRow(row))
      .filter((lead) => !!lead.email && lead.email.includes('@'));

    if (normalizedLeads.length === 0) {
      return NextResponse.json({
        success: true,
        totalRows: rawRows.length,
        newLeadsCount: 0,
        existingCount: 0,
        leads: [],
        message: 'No rows with valid email addresses found in the provided data.',
      });
    }

    // 4. Check existing candidate emails from Supabase
    const emails = normalizedLeads.map((l) => l.email);
    const { data: existingRecords } = await supabase
      .from('candidates')
      .select('id, email, phone, role, status, resume_url')
      .in('email', emails);

    const existingEmailMap = new Map<string, any>();
    if (existingRecords) {
      for (const rec of existingRecords) {
        existingEmailMap.set(rec.email.toLowerCase(), rec);
      }
    }

    // A. PREVIEW MODE ONLY
    if (action === 'preview') {
      const previewList = normalizedLeads.map((lead) => {
        const existing = existingEmailMap.get(lead.email.toLowerCase());
        return {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          roleInput: roleOverride || lead.roleInput,
          city: lead.residingCity,
          isExisting: !!existing,
          existingStatus: existing?.status || null,
          hasResume: !!existing?.resume_url,
        };
      });

      const newCount = previewList.filter((l) => !l.isExisting).length;
      const existingCount = previewList.filter((l) => l.isExisting).length;

      return NextResponse.json({
        success: true,
        action: 'preview',
        totalFound: normalizedLeads.length,
        newCount,
        existingCount,
        leads: previewList,
      });
    }

    // B. FULL SYNC / IMPORT MODE
    const results = [];
    let newCount = 0;
    let existingCount = 0;
    let emailsSent = 0;
    let whatsappSent = 0;

    for (const lead of normalizedLeads) {
      try {
        const isAlreadySaved = existingEmailMap.has(lead.email.toLowerCase());

        const res = await processCandidateLead(
          {
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            roleInput: roleOverride || lead.roleInput,
            metaLeadId: lead.metaLeadId,
            homeState: lead.homeState,
            residingCity: lead.residingCity,
            leadStatus: lead.leadStatus,
            fields: lead.fields,
            sendInvites: sendInvites,
          },
          req
        );

        if (res.isExisting || isAlreadySaved) {
          existingCount++;
        } else {
          newCount++;
        }

        if (res.emailDispatched) emailsSent++;
        if (res.whatsappDispatched) whatsappSent++;

        results.push(res);
      } catch (leadErr: any) {
        console.error(`Failed to ingest lead ${lead.email}:`, leadErr?.message);
      }
    }

    return NextResponse.json({
      success: true,
      action: 'sync',
      totalProcessed: results.length,
      newCount,
      existingCount,
      emailsSent,
      whatsappSent,
      leads: results,
    });
  } catch (err: any) {
    console.error('Google Sheets Sync API Error:', err);
    return NextResponse.json(
      { error: err.message || 'An error occurred while syncing Google Sheets leads' },
      { status: 500 }
    );
  }
}
