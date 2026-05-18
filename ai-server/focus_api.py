"""
focus_api.py — FastAPI backend for AI Study Focus Tracker
"""

import asyncio
import json
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from focus_tracker_3 import Config, FocusTracker

_tracker: FocusTracker | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _tracker
    _tracker = FocusTracker(cfg=Config())
    _tracker.open_camera()
    yield
    _tracker.release()


app = FastAPI(
    title="Lunaria Cafe Focus Tracker API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _next_frame():
    frame, state = _tracker.process_frame()
    return frame, state


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": time.time()}


@app.get("/stream")
def mjpeg_stream():
    def generate():
        while True:
            frame, _ = _next_frame()
            if frame is None:
                break
            jpeg = FocusTracker.encode_frame_jpeg(frame)
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
            )

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/state")
def get_state():
    if _tracker is None:
        return JSONResponse({"error": "Tracker not initialised"}, status_code=503)
    _tracker.process_frame()
    return JSONResponse(_tracker.state.to_dict())


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            frame, state = _next_frame()
            if frame is None:
                break
            payload = {
                "frame_b64": FocusTracker.encode_frame_b64(frame),
                "state": state.to_dict(),
            }
            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(0)
    except WebSocketDisconnect:
        pass


@app.post("/reset")
def reset_session():
    if _tracker is None:
        return JSONResponse({"error": "Tracker not initialised"}, status_code=503)
    _tracker.state.focus_score = 0.0
    _tracker.state.session_seconds = 0.0
    _tracker._session_start = time.time()
    _tracker._last_face_time = time.time()
    return {"message": "Session reset", "focus_score": 0.0}
