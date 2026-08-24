'use client';

import { useState, useRef, useMemo, Suspense, type DragEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  AlertTriangle,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react';

const MAX_BYTES = 1 * 1024 * 1024;

const SCATTER = [
  { left: '-4%', top: '2%', size: 180, rotate: -12, opacity: 0.2, delay: 0, duration: 11 },
  { left: '65%', top: '-2%', size: 210, rotate: 9, opacity: 0.18, delay: 1.2, duration: 13 },
  { left: '22%', top: '16%', size: 130, rotate: 22, opacity: 0.15, delay: 2.4, duration: 9.5 },
  { left: '78%', top: '32%', size: 150, rotate: -18, opacity: 0.16, delay: 0.6, duration: 12.5 },
  { left: '-8%', top: '48%', size: 200, rotate: 14, opacity: 0.18, delay: 1.8, duration: 14 },
  { left: '48%', top: '62%', size: 140, rotate: -6, opacity: 0.14, delay: 3, duration: 10.5 },
  { left: '70%', top: '78%', size: 180, rotate: 17, opacity: 0.19, delay: 0.9, duration: 12 },
  { left: '4%', top: '84%', size: 160, rotate: -22, opacity: 0.16, delay: 2.1, duration: 11.5 },
] as const;

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function UploadForm() {
  const searchParams = useSearchParams();
  const candidateId = searchParams.get('id');
  const candidateName = searchParams.get('name') || 'Candidate';
  const roleTitle = searchParams.get('role') || 'Open Position';

  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const reference = useMemo(
    () =>
      `BL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random()
        .toString(36)
        .slice(2, 7)
        .toUpperCase()}`,
    [done]
  );

  function pick(selected: File | undefined) {
    if (!selected) return;
    if (
      selected.type !== 'application/pdf' &&
      !selected.name.toLowerCase().endsWith('.pdf')
    ) {
      setFile(null);
      setError(
        'This file is not a PDF. Please export or save your resume as a PDF and try again.'
      );
      return;
    }
    if (selected.size > MAX_BYTES) {
      setFile(null);
      setError(
        `This file is ${formatSize(
          selected.size
        )}, which exceeds the 1MB limit. Please compress it and try again.`
      );
      return;
    }
    setError(null);
    setFile(selected);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files?.[0]);
  }

  async function handleSubmit() {
    if (!file) {
      setError('Please select a PDF file first.');
      return;
    }
    if (!candidateId) {
      setError('Invalid submission link. Missing candidate reference.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // 1. Direct upload file to Supabase Storage
      const cleanFileName = `${candidateId}-${Date.now()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(cleanFileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from('resumes')
        .getPublicUrl(cleanFileName);

      const resumeUrl = urlData.publicUrl;

      // 2. Trigger AI evaluation in background (async non-blocking)
      fetch('/api/evaluate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          resumeUrl,
          role: roleTitle,
        }),
      }).catch((bgErr) => {
        console.error('Background AI Evaluation Error:', bgErr);
      });

      // 3. Immediately mark as done and show animated tick success view
      setDone(true);
    } catch (err: any) {
      console.error('Upload Error:', err);
      setError(err.message || 'An unexpected error occurred during submission.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-x-hidden px-4 py-10 sm:py-16 bg-[#a53861] font-sans text-foreground">
      
      {/* Background Animated Scatter Texture Grid */}
      <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden="true">
        {SCATTER.map((mark, index) => (
          <img
            key={index}
            src="/boba-watermark.png"
            alt=""
            className="absolute animate-boba-float opacity-20 filter drop-shadow-xs"
            style={{
              left: mark.left,
              top: mark.top,
              width: mark.size,
              opacity: mark.opacity,
              transform: `rotate(${mark.rotate}deg)`,
              animationDelay: `${mark.delay}s`,
              animationDuration: `${mark.duration}s`,
            }}
          />
        ))}
      </div>

      {/* 3D Glassmorphism Box Container */}
      <div className="relative w-full max-w-[540px] rounded-3xl border border-white/80 bg-white/95 p-6 sm:p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35),0_0_1px_1px_rgba(255,255,255,0.9)_inset] backdrop-blur-2xl">
        
        {/* Header */}
        <header className="flex min-w-0 items-center gap-4 border-b border-[#ebd9c8] pb-5">
          <img
            src="/boba-live-logo.png"
            alt="BobaLive logo"
            className="h-16 w-16 shrink-0 rounded-full border-2 border-[#a53861]/30 bg-white p-0.5 object-cover shadow-sm"
          />
          <div className="min-w-0">
            <p className="truncate font-brand text-3xl font-black tracking-tight text-[#2d1822] drop-shadow-xs">
              BobaLive
            </p>
            <p className="truncate text-xs font-semibold text-[#5f7f7a]">Talent & Recruitment</p>
          </div>
        </header>

        {done ? (
          <section className="pt-8 text-center" aria-live="polite">
            
            {/* Animated Checkmark Tick Icon */}
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#5f7f7a]/15 text-[#5f7f7a] border-2 border-[#5f7f7a]/40 shadow-sm animate-checkmark-pop">
              <svg
                className="h-10 w-10 text-[#5f7f7a]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  className="animate-checkmark-stroke"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-[#2d1822] font-brand">
              Resume Successfully Submitted!
            </h1>
            <p className="mx-auto mt-3 max-w-[420px] text-sm leading-relaxed text-[#5f7f7a]">
              Thank you, <strong className="text-[#2d1822]">{candidateName}</strong>. Your resume has been uploaded successfully. Our hiring team will review your application and contact you shortly.
            </p>
            <p className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-[#f7ebe0] px-4 py-2 text-xs font-medium text-[#2d1822] border border-[#ebd9c8]">
              <span className="text-[#5f7f7a]">Reference</span>
              <span className="font-mono font-bold text-[#a53861]">{reference}</span>
              <span className="text-[#5f7f7a]">
                · {new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </p>
          </section>
        ) : (
          <section className="pt-6">
            <h1 className="text-[1.75rem] font-extrabold tracking-tight text-[#2d1822] font-brand">
              Submit Your Resume / CV
            </h1>
            <p className="mt-3 inline-block rounded-full bg-[#f1d4af] px-3.5 py-1.5 text-xs font-bold text-[#3a1c28] border border-[#d6ab75]/50 shadow-xs">
              Applying for <span className="text-[#a53861] font-black">{roleTitle}</span> as <strong className="text-[#2d1822]">{candidateName}</strong>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[#5f7f7a]">
              Select or drag and drop your official resume document below. We will parse it automatically — no forms to fill in.
            </p>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`mt-6 rounded-2xl border-2 border-dashed p-6 text-center transition-all sm:p-8 cursor-pointer ${
                dragging ? 'border-[#a53861] bg-[#a53861]/10 scale-[1.01]' : 'border-[#5f7f7a]/40 bg-[#f7ebe0]/50 hover:border-[#a53861]'
              }`}
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud className="mx-auto h-10 w-10 text-[#a53861]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-[#2d1822]">
                Drag and drop your PDF resume here, or click to browse
              </p>
              <input
                ref={inputRef}
                id="resume-file"
                name="resume-file"
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(event) => pick(event.target.files?.[0])}
              />
              <button
                type="button"
                className="mt-4 min-h-11 px-4 py-2 rounded-xl border border-[#ebd9c8] bg-white text-sm font-semibold text-[#2d1822] shadow-xs hover:bg-[#f7ebe0] cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                Choose PDF file
              </button>
            </div>

            <p className="mt-3 text-xs text-[#5f7f7a]">
              PDF files only · Maximum file size: 1MB
            </p>

            {file && (
              <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[#ebd9c8] bg-[#f7ebe0] p-3 shadow-xs">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f1d4af] text-[#a53861]">
                  <FileText className="h-5 w-5 text-[#a53861]" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-[#2d1822]">
                    {file.name}
                  </span>
                  <span className="block text-xs font-medium text-[#5f7f7a]">
                    {formatSize(file.size)} · PDF
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-[#5f7f7a] hover:text-[#2d1822] hover:bg-[#ebd9c8] cursor-pointer"
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mt-4 flex gap-3 rounded-2xl border border-[#b93848]/40 bg-[#b93848]/10 p-4 text-left"
              >
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-[#b93848]"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#2d1822]">Invalid File Selection</p>
                  <p className="mt-1 text-sm text-[#5f7f7a]">{error}</p>
                </div>
              </div>
            )}

            <button
              type="button"
              className="mt-6 min-h-14 w-full rounded-xl bg-[#a53861] px-5 py-3.5 text-lg font-bold text-white transition-all hover:bg-[#8c2d50] disabled:opacity-50 shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              disabled={!file || isProcessing}
              onClick={handleSubmit}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  Submitting Resume...
                </>
              ) : (
                'Submit Resume'
              )}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#a53861] text-white text-sm">Loading...</div>}>
      <UploadForm />
    </Suspense>
  );
}
