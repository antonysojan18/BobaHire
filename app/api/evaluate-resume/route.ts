import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

// Initialize AI provider dynamically (Supports Gemini, Groq, or OpenAI API keys)
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
  ? (process.env.GEMINI_MODEL || 'gemini-3.6-flash')
  : 'gpt-4o-mini';

const openai = new OpenAI({ apiKey: apiKey || 'dummy-key', baseURL });

/**
 * Generate evaluation prompt for BARISTA role (35 criteria)
 */
function generateBaristaPrompt(questionnaire: Record<string, any>, resumeText: string): string {
  return `
You are a Senior Recruitment & Technical Barista Auditor for "Boba Live", a specialty coffee and bubble tea beverage chain.
You are evaluating a candidate's CV for the position: "Barista".

==================================================
ROLE ELIGIBILITY CRITERIA & GENERAL REQUIREMENTS
==================================================
Barista Eligibility Criteria:
* Must have completed barista training/course (MANDATORY REQUIREMENT)
* Minimum 1 year experience in the fast food/QSR/beverage industry
* Ability to manage both bubble tea and coffee preparation

General Requirements:
* Age 18–30 preferred (Age must NOT be used as a performance scoring criteria; record only as a factual eligibility observation if present in CV; gender neutral)
* Good communication and customer-handling skills
* Positive attitude and willingness to work
* Ability to maintain cleanliness and follow café standards
* Candidates seeking long-term employment preferred (not short-term/temporary roles)
* Ability to manage both bubble tea and coffee preparation

==================================================
CANDIDATE SELF-REPORTED META QUESTIONNAIRE CLAIMS
==================================================
- Fast Food / QSR Experience Claimed: ${questionnaire.qsr_experience ? 'Yes' : 'No'}
- Claimed Duration: ${questionnaire.experience_duration || '0'}
- Bubble Tea & Coffee Handling Willingness: ${questionnaire.bubble_tea_and_coffee_ready ? 'Yes' : 'No'}
- Top Brand Exposure (Starbucks/CCD/KFC/McDonald's/etc.): ${questionnaire.top_brand_experience ? 'Yes' : 'No'}
- Home State / Location: ${questionnaire.home_state || 'Kerala'}

==================================================
APPLICANT CV TEXT CONTENT
==================================================
"""
${resumeText}
"""

==================================================
BARISTA — 35 AI CV EVALUATION CRITERIA
==================================================
You MUST evaluate the candidate against all 35 criteria across the 7 categories below:

--- Category 1: Mandatory Eligibility ---
1. Barista Training: Has the candidate completed a formal barista training course, certification, or recognized barista program?
2. Barista Qualification Details: Does the CV mention the name, institution, duration, or certification details of the barista training?
3. Relevant Experience: Does the candidate have professional experience working as a barista or in a closely related beverage-service role?
4. Minimum Experience: Does the candidate have at least 1 year of experience in the fast-food, QSR, café, coffee shop, beverage, or similar F&B industry?
5. Coffee Preparation: Does the candidate have practical experience preparing coffee and espresso-based beverages?
6. Coffee Equipment: Does the candidate have experience operating coffee equipment such as espresso machines, grinders, coffee brewers, or similar equipment?
7. Bubble Tea Experience: Does the candidate have practical experience preparing bubble tea, boba, milk tea, fruit tea, or similar beverages?
8. Dual Beverage Capability: Does the candidate's experience demonstrate the ability to independently prepare both coffee and bubble tea products?

--- Category 2: Customer Service & Communication ---
9. Customer Interaction: Does the candidate have regular experience interacting directly with customers?
10. Customer Handling: Does the candidate demonstrate experience taking orders, assisting customers, answering queries, or handling customer requests?
11. Communication Skills: Does the candidate's previous work provide evidence of effective verbal or written communication? Do not rely solely on "good communication skills" being listed in the CV.
12. Complaint Handling: Does the candidate have experience handling customer complaints, difficult customers, or service-related issues?
13. Customer Service Environment: Has the candidate worked in a customer-facing café, QSR, restaurant, retail, hospitality, or similar environment?

--- Category 3: Café / QSR Operations ---
14. High-Volume Environment: Has the candidate worked in a busy or high-volume café, QSR, fast-food outlet, or beverage environment?
15. Order Accuracy & Speed: Does the candidate have experience preparing customer orders accurately and within expected service times?
16. Multitasking: Does the candidate demonstrate the ability to manage multiple responsibilities during service, such as taking orders, preparing beverages, handling payments, and maintaining the workstation?
17. POS Experience: Does the candidate have experience using POS systems, handling billing, or processing customer payments?
18. Equipment Handling: Does the candidate have experience operating, cleaning, or maintaining café/barista equipment?

--- Category 4: Hygiene & Standards ---
19. Cleanliness: Does the candidate have experience maintaining cleanliness of the café, beverage station, equipment, counters, or work area?
20. Food Hygiene: Does the candidate demonstrate knowledge or experience with food hygiene, sanitation, food safety, or café hygiene standards?
21. Food Safety Certification: Does the candidate possess any food safety, hygiene, HACCP, or related certification?
22. Standard Procedures: Does the candidate have experience following standardized recipes, preparation procedures, portion controls, or café operating standards?

--- Category 5: Work Attitude & Teamwork ---
23. Teamwork: Does the candidate demonstrate experience working effectively as part of a café, restaurant, QSR, or F&B team?
24. Responsibility & Initiative: Does the CV show evidence of taking responsibility for additional duties such as opening/closing, stock management, station management, or training junior staff?
25. Adaptability: Does the candidate demonstrate the ability to adapt to different tasks, products, or responsibilities within a fast-paced F&B environment?
26. Service-Oriented Attitude: Does the candidate's work history demonstrate a customer-focused and service-oriented approach? Prioritize evidence from actual responsibilities rather than generic claims such as "positive attitude."

--- Category 6: Long-Term Suitability ---
27. Employment Stability: Does the candidate's employment history show reasonable stability, with previous positions lasting a meaningful period?
28. Long-Term Employment Indicator: Does the candidate have previous employment lasting 1 year or longer, suggesting experience with sustained employment?
29. F&B Career Continuity: Has the candidate demonstrated continued experience or career development within the food, beverage, café, hospitality, or QSR industry?
30. Career Progression: Has the candidate progressed from entry-level F&B roles into positions such as Barista, Senior Barista, Shift Leader, Supervisor, or similar roles?

--- Category 7: Additional Verification ---
31. Missing Mandatory Qualification: Is there insufficient evidence in the CV to verify completion of barista training?
32. Insufficient Experience: Does the CV indicate less than 1 year of relevant QSR/F&B experience, or is the experience duration impossible to verify?
33. Missing Bubble Tea Experience: Is there no identifiable evidence of previous bubble tea/boba preparation experience?
34. Missing Coffee Experience: Is there no identifiable evidence of practical coffee preparation experience?
35. Overall Job Relevance: Based on the complete CV, how closely does the candidate's overall experience match the requirements of a Barista role involving both coffee and bubble tea preparation?

==================================================
SCORING & EVALUATION RULES (100-POINT TOTAL)
==================================================
Score the candidate strictly on a 100-point scale across 4 core pillars:
1. Experience Points (Max 40 points):
   - 1+ years direct experience in coffee shop, cafe, or beverage QSR (40 pts)
   - 6-12 months beverage/QSR or 1+ yr general restaurant/waitstaff (25-30 pts)
   - Entry-level or unrelated food service (10-20 pts)
   - No hospitality/F&B experience (0 pts)

2. Core Skills & Technical Beverage Points (Max 30 points):
   - Certified barista with espresso machine, grinder, milk frothing & boba/bubble tea skills (30 pts)
   - Espresso or boba hands-on experience + basic equipment handling (20-25 pts)
   - Counter/cashier experience with limited beverage preparation (10-15 pts)
   - No beverage preparation experience (0 pts)

3. Customer Service & Operational Speed (Max 15 points):
   - Proven customer interaction, POS billing, order speed, complaint resolution, multitasking (15 pts)
   - Moderate customer service background (8-12 pts)
   - Minimal customer-facing experience (0-5 pts)

4. Stability, Hygiene & Questionnaire Verification (Max 15 points):
   - Steady tenures (1+ yr per job), hygiene awareness/certification, verified against questionnaire (15 pts)
   - Moderate tenure with minor gaps or unverified claims (8-12 pts)
   - High job hopping (<3 months per job) or fabricated claims (0-5 pts)

IMPORTANT:
- Distinguish between "Direct Evidence", "Indirect Evidence", "Not Verified", and "Gap / Risk".
- For each of the 35 questions, specify exact quotes/facts from the CV. If not present, state "Not Verified" or "No evidence found".
- Age and gender must NOT penalize performance score.

Return ONLY a valid JSON object matching this schema:
{
  "total_score": <number 0-100>,
  "criteria_breakdown": {
    "experience_points": <number 0-40>,
    "skills_points": <number 0-30>,
    "communication_points": <number 0-15>,
    "stability_education_points": <number 0-15>
  },
  "mandatory_eligibility": {
    "barista_training_verified": <boolean>,
    "minimum_1_year_qsr_verified": <boolean>,
    "coffee_experience_verified": <boolean>,
    "bubble_tea_experience_verified": <boolean>,
    "dual_beverage_ready": <boolean>,
    "age_eligibility_status": "Eligible (18-30)" | "Out of Range" | "Not Provided in CV",
    "overall_eligible": <boolean>,
    "notes": "<concise summary of mandatory eligibility compliance>"
  },
  "summary": "<2-3 sentence executive recruitment summary>",
  "meta_verification_status": "Verified" | "Discrepancy Noted" | "Unverified",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "recommendation": "Strongly Recommended" | "Recommended" | "Not Recommended",
  "evaluated_questions": [
    {
      "id": 1,
      "category": "Mandatory Eligibility",
      "question": "Barista Training: Has the candidate completed a formal barista training course, certification, or recognized barista program?",
      "status": "Direct Evidence" | "Indirect Evidence" | "Not Verified" | "Gap / Risk",
      "evidence": "<exact quote or specific CV evidence>"
    }
    // ... all 35 questions sequentially from 1 to 35
  ]
}
`;
}

/**
 * Generate evaluation prompt for CAFE STAFF role (35 criteria)
 */
function generateCafeStaffPrompt(questionnaire: Record<string, any>, resumeText: string): string {
  return `
You are a Senior Recruitment Auditor for "Boba Live", evaluating a candidate's CV for: "Cafe Staff".

==================================================
ROLE ELIGIBILITY CRITERIA & GENERAL REQUIREMENTS
==================================================
Cafe Staff Eligibility Criteria:
- Minimum 1 year experience in the fast food/QSR industry
- Ability to manage both bubble tea and coffee preparation

Key Responsibilities:
- Prepare and serve bubble tea, coffee, and café beverages
- Assist customers with orders in a polite and professional manner
- Maintain cleanliness of the café and workstations
- Follow hygiene, safety, and quality standards
- Support daily café operations

General Requirements:
- Age 18–30 preferred (Age must NOT be used as a performance scoring criteria; record only as a factual eligibility observation if present in CV; gender neutral)
- Male and Female candidates welcome
- Good communication and customer-handling skills
- Positive attitude and willingness to work
- Ability to maintain cleanliness and follow café standards
- Candidates seeking long-term employment preferred (not short-term/temporary roles)

==================================================
CANDIDATE SELF-REPORTED META QUESTIONNAIRE CLAIMS
==================================================
- Fast Food / QSR Experience Claimed: ${questionnaire.qsr_experience ? 'Yes' : 'No'}
- Claimed Duration: ${questionnaire.experience_duration || '0'}
- Bubble Tea & Coffee Handling Willingness: ${questionnaire.bubble_tea_and_coffee_ready ? 'Yes' : 'No'}
- Top Brand Exposure (Starbucks/CCD/KFC/McDonald's/etc.): ${questionnaire.top_brand_experience ? 'Yes' : 'No'}
- Home State / Location: ${questionnaire.home_state || 'Kerala'}

==================================================
APPLICANT CV TEXT CONTENT
==================================================
"""
${resumeText}
"""

==================================================
CAFE STAFF — 35 AI CV EVALUATION CRITERIA
==================================================
You MUST evaluate the candidate against all 35 criteria across the 7 categories below:

--- Category 1: Industry & Experience ---
1. Relevant F&B Experience: Does the candidate have previous professional experience in the food and beverage, restaurant, café, fast-food, QSR, hospitality, or similar industry?
2. Minimum 1 Year Experience: Does the candidate have at least 1 year of relevant experience in the fast-food/QSR/F&B industry?
3. Café Experience: Has the candidate previously worked in a café, coffee shop, beverage outlet, bakery café, or similar establishment?
4. QSR Experience: Has the candidate worked in a quick-service restaurant or fast-food environment?
5. Customer-Facing F&B Experience: Has the candidate worked in a role involving regular direct interaction with customers?
6. Relevant Role Similarity: How closely do the candidate's previous job roles relate to general café staff, crew member, service staff, restaurant staff, barista, or beverage-service positions?
7. F&B Career Continuity: Does the candidate show continued or repeated experience within the food, beverage, restaurant, café, or hospitality sector?

--- Category 2: Beverage & Product Experience ---
8. Coffee Experience: Does the CV provide evidence of previous experience preparing, serving, or working with coffee or coffee-based beverages?
9. Bubble Tea Experience: Does the CV provide evidence of previous experience preparing, serving, or working with bubble tea, boba, milk tea, fruit tea, or similar beverages?
10. Dual Beverage Experience: Does the candidate's previous experience indicate exposure to both coffee and bubble tea/beverage preparation?
11. Beverage Outlet Experience: Has the candidate worked in a beverage-focused outlet where preparation and service of drinks were part of their role?
12. Barista/Beverage Training: Has the candidate completed any barista, beverage preparation, café, hospitality, or related training that supports their suitability for the role?

--- Category 3: Customer Handling & Communication ---
13. Customer Interaction: Does the candidate's previous experience demonstrate regular interaction with customers?
14. Customer Service Experience: Does the CV indicate experience assisting customers, taking orders, responding to requests, or providing customer service?
15. Communication Evidence: Does the candidate's work history provide evidence of practical communication skills with customers, colleagues, or supervisors?
16. Customer Complaint Handling: Does the candidate have previous experience dealing with customer complaints, difficult customers, or service-related issues?
17. Service-Oriented Experience: Has the candidate previously worked in a role where customer satisfaction and service quality were important?
18. Team Communication: Does the candidate demonstrate experience working and communicating within a team in a restaurant, café, QSR, hospitality, retail, or similar environment?

--- Category 4: Workplace & F&B Environment ---
19. Fast-Paced Environment: Does the candidate have experience working in a fast-paced or high-volume customer-service environment?
20. Multitasking Evidence: Does the candidate's previous employment indicate the ability to handle multiple responsibilities within a busy workplace?
21. Teamwork: Does the candidate have demonstrated experience working as part of a team?
22. Workplace Adaptability: Does the candidate's career history indicate experience adapting to different tasks, customers, shifts, or workplace situations?

--- Category 5: Hygiene & Standards ---
23. Cleanliness/Hygiene Experience: Does the candidate's previous F&B or hospitality experience indicate responsibility for maintaining cleanliness or hygiene?
24. Food Safety Awareness: Does the CV mention food safety, hygiene, sanitation, HACCP, food handling, or related training/certifications?
25. Café/Restaurant Standards: Does the candidate demonstrate previous experience working under standardized food-service, hygiene, quality, or operational procedures?

--- Category 6: Work History & Long-Term Suitability ---
26. Employment Stability: Does the candidate's employment history demonstrate reasonable stability rather than a consistent pattern of very short-term positions?
27. Long-Term Employment Evidence: Has the candidate previously remained with an employer for 1 year or longer?
28. Short-Term/Temporary Pattern: Does the candidate's CV show a repeated pattern of short-term, temporary, seasonal, or very brief employment?
29. Career Consistency: Does the candidate's overall employment history show a consistent interest or background in customer service, F&B, hospitality, café, restaurant, or related work?
30. Overall Role Relevance: Based on the complete CV, how closely does the candidate's experience match the requirements of a Café Staff position involving customer service and both coffee and bubble tea/beverage exposure?

--- Category 7: Verification / Missing Information ---
31. Experience Verification: Is there sufficient information in the CV to verify the candidate's claimed duration of relevant F&B/QSR experience?
32. Coffee Experience Verification: Is there clear evidence of coffee-related experience, or is it only a generic skill claim?
33. Bubble Tea Experience Verification: Is there clear evidence of bubble-tea/boba-related experience?
34. Communication Verification: Is communication ability supported by actual work experience rather than only being listed under "Skills"?
35. Overall Eligibility: Does the available CV evidence indicate that the candidate meets the core eligibility requirements for the Café Staff position?

==================================================
SCORING & EVALUATION RULES (100-POINT TOTAL)
==================================================
Score the candidate strictly on a 100-point scale across 4 core pillars:
1. Experience Points (Max 40 points):
   - 1+ years direct experience in fast food, QSR, café, restaurant crew, or beverage outlet (40 pts)
   - 6-12 months QSR/hospitality experience (25-30 pts)
   - Entry-level or retail customer service (10-20 pts)
   - No relevant work history (0 pts)

2. Core Skills & Beverage/Operations (Max 30 points):
   - Proven exposure to both beverage preparation (bubble tea/coffee), POS operations, and workstation maintenance (30 pts)
   - Experience in either beverage prep or kitchen/counter operations (20-25 pts)
   - General counter or waiting skills (10-15 pts)
   - No practical operational skills (0 pts)

3. Customer Service & Communication (Max 15 points):
   - Demonstrated customer service, order taking, polite communication, and teamwork (15 pts)
   - Moderate customer interaction (8-12 pts)
   - Minimal customer-facing background (0-5 pts)

4. Stability, Hygiene & Verification (Max 15 points):
   - 1+ year sustained employment with past employers, clean hygiene awareness, verified against questionnaire (15 pts)
   - Moderate job stability with minor gaps (8-12 pts)
   - High turnover pattern or unverified claims (0-5 pts)

Return ONLY a valid JSON object matching this schema:
{
  "total_score": <number 0-100>,
  "criteria_breakdown": {
    "experience_points": <number 0-40>,
    "skills_points": <number 0-30>,
    "communication_points": <number 0-15>,
    "stability_education_points": <number 0-15>
  },
  "mandatory_eligibility": {
    "barista_training_verified": null,
    "minimum_1_year_qsr_verified": <boolean>,
    "coffee_experience_verified": <boolean>,
    "bubble_tea_experience_verified": <boolean>,
    "dual_beverage_ready": <boolean>,
    "age_eligibility_status": "Eligible (18-30)" | "Out of Range" | "Not Provided in CV",
    "overall_eligible": <boolean>,
    "notes": "<concise summary of eligibility compliance>"
  },
  "summary": "<2-3 sentence executive recruitment summary>",
  "meta_verification_status": "Verified" | "Discrepancy Noted" | "Unverified",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "recommendation": "Strongly Recommended" | "Recommended" | "Not Recommended",
  "evaluated_questions": [
    {
      "id": 1,
      "category": "Industry & Experience",
      "question": "Relevant F&B Experience: Does the candidate have previous professional experience in the food and beverage, restaurant, café, fast-food, QSR, hospitality, or similar industry?",
      "status": "Direct Evidence" | "Indirect Evidence" | "Not Verified" | "Gap / Risk",
      "evidence": "<exact quote or specific CV evidence>"
    }
    // ... all 35 questions sequentially from 1 to 35
  ]
}
`;
}

/**
 * Generate evaluation prompt for GENERAL MANAGER role
 */
function generateGMPrompt(questionnaire: Record<string, any>, resumeText: string): string {
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
  "mandatory_eligibility": {
    "minimum_5_years_exp_verified": <boolean>,
    "multi_outlet_verified": <boolean>,
    "overall_eligible": <boolean>,
    "notes": "<GM eligibility note>"
  },
  "summary": "<2-3 sentence executive hiring summary>",
  "meta_verification_status": "Verified" | "Discrepancy Noted" | "Unverified",
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "recommendation": "Strongly Recommended" | "Recommended" | "Not Recommended",
  "evaluated_questions": []
}
`;
}

/**
 * Generate evaluation prompt for HR EXECUTIVE — MULTI-BRANCH role (58 criteria)
 */
function generateHRExecutivePrompt(questionnaire: Record<string, any>, resumeText: string): string {
  return `
You are a Senior Human Resources Director & Executive Talent Auditor for "Boba Live", a fast-growing multi-branch specialty beverage & QSR chain.
You are evaluating a candidate's CV for the position: "HR Executive — Multi-Branch".

==================================================
ROLE CONTEXT & CORE REQUIREMENTS
==================================================
Role: HR Executive — Multi-Branch
The HR Executive is responsible for end-to-end HR operations across multiple café outlets and branches, including high-volume recruitment, frontline employee onboarding, attendance/shift monitoring, leave & payroll support, performance management, workplace disciplinary and conflict resolution, statutory HR compliance, and frequent branch visits/field coordination.

Eligibility & General Requirements:
* 2–5 Years of relevant HR or personnel management experience
* Practical recruitment and hiring experience across frontline/operational staff
* Multi-branch, multi-outlet, or distributed workforce operational HR exposure
* Practical knowledge of Indian statutory compliance (PF, ESI, Minimum Wages, Labour Laws, Shops & Establishments)
* Proficiency in Malayalam (regional branch staff communication) and English
* Willingness and mobility to travel between branches (Two-wheeler ownership/licence preferred)

==================================================
CANDIDATE SELF-REPORTED META QUESTIONNAIRE CLAIMS
==================================================
- Claimed HR Experience Duration: ${questionnaire.hr_experience_duration || questionnaire.experience_duration || '2-5 years'}
- Multi-Branch / Multi-Location Experience Claimed: ${questionnaire.multi_branch_experience ? 'Yes' : 'No'}
- Recruitment & Sourcing Exposure Claimed: ${questionnaire.recruitment_experience ? 'Yes' : 'No'}
- Malayalam Language Proficiency Claimed: ${questionnaire.malayalam_proficiency ? 'Yes' : 'No'}
- Two-Wheeler / Travel Mobility Claimed: ${questionnaire.two_wheeler_mobility ? 'Yes' : 'No'}
- Home State / Residing Location: ${questionnaire.home_state || 'Kerala'} / ${questionnaire.residing_city || 'Kochi'}

==================================================
APPLICANT CV TEXT CONTENT
==================================================
"""
${resumeText}
"""

==================================================
HR EXECUTIVE — 58 AI CV EVALUATION CRITERIA
==================================================
Evaluate the candidate's CV strictly against ALL 58 criteria across the 10 categories below.
Identify direct and indirect evidence from employment history, job responsibilities, qualifications, certifications, skills, and other relevant CV information. Exact keyword matching alone should NOT be used.

--- Category 1: HR Experience & Core Eligibility ---
1. HR Experience: Does the candidate have professional experience specifically in Human Resources or personnel management?
2. 2–5 Years HR Experience: Does the candidate have approximately 2–5 years of relevant HR experience?
3. HR Executive-Level Experience: Has the candidate previously held roles such as HR Executive, HR Generalist, HR Officer, HR Coordinator, HR Associate, or equivalent?
4. End-to-End HR Exposure: Does the candidate demonstrate experience across multiple HR functions rather than working exclusively in one narrow HR area?
5. Recruitment & Hiring: Does the candidate have practical experience sourcing, screening, interviewing, shortlisting, selecting, or hiring employees?
6. Recruitment Volume: Does the CV indicate experience handling recruitment for multiple positions, departments, outlets, or a high number of employees?

--- Category 2: Employee Management ---
7. Employee Onboarding: Does the candidate have experience handling or coordinating employee onboarding, joining formalities, induction, orientation, or new-employee documentation?
8. Training Coordination: Does the candidate have experience coordinating employee training, orientation, development programs, or training schedules?
9. Attendance Management: Does the candidate have experience monitoring or maintaining employee attendance, working hours, shifts, timesheets, or attendance records?
10. Leave Management: Does the candidate have experience managing employee leave requests, leave records, or leave-related processes?
11. Employee Documentation: Does the candidate have experience maintaining employee records, HR files, personnel documentation, contracts, or other HR documentation?
12. Payroll Support: Does the candidate have experience preparing, verifying, coordinating, or supporting payroll processing?
13. Performance Management: Does the candidate have experience monitoring employee performance, conducting appraisals, performance reviews, KPIs, or performance improvement processes?
14. Disciplinary Management: Does the candidate have experience handling employee misconduct, disciplinary procedures, warnings, attendance issues, or workplace policy violations?
15. Employee Complaints: Does the candidate have experience receiving, documenting, investigating, or resolving employee complaints or grievances?
16. Conflict Resolution: Does the candidate demonstrate professional experience resolving workplace conflicts or disputes between employees, teams, or management?
17. Employee Retention: Does the candidate have experience with employee engagement, retention initiatives, reducing turnover, or addressing employee concerns related to retention?
18. Exit Management: Does the candidate have experience handling resignations, exit interviews, clearance procedures, termination processes, or employee offboarding?

--- Category 3: Multi-Branch / Operational HR Experience ---
19. Multi-Location HR: Has the candidate previously managed or supported HR activities across multiple branches, outlets, stores, offices, or locations?
20. Branch/Outlet Staff Management: Does the CV demonstrate experience dealing directly with employees or staff working at operational locations such as restaurants, QSRs, retail stores, hotels, or other outlets?
21. Large Workforce Management: Does the candidate have experience managing HR processes for a significant number of employees?
22. Branch Visits / Field HR: Does the candidate's previous role indicate regular travel between branches, stores, sites, outlets, or other work locations to handle employee or HR matters?
23. Operational Workforce: Does the candidate have experience managing employees working in shift-based, customer-facing, frontline, or operational roles?

--- Category 4: Industry Relevance ---
24. QSR Experience: Has the candidate previously worked in HR within a Quick Service Restaurant/QSR environment?
25. Restaurant/F&B Experience: Has the candidate worked in HR or employee-management functions within a restaurant, café, food-service, or F&B business?
26. Retail Experience: Has the candidate worked in HR within a retail business involving multiple employees, stores, or branches?
27. Hospitality Experience: Has the candidate worked in HR within hotels, hospitality, or similar service-based businesses?
28. Service-Industry Workforce: Does the candidate have experience managing employees in a high-volume, customer-facing service environment?

--- Category 5: Communication & People Management ---
29. Employee Communication: Does the candidate's previous experience demonstrate frequent professional communication with employees at different levels?
30. People Management: Does the candidate have practical experience managing, coordinating, supervising, or supporting employees?
31. Management Communication: Does the candidate demonstrate experience communicating HR matters to managers, supervisors, branch heads, or senior management?
32. Conflict & Difficult Conversations: Does the candidate's experience indicate that they have handled sensitive employee conversations, complaints, disciplinary matters, or workplace disputes?
33. Interpersonal Skills: Does the candidate's work history provide evidence of strong interpersonal skills in employee-facing or people-management situations? Do not rely solely on a generic "good communication skills" claim.

--- Category 6: Language & Mobility ---
34. Malayalam: Does the CV explicitly indicate Malayalam language proficiency?
35. English: Does the CV explicitly indicate English language proficiency?
36. Multi-Branch Travel: Does the candidate's previous work experience indicate willingness or experience travelling between different branches, offices, sites, or work locations?
37. Two-Wheeler / Driving: Does the CV indicate possession of a two-wheeler, valid driving licence, or experience requiring regular two-wheeler travel?

--- Category 7: HR Compliance & Legal Knowledge ---
38. Labour Law Knowledge: Does the candidate demonstrate knowledge or practical experience relating to labour laws, employment regulations, or statutory HR requirements?
39. HR Compliance: Does the candidate have experience maintaining HR compliance, statutory records, employee documentation, or internal HR policies?
40. Statutory Compliance: Does the CV mention experience with HR-related statutory processes such as PF, ESI, gratuity, minimum wages, professional tax, Shops & Establishments requirements, or similar compliance areas?
41. HR Policies: Does the candidate have experience implementing, communicating, or maintaining workplace HR policies and procedures?

--- Category 8: HR Systems & Administration ---
42. HRMS/HR Software: Does the candidate have experience using HRMS, HRIS, payroll software, attendance systems, or other HR technology?
43. HR Data Management: Does the candidate have experience maintaining employee databases, HR reports, attendance data, leave records, or workforce information?
44. Reporting: Does the candidate have experience preparing HR reports, workforce reports, recruitment reports, attendance reports, attrition reports, or similar management reports?
45. Recruitment Platforms: Does the candidate demonstrate experience using recruitment platforms, job portals, applicant tracking systems, LinkedIn, or other hiring channels?

--- Category 9: Qualifications & Professional Development ---
46. HR/Education Qualification: Does the candidate possess an educational qualification relevant to HR, Human Resources Management, Business Administration, Psychology, or a related field?
47. HR Certifications: Does the candidate possess HR-related certifications, professional courses, diplomas, or additional training?
48. HR Career Progression: Does the candidate demonstrate progression in HR responsibilities, such as moving from HR Assistant/Coordinator roles into HR Executive, HR Generalist, HR Manager, or similar positions?

--- Category 10: Overall Suitability & Verification Flags ---
49. Multi-Branch HR Readiness: Based on the complete CV, does the candidate demonstrate experience relevant to independently managing HR activities across multiple operational locations?
50. Overall Role Relevance: How closely does the candidate's demonstrated experience match an HR Executive role responsible for recruitment, employee management, HR administration, compliance, and staff coordination across multiple branches?
51. Insufficient HR Experience: Does the CV indicate less than 2 years of relevant HR experience?
52. Excessive/Seniority Mismatch: Does the candidate's experience significantly exceed the 2–5 year requirement or indicate a substantially more senior profile?
53. Recruitment Gap: Is there insufficient evidence that the candidate has personally handled recruitment or hiring?
54. Employee Management Gap: Is there insufficient evidence of direct employee/staff management or people-management responsibilities?
55. Multi-Branch Experience Gap: Is there no identifiable evidence of working across multiple branches, locations, stores, outlets, or sites?
56. Compliance Gap: Is there insufficient evidence of exposure to labour law, statutory compliance, or HR policies?
57. Language Verification: Is Malayalam or English proficiency not explicitly established in the CV?
58. Mobility Verification: Is there no evidence of the candidate having experience with travel between work locations or other field-based HR responsibilities?

==================================================
IMPORTANT AI AUDITING INSTRUCTIONS
==================================================
* Prioritize actual HR responsibilities listed under previous employment over generic skill statements.
* A candidate listing "Recruitment" under Skills should NOT receive the same evidence strength as a candidate whose employment history states that they independently sourced, screened, interviewed, and hired employees.
* Distinguish between "Direct Evidence", "Indirect Evidence", "Not Verified", and "Gap / Risk".
* Do not assume QSR/restaurant/retail/hospitality experience merely because the candidate has general HR experience.
* Give additional relevance to candidates who have managed frontline, shift-based, customer-facing employees.
* For multi-branch suitability, look for evidence such as multiple outlets, multiple locations, branch visits, workforce size, geographically distributed teams, or centralized HR responsibility.
* Do not assume Malayalam or English proficiency based solely on the candidate's location or name. Look for explicit language information or relevant CV evidence.
* Do not infer possession of a two-wheeler unless explicitly mentioned. A driving licence alone should not automatically be treated as proof of two-wheeler ownership.
* Do not invent missing information. If the CV does not provide sufficient evidence for a criterion, mark it as "Not Verified" rather than assuming possession.
* Mandatory eligibility criteria and positive scoring criteria should be kept separate.
* The final assessment should show the overall score, individual criterion scores, supporting CV evidence, and important gaps/verification requirements.

==================================================
SCORING & EVALUATION RULES (100-POINT TOTAL)
==================================================
Score the candidate strictly on a 100-point scale across 4 core pillars:
1. HR Experience, Multi-Branch & Industry Exposure (Max 35 points):
   - 30-35 pts: 2–5 years core HR experience with multi-branch/multi-unit operations in QSR/F&B/Retail/Hospitality/Service industry.
   - 20-29 pts: 2–5 years general HR experience in corporate or single location with operational/frontline workforce.
   - 10-19 pts: 1–2 years junior HR/assistant experience or unrelated sector.
   - 0-9 pts: Less than 1 year or non-HR background.

2. Core HR Operations, Recruitment & Compliance (Max 30 points):
   - 25-30 pts: Proven hands-on full lifecycle recruitment, onboarding, attendance/payroll coordination, statutory compliance (PF, ESI, labour laws), HRMS tools.
   - 18-24 pts: Strong recruitment & onboarding with basic compliance or HRMS exposure.
   - 10-17 pts: Limited administrative HR tasks with minimal hiring/statutory compliance.
   - 0-9 pts: No practical HR operational experience.

3. People Management, Conflict Resolution & Communication (Max 20 points):
   - 18-20 pts: Strong frontline employee grievance handling, disciplinary procedures, performance appraisals, multi-level stakeholder communication.
   - 12-17 pts: Moderate employee coordination and conflict management experience.
   - 0-11 pts: Minimal or indirect people handling experience.

4. Stability, Qualifications, Languages & Mobility (Max 15 points):
   - 13-15 pts: Relevant HR/Business degree/MBA, stable employment history, verified Malayalam & English proficiency, two-wheeler/field mobility verified.
   - 8-12 pts: General degree, moderate tenure stability, partial language or mobility confirmation.
   - 0-7 pts: Frequent job-hopping, unverified languages, lack of mobility or mismatch.

Return ONLY a valid JSON object matching this schema:
{
  "total_score": <number 0-100>,
  "criteria_breakdown": {
    "experience_points": <number 0-35>,
    "skills_points": <number 0-30>,
    "communication_points": <number 0-20>,
    "stability_education_points": <number 0-15>
  },
  "mandatory_eligibility": {
    "hr_experience_2_to_5_years_verified": <boolean>,
    "recruitment_experience_verified": <boolean>,
    "multi_branch_or_operational_verified": <boolean>,
    "malayalam_proficiency_verified": <boolean>,
    "two_wheeler_mobility_verified": <boolean>,
    "overall_eligible": <boolean>,
    "notes": "<concise summary of HR eligibility compliance>"
  },
  "summary": "<2-3 sentence executive recruitment summary>",
  "meta_verification_status": "Verified" | "Discrepancy Noted" | "Unverified",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "recommendation": "Strongly Recommended" | "Recommended" | "Not Recommended",
  "evaluated_questions": [
    {
      "id": 1,
      "category": "HR Experience & Core Eligibility",
      "question": "HR Experience: Does the candidate have professional experience specifically in Human Resources or personnel management?",
      "status": "Direct Evidence" | "Indirect Evidence" | "Not Verified" | "Gap / Risk",
      "evidence": "<exact quote or specific CV evidence>"
    }
    // ... all 58 questions sequentially from 1 to 58
  ]
}
`;
}

// Construct dynamic system prompt based on role and meta lead data
function generateEvaluationPrompt(role: string, questionnaire: Record<string, any>, resumeText: string): string {
  const normalized = (role || '').toLowerCase();
  if (
    normalized.includes('hr') ||
    normalized.includes('human resource') ||
    normalized.includes('personnel') ||
    normalized.includes('recruiter') ||
    normalized.includes('recruitment')
  ) {
    return generateHRExecutivePrompt(questionnaire, resumeText);
  }
  if (
    normalized.includes('general manager') ||
    normalized.includes('gm') ||
    normalized.includes('store manager') ||
    normalized.includes('cafe manager') ||
    normalized.includes('restaurant manager') ||
    normalized.includes('branch manager') ||
    normalized.includes('manager') ||
    normalized.includes('supervisor')
  ) {
    return generateGMPrompt(questionnaire, resumeText);
  }
  if (normalized.includes('barista') && !normalized.includes('cafe staff')) {
    return generateBaristaPrompt(questionnaire, resumeText);
  }
  // Default to Cafe Staff
  return generateCafeStaffPrompt(questionnaire, resumeText);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.candidateId || !body.resumeUrl) {
      return NextResponse.json(
        { error: 'Missing required parameters candidateId or resumeUrl' },
        { status: 400 }
      );
    }

    const { candidateId, resumeUrl, role = 'Cafe Staff' } = body;

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
    let effectiveRole = candidateRecord?.role || role || 'Cafe Staff';

    // Auto-detect role if questionnaire contains HR or Manager indicators
    const qKeys = Object.keys(questionnaire).join(' ').toLowerCase();
    if (
      qKeys.includes('hr_experience') ||
      qKeys.includes('recruitment_experience') ||
      qKeys.includes('statutory_compliance') ||
      qKeys.includes('multi_branch') ||
      qKeys.includes('two_wheeler')
    ) {
      effectiveRole = 'HR Executive';
    } else if (
      qKeys.includes('five_plus_years_exp') ||
      qKeys.includes('multi_outlet_managed') ||
      qKeys.includes('outlet_scale') ||
      qKeys.includes('managerial_experience') ||
      qKeys.includes('responsibilities')
    ) {
      effectiveRole = effectiveRole.toLowerCase().includes('manager') ? effectiveRole : 'General Manager';
    } else if (
      qKeys.includes('barista_training') ||
      (effectiveRole.toLowerCase().includes('barista') && !effectiveRole.toLowerCase().includes('cafe staff'))
    ) {
      effectiveRole = 'Barista';
    }

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
      mandatory_eligibility: aiEvaluation.mandatory_eligibility || {
        minimum_1_year_qsr_verified: true,
        coffee_experience_verified: true,
        bubble_tea_experience_verified: true,
        dual_beverage_ready: true,
        overall_eligible: true,
        notes: 'Evaluated against role eligibility criteria.',
      },
      summary: aiEvaluation.summary || 'Resume analyzed and scored by AI.',
      meta_verification_status: aiEvaluation.meta_verification_status || 'Verified',
      strengths: Array.isArray(aiEvaluation.strengths) ? aiEvaluation.strengths : [],
      gaps: Array.isArray(aiEvaluation.gaps) ? aiEvaluation.gaps : [],
      recommendation: aiEvaluation.recommendation || (totalScore >= 70 ? 'Recommended' : 'Not Recommended'),
      evaluated_questions: Array.isArray(aiEvaluation.evaluated_questions) ? aiEvaluation.evaluated_questions : [],
    };

    // 5. Update Supabase with points & detailed breakdown
    const { error: updateError } = await supabase
      .from('candidates')
      .update({
        resume_url: resumeUrl,
        role: effectiveRole,
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
