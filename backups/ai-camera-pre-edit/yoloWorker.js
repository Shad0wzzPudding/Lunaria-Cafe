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
    console.log("Model Input Names:", session.inputNames);
    postMessage({ type: 'status', status: 'ready' });
  } catch (err) {
    console.error("YOLO Init Error:", err);
    postMessage({ type: 'status', status: 'error', error: err.message });
  }
}

// function preprocess(imageData) {
//   const { data, width, height } = imageData;
//   const tensorData = new Float32Array(1 * 3 * 640 * 640);
  
//   // แปลงภาพให้อยู่ในรูปแบบ [1, 3, 640, 640] และ Normalize [0-1]
//   for (let y = 0; y < 640; y++) {
//     for (let x = 0; x < 640; x++) {
//       const idx = (y * width + x) * 4;
//       const r = data[idx] / 255.0;
//       const g = data[idx + 1] / 255.0;
//       const b = data[idx + 2] / 255.0;
      
//       tensorData[0 * 640 * 640 + y * 640 + x] = r;
//       tensorData[1 * 640 * 640 + y * 640 + x] = g;
//       tensorData[2 * 640 * 640 + y * 640 + x] = b;
//     }
//   }
//   return new ort.Tensor('float32', tensorData, [1, 3, 640, 640]);
// }

// ในไฟล์ src/lib/yoloWorker.js - แก้ฟังก์ชัน preprocess

// function preprocess(imageData) {
//   const { data, width, height } = imageData;
  
//   // สร้าง Float32Array สำหรับเก็บข้อมูล Tensor [1, 3, 640, 640]
//   const tensorData = new Float32Array(1 * 3 * 640 * 640);
  
//   // แปลงภาพและ Normalize ในลูปเดียว
//   for (let i = 0; i < 640 * 640; i++) {
//     // โครงสร้างภาพอินพุต (ImageData) คือ RGBA, RGBA, ...
//     const r = data[i * 4] / 255.0;     // Normalize เป็น 0.0 - 1.0
//     const g = data[i * 4 + 1] / 255.0;
//     const b = data[i * 4 + 2] / 255.0;
    
//     // จัดวางข้อมูลแบบ NCHW (Batch, Channels, Height, Width) ที่ YOLO ต้องการ
//     // โดย channels เรียงตาม RGB
//     tensorData[0 * 640 * 640 + i] = r; // Red channel
//     tensorData[1 * 640 * 640 + i] = g; // Green channel
//     tensorData[2 * 640 * 640 + i] = b; // Blue channel
//   }
  
//   return new ort.Tensor('float32', tensorData, [1, 3, 640, 640]);
// }

// ในไฟล์ src/lib/yoloWorker.js - แก้ฟังก์ชัน preprocess ใหม่ทั้งหมด
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

  // ส่งคืน Tensor พร้อมระบุ Shape ที่ถูกต้อง
  return new ort.Tensor('float32', tensorData, [1, 3, 640, 640]);
}
// function postprocess(output) {
//   const data = output.data;
//   const numBoxes = 8400; // YOLOv8n
//   console.log("Checking class 67 score:", data[(4 + 67) * numBoxes + 0]);
//   const phones = [];

//   for (let i = 0; i < numBoxes; i++) {
//     const phoneScore = data[(4 + PHONE_CLASS_INDEX) * numBoxes + i];
    
//     if (phoneScore > CONF_THRESHOLD) {
//       const cx = data[0 * numBoxes + i];
//       const cy = data[1 * numBoxes + i];
//       const w = data[2 * numBoxes + i];
//       const h = data[3 * numBoxes + i];

//       phones.push({
//         x1: cx - w / 2,
//         y1: cy - h / 2,
//         w: w,
//         h: h,
//         conf: phoneScore
//       });
//     }
//   }
  
//   if (phones.length > 0) {
//     phones.sort((a, b) => b.conf - a.conf);
//     return [phones[0]]; // ส่งกล่องที่มั่นใจที่สุดกลับไปกล่องเดียว
//   }
//   return [];
// }

// function postprocess(output) {
//   const data = output.data; // ขนาด 84 x 8400
//   const rows = 84;
//   const cols = 8400;
//   const phones = [];

//   for (let i = 0; i < cols; i++) {
//     // class_id สำหรับ phone คือ 67
//     // คะแนนอยู่ที่ index: (4 + 67) * 8400 + i
//     const score = data[(4 + 67) * cols + i];
    
//     if (score > CONF_THRESHOLD) {
//       const x = data[0 * cols + i];
//       const y = data[1 * cols + i];
//       const w = data[2 * cols + i];
//       const h = data[3 * cols + i];

//       phones.push({
//         x1: (x - w / 2) / 640,
//         y1: (y - h / 2) / 640,
//         w: w / 640,
//         h: h / 640,
//         conf: score
//       });
//     }
//   }
//   return phones;
// }

// ในไฟล์ yoloWorker.js


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
    console.log("Worker กำลังจะเริ่มโหลดโมเดล...");
    await initModel();
    console.log("Worker โหลดโมเดลเสร็จแล้ว!");
  }
  
  if (type === 'detect') {
    console.log("Worker ได้รับภาพแล้ว กำลัง Inference...");
  }
  
  if (type === 'detect' && session) {
    try {
      const tensor = preprocess(payload.imageData);
      const results = await session.run({ images: tensor });
      
      const outputName = session.outputNames[0];
      const outputTensor = results[outputName];
      
      const phones = postprocess(outputTensor);
      postMessage({ type: 'result', phones });
    } catch (err) {
      console.error("Inference Error:", err);
    }
  }
}