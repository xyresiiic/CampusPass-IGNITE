import { useCallback, useEffect, useRef, useState } from "react";
import type { GPSLocation } from "../types";

export interface GeolocationState {
  location: GPSLocation | null;
  error: string | null;
  isLocating: boolean;
  accuracy: number | null;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    location: null,
    error: null,
    isLocating: false,
    accuracy: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const timeoutTimerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (watchIdRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timeoutTimerRef.current !== null) {
      window.clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const getLocation = useCallback((): Promise<GPSLocation> => {
    return new Promise((resolve, reject) => {
      cleanup();
      setState((prev) => ({ ...prev, isLocating: true, error: null }));

      if (!window.isSecureContext) {
        const err = "Location requires HTTPS. Open CampusPass in a secure browser context.";
        setState({ location: null, error: err, isLocating: false, accuracy: null });
        reject(new Error(err));
        return;
      }

      if (!("geolocation" in navigator)) {
        const err = "Location is not supported by this browser. Please use an updated version of Chrome.";
        setState({ location: null, error: err, isLocating: false, accuracy: null });
        reject(new Error(err));
        return;
      }

      let best: GPSLocation | null = null;
      let finished = false;
      const timeoutMs = 25000;
      const targetAccuracyM = 50;

      const finish = (loc?: GPSLocation, err?: string) => {
        if (finished) return;
        finished = true;
        cleanup();

        if (loc) {
          setState({
            location: loc,
            error: null,
            isLocating: false,
            accuracy: loc.accuracy_m,
          });
          resolve(loc);
        } else {
          const finalError = err || "Unable to acquire GPS location.";
          setState({
            location: null,
            error: finalError,
            isLocating: false,
            accuracy: null,
          });
          reject(new Error(finalError));
        }
      };

      timeoutTimerRef.current = window.setTimeout(() => {
        if (best) {
          finish(best);
        } else {
          finish(
            undefined,
            "No GPS reading was received within 25 seconds. Enable location permissions and try in an open area."
          );
        }
      }, timeoutMs);

      try {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const candidate: GPSLocation = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy_m: Math.round(position.coords.accuracy),
            };

            if (
              !Number.isFinite(candidate.latitude) ||
              !Number.isFinite(candidate.longitude) ||
              !Number.isFinite(candidate.accuracy_m) ||
              candidate.latitude < -90 ||
              candidate.latitude > 90 ||
              candidate.longitude < -180 ||
              candidate.longitude > 180 ||
              candidate.accuracy_m <= 0
            ) {
              return;
            }

            if (!best || candidate.accuracy_m < best.accuracy_m) {
              best = candidate;
              setState((prev) => ({
                ...prev,
                accuracy: candidate.accuracy_m,
                location: candidate,
              }));
            }

            if (candidate.accuracy_m <= targetAccuracyM) {
              finish(candidate);
            }
          },
          (geoErr) => {
            let msg = "An unexpected location error occurred. Reload CampusPass and try again.";
            if (geoErr.code === geoErr.PERMISSION_DENIED) {
              msg = "Location permission denied. Please allow location access in your browser settings.";
            } else if (geoErr.code === geoErr.POSITION_UNAVAILABLE) {
              if (best && best.accuracy_m <= targetAccuracyM) {
                finish(best);
                return;
              }
              msg = "GPS position unavailable. Turn on high accuracy location in device settings.";
            } else if (geoErr.code === geoErr.TIMEOUT) {
              if (best) {
                finish(best);
                return;
              }
              msg = "Location request timed out. Please try outdoors with clear sky visibility.";
            }
            finish(undefined, msg);
          },
          {
            enableHighAccuracy: true,
            timeout: timeoutMs,
            maximumAge: 0,
          }
        );
      } catch (e) {
        finish(undefined, e instanceof Error ? e.message : "Failed to start GPS tracking.");
      }
    });
  }, [cleanup]);

  const resetLocation = useCallback(() => {
    cleanup();
    setState({ location: null, error: null, isLocating: false, accuracy: null });
  }, [cleanup]);

  return {
    ...state,
    getLocation,
    resetLocation,
  };
}
