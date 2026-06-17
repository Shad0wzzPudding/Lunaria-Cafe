"""
AI Study Focus Tracker (NSC 2026 Edition)
=========================================
Upgraded computer vision module using MediaPipe Tasks API (Python 3.13 compatible)
and YOLOv8 for distraction tracking.
"""

import cv2
import numpy as np
import time
import json
import base64
import urllib.request
import os
from dataclasses import dataclass, field, asdict
from ultralytics import YOLO
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────
class Config:
    CAMERA_INDEX: int = 0
    FRAME_WIDTH: int = 1280
    FRAME_HEIGHT: int = 720

    MP_MODEL_URL: str = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
    MP_MODEL_PATH: str = "face_landmarker.task"

    YOLO_MODEL: str = "yolov8n.pt"
    YOLO_CONFIDENCE: float = 0.45
    CELL_PHONE_CLASS_ID: int = 67

    NO_FACE_GRACE_PERIOD: float = 3.0
    SCORE_TICK_RATE: float = 0.5
    SCORE_GAIN: float = 1.0
    SCORE_PENALTY: float = 2.0
    SCORE_MIN: float = 0.0
    SCORE_MAX: float = 9999.0

    FONT = cv2.FONT_HERSHEY_DUPLEX
    FONT_SCALE: float = 0.75
    FONT_THICKNESS: int = 2


@dataclass
class TrackerState:
    focus_score: float = 0.0
    is_face_detected: bool = False
    is_phone_detected: bool = False
    is_user_focused: bool = False
    session_seconds: float = 0.0
    warning_message: str = ""
    phone_bboxes: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


def _draw_text_with_bg(frame, text, origin, font=Config.FONT, scale=Config.FONT_SCALE, thickness=Config.FONT_THICKNESS, text_color=(255, 255, 255), bg_color=(0, 0, 0), padding=8):
    (tw, th), baseline = cv2.getTextSize(text, font, scale, thickness)
    x, y = origin
    cv2.rectangle(frame, (x - padding, y - th - padding), (x + tw + padding, y + baseline + padding), bg_color, cv2.FILLED)
    cv2.putText(frame, text, (x, y), font, scale, text_color, thickness, cv2.LINE_AA)


def draw_hud(frame: np.ndarray, state: TrackerState, cfg: Config) -> None:
    h, w = frame.shape[:2]
    _draw_text_with_bg(frame, f"Focus Score: {state.focus_score:.0f}", (20, 40), bg_color=(20, 20, 20))
    mins, secs = divmod(int(state.session_seconds), 60)
    _draw_text_with_bg(frame, f"Session: {mins:02d}:{secs:02d}", (20, 80), bg_color=(20, 20, 20))

    if state.is_user_focused:
        badge_text, badge_color = " FOCUSED ", (34, 139, 34)
    elif state.is_phone_detected:
        badge_text, badge_color = " DISTRACTED ", (0, 0, 200)
    else:
        badge_text, badge_color = " NOT FOCUSED ", (0, 140, 255)

    (bw, bh), _ = cv2.getTextSize(badge_text, cfg.FONT, cfg.FONT_SCALE, cfg.FONT_THICKNESS)
    _draw_text_with_bg(frame, badge_text, (w - bw - 30, 40), bg_color=badge_color)

    if state.warning_message:
        warn = state.warning_message
        (ww, wh), _ = cv2.getTextSize(warn, cfg.FONT, 0.9, 2)
        cx, cy = (w - ww) // 2, h // 2
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, cy - wh - 20), (w, cy + 20), (0, 0, 0), cv2.FILLED)
        cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)
        cv2.putText(frame, warn, (cx, cy), cfg.FONT, 0.9, (0, 60, 255), 2, cv2.LINE_AA)

    for bb in state.phone_bboxes:
        x1, y1, x2, y2 = int(bb["x1"]), int(bb["y1"]), int(bb["x2"]), int(bb["y2"])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
        _draw_text_with_bg(frame, f"Phone {bb['conf']:.0%}", (x1, y1 - 6), scale=0.65, bg_color=(0, 0, 200))


class FocusTracker:
    def __init__(self, cfg: Config = Config()):
        self.cfg = cfg
        self.state = TrackerState()
        self._cap: cv2.VideoCapture | None = None
        self._session_start: float = time.time()
        self._last_face_time: float = time.time()
        self._last_score_tick: float = time.time()

        if not os.path.exists(self.cfg.MP_MODEL_PATH):
            print("[FocusTracker] Downloading MediaPipe Face Landmarker model...")
            urllib.request.urlretrieve(self.cfg.MP_MODEL_URL, self.cfg.MP_MODEL_PATH)
            print("[FocusTracker] Download complete.")

        print("[FocusTracker] Initializing MediaPipe Face Landmarker...")
        base_options = python.BaseOptions(model_asset_path=self.cfg.MP_MODEL_PATH)
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
            num_faces=1,
        )
        self._face_landmarker = vision.FaceLandmarker.create_from_options(options)

        print(f"[FocusTracker] Loading YOLO model: {cfg.YOLO_MODEL}...")
        self._yolo = YOLO(cfg.YOLO_MODEL)
        print("[FocusTracker] All models ready.")

    def open_camera(self) -> None:
        self._cap = cv2.VideoCapture(self.cfg.CAMERA_INDEX)
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.cfg.FRAME_WIDTH)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.cfg.FRAME_HEIGHT)
        if not self._cap.isOpened():
            raise RuntimeError(f"Cannot open camera index {self.cfg.CAMERA_INDEX}")
        print("[FocusTracker] Camera opened.")

    def release(self) -> None:
        if self._cap:
            self._cap.release()
        self._face_landmarker.close()
        print("[FocusTracker] Resources released.")

    def process_frame(self) -> tuple[np.ndarray | None, TrackerState]:
        if self._cap is None or not self._cap.isOpened():
            return None, self.state

        ret, frame = self._cap.read()
        if not ret:
            return None, self.state

        frame = cv2.flip(frame, 1)
        now = time.time()
        self.state.session_seconds = now - self._session_start

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        landmarker_result = self._face_landmarker.detect(mp_image)

        is_gaze_focused = True
        if landmarker_result.face_landmarks:
            self.state.is_face_detected = True
            self._last_face_time = now
            if landmarker_result.face_blendshapes:
                blendshapes = landmarker_result.face_blendshapes[0]
                for category in blendshapes:
                    if category.category_name in [
                        "eyeLookInLeft",
                        "eyeLookOutRight",
                        "eyeLookOutLeft",
                        "eyeLookInRight",
                    ] and category.score > 0.6:
                        is_gaze_focused = False
        else:
            self.state.is_face_detected = False

        yolo_results = self._yolo(
            frame,
            conf=self.cfg.YOLO_CONFIDENCE,
            classes=[self.cfg.CELL_PHONE_CLASS_ID],
            verbose=False,
        )
        phone_bboxes = []
        for result in yolo_results:
            for box in result.boxes:
                if int(box.cls[0]) == self.cfg.CELL_PHONE_CLASS_ID:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    phone_bboxes.append(
                        {"x1": x1, "y1": y1, "x2": x2, "y2": y2, "conf": float(box.conf[0])}
                    )

        self.state.is_phone_detected = len(phone_bboxes) > 0
        self.state.phone_bboxes = phone_bboxes

        face_absent_duration = now - self._last_face_time
        no_face_warning = (
            not self.state.is_face_detected
            and face_absent_duration >= self.cfg.NO_FACE_GRACE_PERIOD
        )

        if self.state.is_phone_detected:
            self.state.is_user_focused = False
            self.state.warning_message = "⚠  DISTRACTION DETECTED — PUT YOUR PHONE AWAY!"
        elif not is_gaze_focused:
            self.state.is_user_focused = False
            self.state.warning_message = "👀  GAZE DISTRACTED — LOOK AT THE SCREEN!"
        elif no_face_warning:
            self.state.is_user_focused = False
            self.state.warning_message = "👀  USER NOT FOCUSED — COME BACK!"
        else:
            self.state.is_user_focused = self.state.is_face_detected
            self.state.warning_message = ""

        if now - self._last_score_tick >= self.cfg.SCORE_TICK_RATE:
            self._last_score_tick = now
            if self.state.is_user_focused:
                self.state.focus_score = min(
                    self.state.focus_score + self.cfg.SCORE_GAIN, self.cfg.SCORE_MAX
                )
            elif self.state.is_phone_detected or not is_gaze_focused:
                self.state.focus_score = max(
                    self.state.focus_score - self.cfg.SCORE_PENALTY, self.cfg.SCORE_MIN
                )

        draw_hud(frame, self.state, self.cfg)
        return frame, self.state

    # @staticmethod
    # def encode_frame_jpeg(frame: np.ndarray) -> bytes:
    #     ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    #     if not ok:
    #         return b""
    #     return buf.tobytes()

    # @staticmethod
    # def encode_frame_b64(frame: np.ndarray) -> str:
    #     return base64.b64encode(FocusTracker.encode_frame_jpeg(frame)).decode("ascii")

    @staticmethod
    def encode_frame_jpeg(frame: np.ndarray) -> bytes:
        ret, buffer = cv2.imencode('.jpg', frame)
        return buffer.tobytes() if ret else b""

    @staticmethod
    def encode_frame_b64(frame: np.ndarray) -> str:
        jpeg_bytes = FocusTracker.encode_frame_jpeg(frame)
        return base64.b64encode(jpeg_bytes).decode('utf-8')

    def run(self) -> None:
        self.open_camera()
        print("[FocusTracker] Running - Press Q or Esc to quit.")
        try:
            while True:
                annotated_frame, _ = self.process_frame()
                if annotated_frame is None:
                    break
                cv2.imshow("AI Study Focus Tracker (MediaPipe Pro)", annotated_frame)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), ord("Q"), 27):
                    break
        finally:
            self.release()
            cv2.destroyAllWindows()


if __name__ == "__main__":
    tracker = FocusTracker()
    tracker.run()
