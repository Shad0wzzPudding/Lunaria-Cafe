# Lunaria Cafe — AI Attention Server

Python backend from your NSC focus tracker project. Exposes webcam-based phone/gaze detection to the React game.

## Setup

```powershell
cd ai-server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

First run downloads MediaPipe face model and YOLO weights (may take a few minutes).

## Run

```powershell
uvicorn focus_api:app --host 127.0.0.1 --port 8000 --reload
```

Keep this terminal open while playing. In the game: **Settings → AI Integration → Enable live AI camera**.

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Connection check |
| `GET /state` | JSON focus state (game polls this) |
| `GET /stream` | MJPEG camera preview |
| `WS /ws` | WebSocket frame + state (optional) |
| `POST /reset` | Reset focus score |

## Troubleshooting

- **Camera in use**: Close other apps using the webcam.
- **CORS**: API allows all origins for local dev.
- **Port 8000 busy**: Change port in uvicorn and update URL in game Settings.
