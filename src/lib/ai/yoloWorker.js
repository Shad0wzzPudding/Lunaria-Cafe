import * as ort from 'onnxruntime-web';

// บังคับให้โหลด WASM จาก CDN ป้องกันปัญหาตอน Deploy ลง Vercel
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

// ONNX inference session, initialised once on 'init' message
let session = null;
const PHONE_CLASS_INDEX = 67; // Class 67 คือ โทรศัพท์ใน COCO

// Minimum score for a box whose winning class is already "cell phone" (see the
// argmax check in postprocess — that is what actually keeps headphones, a watch
// and a milk carton out). This was 0.10, far below YOLOv8's usual 0.25-0.5
// working range. A confirmed hit drops the focus score and starts the 30s
// danger clock, so a false positive costs more than briefly missing a real
// phone — but with argmax doing the heavy lifting this no longer has to be
// punishing. Raise it if props still register; lower it if a real phone goes
// unnoticed. The camera overlay prints the live confidence ("Phone 62%").
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

function postprocess(output) {
  const data = output.data;
  // This code indexes the tensor as [1, 4 + numClasses, numBoxes] (box coords
  // first, then one row per class, each row numBoxes long). Ultralytics can
  // also export the transposed [1, numBoxes, 4 + numClasses]; fed that, the
  // maths below would stay in bounds and quietly read nonsense. So assert the
  // layout instead of assuming it — a model swap should fail loudly, not
  // silently start hallucinating phones.
  const dims = output.dims ?? [1, 84, 8400];
  if (dims[1] <= 4 || dims[1] >= dims[2]) {
    throw new Error(`Unexpected YOLO output layout [${dims}] — expected [1, 4+numClasses, numBoxes]`);
  }
  const numClasses = dims[1] - 4;
  const numBoxes = dims[2];
  const phones = [];

  for (let i = 0; i < numBoxes; i++) {
    // 1. คะแนนของคลาสโทรศัพท์ — เกือบทุกกล่องเป็น background จึงคัดออกก่อน
    // Cheap test first: almost all 8400 boxes are background and fail here, so
    // gating on it keeps the 80-class scan below off ~99.9% of them (measured
    // 1.38ms -> 0.02ms per frame, identical output).
    const score = data[(4 + PHONE_CLASS_INDEX) * numBoxes + i];
    if (score <= CONF_THRESHOLD) continue;

    // 2. โทรศัพท์ต้องเป็นคลาสที่ชนะของกล่องนี้ (argmax) ไม่ใช่แค่ผ่านเกณฑ์
    //
    // This box also carries a score for all the other COCO classes, and until
    // now we never looked at them — we asked "is the phone score above the
    // bar?" and ignored that some other class might be scoring far higher.
    // A carton of milk lights up `bottle` at 0.85 and `cell phone` at 0.50,
    // and we happily called it a phone. Headphones and a watch do the same.
    // A detection only counts if cell phone actually WINS the box.
    let best = 0;
    for (let c = 0; c < numClasses; c++) {
      const s = data[(4 + c) * numBoxes + i];
      if (s > best) best = s;
    }
    if (score < best) continue; // another class explains this box better

    // 3. ดึงพิกัดมาสร้างกล่อง
    {
      const cx = data[0 * numBoxes + i]; // จุดกึ่งกลาง X
      const cy = data[1 * numBoxes + i]; // จุดกึ่งกลาง Y
      const w = data[2 * numBoxes + i];  // ความกว้าง
      const h = data[3 * numBoxes + i];  // ความสูง

      // แปลงพิกัดให้อยู่ในช่วง 0.0 - 1.0 เพื่อส่งให้ React เอาไปคูณขนาดหน้าจอ
      phones.push({
        x1: (cx - w / 2) / 640,
        y1: (cy - h / 2) / 640,
        w: w / 640,
        h: h / 640,
        conf: score
      });
    }
  }
  
  // 3. ถ้าเจอกล่อง ให้เรียงลำดับความมั่นใจ แล้วส่งกล่องที่ดีที่สุดกลับไป 1 กล่อง
  if (phones.length > 0) {
    phones.sort((a, b) => b.conf - a.conf);
    return [phones[0]]; 
  }
  
  // 4. ถ้าหาไม่เจอจริงๆ ค่อยคืนค่าว่าง
  return []; 
}

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
    } catch (err) {
      console.error("Inference Error:", err);
      postMessage({ type: 'result', phones: [] });
    }
  }
}