import * as ort from 'onnxruntime-web';

// บังคับให้โหลด WASM จาก CDN ป้องกันปัญหาตอน Deploy ลง Vercel
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

let session = null;
const PHONE_CLASS_INDEX = 67; // Class 67 คือ โทรศัพท์ใน COCO
const CONF_THRESHOLD = 0.10;

async function initModel() {
  try {
    session = await ort.InferenceSession.create(self.location.origin + '/models/yolov8n.onnx', {
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
  const numBoxes = 8400; // จำนวนกล่องทั้งหมดที่ YOLOv8 ส่งมา
  const phones = [];

  for (let i = 0; i < numBoxes; i++) {
    // 1. ดึงคะแนนของคลาสที่เราสนใจ
    const score = data[(4 + PHONE_CLASS_INDEX) * numBoxes + i];
    
    // 2. ถ้าคะแนนผ่านเกณฑ์ ค่อยดึงพิกัดมาสร้างกล่อง
    if (score > CONF_THRESHOLD) {
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