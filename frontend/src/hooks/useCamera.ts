import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCameraOptions {
  autoStart?: boolean;
  initialFacingMode?: "user" | "environment";
}

export function useCamera({ autoStart = true, initialFacingMode = "user" }: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(initialFacingMode);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
    setIsStarting(false);
  }, []);

  const startCamera = useCallback(
    async (desiredFacing?: "user" | "environment") => {
      stopCamera();
      setError(null);
      setIsStarting(true);

      const targetFacing = desiredFacing ?? facingMode;
      if (desiredFacing && desiredFacing !== facingMode) {
        setFacingMode(desiredFacing);
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "Camera access is not supported by your browser or environment. Please open CampusPass in Chrome using HTTPS."
        );
        setIsStarting(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // Play request interrupted or autoplay prevented
          }
        }

        setIsReady(true);
        setError(null);
      } catch (err) {
        let message = "Unable to access the camera.";
        if (err instanceof DOMException) {
          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            message =
              "Camera permission was denied. Click the lock or camera icon in your browser address bar to allow camera access, then reload.";
          } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            message = `No ${targetFacing === "user" ? "front" : "rear"} camera device was found on your system. Please connect a camera.`;
          } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
            message =
              "Camera is already in use by another application or tab. Please close other camera apps and retry.";
          } else {
            message = err.message || message;
          }
        }
        setError(message);
        setIsReady(false);
      } finally {
        setIsStarting(false);
      }
    },
    [facingMode, stopCamera]
  );

  const toggleCamera = useCallback(async () => {
    const nextFacing = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextFacing);
    await startCamera(nextFacing);
  }, [facingMode, startCamera]);

  const captureFrame = useCallback(
    (quality = 0.88): string => {
      const video = videoRef.current;
      if (
        !video ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        throw new Error("Camera feed is not ready. Please wait for preview.");
      }

      const srcW = video.videoWidth;
      const srcH = video.videoHeight;

      // Ensure minimum 480px on the short edge so MiniFASNet and face models
      // have enough resolution. Scale up only if below threshold.
      const MIN_EDGE = 480;
      const shortEdge = Math.min(srcW, srcH);
      const scale = shortEdge < MIN_EDGE ? MIN_EDGE / shortEdge : 1;
      const outW = Math.round(srcW * scale);
      const outH = Math.round(srcH * scale);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to initialize canvas context for photo capture.");
      }

      // Front camera (user-facing) streams are mirrored by the browser so
      // the live preview looks natural in a mirror. The CSS transform is
      // purely cosmetic — the raw pixel data coming out of the MediaStream
      // is already horizontally flipped.  Face recognition and anti-spoofing
      // models (MiniFASNet, Facenet512) expect a geometrically correct face.
      // We un-flip here so the backend receives a natural, un-mirrored image.
      if (facingMode === "user") {
        ctx.translate(outW, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, outW, outH);
      return canvas.toDataURL("image/jpeg", quality);
    },
    [facingMode]
  );

  useEffect(() => {
    let active = true;
    if (autoStart) {
      window.setTimeout(() => {
        if (active) {
          void startCamera();
        }
      }, 0);
    }
    return () => {
      active = false;
      stopCamera();
    };
  }, [autoStart, startCamera, stopCamera]);

  return {
    videoRef,
    isReady,
    isStarting,
    error,
    facingMode,
    startCamera,
    stopCamera,
    toggleCamera,
    captureFrame,
  };
}
