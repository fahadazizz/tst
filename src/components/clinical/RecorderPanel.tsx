"use client";

// RecorderPanel — captures consultation audio in the browser, uploads it, runs
// the STT pipeline, and hands the resulting transcript text back to the parent
// (which feeds it into AI SOAP generation).
//
// Pipeline: MediaRecorder (audio/webm) → uploadRecording (multipart) →
// createSttJob → pollSttJob → getTranscripts → onTranscript(raw_text).
//
// NOTE: depends on the backend STT worker actually processing jobs. Upload and
// job creation are confirmed working; transcription completion is pending the
// backend worker. Until then, polling times out gracefully with a clear message.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Combine,
  Mic,
  RefreshCw,
  RotateCcw,
  Square,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import {
  uploadRecording,
  createSttJob,
  pollSttJob,
  getTranscripts,
  listRecordings,
  combineSegmentTranscripts,
  type RecordingSegment,
} from "@/lib/api/clinical";

type Phase = "idle" | "recording" | "uploading" | "transcribing" | "error";

export function RecorderPanel({
  consultationId,
  onTranscript,
}: {
  consultationId: string;
  onTranscript: (text: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [segments, setSegments] = useState<RecordingSegment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(true);
  const [segmentBusy, setSegmentBusy] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSegments = useCallback(async () => {
    setLoadingSegments(true);
    try {
      setSegments(await listRecordings(consultationId));
    } catch {
      setSegments([]);
    } finally {
      setLoadingSegments(false);
    }
  }, [consultationId]);

  useEffect(() => {
    queueMicrotask(loadSegments);
  }, [loadSegments]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = handleStopped;
      mr.start();
      mediaRecorderRef.current = mr;

      // eslint-disable-next-line react-hooks/purity -- event-handler timestamp for elapsed recording time
      startTimeRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);

      setPhase("recording");
    } catch {
      setError(
        "Couldn't access the microphone. Check browser permissions and try again.",
      );
      setPhase("error");
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  async function handleStopped() {
    const durationSeconds = (Date.now() - startTimeRef.current) / 1000;
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });

    if (blob.size === 0) {
      setError("No audio was captured. Please try recording again.");
      setPhase("error");
      return;
    }

    // 1) Upload the recording.
    setPhase("uploading");
    let recordingId: string;
    try {
      const rec = await uploadRecording(consultationId, blob, durationSeconds);
      recordingId = String(rec.recording_id);
      await loadSegments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setPhase("error");
      return;
    }

    // 2) Create STT job, 3) poll, 4) fetch transcript.
    setPhase("transcribing");
    try {
      const job = await createSttJob(consultationId, recordingId);
      const finished = await pollSttJob(String(job.job_id), {
        intervalMs: 3000,
        timeoutMs: 120000,
      });
      const status = String(finished.status ?? "").toLowerCase();
      if (status === "failed" || status === "error") {
        throw new Error(
          finished.error_message
            ? `Transcription failed: ${finished.error_message}`
            : "Transcription failed.",
        );
      }
      // Get the newest transcript's text.
      const transcripts = await getTranscripts(consultationId);
      const latest = transcripts
        .slice()
        .sort(
          (a, b) =>
            new Date(String(b.created_at)).getTime() -
            new Date(String(a.created_at)).getTime(),
        )[0];
      const text = latest?.raw_text ?? "";
      if (!text) {
        throw new Error("Transcription completed but returned no text.");
      }
      onTranscript(text);
      setPhase("idle");
      await loadSegments();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Transcription didn't complete. You can type the notes manually below.",
      );
      setPhase("error");
      await loadSegments();
    }
  }

  async function retrySegment(segment: RecordingSegment) {
    setSegmentBusy(segment.recording_id);
    setError(null);
    try {
      const job = segment.latest_stt_job?.job_id
        ? segment.latest_stt_job
        : await createSttJob(consultationId, segment.recording_id);
      const finished = await pollSttJob(String(job.job_id), {
        intervalMs: 2000,
        timeoutMs: 120000,
      });
      const status = String(finished.status ?? "").toLowerCase();
      if (status === "failed" || status === "error") {
        throw new Error(finished.error_message ?? "Transcription failed.");
      }
      const transcripts = await getTranscripts(consultationId);
      const transcript = transcripts.find(
        (t) => t.recording_id === segment.recording_id,
      );
      if (transcript?.raw_text) onTranscript(transcript.raw_text);
      await loadSegments();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't resume transcription for this segment.",
      );
    } finally {
      setSegmentBusy(null);
    }
  }

  async function combineSegments() {
    setSegmentBusy("combine");
    setError(null);
    try {
      const transcript = await combineSegmentTranscripts(consultationId);
      onTranscript(transcript.raw_text);
      await loadSegments();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't combine completed segment transcripts.",
      );
    } finally {
      setSegmentBusy(null);
    }
  }

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const completedSegments = segments.filter(
    (s) => String(s.stt_status ?? s.status).toLowerCase() === "completed",
  );
  const canCombine = completedSegments.length >= 2;

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3.5">
      <div className="flex items-center gap-3">
        {phase === "recording" ? (
          <button
            onClick={stopRecording}
            className="inline-flex items-center gap-2 rounded-lg bg-alert px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90"
          >
            <Square size={14} /> Stop ({fmt(elapsed)})
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={phase === "uploading" || phase === "transcribing"}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-line bg-brand-tint px-3.5 py-2 text-[13px] font-medium text-brand hover:bg-[#d9eef0] disabled:opacity-60"
          >
            <Mic size={14} /> Record consultation
          </button>
        )}

        <div className="min-w-0 flex-1 text-[12px] text-ink-2">
          {phase === "idle" && "Record audio to auto-transcribe, or type notes below."}
          {phase === "recording" && (
            <span className="flex items-center gap-1.5 text-alert">
              <span className="inline-block size-2 animate-pulse rounded-full bg-alert" />
              Recording…
            </span>
          )}
          {phase === "uploading" && (
            <span className="flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" /> Uploading audio…
            </span>
          )}
          {phase === "transcribing" && (
            <span className="flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" /> Transcribing…
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2.5 flex items-start gap-2 rounded-md border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-3 rounded-md border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Recording segments
          </div>
          <button
            type="button"
            onClick={loadSegments}
            disabled={loadingSegments}
            className="grid size-7 place-items-center rounded-md border border-line text-ink-3 hover:bg-surface-2 disabled:opacity-60"
            title="Refresh recording segments"
          >
            <RefreshCw
              size={13}
              className={loadingSegments ? "animate-spin" : undefined}
            />
          </button>
        </div>
        {loadingSegments ? (
          <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-ink-2">
            <Loader2 size={13} className="animate-spin" /> Loading segments…
          </div>
        ) : segments.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-ink-2">
            No persisted recording segments yet.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {segments.map((segment) => {
              const sttStatus = String(
                segment.stt_status ?? segment.status ?? "stored",
              ).toLowerCase();
              const isTerminal = ["completed", "failed", "error"].includes(
                sttStatus,
              );
              const canRetry =
                sttStatus === "failed" ||
                sttStatus === "error" ||
                sttStatus === "stored" ||
                segment.latest_stt_job == null;
              return (
                <div
                  key={segment.recording_id}
                  className="flex items-center gap-2 px-3 py-2 text-[12px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">
                      Segment {segment.segment_number}
                    </div>
                    <div className="text-ink-3">
                      {sttStatus.replace(/_/g, " ")}
                      {segment.duration_seconds != null
                        ? ` · ${Math.round(segment.duration_seconds)}s`
                        : ""}
                    </div>
                  </div>
                  {sttStatus === "completed" ? (
                    <CheckCircle2 size={15} className="text-approved" />
                  ) : canRetry ? (
                    <button
                      type="button"
                      onClick={() => retrySegment(segment)}
                      disabled={segmentBusy !== null || phase !== "idle"}
                      className="grid size-7 place-items-center rounded-md border border-line text-ink-3 hover:bg-surface-2 disabled:opacity-60"
                      title="Resume or retry transcription"
                    >
                      {segmentBusy === segment.recording_id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <RotateCcw size={13} />
                      )}
                    </button>
                  ) : (
                    <span
                      className={`text-[11px] ${
                        isTerminal ? "text-alert" : "text-ink-3"
                      }`}
                    >
                      {isTerminal ? "Needs manual notes" : "In progress"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {canCombine && (
          <div className="border-t border-line px-3 py-2">
            <button
              type="button"
              onClick={combineSegments}
              disabled={segmentBusy !== null || phase !== "idle"}
              className="inline-flex items-center gap-2 rounded-md border border-brand-line bg-brand-tint px-3 py-1.5 text-[12px] font-medium text-brand hover:bg-[#d9eef0] disabled:opacity-60"
            >
              {segmentBusy === "combine" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Combine size={13} />
              )}
              Combine completed segments
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
