import { Camera, VideoCameraSlash } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

interface CameraScannerProps {
  onCapture: (file: File) => void;
}

/**
 * Scan to PDF capture surface. Streams the camera into a mirrored preview
 * and saves each capture as a JPEG File. Falls back to a message when no
 * camera is available.
 */
export function CameraScanner({ onCapture }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support camera capture. Drop images instead.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((media) => {
        if (!active) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        if (videoRef.current) videoRef.current.srcObject = media;
      })
      .catch(() => {
        setError("Camera unavailable. Drop images instead.");
      });

    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror the drawing so the capture matches the preview.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapture(new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" }));
        }
      },
      "image/jpeg",
      0.9
    );
  };

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4 text-[14px] text-muted">
        <VideoCameraSlash size={20} className="shrink-0 text-muted" />
        {error}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative bg-ink/5">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="mx-auto aspect-[3/4] max-h-[46dvh] w-auto max-w-full scale-x-[-1] object-contain sm:aspect-[4/3] sm:max-h-[52dvh]"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="mx-8 h-[80%] w-[80%] rounded-2xl border-2 border-dashed border-accent/50" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
        <p className="text-[13px] text-muted">Line the page up in the frame, then capture.</p>
        <button
          type="button"
          onClick={capture}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-paper transition hover:opacity-90 active:scale-[0.97]"
        >
          <Camera size={17} weight="regular" />
          Capture
        </button>
      </div>
    </div>
  );
}
