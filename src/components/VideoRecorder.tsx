import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Video, Square, RotateCcw, Upload, X } from "lucide-react";

export const MAX_VIDEO_SECONDS = 60;

/** Picks a container the browser can actually record; never lies about the format. */
export function pickRecordingType(): { mimeType: string; extension: string } | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  const candidates: { mimeType: string; extension: string }[] = [
    { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
    { mimeType: "video/mp4;codecs=h264,aac", extension: "mp4" },
    { mimeType: "video/mp4", extension: "mp4" },
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

export type RecordedVideo = {
  blob: Blob;
  mimeType: string;
  extension: string;
  durationSeconds: number;
};

export function VideoRecorder({
  open,
  onClose,
  onUpload,
}: {
  open: boolean;
  onClose: () => void;
  onUpload: (video: RecordedVideo) => Promise<void>;
}) {
  const liveRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const secondsRef = useRef(0);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recorded, setRecorded] = useState<RecordedVideo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (liveRef.current) liveRef.current.srcObject = null;
  }, []);

  const releasePreview = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setReady(false);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot record video. Try Chrome, Safari or Edge.");
      return;
    }
    if (!pickRecordingType()) {
      setError("This browser cannot record video. Try Chrome, Safari or Edge.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play().catch(() => undefined);
      }
      setReady(true);
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Camera and microphone access was blocked. Allow access in your browser settings and try again.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("No camera or microphone was found on this device.");
      } else if (name === "NotReadableError") {
        setError("Your camera is already in use by another app. Close it and try again.");
      } else {
        setError("The camera could not be started. Please try again.");
      }
    }
  }, []);

  // Open/close lifecycle: camera on when open, fully released when closed.
  useEffect(() => {
    if (!open) return;
    void startCamera();
    return () => {
      clearTimer();
      try {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      } catch {
        /* already stopped */
      }
      recorderRef.current = null;
      stopTracks();
    };
  }, [open, startCamera, stopTracks]);

  useEffect(() => () => releasePreview(), [releasePreview]);

  const stop = useCallback(() => {
    clearTimer();
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const start = () => {
    const type = pickRecordingType();
    const stream = streamRef.current;
    if (!type || !stream) return;
    releasePreview();
    setRecorded(null);
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: type.mimeType });
    } catch {
      setError("Recording could not be started in this browser.");
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearTimer();
      setRecording(false);
      const blob = new Blob(chunksRef.current, { type: type.mimeType });
      chunksRef.current = [];
      if (!blob.size) {
        setError("Nothing was recorded. Please try again.");
        return;
      }
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPreviewUrl(url);
      setRecorded({
        blob,
        mimeType: type.mimeType,
        extension: type.extension,
        durationSeconds: Math.max(1, Math.round(secondsRef.current)),
      });
      // Camera is only needed while recording.
      stopTracks();
      setReady(false);
    };
    setSeconds(0);
    secondsRef.current = 0;
    recorder.start(250);
    setRecording(true);
    timerRef.current = window.setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= MAX_VIDEO_SECONDS) stop();
    }, 1000);
  };

  const retake = async () => {
    releasePreview();
    setRecorded(null);
    setSeconds(0);
    secondsRef.current = 0;
    await startCamera();
  };

  const upload = async () => {
    if (!recorded) return;
    setUploading(true);
    setError(null);
    try {
      await onUpload(recorded);
      releasePreview();
      setRecorded(null);
      onClose();
    } catch (e) {
      setError((e as Error).message || "Upload failed. You can retry.");
    } finally {
      setUploading(false);
    }
  };

  const close = () => {
    clearTimer();
    stop();
    stopTracks();
    releasePreview();
    setRecorded(null);
    setSeconds(0);
    secondsRef.current = 0;
    onClose();
  };

  const remaining = Math.max(0, MAX_VIDEO_SECONDS - seconds);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record video</DialogTitle>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-md bg-black">
          <video
            ref={liveRef}
            className={recorded ? "hidden" : "aspect-video w-full object-cover"}
            playsInline
            muted
            autoPlay
          />
          {recorded && previewUrl && (
            <video
              ref={playbackRef}
              className="aspect-video w-full object-contain"
              src={previewUrl}
              controls
              playsInline
            />
          )}
          {recording && (
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")} · {remaining}s left
            </span>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
        )}
        {!recorded && !recording && !error && (
          <p className="text-xs text-muted-foreground">Recordings stop automatically after {MAX_VIDEO_SECONDS} seconds.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {!recorded && !recording && (
            <Button onClick={start} disabled={!ready}>
              <Video className="mr-1 h-4 w-4" />Start recording
            </Button>
          )}
          {recording && (
            <Button variant="destructive" onClick={stop}>
              <Square className="mr-1 h-4 w-4" />Stop
            </Button>
          )}
          {recorded && (
            <>
              <Button onClick={upload} disabled={uploading}>
                <Upload className="mr-1 h-4 w-4" />{uploading ? "Uploading…" : error ? "Retry upload" : "Upload"}
              </Button>
              <Button variant="outline" onClick={retake} disabled={uploading}>
                <RotateCcw className="mr-1 h-4 w-4" />Retake
              </Button>
            </>
          )}
          {error && !recorded && !recording && (
            <Button variant="outline" onClick={() => void startCamera()}>
              <RotateCcw className="mr-1 h-4 w-4" />Try again
            </Button>
          )}
          <Button variant="ghost" onClick={close} disabled={uploading}>
            <X className="mr-1 h-4 w-4" />Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
