"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEMO_SCENARIOS,
  DEMO_SPEED_MULTIPLIER,
  type DemoContext,
  type DemoScenario,
} from "@/components/command-platform/demo/scenarios";

export type DemoSpeed = "slow" | "normal" | "fast";

export interface DemoPlayerState {
  scenario?: DemoScenario;
  stepIndex: number;
  stepCount: number;
  running: boolean;
  paused: boolean;
  speed: DemoSpeed;
  progress: number;
}

export interface DemoPlayerApi extends DemoPlayerState {
  start: (scenarioId: DemoScenario["id"]) => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  stop: () => void;
  setSpeed: (speed: DemoSpeed) => void;
}

export function useDemoPlayer(context: DemoContext): DemoPlayerApi {
  const [scenarioId, setScenarioId] = useState<DemoScenario["id"] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<DemoSpeed>("normal");
  const [holdProgress, setHoldProgress] = useState(0);

  const firedRef = useRef<number>(-1);
  const timerRef = useRef<number | null>(null);
  const holdStartRef = useRef<number>(0);
  const remainingRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const contextRef = useRef(context);

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  const scenario = useMemo(
    () =>
      scenarioId
        ? DEMO_SCENARIOS.find((candidate) => candidate.id === scenarioId)
        : undefined,
    [scenarioId],
  );

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== 0) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    setRunning(false);
    setPaused(false);
    setScenarioId(null);
    setStepIndex(0);
    setHoldProgress(0);
    firedRef.current = -1;
    contextRef.current.clearDemoOverrides();
  }, [clearTimers]);

  const start = useCallback(
    (nextScenarioId: DemoScenario["id"]) => {
      clearTimers();
      firedRef.current = -1;
      contextRef.current.clearDemoOverrides();
      setScenarioId(nextScenarioId);
      setStepIndex(0);
      setPaused(false);
      setRunning(true);
      setHoldProgress(0);
    },
    [clearTimers],
  );

  const restart = useCallback(() => {
    if (!scenario) return;
    clearTimers();
    firedRef.current = -1;
    contextRef.current.clearDemoOverrides();
    setStepIndex(0);
    setPaused(false);
    setRunning(true);
    setHoldProgress(0);
  }, [clearTimers, scenario]);

  const pause = useCallback(() => {
    if (!running || paused) return;
    setPaused(true);
  }, [running, paused]);

  const resume = useCallback(() => {
    if (!running || !paused) return;
    setPaused(false);
  }, [running, paused]);

  useEffect(() => {
    if (!running || paused || !scenario) return undefined;

    if (stepIndex >= scenario.steps.length) {
      const id = window.setTimeout(() => {
        setRunning(false);
        setPaused(false);
      }, 0);
      return () => window.clearTimeout(id);
    }

    const step = scenario.steps[stepIndex];
    const multiplier = DEMO_SPEED_MULTIPLIER[speed];
    let cancelled = false;

    const scheduleHold = (remainingMs: number) => {
      holdStartRef.current = performance.now();
      remainingRef.current = remainingMs;
      const tick = () => {
        if (cancelled) return;
        const elapsed = performance.now() - holdStartRef.current;
        const totalHold = step.hold * multiplier;
        const done = (totalHold - remainingMs) + elapsed;
        setHoldProgress(Math.min(1, done / totalHold));
        rafRef.current = window.requestAnimationFrame(tick);
      };
      rafRef.current = window.requestAnimationFrame(tick);

      timerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        setHoldProgress(1);
        window.setTimeout(() => {
          if (cancelled) return;
          setStepIndex((current) => current + 1);
        }, 40);
      }, remainingMs);
    };

    const run = async () => {
      if (firedRef.current !== stepIndex) {
        firedRef.current = stepIndex;
        setHoldProgress(0);
        if (step.action) {
          try {
            await step.action(contextRef.current);
          } catch {
            /* ignore step failures so the demo can continue */
          }
        }
      }
      if (cancelled) return;
      const holdMs = step.hold * multiplier;
      scheduleHold(holdMs);
    };

    void run();

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [clearTimers, paused, running, scenario, speed, stepIndex]);

  return {
    scenario,
    stepIndex,
    stepCount: scenario?.steps.length ?? 0,
    running,
    paused,
    speed,
    progress: holdProgress,
    start,
    pause,
    resume,
    restart,
    stop,
    setSpeed,
  };
}
