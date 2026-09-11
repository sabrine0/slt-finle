"use client";

import { useEffect, useRef } from "react";

import type { AlertSnapshot } from "@/types/command-platform";

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextCtor })
    .webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

function playCriticalChime(ctx: AudioContext) {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  gain.connect(ctx.destination);

  const oscA = ctx.createOscillator();
  oscA.type = "sine";
  oscA.frequency.setValueAtTime(880, now);
  oscA.frequency.exponentialRampToValueAtTime(560, now + 0.18);
  oscA.connect(gain);
  oscA.start(now);
  oscA.stop(now + 0.2);

  const oscB = ctx.createOscillator();
  oscB.type = "sine";
  oscB.frequency.setValueAtTime(660, now + 0.18);
  oscB.frequency.exponentialRampToValueAtTime(440, now + 0.42);
  oscB.connect(gain);
  oscB.start(now + 0.18);
  oscB.stop(now + 0.45);
}

export function useCriticalAlertSound(
  alerts: AlertSnapshot[],
  enabled: boolean,
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const seenCriticalIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    const criticalIds = alerts
      .filter((alert) => alert.level === "critical")
      .map((alert) => alert.id);

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      seenCriticalIdsRef.current = new Set(criticalIds);
      return;
    }

    const seen = seenCriticalIdsRef.current;
    const freshCriticals = criticalIds.filter((id) => !seen.has(id));

    if (freshCriticals.length > 0 && enabled) {
      const Ctor = getAudioContextCtor();
      if (Ctor) {
        if (!ctxRef.current) {
          ctxRef.current = new Ctor();
        }
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") {
          void ctx.resume();
        }
        try {
          playCriticalChime(ctx);
        } catch {
          // AudioContext creation can fail before a user gesture; ignore.
        }
      }
    }

    seenCriticalIdsRef.current = new Set(criticalIds);
  }, [alerts, enabled]);
}
