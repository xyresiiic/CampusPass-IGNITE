import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCameraOptions {
  autoStart?: boolean;
}

export function useCamera({ autoStart = true }: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

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

  const startCamera = useCallback(async () => {
    stopCamera();
    setError(null);
    setIsStarting(true);

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
          facingMode: "user",
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
          message = "No front camera device was found on your system. Please connect a camera.";
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
  }, [stopCamera]);

  const captureFrame = useCallback((quality = 0.88): string => {
    const video = videoRef.current;
    if (
      !video ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      throw new Error("Camera feed is not ready. Please wait for preview.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Failed to initialize canvas context for photo capture.");
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }, []);

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
    startCamera,
    stopCamera,
    captureFrame,
  };
}
