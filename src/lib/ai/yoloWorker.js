import * as ort from 'onnxruntime-web';

// บังคับให้โหลด WASM จาก CDN ป้องกันปัญหาตอน Deploy ลง Vercel
// Pin to the installed package version, exactly as MediaPipe is pinned in
// browserAI: an unversioned jsdelivr path serves @latest, and WASM binaries
// newer than the JS that drives them will break inference in production on a
// day nobody touched this repo.
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/';

// ONNX inference session, initialised once on 'init' message
let session = null;
const PHONE_CLASS_ID = 67; // Class 67 คือ โทรศัพท์ใน COCO

// Minimum confidence for a detection the model has already labelled "cell
// phone". YOLO26 runs end-to-end: it picks the winning class itself and hands
// back one row per surviving detection, so the old argmax scan (which existed
// to stop a milk carton scoring `bottle` 0.85 / `cell phone` 0.50 from counting
// as a phone) is no longer needed — a losing class never reaches us at all.
// A confirmed hit drops the focus score and starts the 30s danger clock, so a
// false positive costs more than briefly missing a real phone. Raise this if
// props still register; lower it if a real phone goes unnoticed. The camera
// overlay prints the live confidence ("Phone 62%").
const CONF_THRESHOLD = 0.40;

async function initModel() {
  try {
    session = await ort.InferenceSession.create(self.location.origin + '/models/yolo26n.onnx', {
      executionProviders: ['wasm']
    });
    postMessage({ type: 'status', status: 'ready' });
  } catch (err) {
    console.error("YOLO Init Error:", err);
    postMessage({ type: 'status', status: 'error', error: err.message });
  }
}

function preprocess(imageData) {
  const { data } = imageData; // flat RGBA 640x640
  const numPixels = 640 * 640;
  
  // สร้าง Float32Array ขนาด Batch=1, Channels=3, H=640, W=640
  const tensorData = new Float32Array(1 * 3 * numPixels);

  // กำหนด Offset สำหรับแต่ละช่องสีแบบ explicit
  const offsetR = 0;
  const offsetG = 1 * numPixels;
  const offsetB = 2 * numPixels;

  // วนลูปแกะทีละ Pixel
  for (let i = 0; i < numPixels; i++) {
    const pixelIdx = i * 4; // ตำแหน่ง RGBA ใน ImageData
    
    // Normalize จาก 0-255 เป็น 0.0-1.0
    const r = data[pixelIdx] / 255.0;
    const g = data[pixelIdx + 1] / 255.0;
    const b = data[pixelIdx + 2] / 255.0;
    
    // บรรจุลงในโครงสร้าง [Batch, Channels, Height, Width]
    tensorData[offsetR + i] = r; // Red channel plane
    tensorData[offsetG + i] = g; // Green channel plane
    tensorData[offsetB + i] = b; // Blue channel plane
    // Alpha channel data[pixelIdx+3] โดนทิ้งไป
  }

  return new ort.Tensor('float32', tensorData, [1, 3, 640, 640]);
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function postprocess(output) {
  const data = output.data;
  // YOLO26 exports end-to-end (NMS-free): [1, numDetections, 6], where every
  // row is [x1, y1, x2, y2, conf, classId] — corners in INPUT-PIXEL space
  // (0-640), not the cxcywh + one-row-per-class grid YOLOv8 produced. Fed a
  // YOLOv8 tensor the maths below would stay in bounds and quietly read
  // nonsense, so assert the layout: a model swap must fail loudly, not
  // silently start hallucinating phones.
  const dims = output.dims ?? [];
  if (dims.length !== 3 || dims[2] !== 6) {
    throw new Error(`Unexpected YOLO output layout [${dims}] — expected [1, numDetections, 6]`);
  }
  const numDets = dims[1];

  // Rows arrive sorted by confidence, but don't lean on that — scan them all
  // and keep the single best phone. (One box is all the game ever draws.)
  let best = null;

  for (let i = 0; i < numDets; i++) {
    const o = i * 6;

    // Cheap tests first: most of the 300 rows are padding with conf 0.
    const conf = data[o + 4];
    if (conf <= CONF_THRESHOLD) continue;
    if (Math.round(data[o + 5]) !== PHONE_CLASS_ID) continue;
    if (best && conf <= best.conf) continue;

    // Corners can sit slightly outside the frame (the model happily returns
    // x1 = -4), which would draw a box hanging off the canvas — clamp first.
    const x1 = clamp01(data[o] / 640);
    const y1 = clamp01(data[o + 1] / 640);
    const x2 = clamp01(data[o + 2] / 640);
    const y2 = clamp01(data[o + 3] / 640);
    const w = x2 - x1;
    const h = y2 - y1;
    if (w <= 0 || h <= 0) continue; // fully off-frame after clamping

    // Normalised 0.0-1.0 so React can just multiply by the canvas size.
    best = { x1, y1, w, h, conf };
  }

  return best ? [best] : [];
}

// An empty result is indistinguishable from "no phone in frame", so a failing
// inference would otherwise score the player as focused forever while only
// whispering to the console — the same silent failure a missing model file
// caused. Report it once (it repeats every frame) so the main thread can warn.
let inferenceFailed = false;

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  if (type === 'init') {
    await initModel();
  }

  if (type === 'detect') {
    // Always reply with a result (even empty / on error) so the main thread's
    // in-flight guard clears — otherwise phone detection wedges for the session.
    if (!session) {
      postMessage({ type: 'result', phones: [] });
      return;
    }
    try {
      const tensor = preprocess(payload.imageData);
      const results = await session.run({ images: tensor });
      const outputTensor = results[session.outputNames[0]];
      postMessage({ type: 'result', phones: postprocess(outputTensor) });
      // Recovered: say so, or the main thread leaves "PHONE DETECTION OFFLINE"
      // on the camera for the rest of the session while detection quietly works
      // again. It has to be said explicitly — a plain result cannot mean
      // "healthy", because a failed model load posts empty results too (see the
      // !session branch above), and treating those as recovery would erase the
      // one banner that must never disappear.
      if (inferenceFailed) {
        inferenceFailed = false;
        postMessage({ type: 'status', status: 'ready' });
      }
    } catch (err) {
      console.error("Inference Error:", err);
      if (!inferenceFailed) {
        inferenceFailed = true;
        postMessage({ type: 'status', status: 'error', error: err.message });
      }
      postMessage({ type: 'result', phones: [] });
    }
  }
}