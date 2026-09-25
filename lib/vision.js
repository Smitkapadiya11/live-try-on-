// Person framing and segmentation with MediaPipe Pose Landmarker (lite), adapted from
// OpenWear. Runs on a 256px copy of the camera frame so it stays cheap next to WebRTC.
// The wasm runtime and model are served from /public/vision.

const DETECT_WIDTH = 256;

export async function createPoseTracker() {
  const { PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const base = "/vision/";
  const fileset = { wasmLoaderPath: `${base}vision_wasm_internal.js`, wasmBinaryPath: `${base}vision_wasm_internal.wasm` };
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}pose_landmarker_lite.task`, delegate: "CPU" },
    runningMode: "VIDEO",
    numPoses: 1,
    outputSegmentationMasks: true,
  });
  const input = document.createElement("canvas");
  const inputCtx = input.getContext("2d", { willReadFrequently: true });
  const mask = document.createElement("canvas");
  const maskCtx = mask.getContext("2d");
  let maskImage = null;
  let last = 0;

  return {
    mask,
    /** Detects the pose on the current frame and refreshes the person-mask canvas. */
    detect(video) {
      if (!video.videoWidth) return null;
      const width = DETECT_WIDTH;
      const height = Math.round((DETECT_WIDTH * video.videoHeight) / video.videoWidth);
      if (input.width !== width || input.height !== height) {
        input.width = mask.width = width;
        input.height = mask.height = height;
        maskImage = maskCtx.createImageData(width, height);
      }
      inputCtx.drawImage(video, 0, 0, width, height);
      const now = Math.max(performance.now(), last + 1);
      last = now;
      let landmarks = null;
      landmarker.detectForVideo(input, now, (result) => {
        landmarks = result.landmarks?.[0] || null;
        const seg = result.segmentationMasks?.[0];
        if (seg && maskImage) {
          const values = seg.getAsFloat32Array();
          const data = maskImage.data;
          for (let i = 0; i < values.length; i++) {
            const o = i * 4;
            data[o] = data[o + 1] = data[o + 2] = 255;
            data[o + 3] = values[i] * 255;
          }
          maskCtx.putImageData(maskImage, 0, 0);
        } else if (!landmarks) {
          maskCtx.clearRect(0, 0, mask.width, mask.height);
        }
      });
      return landmarks;
    },
    close() {
      landmarker.close();
    },
  };
}

/** Where the mirrored, object-fit: cover camera image lands on the stage. */
export function coverRect({ width, height, videoWidth, videoHeight }) {
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const w = videoWidth * scale;
  const h = videoHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

/** The silhouette lives in a 100×100 box, bottom-centred on the stage. */
export function silhouetteBox(width, height) {
  const side = Math.min(width, height);
  return { left: (width - side) / 2, top: height - side, side };
}

/** Head-and-shoulders outline shown during framing (SVG path in the 100×100 box). */
export const SILHOUETTE =
  "M45.5 31.2 L45.5 36 C38 37 26 38.5 22 47 C19.5 52 19 60 19 70 L19 100 L81 100 L81 70 C81 60 80.5 52 78 47 C74 38.5 62 37 54.5 36 L54.5 31.2 A12 12 0 1 0 45.5 31.2 Z";

const TARGET = { head: { x: 50, y: 20 }, shoulders: 39, near: 1.3, far: 0.68, slack: 10 };

/** Turns pose landmarks into one coaching instruction. */
export function guide(landmarks, geometry) {
  if (!landmarks) return { ok: false, message: "Step into the frame" };
  const seen = (p) => (p.visibility ?? 1) > 0.5;
  const [nose, ls, rs] = [landmarks[0], landmarks[11], landmarks[12]];
  if (!seen(nose)) return { ok: false, message: "Face the camera" };
  if (!seen(ls) || !seen(rs)) return { ok: false, message: "Step back" };
  const cover = coverRect(geometry);
  const box = silhouetteBox(geometry.width, geometry.height);
  const units = (p) => ({
    x: ((geometry.width - (cover.x + p.x * cover.width) - box.left) / box.side) * 100,
    y: ((cover.y + p.y * cover.height - box.top) / box.side) * 100,
  });
  const head = units(nose);
  const shoulders = Math.abs(units(ls).x - units(rs).x);
  if (shoulders > TARGET.shoulders * TARGET.near) return { ok: false, message: "Step back" };
  if (shoulders < TARGET.shoulders * TARGET.far) return { ok: false, message: "Come a little closer" };
  if (head.x < TARGET.head.x - TARGET.slack) return { ok: false, message: "Move right" };
  if (head.x > TARGET.head.x + TARGET.slack) return { ok: false, message: "Move left" };
  if (Math.abs(head.y - TARGET.head.y) > TARGET.slack * 1.3) return { ok: false, message: "Line your head up with the circle" };
  return { ok: true, message: "Hold still" };
}
