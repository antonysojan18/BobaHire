import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

// Initialize AI provider dynamically (Supports free Groq, Gemini, or OpenAI API keys)
const isGroq = !!process.env.GROQ_API_KEY;
const isGemini = !!process.env.GEMINI_API_KEY;

const apiKey =
  process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

const baseURL = isGroq
  ? 'https://api.groq.com/openai/v1'
  : isGemini
  ? 'https://generativelanguage.googleapis.com/v1beta/openai/'
  : undefined;

const aiModel = isGroq
  ? 'llama-3.3-70b-versatile'
  : isGemini
  ? 'gemini-3.6-flash'
  : 'gpt-4o-mini';

const openai = new OpenAI({ apiKey: apiKey || 'dummy-key', baseURL });

// Construct dynamic system prompt based on role and meta lead data
function generateEvaluationPrompt(role: string, questionnaire: Record<string, any>, resumeText: string): string {
  const isGM = role.toLowerCase().includes('general manager') || role.toLowerCase().includes('gm');

  if (isGM) {
    return `
You are an Executive Recruitment Auditor for "Boba Live", a high-growth bubble tea and specialty beverage chain.
You are evaluating a candidate for the position: "General Manager".

The candidate submitted the following preliminary answers in their Meta Lead Ad application:
- 5+ Years Managerial Experience Claimed: ${questionnaire.five_plus_years_exp ? 'Yes' : 'No'}
- Multi-Outlet Management Claimed: ${questionnaire.multi_outlet_managed ? 'Yes' : 'No'}
- Scale of Previous Experience: ${questionnaire.outlet_scale || 'None'}
- Stated Responsibilities: ${questionnaire.responsibilities || 'None'}
- Currently Residing in Kochi: ${questionnaire.residing_in_kochi ? 'Yes' : 'No'}

Candidate Resume Text:
"""
${resumeText}
"""

Evaluate and score this candidate strictly against the following 100-Point General Manager Rubric:

1. Multi-Outlet Operations & P&L Management (Max 35 points):
   - 35 pts: Documented track record of managing 5+ outlets or high-volume multi-unit restaurant/cafe operations.
   - 25 pts: Experience managing 2–4 outlets with direct P&L, inventory, and cost control responsibility.
   - 10 pts: Single unit restaurant manager / assistant manager experience only.
   - 0 pts: No proven multi-unit managerial leadership in hospitality.

2. People Leadership, Hiring & Team Development (Max 25 points):
   - 25 pts: Strong background in recruitment, staff training, shift scheduling, and retention management across multiple store teams.
   - 15 pts: Direct team supervision (10+ staff members) in a single branch.
   - 0 pts: Minimal to no supervisory experience.

3. QSR / Specialty Beverage & Cafe Industry Relevance (Max 20 points):
   - 20 pts: Direct leadership background in QSR, quick-service cafe, coffee chain, or bubble tea brands.
   - 10 pts: Broader hospitality background (fine dining, hotel F&B, retail store operations).
   - 0 pts: Unrelated industry background.

4. Resume Consistency & Verification (Max 20 points):
   - Cross-check their Meta questionnaire claims against the resume.
   - 20 pts: Work history dates, roles, and accomplishments fully support their 5+ year and multi-outlet claims.
   - 10 pts: Minor discrepancies or vague tenure timelines.
   - 0 pts: Resume directly contradicts self-reported lead ad experience claims.

Return ONLY a valid JSON object matching this schema:
{
  "total_score": <number between 0 and 100>,
  "criteria_breakdown": {
    "experience_points": <number 0-35>,
    "skills_points": <number 0-25>,
    "communication_points": <number 0-20>,
    "stability_education_points": <number 0-20>
  },
  "summary": "<2-3 sentence executive hiring summary>",
  "meta_verification_status": "Verified" | "Discrepancy Noted" | "Unverified",
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "recommendation": "Strongly Recommended" | "Recommended" | "Not Recommended"
}
`;
  } else {
    // Frontline Cafe Staff / Barista Rubric
    return `
You are an HR Recruitment Auditor for "Boba Live", evaluating a candidate for: "Cafe Staff / Barista (Frontline)".

The candidate submitted the following preliminary answers in their Meta Lead Ad application:
- Prior Fast Food / QSR Experience Claimed: ${questionnaire.qsr_experience ? 'Yes' : 'No'}
- Experience Duration Claimed: ${questionnaire.experience_duration || '0'}
- Bubble Tea & Coffee Handling Willingness: ${questionnaire.bubble_tea_and_coffee_ready ? 'Yes' : 'No'}
- Top Brand Exposure (Starbucks/CCD/KFC/McDonald's/etc.): ${questionnaire.top_brand_experience ? 'Yes' : 'No'}
- Home State: ${questionnaire.home_state || 'Kerala'}

Candidate Resume Text:
"""
${resumeText}
"""

Evaluate and score this candidate strictly against the following 100-Point Frontline Barista Rubric:

1. Relevant Beverage & QSR Experience (Max 40 points):
   - 40 pts: 1+ years direct hands-on experience in specialty coffee, bubble tea, or fast-paced QSR chains.
   - 25 pts: Less than 1 year in QSR or general food service/waitstaff experience.
   - 0 pts: No relevant food service/beverage experience.

2. Equipment & Technical Preparation Skills (Max 30 points):
   - 30 pts: Proven proficiency with espresso machines, milk steaming, POS billing systems, syrup/recipe consistency, and hygiene protocols.
   - 15 pts: General kitchen/counter assistance skills without specialized machine handling.
   - 0 pts: No technical barista exposure.

3. Customer Service & Counter Speed (Max 15 points):
   - 15 pts: Strong customer-facing track record, order accuracy, upselling, and active collaboration during rush hours.
   - 8 pts: Basic customer support experience.
   - 0 pts: No customer interaction history.

4. Stability & Questionnaire Verification (Max 15 points):
   - 15 pts: Resume aligns with self-reported QSR experience claims and exhibits steady job tenures.
   - 5 pts: Resume shows short tenures (<3 months frequent job hopping) or vague roles.
   - 0 pts: Experience claim from lead form is absent or fabricated.

Return ONLY a valid JSON object matching this schema:
{
  "total_score": <number between 0 and 100>,
  "criteria_breakdown": {
    "experience_points": <number 0-40>,
    "skills_points": <number 0-30>,
    "communication_points": <number 0-15>,
    "stability_education_points": <number 0-15>
  },
  "summary": "<2-3 sentence hiring review>",
  "meta_verification_status": "Verified" | "Discrepancy Noted" | "Unverified",
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "recommendation": "Strongly Recommended" | "Recommended" | "Not Recommended"
}
`;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || !body.candidateId || !body.resumeUrl) {
      return NextResponse.json(
        { error: 'Missing required parameters candidateId or resumeUrl' },
        { status: 400 }
      );
    }

    const { candidateId, resumeUrl, role = 'Open Position' } = body;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'No AI API key found. Please set GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY in .env.local',
        },
        { status: 500 }
      );
    }

    // Fetch candidate record from Supabase DB to retrieve questionnaire_data & effective role
    const { data: candidateRecord } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', candidateId)
      .single();

    const questionnaire = candidateRecord?.questionnaire_data || body.questionnaire || {};
    const effectiveRole = candidateRecord?.role || role || 'Cafe Staff';

    // 1. Download the PDF from the Supabase public URL
    let arrayBuffer: ArrayBuffer;
    try {
      const pdfResponse = await fetch(resumeUrl);
      if (!pdfResponse.ok) {
        return NextResponse.json(
          { error: `Failed to download PDF resume: HTTP ${pdfResponse.status}` },
          { status: 400 }
        );
      }
      arrayBuffer = await pdfResponse.arrayBuffer();
    } catch (fetchErr: any) {
      return NextResponse.json(
        { error: `Network error downloading resume PDF: ${fetchErr.message}` },
        { status: 400 }
      );
    }

    // 2. Extract raw text from the PDF safely
    let extractedText = '';
    try {
      const buffer = Buffer.from(arrayBuffer);
      const pdfData = await pdfParse(buffer);
      extractedText = (pdfData.text || '').trim();
    } catch (parseErr: any) {
      console.warn('PDF parsing warning:', parseErr);
      extractedText = 'Scanned or image-based PDF document without extractable text.';
    }

    if (!extractedText) {
      extractedText = 'No text content could be extracted from this PDF file.';
    }

    // 3. Generate dynamic role-aware system prompt
    const prompt = generateEvaluationPrompt(effectiveRole, questionnaire, extractedText);

    // 4. Run the evaluation through AI safely
    let aiEvaluation: any;
    try {
      const completion = await openai.chat.completions.create({
        model: aiModel,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      });

      const rawContent = completion.choices[0]?.message?.content || '{}';
      const cleanedJson = rawContent
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      aiEvaluation = JSON.parse(cleanedJson);
    } catch (openAiErr: any) {
      console.error('AI Evaluation Error:', openAiErr);
      if (openAiErr?.code === 'credit_balance_exhausted' || openAiErr?.status === 429) {
        return NextResponse.json(
          {
            error:
              'AI API quota limit reached. Please check your billing credits or add a free GEMINI_API_KEY / GROQ_API_KEY in .env.local',
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: `AI Evaluation failed: ${openAiErr.message}` },
        { status: 500 }
      );
    }

    // Ensure score and breakdown structure are sanitized with defaults
    const totalScore = typeof aiEvaluation.total_score === 'number' ? aiEvaluation.total_score : 0;
    const sanitizedEvaluation = {
      total_score: totalScore,
      criteria_breakdown: {
        experience_points: aiEvaluation.criteria_breakdown?.experience_points ?? 0,
        skills_points: aiEvaluation.criteria_breakdown?.skills_points ?? 0,
        communication_points: aiEvaluation.criteria_breakdown?.communication_points ?? 0,
        stability_education_points: aiEvaluation.criteria_breakdown?.stability_education_points ?? 0,
      },
      summary: aiEvaluation.summary || 'Resume analyzed and scored by AI.',
      meta_verification_status: aiEvaluation.meta_verification_status || 'Verified',
      strengths: Array.isArray(aiEvaluation.strengths) ? aiEvaluation.strengths : [],
      gaps: Array.isArray(aiEvaluation.gaps) ? aiEvaluation.gaps : [],
      recommendation: aiEvaluation.recommendation || (totalScore >= 70 ? 'Recommended' : 'Not Recommended'),
    };

    // 5. Update Supabase with points & detailed breakdown
    const { error: updateError } = await supabase
      .from('candidates')
      .update({
        resume_url: resumeUrl,
        status: 'reviewed',
        ai_score: sanitizedEvaluation.total_score,
        ai_evaluation: sanitizedEvaluation,
      })
      .eq('id', candidateId);

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, evaluation: sanitizedEvaluation });
  } catch (err: any) {
    console.error('Evaluation Route Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
