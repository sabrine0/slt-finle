"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { getSocketConnectionConfig } from "@/lib/command-platform-api";
import { fetchIntersectionState } from "@/lib/intersection-runtime-api";
import type { IntersectionRuntimeState } from "@/types/intersection-runtime";

export type IntersectionStateStatus = "connecting" | "live" | "stale" | "error";

export interface IntersectionStateResult {
  state: IntersectionRuntimeState | null;
  status: IntersectionStateStatus;
  lastMessage: string | null;
  refresh: () => Promise<void>;
}

let sharedSocket: Socket | null = null;
let sharedSocketRefs = 0;

function getSharedSocket(): Socket {
  if (sharedSocket) {
    sharedSocketRefs += 1;
    return sharedSocket;
  }
  const socketConfig = getSocketConnectionConfig();
  sharedSocket = io(socketConfig.url, {
    path: socketConfig.path,
    transports: socketConfig.transports,
    timeout: 4000,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });
  sharedSocketRefs = 1;
  return sharedSocket;
}

function releaseSharedSocket() {
  sharedSocketRefs -= 1;
  if (sharedSocketRefs <= 0) {
    sharedSocket?.close();
    sharedSocket = null;
    sharedSocketRefs = 0;
  }
}

export function useIntersectionState(
  intersectionId: string | undefined,
): IntersectionStateResult {
  const [state, setState] = useState<IntersectionRuntimeState | null>(null);
  const [status, setStatus] = useState<IntersectionStateStatus>("connecting");
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const lastReceivedRef = useRef<number>(0);

  useEffect(() => {
    if (!intersectionId) {
      setState(null);
      setStatus("connecting");
      return;
    }

    let cancelled = false;
    setStatus("connecting");
    setLastMessage(null);

    const load = async () => {
      try {
        const initial = await fetchIntersectionState(intersectionId);
        if (cancelled) return;
        setState(initial);
        setStatus("live");
        lastReceivedRef.current = Date.now();
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setLastMessage(
          error instanceof Error ? error.message : "Failed to load state",
        );
      }
    };

    void load();

    const socket = getSharedSocket();
    const eventName = `intersection.state.${intersectionId}`;
    const handler = (payload: IntersectionRuntimeState) => {
      if (cancelled) return;
      setState(payload);
      setStatus("live");
      lastReceivedRef.current = Date.now();
    };
    const onConnect = () => {
      setStatus((current) => (current === "error" ? "connecting" : current));
      socket.emit("intersection.state.request", { intersectionId });
    };
    const onDisconnect = () => {
      setStatus("stale");
    };

    socket.on(eventName, handler);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    const stalenessWatch = window.setInterval(() => {
      if (cancelled) return;
      const since = Date.now() - lastReceivedRef.current;
      if (since > 4000 && socket.connected && status !== "error") {
        setStatus("stale");
      }
    }, 2000);

    return () => {
      cancelled = true;
      socket.off(eventName, handler);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      window.clearInterval(stalenessWatch);
      releaseSharedSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intersectionId]);

  const refresh = async () => {
    if (!intersectionId) return;
    try {
      const next = await fetchIntersectionState(intersectionId);
      setState(next);
      setStatus("live");
      lastReceivedRef.current = Date.now();
    } catch (error) {
      setStatus("error");
      setLastMessage(
        error instanceof Error ? error.message : "Refresh failed",
      );
    }
  };

  return { state, status, lastMessage, refresh };
}
