"use client";

// The live fitting room: camera → framing guide → tap a garment → Decart Lucy VTON dresses
// the customer in realtime. Session logic adapted from OpenWear (KenjiPcx/openwear-extension-kit).
//
//   gate ─► starting ─► framing ─► ready ──(tap garment)──► fitting ─► live ─► (tap another)
//     ▲                                                                              │
//     └───────────────────────────── ended / error ◄─────────────────────────────────┘
//
// The first garment opens the Decart connection with that garment as its initial state; every
// later garment or colour swap reuses it via set(). Live video is billed per second, so the
// session stops on tab hide, on the timer, and on "End".

import { createDecartClient, models } from "@decartai/sdk";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/Brand";
import { GARMENTS, byId, inr } from "@/lib/catalogue";
import { catalogPrompt, nameFromFile, normalizeImage, uploadPrompt } from "@/lib/garment";
import { createPoseTracker, coverRect, guide, silhouetteBox, SILHOUETTE } from "@/lib/vision";

const model = models.realtime("lucy-vton-latest");
const SCAN_REVEAL_MS = 1300; // final top-to-bottom sweep that reveals the AI video
const SETTLE_MS = 900; // Decart needs a moment after set() before frames show the new garment
const HOLD_MS = 900; // how long the customer must stay in the outline before framing completes
const TOKEN_TTL_MS = 50_000; // client tokens live 60s; refresh a little early

/** Maps camera, token and network failures to one readable message plus the action that fixes it. */
function friendly(error) {
  const message = String(error?.message || error || "");
  if (error?.code === "BAD_CODE") return { message, action: "code" };
  if (error?.name === "NotAllowedError") return { message: "Camera access is blocked. Allow the camera in your browser's address bar, then start again.", action: "restart" };
  if (error?.name === "NotFoundError") return { message: "No camera found on this device." };
  if (error?.name === "NotReadableError") return { message: "Your camera is being used by another app. Close it and start again.", action: "restart" };
  if (error?.code === "INVALID_API_KEY") return { message: "Decart rejected the API key on the server.", action: "restart" };
  if (String(error?.code || "").startsWith("WEBRTC")) return { message: "Couldn't reach the live video servers. Check your network and try again.", action: "restart" };
  return { message: message || "Something went wrong. Try again.", action: "restart" };
}

async function fetchToken(code) {
  const res = await fetch("/api/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Could not start a session.");
    err.code = data.code;
    throw err;
  }
  return { ...data, at: Date.now() };
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "men", label: "Men" },
  { id: "women", label: "Women" },
];

export default function LiveStudio({ initialGarmentId }) {
  const [config, setConfig] = useState(null); // { configured, requiresCode, sessionSeconds }
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState("gate"); // gate | starting | framing | ready
  const [notice, setNotice] = useState(null);
  const [garment, setGarment] = useState(null); // { id, key, name, preview, status, colour, catalogId }
  const [guidance, setGuidance] = useState({ ok: false, message: "Step into the frame" });
  const [holding, setHolding] = useState(false);
  const [remoteVisible, setRemoteVisible] = useState(false);
  const [connection, setConnection] = useState("");
  const [queue, setQueue] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [filter, setFilter] = useState("all");
  const [peek, setPeek] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(initialGarmentId ? byId(initialGarmentId) || null : null);

  const stageRef = useRef(null);
  const cameraRef = useRef(null);
  const remoteRef = useRef(null);
  const fxRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const connectionRef = useRef(null);
  const connectingRef = useRef(null);
  const connectingForRef = useRef(0);
  const remoteShownRef = useRef(false);
  const trackerRef = useRef(null);
  const poseRef = useRef(null);
  const phaseRef = useRef("gate");
  const framedRef = useRef(false);
  const framedWaitersRef = useRef([]);
  const holdStartRef = useRef(0);
  const scanRef = useRef({ mode: "off", start: 0, revealRemote: false });
  const garmentRef = useRef(null);
  const imageRef = useRef(null);
  const sessionRef = useRef(0); // bumped on stop(); async work from an older session bails out
  const seqRef = useRef(0);
  const timerRef = useRef(null);
  const tokenRef = useRef(null);
  const codeRef = useRef("");
  phaseRef.current = phase;
  garmentRef.current = garment;
  codeRef.current = code;

  useEffect(() => {
    fetch("/api/token")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ configured: false }));
    try {
      const saved = sessionStorage.getItem("kapadiya-code");
      if (saved) setCode(saved);
    } catch {}
  }, []);

  const updateGarment = useCallback((id, patch) => {
    setGarment((g) => (g && g.id === id ? { ...g, ...patch } : g));
  }, []);

  // ---------- Session lifecycle ----------

  /** Ends everything: Decart connection, camera, timers and effects. Always safe to call. */
  const stop = useCallback((reason) => {
    sessionRef.current++;
    clearInterval(timerRef.current);
    timerRef.current = null;
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    connectingRef.current = null;
    tokenRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (cameraRef.current) cameraRef.current.srcObject = null;
    if (remoteRef.current) remoteRef.current.srcObject = null;
    framedRef.current = false;
    framedWaitersRef.current = [];
    remoteShownRef.current = false;
    scanRef.current = { mode: "off", start: 0, revealRemote: false };
    setRemoteVisible(false);
    setConnection("");
    setQueue(null);
    setPeek(false);
    setPhase("gate");
    setGarment((g) => (g && g.status !== "live" ? { ...g, status: "failed" } : g));
    setNotice(reason || null);
  }, []);

  useEffect(() => {
    const onHidden = () => {
      if (document.hidden && streamRef.current) stop({ message: "Paused while you were away — nothing is billed while paused.", action: "restart" });
    };
    const onUnload = () => stop();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onUnload);
      stop();
    };
  }, [stop]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // ---------- Framing guide ----------

  const markFramed = useCallback(() => {
    framedRef.current = true;
    setPhase("ready");
    framedWaitersRef.current.splice(0).forEach((resolve) => resolve());
  }, []);

  const waitUntilFramed = useCallback((session) => {
    if (framedRef.current) return Promise.resolve();
    return new Promise((resolve, reject) => {
      framedWaitersRef.current.push(() => (session === sessionRef.current ? resolve() : reject(new Error("stopped"))));
    });
  }, []);

  /** Start: check the access code (by minting a token), open the camera, load the body guide. */
  const start = useCallback(async () => {
    if (phaseRef.current !== "gate") return;
    setNotice(null);
    const session = ++sessionRef.current;
    setPhase("starting");
    try {
      tokenRef.current = await fetchToken(codeRef.current);
      try {
        sessionStorage.setItem("kapadiya-code", codeRef.current);
      } catch {}
      if (session !== sessionRef.current) return;
      const portrait = window.innerHeight > window.innerWidth;
      const fps = typeof model.fps === "number" ? { ideal: model.fps } : model.fps;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: portrait ? model.height : model.width },
          height: { ideal: portrait ? model.width : model.height },
          ...(fps ? { frameRate: fps } : {}),
          facingMode: "user",
        },
        audio: false,
      });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      stream.getVideoTracks()[0].onended = () => stop({ message: "Camera disconnected.", action: "restart" });
      const camera = cameraRef.current;
      camera.srcObject = stream;
      await camera.play();
      if (!trackerRef.current) {
        try {
          trackerRef.current = await createPoseTracker();
        } catch (err) {
          console.warn("Framing guide unavailable", err);
        }
      }
      if (session !== sessionRef.current) return;
      if (trackerRef.current) {
        holdStartRef.current = 0;
        setHolding(false);
        setPhase("framing");
      } else markFramed();
    } catch (err) {
      if (session !== sessionRef.current) return;
      stop(friendly(err));
    }
  }, [markFramed, stop]);

  /** Opens the Decart realtime session with the first garment as its initial state. */
  const connect = useCallback(
    async (image, prompt, session) => {
      let token = tokenRef.current;
      if (!token || Date.now() - token.at > TOKEN_TTL_MS) token = tokenRef.current = await fetchToken(codeRef.current);
      if (session !== sessionRef.current) throw new Error("stopped");
      const client = createDecartClient({ apiKey: token.apiKey, telemetry: false });
      const realtime = await client.realtime.connect(streamRef.current, {
        model,
        mirror: true, // the camera is always the front one; mirror explicitly (Decart best practice)
        ...(token.fastMode ? { speed: "fast" } : {}),
        initialState: { prompt: { text: prompt, enhance: true }, image },
        onRemoteStream: (remote) => {
          if (session !== sessionRef.current || !remoteRef.current) return;
          remoteRef.current.srcObject = remote;
          remoteRef.current.play().catch(() => {});
        },
      });
      if (session !== sessionRef.current) {
        realtime.disconnect();
        throw new Error("stopped");
      }
      realtime.on("connectionChange", (state) => {
        if (session !== sessionRef.current) return;
        setConnection(state);
        if (state === "generating" || state === "connected") setQueue(null);
        if (state === "disconnected") stop({ message: "The live session ended.", action: "restart" });
      });
      realtime.on("queuePosition", (q) => session === sessionRef.current && setQueue(q));
      realtime.on("sessionEnded", (e) => {
        if (session === sessionRef.current) stop({ message: `Session ended${e?.reason ? ` (${e.reason})` : ""}.`, action: "restart" });
      });
      realtime.on("error", (err) => session === sessionRef.current && stop(friendly(err)));
      connectionRef.current = realtime;
      setConnection(realtime.getConnectionState?.() || "connected");
      const started = Date.now();
      setRemaining(token.sessionSeconds);
      timerRef.current = setInterval(() => {
        const left = Math.max(0, token.sessionSeconds - Math.floor((Date.now() - started) / 1000));
        setRemaining(left);
        if (!left) stop({ message: "That's the end of this fitting. Start again whenever you like.", action: "restart" });
      }, 1000);
      return realtime;
    },
    [stop],
  );

  // ---------- Garment pipeline ----------

  const waitForRemoteFrame = () =>
    new Promise((resolve) => {
      const v = remoteRef.current;
      if (!v || (v.readyState >= 2 && v.videoWidth)) return resolve();
      const done = () => {
        v.removeEventListener("loadeddata", done);
        resolve();
      };
      v.addEventListener("loadeddata", done);
    });

  /** Puts a prepared garment on the customer: the first one connects, later ones swap in with set(). */
  const apply = useCallback(
    async (id, image, prompt) => {
      const session = sessionRef.current;
      await waitUntilFramed(session);
      if (session !== sessionRef.current || garmentRef.current?.id !== id) return;
      updateGarment(id, { status: "fitting" });
      scanRef.current = { mode: "loop", start: performance.now(), revealRemote: false };
      const firstLook = !remoteShownRef.current;
      if (!connectionRef.current) {
        if (!connectingRef.current) {
          connectingRef.current = connect(image, prompt, session);
          connectingForRef.current = id;
        }
        try {
          await connectingRef.current;
        } catch (err) {
          if (session === sessionRef.current) connectingRef.current = null;
          throw err;
        }
        if (connectingForRef.current !== id) await connectionRef.current?.set({ prompt, image, enhance: true });
      } else {
        await connectionRef.current.set({ prompt, image, enhance: true });
      }
      await waitForRemoteFrame();
      await new Promise((r) => setTimeout(r, firstLook ? SETTLE_MS + 500 : SETTLE_MS));
      if (session !== sessionRef.current || garmentRef.current?.id !== id) return;
      scanRef.current = { mode: "reveal", start: performance.now(), revealRemote: firstLook };
      if (firstLook) {
        remoteShownRef.current = true;
        setRemoteVisible(true);
      }
      updateGarment(id, { status: "live" });
    },
    [connect, updateGarment, waitUntilFramed],
  );

  /** Entry point for every look: catalogue garment (+ colourway) or an uploaded photo. */
  const tryOn = useCallback(
    async ({ catalogItem, colour, file }) => {
      setNotice(null);
      setDragging(false);
      if (phaseRef.current === "gate") {
        // Remember the choice; it applies as soon as the camera is on and framed.
        if (catalogItem) setPending(catalogItem);
        return;
      }
      const id = ++seqRef.current;
      const name = catalogItem ? catalogItem.name : nameFromFile(file) || "Your photo";
      const colourName = colour || catalogItem?.colourways?.[0]?.name || null;
      const prompt = catalogItem ? catalogPrompt(catalogItem, colourName) : uploadPrompt(name);
      setGarment({ id, name, preview: catalogItem?.image || "", status: "reading", colour: colourName, catalogId: catalogItem?.id || null });
      try {
        const prepared = await normalizeImage(catalogItem ? catalogItem.image : file);
        if (garmentRef.current?.id !== id) return;
        imageRef.current = prepared.blob;
        updateGarment(id, { preview: catalogItem ? catalogItem.image : prepared.preview, status: phaseRef.current === "ready" ? "fitting" : "waiting" });
        await apply(id, prepared.blob, prompt);
      } catch (err) {
        if (err?.message === "stopped") return;
        if (garmentRef.current?.id === id) updateGarment(id, { status: "failed" });
        scanRef.current = { mode: "off", start: 0, revealRemote: false };
        setNotice(friendly(err));
      }
    },
    [apply, updateGarment],
  );

  // A garment picked on the landing page (or before starting) applies once the camera is live.
  useEffect(() => {
    if (pending && (phase === "framing" || phase === "ready")) {
      const item = pending;
      setPending(null);
      void tryOn({ catalogItem: item });
    }
  }, [pending, phase, tryOn]);

  /** Colour chips re-send the same garment image with a recolour sentence in the prompt. */
  const recolour = useCallback(
    (colour) => {
      const g = garmentRef.current;
      const item = g?.catalogId && byId(g.catalogId);
      if (!item || g.colour === colour || ["reading", "fitting"].includes(g.status)) return;
      void tryOn({ catalogItem: item, colour });
    },
    [tryOn],
  );

  // ---------- Vision + scan effect loop ----------
  // One rAF loop: pose detection (~15 fps) while framing or scanning, the framing guide, and the
  // laser scan — looping while Decart works, then one sweep that reveals the AI video underneath.

  useEffect(() => {
    let frame = 0;
    let lastDetect = 0;
    const fx = document.createElement("canvas");
    const draw = (now) => {
      frame = requestAnimationFrame(draw);
      const camera = cameraRef.current;
      const canvas = fxRef.current;
      const tracker = trackerRef.current;
      if (!camera || !canvas || !streamRef.current || !camera.videoWidth) return;
      const scan = scanRef.current;
      const framing = phaseRef.current === "framing";
      if (tracker && (framing || scan.mode !== "off") && now - lastDetect > 66) {
        lastDetect = now;
        poseRef.current = tracker.detect(camera);
      }
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = fx.width = Math.round(width * dpr);
        canvas.height = fx.height = Math.round(height * dpr);
      }
      const geometry = { width, height, videoWidth: camera.videoWidth, videoHeight: camera.videoHeight };
      if (framing && tracker) {
        const result = guide(poseRef.current, geometry);
        setGuidance((p) => (p.message === result.message && p.ok === result.ok ? p : result));
        if (result.ok) {
          holdStartRef.current ||= now;
          setHolding(true);
          if (now - holdStartRef.current > HOLD_MS) markFramed();
        } else if (holdStartRef.current) {
          holdStartRef.current = 0;
          setHolding(false);
        }
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const remote = remoteRef.current;
      if (scan.mode === "off") {
        if (remote && !scan.revealRemote) remote.style.clipPath = "";
        return;
      }

      const elapsed = now - scan.start;
      let y;
      let intensity = 1;
      if (scan.mode === "loop") {
        const p = (elapsed % 2400) / 2400;
        y = height * (0.04 + 0.92 * (0.5 - Math.cos(p * Math.PI * 2) / 2));
        intensity = Math.min(1, elapsed / 300);
      } else {
        const p = Math.min(1, elapsed / SCAN_REVEAL_MS);
        y = height * (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
        intensity = p > 0.85 ? (1 - p) / 0.15 : 1;
        if (remote) remote.style.clipPath = scan.revealRemote ? `inset(0 0 ${Math.max(0, 100 - (y / height) * 100)}% 0)` : "";
        if (p >= 1) {
          scanRef.current = { mode: "off", start: 0, revealRemote: false };
          if (remote) remote.style.clipPath = "";
          return;
        }
      }

      // Body-conforming glow in house champagne: draw the band, keep only pixels inside the person mask.
      const f = fx.getContext("2d");
      f.setTransform(dpr, 0, 0, dpr, 0, 0);
      f.globalCompositeOperation = "source-over";
      f.clearRect(0, 0, width, height);
      const wake = scan.mode === "reveal" ? Math.min(y, 220) : 150;
      const wg = f.createLinearGradient(0, y - wake, 0, y);
      wg.addColorStop(0, "rgba(201,169,97,0)");
      wg.addColorStop(1, "rgba(232,213,168,0.36)");
      f.fillStyle = wg;
      f.fillRect(0, y - wake, width, wake);
      f.fillStyle = "rgba(245,235,210,0.2)";
      for (let line = y - wake; line < y; line += 5) f.fillRect(0, line, width, 1);
      f.fillStyle = "rgba(232,213,168,0.14)";
      for (let col = (elapsed / 40) % 18; col < width; col += 18) f.fillRect(col, y - wake * 0.6, 1, wake * 0.6);
      const band = f.createLinearGradient(0, y - 22, 0, y + 22);
      band.addColorStop(0, "rgba(201,169,97,0)");
      band.addColorStop(0.5, "rgba(255,248,230,0.95)");
      band.addColorStop(1, "rgba(201,169,97,0)");
      f.fillStyle = band;
      f.fillRect(0, y - 22, width, 44);
      for (let s = 0; s < 36; s++) {
        f.fillStyle = `rgba(255,250,235,${0.4 + Math.random() * 0.6})`;
        f.fillRect(Math.random() * width, y - 16 + Math.random() * 20, 2, 2);
      }
      if (tracker && poseRef.current) {
        const cover = coverRect(geometry);
        f.globalCompositeOperation = "destination-in";
        f.save();
        f.translate(width, 0);
        f.scale(-1, 1);
        f.filter = "blur(2px)";
        f.drawImage(tracker.mask, cover.x, cover.y, cover.width, cover.height);
        f.restore();
        f.filter = "none";
      }
      ctx.globalAlpha = intensity;
      ctx.drawImage(fx, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.shadowColor = "rgba(232,213,168,0.95)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "rgba(255,248,230,0.92)";
      ctx.fillRect(0, y - 1, width, 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(201,169,97,0.9)";
      ctx.fillRect(8, y - 6, 3, 12);
      ctx.fillRect(width - 11, y - 6, 3, 12);
      ctx.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [markFramed]);

  // ---------- Actions ----------

  /** Saves the current AI frame as a JPEG with a small house signature. */
  const snapshot = () => {
    const v = remoteRef.current;
    if (!v?.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0);
    const pad = Math.round(c.width * 0.03);
    ctx.font = `600 ${Math.round(c.width * 0.022)}px Manrope, sans-serif`;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillText("KAPADIYA & SONS · LIVE TRY-ON", pad + 1, c.height - pad + 1);
    ctx.fillStyle = "#E8D5A8";
    ctx.fillText("KAPADIYA & SONS · LIVE TRY-ON", pad, c.height - pad);
    c.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kapadiya-look-${Date.now()}.jpg`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      "image/jpeg",
      0.95,
    );
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
    if (file) void tryOn({ file });
    else setNotice({ message: "Drop a JPG, PNG or WebP photo of a garment." });
  };

  // ---------- Render ----------

  const box = silhouetteBox(size.width, size.height);
  const cameraOn = phase === "framing" || phase === "ready";
  const live = remoteVisible && (connection === "generating" || connection === "connected");
  const rail = useMemo(() => GARMENTS.filter((g) => filter === "all" || g.gender === filter), [filter]);
  const activeItem = garment?.catalogId ? byId(garment.catalogId) : null;
  const busy = garment && ["reading", "fitting"].includes(garment.status);
  const statusText = {
    reading: "Preparing garment…",
    waiting: phase === "framing" ? "Step into the outline — it applies next" : "Waiting for the camera…",
    fitting: queue ? `In queue · #${queue.position} of ${queue.queueSize}` : "Tailoring it to you…",
    live: "Live",
    failed: "Didn't apply — tap to retry",
  };

  return (
    <div
      className="flex h-[100dvh] flex-col overflow-hidden bg-void text-bone lg:flex-row"
      onDragEnter={(e) => {
        e.preventDefault();
        if (cameraOn) setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      {/* ---------------- Stage ---------------- */}
      <div ref={stageRef} className="stage relative min-h-0 flex-1 overflow-hidden bg-[#0e0f12]">
        <video className="camera" ref={cameraRef} muted playsInline />
        <video className={`remote ${remoteVisible ? "visible" : ""} ${peek ? "peek" : ""}`} ref={remoteRef} muted playsInline />
        <canvas className="fx" ref={fxRef} />

        {/* top bar */}
        <div className="absolute inset-x-0 top-0 z-[25] flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-[max(14px,env(safe-area-inset-top))]">
          <Link href="/" aria-label="Back to home">
            <BrandMark strong={live} />
          </Link>
          <div className="flex items-center gap-2">
            {live && (
              <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#e5484d] soft-pulse" /> Live
                {remaining > 0 && (
                  <span className="ml-1 tabular-nums text-muted">
                    {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
                  </span>
                )}
              </span>
            )}
            {cameraOn && (
              <button className="icon-btn" onClick={() => stop({ message: "Session ended. Thank you for trying on with us.", action: "restart" })} title="End session" aria-label="End session">
                <svg viewBox="0 0 24 24"><path d="M12 3v8" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* framing guide */}
        {phase === "framing" && size.width > 0 && (
          <div className={`framing absolute inset-0 z-[4] ${holding ? "holding" : ""}`}>
            <svg width={size.width} height={size.height} aria-hidden="true" className="absolute inset-0">
              <defs>
                <mask id="cutout">
                  <rect width="100%" height="100%" fill="white" />
                  <path d={SILHOUETTE} fill="black" transform={`translate(${box.left} ${box.top}) scale(${box.side / 100})`} />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(8,9,11,0.62)" mask="url(#cutout)" />
              <path className="outline" d={SILHOUETTE} transform={`translate(${box.left} ${box.top}) scale(${box.side / 100})`} vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="absolute inset-x-0 top-20 flex flex-col items-center gap-2 px-6 text-center">
              <strong key={guidance.message} className="fade-up font-display text-headline-sm">
                {guidance.ok ? "Hold still" : guidance.message}
              </strong>
              <span className="text-body-sm text-muted">Line your head and shoulders up with the outline</span>
              <button className="mt-2 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-[12px] font-semibold backdrop-blur" onClick={markFramed}>
                Skip guide
              </button>
            </div>
          </div>
        )}

        {/* gate */}
        {phase === "gate" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-void/95 px-6 py-20">
            <div className="fade-up w-full max-w-sm text-center">
              <p className="eyebrow text-champagne">Your live fitting room</p>
              <h1 className="mt-3 font-display text-[40px] leading-tight">See it on you.</h1>
              {pending && (
                <div className="mx-auto mt-5 flex max-w-xs items-center gap-3 rounded-media border border-border-subtle bg-surface p-2 text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pending.image} alt="" className="h-14 w-11 rounded-md bg-bone object-cover" />
                  <div>
                    <p className="eyebrow text-[10px] text-muted">First look</p>
                    <p className="text-body-sm font-semibold">{pending.name}</p>
                  </div>
                </div>
              )}
              <ol className="mx-auto mt-6 grid max-w-xs gap-2.5 text-left text-body-sm text-on-surface">
                {["Allow your camera", "Line up with the outline", "Tap any garment to wear it live"].map((s, i) => (
                  <li key={s} className="flex items-center gap-3">
                    <b className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-champagne/50 text-[11px] text-champagne">{i + 1}</b>
                    {s}
                  </li>
                ))}
              </ol>
              {config && !config.configured ? (
                <p className="mt-8 rounded-media border border-[#e5484d]/40 bg-[#e5484d]/10 p-4 text-body-sm">
                  Live try-on isn&apos;t switched on yet — the server is missing its Decart API key.
                </p>
              ) : (
                <form
                  className="mt-8 flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void start();
                  }}
                >
                  {config?.requiresCode && (
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Access code"
                      autoComplete="off"
                      className="rounded-full border border-border-subtle bg-surface px-5 py-3.5 text-center text-body-lg text-bone outline-none placeholder:text-muted focus:border-champagne"
                    />
                  )}
                  <button type="submit" className="btn-primary" disabled={!config || (config.requiresCode && !code.trim())}>
                    Start camera
                  </button>
                </form>
              )}
              <p className="mt-4 text-[12px] leading-relaxed text-muted">
                Video streams to our AI partner only while this page is open. Nothing is recorded.
                {config?.sessionSeconds ? ` Sessions last up to ${Math.round(config.sessionSeconds / 60)} min.` : ""}
              </p>
            </div>
          </div>
        )}

        {phase === "starting" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-void/90">
            <div className="spinner" />
            <span className="text-body-sm text-muted">Opening camera and loading the body guide…</span>
          </div>
        )}

        {/* ready, nothing chosen yet */}
        {phase === "ready" && !garment && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[5] flex justify-center px-6">
            <span className="fade-up rounded-full bg-black/55 px-5 py-3 text-body-sm backdrop-blur">
              <span className="lg:hidden">Tap a garment below to wear it</span>
              <span className="hidden lg:inline">Pick a garment on the right — or drop your own photo here</span>
            </span>
          </div>
        )}

        {/* current garment card */}
        {garment && cameraOn && (
          <div className="fade-up absolute bottom-4 left-4 z-[6] flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-media border border-white/10 bg-black/55 p-2 pr-4 backdrop-blur-md">
            <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-md bg-bone">
              {garment.preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={garment.preview} alt="" className="h-full w-full object-cover" />
              )}
              {busy && <i className="thumb-scan" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold">
                {garment.name}
                {activeItem && garment.colour && garment.colour !== activeItem.colourways[0].name && <span className="font-normal text-muted"> · {garment.colour}</span>}
              </p>
              <p className="flex items-center gap-1.5 text-[12px] text-muted">
                {garment.status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-[#7de0b8]" />}
                {statusText[garment.status]}
              </p>
            </div>
          </div>
        )}

        {/* right-side tools */}
        {live && (
          <div className="absolute right-4 top-1/2 z-[6] flex -translate-y-1/2 flex-col gap-2">
            <button
              className="icon-btn"
              title="Hold to compare with your real outfit"
              aria-label="Hold to compare"
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <svg viewBox="0 0 24 24"><path d="M12 3v18" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
            </button>
            <button className="icon-btn" onClick={snapshot} title="Save a photo" aria-label="Save a photo">
              <svg viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3v11H4Z" /><circle cx="12" cy="13.5" r="3.3" /></svg>
            </button>
          </div>
        )}
        {peek && <div className="absolute left-1/2 top-20 z-[6] -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]">Your outfit</div>}

        {connection === "reconnecting" && <div className="absolute left-1/2 top-20 z-[7] -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-body-sm">Reconnecting…</div>}
        {dragging && <div className="pointer-events-none absolute inset-3 z-[8] grid place-items-center rounded-card border-2 border-dashed border-champagne bg-champagne/10 font-display text-headline-sm">Drop to try it on</div>}

        {notice && (
          <div role="alert" className="fade-up absolute left-1/2 top-20 z-30 flex w-[min(92%,440px)] -translate-x-1/2 items-start gap-3 rounded-media border border-white/10 bg-raised/95 p-4 text-body-sm shadow-drawer backdrop-blur">
            <span className="flex-1">{notice.message}</span>
            {notice.action === "restart" && phase === "gate" && (
              <button className="shrink-0 font-semibold text-champagne" onClick={() => void start()}>
                Start again
              </button>
            )}
            <button className="shrink-0 text-muted" onClick={() => setNotice(null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ---------------- Rail ---------------- */}
      <aside className="flex max-h-[42dvh] shrink-0 flex-col border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3 lg:px-5 lg:pt-5">
          <div className="flex gap-1 rounded-full bg-void p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${filter === f.id ? "bg-champagne text-void" : "text-muted hover:text-bone"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-[12px] font-semibold text-champagne" disabled={!cameraOn} style={{ opacity: cameraOn ? 1 : 0.4 }}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>
            Your photo
          </button>
        </div>

        {activeItem && cameraOn && (
          <div className="flex items-center gap-2 overflow-x-auto px-4 pb-2 lg:px-5">
            <span className="eyebrow shrink-0 text-[10px] text-muted">Colour</span>
            {activeItem.colourways.map((c) => (
              <button
                key={c.name}
                onClick={() => recolour(c.name)}
                disabled={busy}
                title={c.name}
                aria-label={c.name}
                className={`h-7 w-7 shrink-0 rounded-full border-2 transition-transform active:scale-90 disabled:opacity-50 ${garment?.colour === c.name ? "border-champagne" : "border-white/10"}`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-3 lg:overflow-y-auto lg:overflow-x-hidden lg:px-5 lg:pb-6">
          <div className="flex gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
            {rail.map((g) => {
              const active = garment?.catalogId === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => void tryOn({ catalogItem: g })}
                  disabled={busy && !active}
                  className={`group relative w-24 shrink-0 overflow-hidden rounded-media border text-left transition-all disabled:opacity-60 sm:w-28 lg:w-auto ${active ? "border-champagne ring-2 ring-champagne/40" : "border-border-subtle hover:border-champagne/60"} ${pending?.id === g.id ? "border-champagne" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.image} alt={g.name} loading="lazy" className="aspect-[3/4] w-full bg-bone object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-1.5 pt-6">
                    <span className="block truncate text-[11px] font-semibold text-bone">{g.name}</span>
                    <span className="hidden text-[10px] text-champagne-light lg:block">{inr(g.price)}</span>
                  </span>
                  {active && busy && <i className="thumb-scan" />}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void tryOn({ file });
          e.target.value = "";
        }}
      />
    </div>
  );
}
