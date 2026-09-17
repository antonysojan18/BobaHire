'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import {
  ArrowUpDown,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

interface Candidate {
  id: string;
  created_at?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  location?: string | null;
  meta_lead_id?: string | null;
  home_state?: string | null;
  residing_city?: string | null;
  questionnaire_data?: Record<string, any> | null;
  pre_screen_passed?: boolean | null;
  status: string;
  resume_url: string | null;
  ai_score: number | null;
  ai_evaluation: {
    total_score?: number;
    criteria_breakdown?: {
      experience_points: number;
      skills_points: number;
      communication_points: number;
      stability_education_points: number;
    };
    mandatory_eligibility?: {
      barista_training_verified?: boolean | null;
      minimum_1_year_qsr_verified?: boolean | null;
      coffee_experience_verified?: boolean | null;
      bubble_tea_experience_verified?: boolean | null;
      dual_beverage_ready?: boolean | null;
      age_eligibility_status?: string | null;
      minimum_5_years_exp_verified?: boolean | null;
      multi_outlet_verified?: boolean | null;
      hr_experience_2_to_5_years_verified?: boolean | null;
      recruitment_experience_verified?: boolean | null;
      multi_branch_or_operational_verified?: boolean | null;
      malayalam_proficiency_verified?: boolean | null;
      two_wheeler_mobility_verified?: boolean | null;
      overall_eligible?: boolean | null;
      notes?: string | null;
    };
    summary?: string;
    strengths?: string[];
    gaps?: string[];
    recommendation?: string;
    evaluated_questions?: Array<{
      id: number;
      category: string;
      question: string;
      status: string;
      evidence: string;
    }>;
  } | null;
}

type SortKey = 'rank' | 'role' | 'location' | 'points' | 'date';

export default function AdminDashboard() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  // Sorting & Filtering State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'date',
    dir: 'desc',
  });
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Monthly Analytics Filter State
  const [analyticsMonth, setAnalyticsMonth] = useState<string>('all');

  // Export Modal State
  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  // Interview Date/Time Picker Modal State
  const [interviewCandidate, setInterviewCandidate] = useState<Candidate | null>(null);
  const [interviewDateTime, setInterviewDateTime] = useState<string>('');
  const [sendingEmail, setSendingEmail] = useState<boolean>(false);

  // Custom Message Modal State
  const [messageCandidate, setMessageCandidate] = useState<Candidate | null>(null);
  const [customSubject, setCustomSubject] = useState<string>('');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [sendingCustomMessage, setSendingCustomMessage] = useState<boolean>(false);

  // Status Action Confirmation Modal State
  const [confirmAction, setConfirmAction] = useState<{
    candidate: Candidate;
    action: 'Shortlist' | 'Reject' | 'Delete';
  } | null>(null);
  const [actionProcessing, setActionProcessing] = useState<boolean>(false);

  // Separate Modal State for Points Breakdown vs PDF Viewer
  const [activeModal, setActiveModal] = useState<{
    candidate: Candidate;
    type: 'breakdown' | 'pdf';
  } | null>(null);
  const [criteriaCategoryFilter, setCriteriaCategoryFilter] = useState<string>('all');
  const [criteriaSearchQuery, setCriteriaSearchQuery] = useState<string>('');

  // Lead Dispatch Form State
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    location: '',
  });

  // AI Evaluation in progress state
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [batchEvaluating, setBatchEvaluating] = useState<boolean>(false);

  const fetchCandidates = async () => {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading candidates:', error);
    } else if (data) {
      const normalizedCandidates = (data as Candidate[]).map((c) => {
        const q = c.questionnaire_data || {};
        const qKeys = Object.keys(q).join(' ').toLowerCase();
        let targetRole = c.role;

        if (
          qKeys.includes('hr_experience') ||
          qKeys.includes('recruitment_experience') ||
          qKeys.includes('statutory_compliance') ||
          qKeys.includes('multi_branch') ||
          qKeys.includes('two_wheeler')
        ) {
          if (!c.role || c.role.toLowerCase().includes('cafe') || c.role.toLowerCase().includes('barista')) {
            targetRole = 'HR Executive';
            // Sync database asynchronously
            supabase.from('candidates').update({ role: 'HR Executive' }).eq('id', c.id).then();
          }
        } else if (
          qKeys.includes('five_plus_years_exp') ||
          qKeys.includes('multi_outlet_managed') ||
          qKeys.includes('outlet_scale') ||
          qKeys.includes('managerial_experience') ||
          qKeys.includes('responsibilities')
        ) {
          if (!c.role || c.role.toLowerCase().includes('cafe') || c.role.toLowerCase().includes('barista')) {
            targetRole = 'General Manager';
            // Sync database asynchronously
            supabase.from('candidates').update({ role: 'General Manager' }).eq('id', c.id).then();
          }
        }

        return { ...c, role: targetRole };
      });

      setCandidates(normalizedCandidates);
    }
  };

  const handleEvaluateCandidate = async (candidate: Candidate) => {
    if (!candidate.resume_url) {
      alert('This candidate has not uploaded a resume yet.');
      return;
    }
    setEvaluatingId(candidate.id);
    try {
      const res = await fetch('/api/evaluate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: candidate.id,
          resumeUrl: candidate.resume_url,
          role: candidate.role,
          questionnaire: candidate.questionnaire_data,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Evaluation failed');
      await fetchCandidates();
    } catch (err: any) {
      alert(`AI Evaluation Error: ${err.message}`);
    } finally {
      setEvaluatingId(null);
    }
  };

  const handleBatchEvaluatePending = async () => {
    const toEvaluate = candidates.filter((c) => c.resume_url && (c.ai_score === null || !c.ai_evaluation));
    if (toEvaluate.length === 0) {
      alert('No unevaluated candidates with uploaded resumes found.');
      return;
    }

    setBatchEvaluating(true);
    let successCount = 0;

    for (const c of toEvaluate) {
      try {
        const res = await fetch('/api/evaluate-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateId: c.id,
            resumeUrl: c.resume_url,
            role: c.role,
            questionnaire: c.questionnaire_data,
          }),
        });
        if (res.ok) successCount++;
      } catch (e) {
        console.error(`Failed to evaluate candidate ${c.id}:`, e);
      }
    }

    setBatchEvaluating(false);
    fetchCandidates();
    alert(`Successfully evaluated ${successCount} of ${toEvaluate.length} candidates!`);
  };

  const openMessageModal = (candidate: Candidate) => {
    setMessageCandidate(candidate);
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const uploadUrl = `${baseUrl}/upload?id=${candidate.id}&name=${encodeURIComponent(candidate.name)}&role=${encodeURIComponent(candidate.role)}`;

    if (!candidate.resume_url) {
      setCustomSubject(`Reminder: Please upload your CV for ${candidate.role} — BobaLive`);
      setCustomMessage(
        `Hello ${candidate.name},\n\nThis is a friendly reminder regarding your application for the ${candidate.role} position at BobaLive.\n\nWe noticed that we haven't received your CV / Resume yet. To help our recruitment team review your qualifications and proceed with your application, please upload your resume (PDF) using the secure link below:\n\nUpload CV Link:\n${uploadUrl}\n\nPlease upload your CV as soon as possible so we can proceed with your interview evaluation.\n\nBest regards,\nBobaLive Recruitment Team`
      );
    } else {
      setCustomSubject(`Update regarding your application for ${candidate.role} at BobaLive`);
      setCustomMessage(
        `Hello ${candidate.name},\n\nWe are currently reviewing candidate applications for the ${candidate.role} position and wanted to thank you for your interest in BobaLive.\n\nOur team will be in touch with further updates soon.\n\nBest regards,\nBobaLive HR Team`
      );
    }
  };

  const handleSendCustomMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageCandidate || !customMessage.trim()) return;

    setSendingCustomMessage(true);
    try {
      const res = await fetch('/api/send-status-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: messageCandidate.name,
          email: messageCandidate.email,
          phone: messageCandidate.phone || '',
          location: messageCandidate.location || '',
          role: messageCandidate.role,
          action: 'custom',
          customSubject: customSubject.trim() || `Update regarding your application for ${messageCandidate.role} at BobaLive`,
          customMessage: customMessage.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      alert(`Message successfully sent to ${messageCandidate.name} (${messageCandidate.email})!`);
      setMessageCandidate(null);
      setCustomSubject('');
      setCustomMessage('');
    } catch (err: any) {
      alert(`Error sending message: ${err.message}`);
    } finally {
      setSendingCustomMessage(false);
    }
  };

  useEffect(() => {
    // Security check: verify tab session active flag
    if (typeof window !== 'undefined') {
      const activeSession = sessionStorage.getItem('boba_admin_active');
      if (!activeSession) {
        fetch('/api/auth/logout', { method: 'POST' }).then(() => {
          window.location.href = '/login';
        });
        return;
      }
    }

    fetchCandidates();
    const interval = setInterval(() => {
      fetchCandidates();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');

      alert(`Invitation email successfully sent to ${form.email}!`);
      setForm({ name: '', email: '', phone: '', role: '', location: '' });
      fetchCandidates();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const sendStatusEmail = async (candidate: Candidate, action: string, dateTime?: string) => {
    try {
      await fetch('/api/send-status-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone || '',
          location: candidate.location || '',
          role: candidate.role,
          action,
          interviewDateTime: dateTime || '',
        }),
      });
    } catch (err) {
      console.error('Error sending status email:', err);
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!confirmAction) return;

    setActionProcessing(true);
    const { candidate, action } = confirmAction;

    if (action === 'Delete') {
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
      const { error } = await supabase
        .from('candidates')
        .delete()
        .eq('id', candidate.id);

      if (error) {
        console.error('Error deleting candidate:', error);
        fetchCandidates();
      }
      setActionProcessing(false);
      setConfirmAction(null);
      return;
    }

    const dbStatus = action === 'Shortlist' ? 'shortlisted' : 'rejected';

    // Optimistic UI update
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? { ...c, status: dbStatus } : c))
    );

    const { error } = await supabase
      .from('candidates')
      .update({ status: dbStatus })
      .eq('id', candidate.id);

    if (error) {
      console.error('Error updating status:', error);
      fetchCandidates();
      setActionProcessing(false);
      setConfirmAction(null);
      return;
    }

    if (action === 'Shortlist') {
      await sendStatusEmail(candidate, 'shortlist');
    } else {
      await sendStatusEmail(candidate, 'reject');
    }

    setActionProcessing(false);
    setConfirmAction(null);
  };

  const handleConfirmInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interviewCandidate || !interviewDateTime) return;

    setSendingEmail(true);

    const candidateId = interviewCandidate.id;
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, status: 'interview' } : c))
    );

    await supabase
      .from('candidates')
      .update({ status: 'interview' })
      .eq('id', candidateId);

    await sendStatusEmail(interviewCandidate, 'interview', interviewDateTime);

    setSendingEmail(false);
    setInterviewCandidate(null);
  };

  // Meta Ads CSV / Excel Batch Import Backup System
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadRoleOverride, setUploadRoleOverride] = useState<string>('HR Executive');
  const [batchImporting, setBatchImporting] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<{
    total: number;
    processed: number;
    passed: number;
    failed: number;
    emailsSent: number;
  } | null>(null);

  const parseFileToLeads = async (file: File, selectedRoleOverride: string = 'auto') => {
    const isCsv = file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt');
    let workbook: XLSX.WorkBook;

    if (isCsv) {
      const csvText = await file.text();
      workbook = XLSX.read(csvText, { type: 'string' });
    } else {
      const arrayBuffer = await file.arrayBuffer();
      workbook = XLSX.read(arrayBuffer, { type: 'array' });
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Get 2D matrix of sheet data (array of row arrays)
    const matrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!matrix || matrix.length < 2) return [];

    const safeStr = (val: any): string => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'string') return val.trim();
      if (typeof val === 'number') return String(val).trim();
      if (typeof val === 'object' && val.v !== undefined) return String(val.v).trim();
      if (typeof val === 'object' && val.w !== undefined) return String(val.w).trim();
      if (typeof val === 'object' && val.l?.Target) return String(val.l.Target).replace(/^mailto:/i, '').trim();
      return String(val).trim();
    };

    // Find the header row index (row containing 'email', 'name', 'id', 'full_name')
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(10, matrix.length); r++) {
      const rowStr = matrix[r].map(safeStr).join(' ').toLowerCase();
      if (rowStr.includes('email') || rowStr.includes('name') || rowStr.includes('phone') || rowStr.includes('id')) {
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx === -1) headerRowIdx = 0;

    const rawHeaders = matrix[headerRowIdx].map(safeStr);
    const normalizedHeaders = rawHeaders.map((h) =>
      h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
    );

    const parsedLeads: any[] = [];

    // Loop through data rows after header row
    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || !row.some((cell) => safeStr(cell).length > 0)) continue;

      const rowFields: Record<string, string> = {};
      normalizedHeaders.forEach((hKey, cIdx) => {
        if (hKey) rowFields[hKey] = safeStr(row[cIdx]);
      });

      // 1. Extract Name
      let name =
        rowFields.full_name ||
        rowFields.name ||
        rowFields.candidate_name ||
        (rowFields.first_name ? `${rowFields.first_name} ${rowFields.last_name || ''}`.trim() : '');

      if (!name) {
        const nameColIdx = normalizedHeaders.findIndex((h) => h.includes('name'));
        if (nameColIdx !== -1 && row[nameColIdx]) name = safeStr(row[nameColIdx]);
      }
      if (!name) name = 'Candidate';

      // 2. Extract Email
      let email = rowFields.email || rowFields.email_address || '';
      if (!email || !email.includes('@')) {
        for (const cell of row) {
          const s = safeStr(cell).toLowerCase();
          if (s.includes('@') && s.includes('.') && !s.includes(' ')) {
            email = s;
            break;
          }
        }
      }

      email = email.toLowerCase().trim();

      // 3. Extract Phone
      let phone = rowFields.phone_number || rowFields.phone || rowFields.contact_number || '';
      if (!phone) {
        const phoneColIdx = normalizedHeaders.findIndex((h) => h.includes('phone') || h.includes('mobile'));
        if (phoneColIdx !== -1 && row[phoneColIdx]) phone = safeStr(row[phoneColIdx]);
      }

      // 4. Assign selected role
      const role = selectedRoleOverride || 'HR Executive';

      const meta_lead_id = rowFields.id || rowFields.lead_id || rowFields.meta_lead_id || `lead_${Date.now()}_${r}`;
      const home_state = rowFields.please_select_your_home_state || rowFields.state || rowFields.home_state || 'Kerala';
      const residing_city = rowFields.city || rowFields.residing_city || rowFields.location || 'Kochi';

      if (email && email.includes('@')) {
        parsedLeads.push({
          name,
          email,
          phone,
          role,
          meta_lead_id,
          home_state,
          residing_city,
          fields: rowFields,
        });
      }
    }

    return parsedLeads;
  };

  const handleBatchFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return alert('Please select a Meta Ads CSV or Excel (.xlsx) file to upload.');

    setBatchImporting(true);
    setImportStatus(null);

    try {
      const leads = await parseFileToLeads(csvFile, uploadRoleOverride);

      if (leads.length === 0) {
        alert(
          'No valid lead rows with email addresses found in the uploaded file. Please ensure the file contains an email column or email values.'
        );
        setBatchImporting(false);
        return;
      }

      let processed = 0;
      let passedCount = 0;
      let failedCount = 0;
      let emailsSent = 0;

      for (const lead of leads) {
        try {
          const res = await fetch('/api/webhooks/meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lead),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            processed++;
            passedCount++;
            if (data.emailDispatched) emailsSent++;
          } else {
            console.error('Lead import API error:', data);
            // Even if API returns non-success, count as processed if candidate was handled
            if (data.candidateId) {
              processed++;
              passedCount++;
            } else {
              failedCount++;
            }
          }
        } catch (err) {
          console.error('Error importing lead row:', err);
          failedCount++;
        }
      }

      setImportStatus({
        total: leads.length,
        processed,
        passed: passedCount,
        failed: failedCount,
        emailsSent,
      });

      fetchCandidates();
      setCsvFile(null);
    } catch (err: any) {
      alert(`File Processing Error: ${err.message}`);
    } finally {
      setBatchImporting(false);
    }
  };

  const downloadSampleCSV = () => {
    const sampleCsv = `full_name,email,phone_number,job_title,city,state,do_you_have_at_least_5_years,have_you_previously_managed_multiple_outlets,which_best_describes_your_previous_managerial_experience,are_you_currently_residing_in_kochi,do_you_have_prior_experience_in_fast_food,are_you_comfortable_managing_both_bubble_tea
Rahul Nair,rahul.nair.meta@example.com,+919876543210,General Manager,Kochi,Kerala,yes,yes,managed_5_or_more_outlets,yes,yes,yes
Ananya Sharma,ananya.sharma.meta@example.com,+919876543211,Cafe Staff / Barista,Kochi,Kerala,no,no,none,yes,yes,yes`;

    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'BobaLive_Meta_Ads_Sample_Leads.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSelectCandidate = async (candidate: Candidate) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? { ...c, status: 'selected' } : c))
    );

    const { error } = await supabase
      .from('candidates')
      .update({ status: 'selected' })
      .eq('id', candidate.id);

    if (error) {
      console.error('Error selecting candidate:', error);
      fetchCandidates();
    }
  };

  const handleDeleteCandidate = (candidate: Candidate) => {
    setConfirmAction({ candidate, action: 'Delete' });
  };

  // Interactive Calendar & Manual Time State
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(new Date());
  const [selectedInterviewDate, setSelectedInterviewDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('10:00 AM');
  const [rawTimeInput, setRawTimeInput] = useState<string>('10:00');

  const format24to12 = (time24: string): string => {
    if (!time24) return '10:00 AM';
    const [hStr, mStr = '00'] = time24.split(':');
    let h = parseInt(hStr, 10);
    if (isNaN(h)) return '10:00 AM';
    const modifier = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${mStr.padStart(2, '0')} ${modifier}`;
  };

  const format12to24 = (time12: string): string => {
    if (!time12) return '10:00';
    const parts = time12.trim().split(' ');
    const modifier = parts[1] || 'AM';
    const [hStr, mStr = '00'] = (parts[0] || '10:00').split(':');
    let h = parseInt(hStr, 10);
    if (isNaN(h)) h = 10;
    if (modifier.toUpperCase() === 'PM' && h < 12) h += 12;
    if (modifier.toUpperCase() === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${mStr.padStart(2, '0')}`;
  };

  const updateInterviewSchedule = (dayObj: Date, timeInput: string, is24h = false) => {
    setSelectedInterviewDate(dayObj);

    let time24 = '10:00';
    let display12 = '10:00 AM';

    if (is24h) {
      time24 = timeInput;
      display12 = format24to12(timeInput);
    } else {
      display12 = timeInput;
      time24 = format12to24(timeInput);
    }

    setRawTimeInput(time24);
    setSelectedTimeSlot(display12);

    const year = dayObj.getFullYear();
    const month = String(dayObj.getMonth() + 1).padStart(2, '0');
    const day = String(dayObj.getDate()).padStart(2, '0');
    setInterviewDateTime(`${year}-${month}-${day}T${time24}`);
  };

  const triggerInterviewModal = (c: Candidate) => {
    setInterviewCandidate(c);
    const initialDate = new Date();
    initialDate.setDate(initialDate.getDate() + 1);
    setCalendarViewDate(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    updateInterviewSchedule(initialDate, '10:00', true);
  };

  const formatDateSubmitted = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Dynamically extract unique creation months from candidates
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    candidates.forEach((c) => {
      if (c.created_at) {
        const date = new Date(c.created_at);
        if (!isNaN(date.getTime())) {
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthsSet.add(monthKey);
        }
      }
    });
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [candidates]);

  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  };

  // HR Executive Analytics Metrics (Filtered Monthly)
  const analytics = useMemo(() => {
    let filtered = candidates;

    if (analyticsMonth !== 'all') {
      filtered = candidates.filter((c) => {
        if (!c.created_at) return false;
        const date = new Date(c.created_at);
        if (isNaN(date.getTime())) return false;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return key === analyticsMonth;
      });
    }

    const totalInvited = filtered.length;
    const evaluated = filtered.filter(
      (c) =>
        c.status === 'reviewed' ||
        c.status === 'shortlisted' ||
        c.status === 'interview' ||
        c.status === 'rejected' ||
        c.ai_score !== null
    ).length;
    const pending = filtered.filter(
      (c) => (c.status === 'invited' || c.status === 'Pending Resume') && c.ai_score === null
    ).length;

    return { totalInvited, evaluated, pending };
  }, [candidates, analyticsMonth]);

  // Unique lists for filter dropdowns
  const uniqueRoles = useMemo(() => {
    const roles = candidates.map((c) => c.role?.trim()).filter(Boolean);
    return Array.from(new Set(roles)).sort();
  }, [candidates]);

  const uniqueLocations = useMemo(() => {
    const locations = candidates
      .map((c) => (c.location || 'Remote / Unspecified').trim())
      .filter(Boolean);
    return Array.from(new Set(locations)).sort();
  }, [candidates]);

  // Process, Filter & Rank Candidates
  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = candidates.filter((c) => {
      const matchSearch =
        !q ||
        [
          c.name,
          c.email,
          c.role,
          c.location || '',
          c.ai_evaluation?.summary || '',
          ...(c.ai_evaluation?.strengths || []),
        ].some((val) => val.toLowerCase().includes(q));

      const matchStatus =
        statusFilter === 'all' ||
        c.status === statusFilter ||
        (statusFilter === 'selected' && (c.status === 'selected' || c.status === 'Selected')) ||
        (statusFilter === 'shortlisted' && c.status === 'shortlisted') ||
        (statusFilter === 'interview' && c.status === 'interview') ||
        (statusFilter === 'reviewed' && c.status === 'reviewed') ||
        (statusFilter === 'invited' && (c.status === 'invited' || c.status === 'Pending Resume')) ||
        (statusFilter === 'rejected' && c.status === 'rejected');

      const matchRole = roleFilter === 'all' || c.role === roleFilter;
      const matchLocation =
        locationFilter === 'all' || (c.location || 'Remote / Unspecified') === locationFilter;

      return matchSearch && matchStatus && matchRole && matchLocation;
    });

    const isSelected = (c: Candidate) => c.status === 'selected' || c.status === 'Selected';
    const isPending = (c: Candidate) => c.status === 'invited' || c.status === 'Pending Resume' || c.ai_score === null;

    const unselected = filtered.filter((c) => !isSelected(c));
    const selected = filtered.filter((c) => isSelected(c));

    // Rank only evaluated candidates with non-null AI scores
    const evaluatedUnselected = unselected.filter((c) => !isPending(c));
    const rankedEvaluated = [...evaluatedUnselected].sort((a, b) => (b.ai_score ?? -1) - (a.ai_score ?? -1));
    const rankMap = new Map(rankedEvaluated.map((c, i) => [c.id, i + 1]));

    const dir = sort.dir === 'asc' ? 1 : -1;
    const sortedUnselected = [...unselected].sort((a, b) => {
      switch (sort.key) {
        case 'role':
          return (a.role || '').localeCompare(b.role || '') * dir;
        case 'location':
          return (a.location || 'Remote').localeCompare(b.location || 'Remote') * dir;
        case 'date':
          return (
            ((a.created_at ? new Date(a.created_at).getTime() : 0) -
              (b.created_at ? new Date(b.created_at).getTime() : 0)) *
            dir
          );
        case 'rank':
          return ((rankMap.get(a.id) ?? 999) - (rankMap.get(b.id) ?? 999)) * dir;
        default:
          return ((a.ai_score ?? -1) - (b.ai_score ?? -1)) * dir;
      }
    });

    const sortedSelected = [...selected].sort((a, b) => {
      return ((b.ai_score ?? -1) - (a.ai_score ?? -1)) * dir;
    });

    const combined = [...sortedUnselected, ...sortedSelected];

    return combined.map((c) => ({
      candidate: c,
      rank: isSelected(c) || isPending(c) ? null : (rankMap.get(c.id) ?? null),
    }));
  }, [candidates, searchQuery, statusFilter, roleFilter, locationFilter, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  };

  // Export Data Functions (CSV, XLS, PDF)
  const exportAsCSV = () => {
    if (candidates.length === 0) return alert('No candidate records available to export.');

    const headers = [
      'Rank',
      'Name',
      'Email',
      'Phone',
      'Role',
      'Location',
      'Date Submitted',
      'Status',
      'AI Score',
      'Experience Points',
      'Skills Points',
      'Communication Points',
      'Stability Points',
      'AI Summary',
      'Resume URL',
    ];

    const exportRows = rows.map(({ candidate: c, rank }) => [
      rank,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.role || '').replace(/"/g, '""')}"`,
      `"${(c.location || 'Remote').replace(/"/g, '""')}"`,
      `"${formatDateSubmitted(c.created_at)}"`,
      `"${c.status}"`,
      c.ai_score ?? '',
      c.ai_evaluation?.criteria_breakdown?.experience_points ?? '',
      c.ai_evaluation?.criteria_breakdown?.skills_points ?? '',
      c.ai_evaluation?.criteria_breakdown?.communication_points ?? '',
      c.ai_evaluation?.criteria_breakdown?.stability_education_points ?? '',
      `"${(c.ai_evaluation?.summary || '').replace(/"/g, '""')}"`,
      `"${c.resume_url || ''}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...exportRows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const timestamp = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `BobaLive_Careers_Candidates_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportModal(false);
  };

  const exportAsXLS = () => {
    if (candidates.length === 0) return alert('No candidate records available to export.');

    const tableRows = rows
      .map(
        ({ candidate: c, rank }) => `
        <tr>
          <td>#${rank}</td>
          <td>${c.name}</td>
          <td>${c.email}</td>
          <td>${c.phone || ''}</td>
          <td>${c.role}</td>
          <td>${c.location || 'Remote'}</td>
          <td>${formatDateSubmitted(c.created_at)}</td>
          <td>${c.status}</td>
          <td>${c.ai_score ?? ''}</td>
          <td>${c.ai_evaluation?.criteria_breakdown?.experience_points ?? ''}</td>
          <td>${c.ai_evaluation?.criteria_breakdown?.skills_points ?? ''}</td>
          <td>${c.ai_evaluation?.criteria_breakdown?.communication_points ?? ''}</td>
          <td>${c.ai_evaluation?.criteria_breakdown?.stability_education_points ?? ''}</td>
          <td>${c.ai_evaluation?.summary || ''}</td>
          <td>${c.resume_url || ''}</td>
        </tr>
      `
      )
      .join('');

    const template = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"/></head>
      <body>
        <h2 style="font-family:Arial;color:#1e293b;">BobaLive Careers — Candidate Evaluation Leaderboard</h2>
        <table border="1" style="font-family:Arial;border-collapse:collapse;width:100%;">
          <thead>
            <tr style="background-color:#7c2d12;color:#ffffff;font-weight:bold;">
              <th>Rank</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Location</th>
              <th>Date Submitted</th><th>Status</th><th>AI Score</th><th>Experience (/40)</th>
              <th>Skills (/30)</th><th>Communication (/15)</th><th>Stability (/15)</th><th>AI Summary</th><th>Resume URL</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([template], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().slice(0, 10);
    link.download = `BobaLive_Careers_Candidates_${timestamp}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  const exportAsPDF = () => {
    if (candidates.length === 0) return alert('No candidate records available to export.');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to generate the PDF report.');

    const tableRows = rows
      .map(
        ({ candidate: c, rank }) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px; font-weight: bold; color: #64748b;">#${rank}</td>
          <td style="padding: 10px;">
            <strong style="color: #1e293b;">${c.name}</strong><br/>
            <span style="font-size: 11px; color: #64748b;">${c.email}</span>
          </td>
          <td style="padding: 10px; color: #334155;">${c.role}</td>
          <td style="padding: 10px; color: #475569;">${c.location || 'Remote'}</td>
          <td style="padding: 10px; color: #64748b; font-size: 11px;">${formatDateSubmitted(c.created_at)}</td>
          <td style="padding: 10px;">
            <span style="padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background: #f1f5f9; color: #334155;">
              ${c.status}
            </span>
          </td>
          <td style="padding: 10px; font-weight: bold; color: #0284c7;">
            ${c.ai_score !== null ? `${c.ai_score} / 100` : '—'}
          </td>
        </tr>
      `
      )
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>BobaLive Careers — Candidate Leaderboard Executive Report</title>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 30px; color: #1e293b; }
          h1 { color: #1e293b; font-size: 22px; margin-bottom: 5px; }
          p { color: #64748b; font-size: 12px; margin-top: 0; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
          th { background: #f8fafc; color: #475569; padding: 10px; border-bottom: 2px solid #e2e8f0; font-size: 12px; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div>
            <h1>BobaLive Careers — Candidate Leaderboard Executive Report</h1>
            <p>Generated on ${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })} | Total Candidates: ${rows.length}</p>
          </div>
          <button onclick="window.print()" style="background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;">
            Print / Save as PDF
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Rank</th><th>Candidate</th><th>Role</th><th>Location</th><th>Submitted Date</th><th>Status</th><th>AI Score</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <script>
          setTimeout(() => { window.print(); }, 500);
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setShowExportModal(false);
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'selected':
      case 'Selected':
        return (
          <span className="text-xs font-bold text-[#5f7f7a]">
            Selected
          </span>
        );
      case 'shortlisted':
      case 'Shortlisted':
        return (
          <span className="text-xs font-bold text-[#3d5a55]">
            Shortlisted
          </span>
        );
      case 'interview':
      case 'Interview Scheduled':
        return (
          <span className="text-xs font-bold text-indigo-700">
            Interview Scheduled
          </span>
        );
      case 'rejected':
      case 'Rejected':
        return (
          <span className="text-xs font-bold text-[#a53861]">
            Rejected
          </span>
        );
      case 'reviewed':
      case 'AI Evaluated':
        return (
          <span className="text-xs font-bold text-[#3d5a55]">
            AI Evaluated
          </span>
        );
      default:
        return (
          <span className="text-xs font-bold text-[#a53861]">
            Pending
          </span>
        );
    }
  };

  return (
    <main className="min-h-screen bg-background font-sans text-foreground">
      
      {/* Header Bar */}
      <header className="border-b border-[#8c2d50] bg-[#a53861] text-white shadow-md">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3.5">
            <img
              src="/boba-logo.png"
              alt="Boba Logo"
              className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-full border border-white/30 bg-black/20 p-0.5 object-cover shadow-sm filter drop-shadow-xs"
            />
            <div className="min-w-0">
              <h1 className="truncate font-brand text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight drop-shadow-xs">
                BobaLive Careers
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="inline-flex items-center justify-center rounded-md border border-white/30 bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/25 active:scale-95 cursor-pointer shadow-xs"
            >
              <Download className="mr-2 h-4 w-4" />
              Export Data
            </button>
            <button
              type="button"
              onClick={async () => {
                if (typeof window !== 'undefined') {
                  sessionStorage.removeItem('boba_admin_active');
                }
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
              }}
              className="inline-flex items-center justify-center rounded-md border border-white/30 bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/25 active:scale-95 cursor-pointer shadow-xs hover:bg-red-500/80"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-8 px-5 py-8 lg:px-8">
        
        {/* Executive Analytics Section */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-lg font-bold text-foreground">Executive Analytics</h2>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filter Month:</span>
              <select
                value={analyticsMonth}
                onChange={(e) => setAnalyticsMonth(e.target.value)}
                className="w-[190px] rounded-md border border-input bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Time</option>
                {availableMonths.map((mKey) => (
                  <option key={mKey} value={mKey}>
                    {formatMonthLabel(mKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Leads Invited</p>
              <p className="mt-3 font-display text-4xl font-bold text-foreground">{analytics.totalInvited}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumes Evaluated</p>
              <p className="mt-3 font-display text-4xl font-bold text-foreground">{analytics.evaluated}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending Leads</p>
              <p className="mt-3 font-display text-4xl font-bold text-foreground">{analytics.pending}</p>
            </div>
          </div>
        </section>

        {/* Simplified Lead Upload Section with Role Selector */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-panel space-y-3">
          <p className="text-xs text-muted-foreground">
            Upload candidate lead files (.csv / .xlsx) to evaluate responses, screen qualifications, and dispatch resume upload invites.
          </p>
          <form onSubmit={handleBatchFileUpload} className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="flex-1 min-w-0">
              <input
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#a53861] file:text-white hover:file:bg-[#8c2d50] cursor-pointer border border-input rounded-lg bg-background p-1"
              />
            </div>

            <div className="w-full md:w-56">
              <select
                aria-label="Select target role for uploaded leads"
                value={uploadRoleOverride}
                onChange={(e) => setUploadRoleOverride(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-[#a53861] h-[36px]"
              >
                <option value="HR Executive">HR Executive</option>
                <option value="General Manager">Manager</option>
                <option value="Cafe Staff / Barista">Cafe Staff / Barista</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={batchImporting || !csvFile}
              className="inline-flex w-full md:w-auto items-center justify-center rounded-lg bg-[#a53861] px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-[#8c2d50] disabled:opacity-50 cursor-pointer shrink-0 shadow-xs h-[36px]"
            >
              <Upload className="mr-2 h-4 w-4" />
              {batchImporting ? 'Evaluating...' : 'Evaluate'}
            </button>
          </form>

          {importStatus && (
            <p className="mt-3 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              Processed {importStatus.processed} of {importStatus.total} leads. Sent {importStatus.emailsSent} invitation emails.
            </p>
          )}
        </section>

        {/* Toolbar & Filters */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-panel">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidates, emails, roles, locations or AI-extracted skills"
                className="w-full rounded-md border border-input bg-background pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="hidden h-4 w-4 text-muted-foreground lg:block" />
              
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-[180px] rounded-md border border-input bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Statuses</option>
                <option value="selected">Selected</option>
                <option value="shortlisted">Shortlisted</option>
                <option value="interview">Interview Scheduled</option>
                <option value="reviewed">AI Evaluated</option>
                <option value="invited">Pending Resume</option>
                <option value="rejected">Rejected</option>
              </select>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-[180px] rounded-md border border-input bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Roles</option>
                {uniqueRoles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-[180px] rounded-md border border-input bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Locations</option>
                {uniqueLocations.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Candidate Leaderboard Table */}
        <section className="rounded-xl border border-border bg-card shadow-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#4d6a65] bg-[#5f7f7a] px-6 py-4 text-white">
            <h2 className="font-display text-lg font-bold text-white tracking-tight">Candidate Leaderboard</h2>
            <div className="flex items-center gap-3">
              {candidates.some((c) => c.resume_url && (c.ai_score === null || !c.ai_evaluation)) && (
                <button
                  type="button"
                  disabled={batchEvaluating}
                  onClick={handleBatchEvaluatePending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs transition-colors cursor-pointer"
                >
                  {batchEvaluating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Evaluate All Pending Resumes
                </button>
              )}
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs">
                {rows.length} records
              </span>
            </div>
          </div>

          <div className="overflow-x-auto w-full pb-2">
            <table className="w-full min-w-[1550px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#5f7f7a]/25 bg-[#5f7f7a]/10 text-left">
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-[#3d5a55] w-20 border-r border-[#5f7f7a]/25">
                    <button type="button" onClick={() => toggleSort('rank')} className="inline-flex items-center gap-1.5 hover:text-[#5f7f7a]">
                      Rank <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-[#3d5a55] min-w-[240px] border-r border-[#5f7f7a]/25">
                    Candidate
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-[#3d5a55] min-w-[170px] border-r border-[#5f7f7a]/25">
                    <button type="button" onClick={() => toggleSort('role')} className="inline-flex items-center gap-1.5 hover:text-[#5f7f7a]">
                      Role <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-[#3d5a55] min-w-[150px] border-r border-[#5f7f7a]/25">
                    <button type="button" onClick={() => toggleSort('location')} className="inline-flex items-center gap-1.5 hover:text-[#5f7f7a]">
                      Location <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-[#3d5a55] min-w-[200px] border-r border-[#5f7f7a]/25">
                    <button type="button" onClick={() => toggleSort('date')} className="inline-flex items-center gap-1.5 hover:text-[#5f7f7a]">
                      Submitted Date & Time <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-[#3d5a55] min-w-[160px] border-r border-[#5f7f7a]/25">
                    Status
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-[#3d5a55] min-w-[130px] border-r border-[#5f7f7a]/25">
                    <button type="button" onClick={() => toggleSort('points')} className="inline-flex items-center gap-1.5 hover:text-[#5f7f7a]">
                      Total Points <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-[#3d5a55] min-w-[560px] text-right">
                    Automated Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-sm text-muted-foreground">
                      {searchQuery ? `No candidates match "${searchQuery}".` : 'No candidates match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  rows.map(({ candidate: c, rank }) => (
                    <tr key={c.id} className="transition-colors hover:bg-muted/40 divide-x divide-border/60">
                      <td className="px-5 py-4 font-display text-base font-bold text-muted-foreground border-r border-border/60">
                        {rank !== null ? `#${rank}` : '—'}
                      </td>
                      <td className="px-5 py-4 border-r border-border/60">
                        <p className="font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </td>
                      <td className="px-5 py-4 border-r border-border/60">{c.role}</td>
                      <td className="px-5 py-4 text-muted-foreground border-r border-border/60">{c.location || 'Remote'}</td>
                      <td className="px-5 py-4 text-xs font-medium text-muted-foreground border-r border-border/60">
                        {formatDateSubmitted(c.created_at)}
                      </td>
                      <td className="px-5 py-4 border-r border-border/60">{renderStatusBadge(c.status)}</td>
                      <td className="px-5 py-4 border-r border-border/60">
                        {c.ai_score === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="font-display text-lg font-bold text-foreground">
                            {c.ai_score}
                            <span className="text-xs font-medium text-muted-foreground">/100</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center rounded-lg border border-border bg-background p-0.5 divide-x divide-border shadow-xs">
                          <button
                            type="button"
                            disabled={c.status === 'shortlisted' || c.status === 'Shortlisted'}
                            onClick={() => setConfirmAction({ candidate: c, action: 'Shortlist' })}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40 cursor-pointer"
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                            Shortlist
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerInterviewModal(c)}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
                          >
                            <CalendarClock className="mr-1 h-3.5 w-3.5 text-indigo-600" />
                            Interview
                          </button>
                          <button
                            type="button"
                            disabled={c.status === 'rejected' || c.status === 'Rejected'}
                            onClick={() => setConfirmAction({ candidate: c, action: 'Reject' })}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40 cursor-pointer"
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5 text-rose-600" />
                            Reject
                          </button>
                          <button
                            type="button"
                            title={!c.resume_url ? `Send CV upload reminder to ${c.name}` : `Send message to ${c.name}`}
                            onClick={() => openMessageModal(c)}
                            className={`inline-flex items-center px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                              !c.resume_url
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold'
                                : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            <MessageSquare className={`mr-1 h-3.5 w-3.5 ${!c.resume_url ? 'text-amber-600' : ''}`} />
                            {!c.resume_url ? 'Remind CV' : 'Message'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveModal({ candidate: c, type: 'breakdown' })}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted cursor-pointer"
                          >
                            Points Breakdown
                          </button>
                          <button
                            type="button"
                            disabled={!c.resume_url}
                            onClick={() => setActiveModal({ candidate: c, type: 'pdf' })}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 cursor-pointer"
                          >
                            <FileText className="mr-1 h-3.5 w-3.5" />
                            View PDF
                          </button>
                          
                          {/* Tick Button: Selects candidate, removes rank & places down */}
                          <button
                            type="button"
                            title="Select candidate (Removes rank & places at bottom)"
                            disabled={c.status === 'selected' || c.status === 'Selected'}
                            onClick={() => handleSelectCandidate(c)}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 cursor-pointer transition-colors"
                          >
                            <Check className="h-4 w-4 text-emerald-600 stroke-[3]" />
                          </button>

                          {/* Cross Button: Prompts deletion modal without blocking UI thread */}
                          <button
                            type="button"
                            title="Delete candidate from dashboard & database"
                            onClick={() => setConfirmAction({ candidate: c, action: 'Delete' })}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 cursor-pointer transition-colors"
                          >
                            <X className="h-4 w-4 text-rose-600 stroke-[3]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>

      {/* Export Data Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-xl border border-border max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-foreground">Export Data</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Select an export format for the candidate leaderboard view ({rows.length} records)</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="text-muted-foreground hover:text-foreground text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-2">
              <button
                type="button"
                onClick={exportAsCSV}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary hover:bg-muted cursor-pointer"
              >
                <span className="font-medium text-foreground">CSV Spreadsheet</span>
                <span className="text-sm text-muted-foreground">.csv</span>
              </button>
              <button
                type="button"
                onClick={exportAsXLS}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary hover:bg-muted cursor-pointer"
              >
                <span className="font-medium text-foreground">Excel Spreadsheet</span>
                <span className="text-sm text-muted-foreground">.xls</span>
              </button>
              <button
                type="button"
                onClick={exportAsPDF}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary hover:bg-muted cursor-pointer"
              >
                <span className="font-medium text-foreground">Executive PDF Report</span>
                <span className="text-sm text-muted-foreground">.pdf</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-xl border border-border max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-foreground">
                  {confirmAction.action === 'Shortlist'
                    ? 'Confirm Shortlist'
                    : confirmAction.action === 'Reject'
                    ? 'Confirm Rejection'
                    : 'Confirm Delete Candidate'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Candidate: <strong className="text-foreground">{confirmAction.candidate.name}</strong> ({confirmAction.candidate.role})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="text-muted-foreground hover:text-foreground text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              {confirmAction.action === 'Shortlist'
                ? `${confirmAction.candidate.name} will be marked as Shortlisted and a congratulatory email will be sent to ${confirmAction.candidate.email}.`
                : confirmAction.action === 'Reject'
                ? `${confirmAction.candidate.name} will be marked as Rejected and a polite, encouraging status update will be sent to ${confirmAction.candidate.email}.`
                : `Are you sure you want to permanently remove ${confirmAction.candidate.name} from the candidate dashboard and database? This action cannot be undone.`}
            </p>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStatusChange}
                disabled={actionProcessing}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer ${
                  confirmAction.action === 'Delete'
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {actionProcessing
                  ? 'Processing...'
                  : confirmAction.action === 'Delete'
                  ? 'Delete Candidate'
                  : 'Confirm & Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Interview Modal with Custom Interactive Calendar */}
      {interviewCandidate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card rounded-2xl border border-border max-w-lg w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex justify-between items-start border-b border-border pb-4">
              <div>
                <h3 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-primary" /> Schedule Interview
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Select interview date & time slot for <strong className="text-foreground">{interviewCandidate.name}</strong> ({interviewCandidate.role})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInterviewCandidate(null)}
                className="text-muted-foreground hover:text-foreground text-xl font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmInterview} className="space-y-5">
              
              {/* Interactive Calendar Header & Navigation */}
              <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCalendarViewDate(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1))}
                    className="p-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-display text-sm font-bold text-foreground">
                    {calendarViewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCalendarViewDate(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1))}
                    className="p-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted cursor-pointer transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Day Names Header */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <span key={d} className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      {d}
                    </span>
                  ))}
                </div>

                {/* Calendar Days Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const year = calendarViewDate.getFullYear();
                    const month = calendarViewDate.getMonth();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const firstDayOffset = new Date(year, month, 1).getDay();

                    const today = new Date();
                    const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

                    const cells = [];

                    // Blank offset cells
                    for (let i = 0; i < firstDayOffset; i++) {
                      cells.push(<div key={`blank-${i}`} className="h-9 w-9" />);
                    }

                    // Days 1 to N
                    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
                      const thisDate = new Date(year, month, dayNum);
                      const isSelected =
                        selectedInterviewDate.getDate() === dayNum &&
                        selectedInterviewDate.getMonth() === month &&
                        selectedInterviewDate.getFullYear() === year;
                      const isToday =
                        today.getDate() === dayNum &&
                        today.getMonth() === month &&
                        today.getFullYear() === year;
                      const isPast = thisDate < todayAtMidnight;

                      cells.push(
                        <button
                          key={dayNum}
                          type="button"
                          disabled={isPast}
                          onClick={() => updateInterviewSchedule(thisDate, selectedTimeSlot)}
                          className={`h-9 w-9 mx-auto flex items-center justify-center rounded-xl text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-[#a53861] text-white shadow-md scale-105'
                              : isToday
                              ? 'border-2 border-[#a53861] text-[#a53861] hover:bg-accent'
                              : isPast
                              ? 'text-muted-foreground/30 cursor-not-allowed'
                              : 'text-foreground hover:bg-accent cursor-pointer'
                          }`}
                        >
                          {dayNum}
                        </button>
                      );
                    }

                    return cells;
                  })()}
                </div>
              </div>

              {/* Manual Time Entry & Quick Presets */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="manual-interview-time" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    <span>Interview Time (Manual Entry)</span>
                  </label>
                  <span className="text-xs font-extrabold text-[#5f7f7a] bg-[#5f7f7a]/15 px-2.5 py-0.5 rounded-full border border-[#5f7f7a]/30 shadow-2xs">
                    {selectedTimeSlot}
                  </span>
                </div>

                {/* Direct Manual Time Picker Input */}
                <div className="relative">
                  <input
                    id="manual-interview-time"
                    type="time"
                    value={rawTimeInput}
                    onChange={(e) => updateInterviewSchedule(selectedInterviewDate, e.target.value, true)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-[#5f7f7a] shadow-xs cursor-pointer"
                  />
                </div>

                {/* Quick Presets for Speed */}
                <div className="space-y-1.5 pt-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Quick Preset Shortcuts:
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {['09:00 AM', '10:00 AM', '11:30 AM', '01:30 PM', '03:00 PM', '04:30 PM'].map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => updateInterviewSchedule(selectedInterviewDate, slot, false)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          selectedTimeSlot === slot
                            ? 'bg-[#5f7f7a] text-white border-[#5f7f7a] shadow-xs'
                            : 'bg-background border-border text-foreground hover:bg-muted cursor-pointer'
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Time Zone and Confirmation Notice */}
              <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1">
                <p className="text-xs text-foreground font-semibold flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  Scheduled Date & Time
                </p>
                <p className="text-sm font-bold text-primary">
                  {interviewDateTime ? new Date(interviewDateTime).toLocaleString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  }) : 'Please pick a valid date & time'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  An official BobaLive Google Calendar (.ics) invite will be sent directly to {interviewCandidate.email}.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setInterviewCandidate(null)}
                  className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEmail || !interviewDateTime}
                  className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {sendingEmail ? 'Sending Invitation...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Message to Applicant Modal */}
      {messageCandidate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card rounded-2xl border border-border max-w-xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex justify-between items-start border-b border-border pb-4">
              <div>
                <h3 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-amber-600" /> Send Message
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Applicant: <strong className="text-foreground">{messageCandidate.name}</strong> • {messageCandidate.email} • <span className="font-semibold">{messageCandidate.role}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMessageCandidate(null)}
                className="text-muted-foreground hover:text-foreground text-xl font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendCustomMessage} className="space-y-4">
              {/* Quick Template Presets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Quick Message Templates:
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                      const uploadUrl = `${baseUrl}/upload?id=${messageCandidate.id}&name=${encodeURIComponent(messageCandidate.name)}&role=${encodeURIComponent(messageCandidate.role)}`;
                      setCustomMessage((prev) => `${prev.trim()}\n\nUpload CV Link:\n${uploadUrl}\n\n`);
                    }}
                    className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    + Insert CV Upload Link
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                      const uploadUrl = `${baseUrl}/upload?id=${messageCandidate.id}&name=${encodeURIComponent(messageCandidate.name)}&role=${encodeURIComponent(messageCandidate.role)}`;
                      setCustomSubject(`Reminder: Please upload your CV for ${messageCandidate.role} — BobaLive`);
                      setCustomMessage(
                        `Hello ${messageCandidate.name},\n\nThis is a friendly reminder regarding your application for the ${messageCandidate.role} position at BobaLive.\n\nWe noticed that we haven't received your CV / Resume yet. To help our recruitment team review your qualifications and proceed with your application, please upload your resume (PDF) using the secure link below:\n\nUpload CV Link:\n${uploadUrl}\n\nPlease upload your CV as soon as possible so we can proceed with your interview evaluation.\n\nBest regards,\nBobaLive Recruitment Team`
                      );
                    }}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 cursor-pointer transition-colors shadow-xs"
                  >
                    📤 CV Upload Reminder
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomSubject(`Update regarding your application for ${messageCandidate.role} at BobaLive`);
                      setCustomMessage(
                        `Hello ${messageCandidate.name},\n\nWe are currently reviewing candidate applications for the ${messageCandidate.role} position and wanted to thank you for your interest in BobaLive.\n\nOur team will be in touch with further updates soon.\n\nBest regards,\nBobaLive HR Team`
                      );
                    }}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border bg-muted/50 hover:bg-muted text-foreground cursor-pointer transition-colors"
                  >
                    📝 General Update
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomSubject(`Document Request: Additional Details Needed for ${messageCandidate.role} Position`);
                      setCustomMessage(
                        `Hello ${messageCandidate.name},\n\nCould you please reply with an updated copy of your resume or any relevant certifications (e.g. food safety / beverage training) to help us complete your application evaluation?\n\nThank you,\nBobaLive Recruitment`
                      );
                    }}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border bg-muted/50 hover:bg-muted text-foreground cursor-pointer transition-colors"
                  >
                    📄 Request Documents
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomSubject(`Interview Availability Inquiry: ${messageCandidate.role} at BobaLive`);
                      setCustomMessage(
                        `Hello ${messageCandidate.name},\n\nWe would like to speak with you regarding your application for the ${messageCandidate.role} role. Please let us know what times and days work best for you this week for an interview.\n\nLooking forward to speaking with you!`
                      );
                    }}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border bg-muted/50 hover:bg-muted text-foreground cursor-pointer transition-colors"
                  >
                    💬 Interview Availability
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomSubject(`Message regarding your application for ${messageCandidate.role} at BobaLive`);
                      setCustomMessage(`Hello ${messageCandidate.name},\n\n`);
                    }}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg border border-dashed border-border bg-background hover:bg-muted text-muted-foreground cursor-pointer transition-colors"
                  >
                    ✨ Blank
                  </button>
                </div>
              </div>

              {/* Subject Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Email Subject</label>
                <input
                  type="text"
                  required
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder="Subject line..."
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                />
              </div>

              {/* Message Body */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Message Body</label>
                <textarea
                  required
                  rows={6}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Type your message to the applicant here..."
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs resize-y"
                />
                <p className="text-[11px] text-muted-foreground">
                  The message will be formatted with official BobaLive branding and dispatched directly to <strong>{messageCandidate.email}</strong>.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setMessageCandidate(null)}
                  className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingCustomMessage || !customMessage.trim()}
                  className="inline-flex items-center rounded-md bg-amber-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {sendingCustomMessage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Message
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SEPARATE MODAL 1: Dedicated AI Points Breakdown Modal */}
      {activeModal?.type === 'breakdown' && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card rounded-2xl border border-border max-w-4xl w-full p-6 sm:p-7 space-y-5 shadow-2xl my-8 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-border pb-4 shrink-0">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-display text-xl font-bold text-foreground">{activeModal.candidate.name}</h3>
                  {renderStatusBadge(activeModal.candidate.status)}
                  {/* Role Badge */}
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${
                    activeModal.candidate.role.toLowerCase().includes('hr') || activeModal.candidate.role.toLowerCase().includes('human resource')
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : activeModal.candidate.role.toLowerCase().includes('general manager') || activeModal.candidate.role.toLowerCase().includes('gm')
                      ? 'bg-purple-100 text-purple-800 border-purple-300'
                      : activeModal.candidate.role.toLowerCase().includes('barista')
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}>
                    {activeModal.candidate.role}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeModal.candidate.email} • {activeModal.candidate.role} • {activeModal.candidate.location || 'Remote'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  setCriteriaCategoryFilter('all');
                  setCriteriaSearchQuery('');
                }}
                className="text-muted-foreground hover:text-foreground text-xl font-bold p-1 rounded-lg transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto pr-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-display text-base font-bold text-foreground flex items-center gap-2">
                  <span>📊</span> AI Evaluation & Verification Report
                </h4>
                {/* Verification Indicator */}
                {activeModal.candidate.ai_evaluation && (
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border shadow-xs ${
                    (activeModal.candidate.ai_evaluation as any)?.meta_verification_status === 'Discrepancy Noted'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : (activeModal.candidate.ai_evaluation as any)?.meta_verification_status === 'Unverified'
                      ? 'bg-slate-100 text-slate-800 border-slate-300'
                      : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  }`}>
                    Verification: {(activeModal.candidate.ai_evaluation as any)?.meta_verification_status || 'Verified'}
                  </span>
                )}
              </div>

              {/* Lead Form Summary Card */}
              {activeModal.candidate.questionnaire_data && (
                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">📋 Lead Form Self-Reported Answers</h5>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">Meta Lead Ad</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {Object.entries(activeModal.candidate.questionnaire_data).map(([key, val]) => (
                      <div key={key} className="bg-card p-2.5 rounded-lg border border-border/60">
                        <span className="font-semibold text-muted-foreground capitalize">{key.replace(/_/g, ' ')}: </span>
                        <strong className="text-foreground">{typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {activeModal.candidate.ai_evaluation ? (
                <>
                  {/* Scores Grid */}
                  {(() => {
                    const isHR = activeModal.candidate.role.toLowerCase().includes('hr') || activeModal.candidate.role.toLowerCase().includes('human resource');
                    const isGM = activeModal.candidate.role.toLowerCase().includes('general manager') || activeModal.candidate.role.toLowerCase().includes('gm');

                    const items = isHR
                      ? [
                          { label: 'HR & Multi-Branch Exp', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.experience_points ?? 0, max: 35 },
                          { label: 'HR Ops & Compliance', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.skills_points ?? 0, max: 30 },
                          { label: 'People Mgmt & Comms', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.communication_points ?? 0, max: 20 },
                          { label: 'Stability & Mobility', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.stability_education_points ?? 0, max: 15 },
                        ]
                      : isGM
                      ? [
                          { label: 'Multi-Outlet & P&L', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.experience_points ?? 0, max: 35 },
                          { label: 'People Leadership', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.skills_points ?? 0, max: 25 },
                          { label: 'QSR / Cafe Relevance', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.communication_points ?? 0, max: 20 },
                          { label: 'Consistency & Verification', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.stability_education_points ?? 0, max: 20 },
                        ]
                      : [
                          { label: 'Experience', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.experience_points ?? 0, max: 40 },
                          { label: 'Core Skills', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.skills_points ?? 0, max: 30 },
                          { label: 'Communication', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.communication_points ?? 0, max: 15 },
                          { label: 'Stability & Verification', score: activeModal.candidate.ai_evaluation.criteria_breakdown?.stability_education_points ?? 0, max: 15 },
                        ];

                    return (
                      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                        {items.map((item) => (
                          <div key={item.label} className="rounded-xl border border-border bg-muted/40 p-3.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate" title={item.label}>
                              {item.label}
                            </p>
                            <p className="mt-1 font-display text-2xl font-black text-foreground">
                              {item.score}
                              <span className="text-xs font-medium text-muted-foreground">/{item.max}</span>
                            </p>
                            <div className="mt-2 h-2 w-full rounded-full bg-border overflow-hidden">
                              <div
                                className="h-2 rounded-full bg-primary transition-all duration-500"
                                style={{ width: `${Math.min(100, (item.score / item.max) * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Total Score Banner */}
                  <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total AI Evaluation Score</p>
                    <p className="font-display text-3xl font-black text-foreground">{activeModal.candidate.ai_score ?? 0}<span className="text-sm font-semibold text-muted-foreground"> / 100</span></p>
                  </div>

                  {/* Mandatory Eligibility Card (if available) */}
                  {activeModal.candidate.ai_evaluation.mandatory_eligibility && (
                    <div className="rounded-xl border border-[#ebd9c8] bg-[#f7ebe0]/50 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-[#2d1822] flex items-center gap-1.5">
                          <span>✅</span> Mandatory Role Eligibility Verification
                        </h5>
                        <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold border ${
                          activeModal.candidate.ai_evaluation.mandatory_eligibility.overall_eligible
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}>
                          {activeModal.candidate.ai_evaluation.mandatory_eligibility.overall_eligible ? 'Eligible' : 'Eligibility Gap Noted'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        {/* HR Executive Eligibility Fields */}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.hr_experience_2_to_5_years_verified !== undefined && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">2–5 Yrs HR Exp:</span>
                            <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.hr_experience_2_to_5_years_verified ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.hr_experience_2_to_5_years_verified ? '✓ Verified' : '✕ Not Verified'}
                            </span>
                          </div>
                        )}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.recruitment_experience_verified !== undefined && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">Recruitment Exp:</span>
                            <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.recruitment_experience_verified ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.recruitment_experience_verified ? '✓ Verified' : 'Not Verified'}
                            </span>
                          </div>
                        )}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.multi_branch_or_operational_verified !== undefined && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">Multi-Branch Exp:</span>
                            <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.multi_branch_or_operational_verified ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.multi_branch_or_operational_verified ? '✓ Verified' : 'Not Verified'}
                            </span>
                          </div>
                        )}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.malayalam_proficiency_verified !== undefined && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">Malayalam:</span>
                            <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.malayalam_proficiency_verified ? 'text-emerald-700' : 'text-amber-600'}`}>
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.malayalam_proficiency_verified ? '✓ Verified' : 'Unverified'}
                            </span>
                          </div>
                        )}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.two_wheeler_mobility_verified !== undefined && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">Mobility / Bike:</span>
                            <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.two_wheeler_mobility_verified ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.two_wheeler_mobility_verified ? '✓ Verified' : 'Not Stated'}
                            </span>
                          </div>
                        )}

                        {/* GM Eligibility Fields */}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.minimum_5_years_exp_verified !== undefined && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">5+ Yrs Mgr Exp:</span>
                            <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.minimum_5_years_exp_verified ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.minimum_5_years_exp_verified ? '✓ Verified' : '✕ Not Verified'}
                            </span>
                          </div>
                        )}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.multi_outlet_verified !== undefined && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">Multi-Outlet:</span>
                            <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.multi_outlet_verified ? 'text-emerald-700' : 'text-amber-600'}`}>
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.multi_outlet_verified ? '✓ Verified' : 'Unverified'}
                            </span>
                          </div>
                        )}

                        {/* Barista & Cafe Staff Fields */}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.barista_training_verified !== undefined &&
                          activeModal.candidate.ai_evaluation.mandatory_eligibility.barista_training_verified !== null && (
                            <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                              <span className="text-muted-foreground font-medium">Barista Training:</span>
                              <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.barista_training_verified ? 'text-emerald-700' : 'text-rose-600'}`}>
                                {activeModal.candidate.ai_evaluation.mandatory_eligibility.barista_training_verified ? '✓ Verified' : '✕ Not Verified'}
                              </span>
                            </div>
                        )}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.minimum_1_year_qsr_verified !== undefined && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">Min 1 Yr QSR:</span>
                            <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.minimum_1_year_qsr_verified ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.minimum_1_year_qsr_verified ? '✓ Verified' : '✕ Not Verified'}
                            </span>
                          </div>
                        )}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.coffee_experience_verified !== undefined && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">Coffee Prep:</span>
                            <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.coffee_experience_verified ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.coffee_experience_verified ? '✓ Verified' : 'Not Verified'}
                            </span>
                          </div>
                        )}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.bubble_tea_experience_verified !== undefined && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">Bubble Tea Prep:</span>
                            <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.bubble_tea_experience_verified ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.bubble_tea_experience_verified ? '✓ Verified' : 'Not Verified'}
                            </span>
                          </div>
                        )}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.dual_beverage_ready !== undefined && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">Dual Beverage:</span>
                            <span className={`font-bold ${activeModal.candidate.ai_evaluation.mandatory_eligibility.dual_beverage_ready ? 'text-emerald-700' : 'text-amber-600'}`}>
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.dual_beverage_ready ? '✓ Demonstrated' : 'Partial'}
                            </span>
                          </div>
                        )}
                        {activeModal.candidate.ai_evaluation.mandatory_eligibility.age_eligibility_status && (
                          <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">Age Pref (18-30):</span>
                            <span className="font-semibold text-foreground">
                              {activeModal.candidate.ai_evaluation.mandatory_eligibility.age_eligibility_status}
                            </span>
                          </div>
                        )}
                      </div>
                      {activeModal.candidate.ai_evaluation.mandatory_eligibility.notes && (
                        <p className="text-[11px] text-muted-foreground italic border-t border-[#ebd9c8]/70 pt-2">
                          Note: {activeModal.candidate.ai_evaluation.mandatory_eligibility.notes}
                        </p>
                      )}
                    </div>
                  )}

                  {/* AI Audit Summary */}
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">AI Audit Summary</h5>
                    <p className="text-xs leading-relaxed text-foreground bg-muted/30 p-3.5 rounded-xl border border-border">
                      {activeModal.candidate.ai_evaluation.summary || 'No evaluation summary available.'}
                    </p>
                  </div>

                  {/* Strengths & Gaps */}
                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-3.5">
                      <h5 className="text-xs font-bold uppercase tracking-wide text-emerald-900 mb-2 flex items-center gap-1.5">
                        <span>✨</span> Key Strengths
                      </h5>
                      <ul className="space-y-1.5">
                        {activeModal.candidate.ai_evaluation.strengths && activeModal.candidate.ai_evaluation.strengths.length > 0 ? (
                          activeModal.candidate.ai_evaluation.strengths.map((s, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-emerald-950">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0 mt-1.5" />
                              <span>{s}</span>
                            </li>
                          ))
                        ) : (
                          <li className="text-muted-foreground">None identified.</li>
                        )}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-rose-200/60 bg-rose-50/40 p-3.5">
                      <h5 className="text-xs font-bold uppercase tracking-wide text-rose-900 mb-2 flex items-center gap-1.5">
                        <span>⚠️</span> Identified Gaps & Risks
                      </h5>
                      <ul className="space-y-1.5">
                        {activeModal.candidate.ai_evaluation.gaps && activeModal.candidate.ai_evaluation.gaps.length > 0 ? (
                          activeModal.candidate.ai_evaluation.gaps.map((g, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-rose-950">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 shrink-0 mt-1.5" />
                              <span>{g}</span>
                            </li>
                          ))
                        ) : (
                          <li className="text-muted-foreground">No significant gaps detected.</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* 35 Detailed Criteria Questions Deep Dive */}
                  {activeModal.candidate.ai_evaluation.evaluated_questions &&
                    activeModal.candidate.ai_evaluation.evaluated_questions.length > 0 && (
                      <div className="rounded-2xl border border-border bg-card p-4 space-y-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                          <div>
                            <h5 className="font-display text-sm font-bold text-foreground flex items-center gap-1.5">
                              <span>📋</span> Professional Criteria Evaluation ({activeModal.candidate.ai_evaluation.evaluated_questions.length} Points)
                            </h5>
                            <p className="text-[11px] text-muted-foreground">
                              Direct & indirect evidence extracted from the candidate's CV for each criterion.
                            </p>
                          </div>
                          
                          {/* Search criteria */}
                          <div className="relative w-full sm:w-56">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                              type="text"
                              value={criteriaSearchQuery}
                              onChange={(e) => setCriteriaSearchQuery(e.target.value)}
                              placeholder="Search criteria or evidence..."
                              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        </div>

                        {/* Category filter pills */}
                        {(() => {
                          const categories = Array.from(
                            new Set(activeModal.candidate.ai_evaluation.evaluated_questions.map((q) => q.category))
                          );
                          return (
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => setCriteriaCategoryFilter('all')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border ${
                                  criteriaCategoryFilter === 'all'
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                                }`}
                              >
                                All ({activeModal.candidate.ai_evaluation.evaluated_questions.length})
                              </button>
                              {categories.map((cat) => {
                                const count = activeModal.candidate.ai_evaluation!.evaluated_questions!.filter((q) => q.category === cat).length;
                                return (
                                  <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setCriteriaCategoryFilter(cat)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border ${
                                      criteriaCategoryFilter === cat
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                                    }`}
                                  >
                                    {cat} ({count})
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Questions List */}
                        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                          {activeModal.candidate.ai_evaluation.evaluated_questions
                            .filter((q) => {
                              const matchCat = criteriaCategoryFilter === 'all' || q.category === criteriaCategoryFilter;
                              const qSearch = criteriaSearchQuery.trim().toLowerCase();
                              const matchQuery =
                                !qSearch ||
                                q.question.toLowerCase().includes(qSearch) ||
                                q.evidence.toLowerCase().includes(qSearch) ||
                                q.status.toLowerCase().includes(qSearch);
                              return matchCat && matchQuery;
                            })
                            .map((item, idx) => {
                              const isDirect = item.status?.toLowerCase().includes('direct');
                              const isIndirect = item.status?.toLowerCase().includes('indirect');
                              const isGap = item.status?.toLowerCase().includes('gap') || item.status?.toLowerCase().includes('risk');
                              
                              return (
                                <div
                                  key={idx}
                                  className="rounded-xl border border-border/80 bg-muted/20 p-3 text-xs space-y-1.5 hover:bg-muted/40 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono font-bold text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                                        #{item.id ?? idx + 1}
                                      </span>
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-card px-2 py-0.5 rounded border border-border/60">
                                        {item.category}
                                      </span>
                                    </div>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border shrink-0 ${
                                        isDirect
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                          : isIndirect
                                          ? 'bg-sky-100 text-sky-800 border-sky-300'
                                          : isGap
                                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                                          : 'bg-slate-100 text-slate-700 border-slate-300'
                                      }`}
                                    >
                                      {item.status || 'Evaluated'}
                                    </span>
                                  </div>
                                  <p className="font-semibold text-foreground leading-snug">{item.question}</p>
                                  <div className="bg-card p-2 rounded-lg border border-border/70 text-muted-foreground text-[11px] leading-relaxed">
                                    <span className="font-bold text-foreground">CV Evidence: </span>
                                    {item.evidence || 'No direct evidence found in CV.'}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                </>
              ) : (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No AI evaluation yet. Candidate has not submitted a resume.
                </div>
              )}
            </div>

            <div className="pt-3 flex justify-end border-t border-border shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  setCriteriaCategoryFilter('all');
                  setCriteriaSearchQuery('');
                }}
                className="rounded-xl bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SEPARATE MODAL 2: Dedicated In-App PDF Resume Viewer Modal */}
      {activeModal?.type === 'pdf' && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card rounded-xl border border-border max-w-4xl w-full p-6 space-y-4 shadow-2xl my-8">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <div className="flex items-center space-x-3 mb-1">
                  <h3 className="font-display text-xl font-bold text-foreground">{activeModal.candidate.name} — Resume PDF</h3>
                  {renderStatusBadge(activeModal.candidate.status)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeModal.candidate.role} • {activeModal.candidate.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-muted-foreground hover:text-foreground text-xl font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border">
                <span>Cross-verifying uploaded PDF for <strong>{activeModal.candidate.name}</strong></span>
                {activeModal.candidate.resume_url && (
                  <a
                    href={activeModal.candidate.resume_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary font-semibold hover:underline"
                  >
                    Open in New Tab ↗
                  </a>
                )}
              </div>

              {activeModal.candidate.resume_url ? (
                <div className="w-full h-[600px] rounded-lg overflow-hidden border border-border bg-muted">
                  <iframe
                    src={activeModal.candidate.resume_url}
                    className="w-full h-full border-0"
                    title={`${activeModal.candidate.name} Resume PDF`}
                  />
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-xs rounded-lg border border-border bg-muted/20">
                  No PDF uploaded for this candidate yet.
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
