#!/usr/bin/env python3
"""
Sherpa-ONNX WebSocket ASR Worker — Local speech recognition cho Pi voice-input.

Chay WebSocket server, nhan PCM16 audio stream, transcribe bang sherpa-onnx
model zipformer-vi-30M (Tieng Viet, 33MB, chay CPU).

Protocol tuong thich voice-input extension websocket mode:
  - GET /health -> {"status":"ok", "model_loaded":true}
  - WebSocket ws://host:port/ws
    - Client -> Server: binary PCM16 S16LE 16kHz mono
    - Client -> Server: {"type":"end"} JSON khi het cau
    - Server -> Client: {"final":"transcribed text"}

Usage:
  python sherpa_worker.py

Environment:
  SHERPA_MODEL_DIR   path to model files (default: ~/.cache/sherpa-onnx/zipformer-vi-30M)
  SHERPA_HOST        bind address (default: 127.0.0.1)
  SHERPA_PORT        port (default: 8766)
  SHERPA_NUM_THREADS CPU threads (default: 4)

Wing: openclaw | Topic: voice | Updated: 2026-06-16
"""

import json
import logging
import os
import struct
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from sherpa_onnx.offline_recognizer import OfflineRecognizer

logging.basicConfig(
    level=logging.INFO,
    format="[sherpa-worker] %(levelname)s %(message)s",
)
log = logging.getLogger("sherpa-worker")

# --- Config ----------------------------------------------------------------
DEFAULT_MODEL_DIR = Path.home() / ".cache" / "sherpa-onnx" / "zipformer-vi-30M"
MODEL_DIR = Path(os.environ.get("SHERPA_MODEL_DIR", str(DEFAULT_MODEL_DIR)))
HOST = os.environ.get("SHERPA_HOST", "127.0.0.1")
PORT = int(os.environ.get("SHERPA_PORT", "8766"))
NUM_THREADS = int(os.environ.get("SHERPA_NUM_THREADS", "4"))

recognizer: OfflineRecognizer | None = None


# --- Model -----------------------------------------------------------------

def create_recognizer(model_dir: Path) -> OfflineRecognizer:
    """Initialize sherpa-onnx offline recognizer from model files."""
    encoder = str(model_dir / "encoder.int8.onnx")
    decoder = str(model_dir / "decoder.onnx")
    joiner = str(model_dir / "joiner.int8.onnx")
    tokens = str(model_dir / "tokens.txt")
    bpe_vocab_path = model_dir / "bpe.model"

    missing = [f for f in [encoder, decoder, joiner, tokens] if not os.path.exists(f)]
    if missing:
        raise FileNotFoundError(
            f"Missing model files in {model_dir}: {missing}\n"
            f"Download from: https://huggingface.co/hynt/Zipformer-30M-RNNT-6000h"
        )

    log.info("Loading model from %s", model_dir)
    rec = OfflineRecognizer.from_transducer(
        encoder=encoder,
        decoder=decoder,
        joiner=joiner,
        tokens=tokens,
        num_threads=NUM_THREADS,
        provider="cpu",
        modeling_unit="bpe",
        bpe_vocab=str(bpe_vocab_path) if bpe_vocab_path.exists() else "",
        hotwords_file="",
        hotwords_score=1.5,
        decoding_method="greedy_search",
        max_active_paths=4,
        blank_penalty=0.0,
        rule_fsts="",
        rule_fars="",
        lm="",
        lm_scale=0.0,
        hr_dict_dir="",
        hr_rule_fsts="",
        hr_lexicon="",
        lodr_fst="",
        lodr_scale=0.0,
        debug=False,
        model_type="",
        sample_rate=16000,
        feature_dim=80,
        dither=0.0,
    )
    log.info("Model loaded: zipformer-vi-30M (%d threads)", NUM_THREADS)
    return rec


async def download_model(model_dir: Path) -> None:
    """Download the official k2-fsa Vietnamese zipformer model if not present.

    Uses the k2-fsa sherpa-onnx release asset, which bundles a complete
    tokens.txt (no sentencepiece generation step), so the recognizer
    vocabulary is always valid.
    """
    if (model_dir / "encoder.int8.onnx").exists():
        return

    log.info("=" * 60)
    log.info("Downloading zipformer-vi-30M-int8 model (~26MB)...")
    log.info("=" * 60)

    model_dir.mkdir(parents=True, exist_ok=True)
    import requests

    url = (
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
        "sherpa-onnx-zipformer-vi-30M-int8-2026-02-09.tar.bz2"
    )
    archive = model_dir / "model.tar.bz2"
    log.info("  Downloading %s", url)
    resp = requests.get(url, timeout=600)
    resp.raise_for_status()
    with open(archive, "wb") as f:
        f.write(resp.content)
    log.info("    Done (%.1f MB)", len(resp.content) / (1024 * 1024))

    # Extract only the model files we need, flattening the archive's top folder.
    import tarfile
    with tarfile.open(archive, "r:bz2") as tar:
        wanted = {
            "encoder.int8.onnx",
            "decoder.onnx",
            "joiner.int8.onnx",
            "tokens.txt",
            "bpe.model",
        }
        for member in tar.getmembers():
            if not member.isfile():
                continue
            name = Path(member.name).name
            if name not in wanted:
                continue
            src = tar.extractfile(member)
            if src is None:
                continue
            with open(model_dir / name, "wb") as f:
                f.write(src.read())
            log.info("  Extracted %s", name)
    archive.unlink(missing_ok=True)

    log.info("Model download complete!")
    log.info("Model directory: %s", model_dir)


# --- Lifespan & HTTP Endpoints -------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global recognizer
    await download_model(MODEL_DIR)
    recognizer = create_recognizer(MODEL_DIR)
    yield
    recognizer = None

app = FastAPI(title="Sherpa-ONNX ASR Worker", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": recognizer is not None,
        "model": "zipformer-vi-30M",
        "host": HOST,
        "port": PORT,
    }


# --- WebSocket -----------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    log.info("WebSocket client connected")

    audio_buffer = bytearray()

    try:
        while True:
            data = await ws.receive()

            if data["type"] == "websocket.receive":
                raw = data.get("text") or data.get("bytes")
                if raw is None:
                    continue

                if isinstance(raw, bytes):
                    audio_buffer.extend(raw)

                elif isinstance(raw, str):
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        await ws.send_json({"error": "invalid JSON"})
                        continue

                    if msg.get("type") == "end":
                        if len(audio_buffer) < 64:
                            await ws.send_json({"final": ""})
                            audio_buffer.clear()
                            continue

                        text = transcribe(bytes(audio_buffer))
                        audio_buffer.clear()

                        if text:
                            await ws.send_json({"final": text})
                            log.info("Transcribed: %s", text[:120])
                        else:
                            await ws.send_json({"final": ""})

            elif data["type"] == "websocket.disconnect":
                log.info("WebSocket client disconnected")
                break

    except WebSocketDisconnect:
        log.info("WebSocket client disconnected")
    except Exception as e:
        log.error("WebSocket error: %s", e)
    finally:
        audio_buffer.clear()


# --- Transcription -------------------------------------------------------

def transcribe(pcm_data: bytes) -> str:
    """Transcribe PCM16 S16LE 16kHz mono audio using sherpa-onnx."""
    global recognizer
    if recognizer is None:
        return ""

    sample_count = len(pcm_data) // 2
    if sample_count == 0:
        return ""

    samples = [
        struct.unpack("<h", pcm_data[i : i + 2])[0] / 32768.0
        for i in range(0, len(pcm_data), 2)
    ]

    stream = recognizer.create_stream()
    stream.accept_waveform(16000, samples)
    recognizer.decode_streams([stream])
    return stream.result.text.strip()


# --- Entry point ---------------------------------------------------------

if __name__ == "__main__":
    log.info("=" * 50)
    log.info("Sherpa-ONNX ASR Worker")
    log.info("=" * 50)
    log.info("Model:  %s", MODEL_DIR)
    log.info("Host:   %s", HOST)
    log.info("Port:   %d", PORT)
    log.info("Threads: %d", NUM_THREADS)
    log.info("=" * 50)
    log.info("Health endpoint:  http://%s:%d/health", HOST, PORT)
    log.info("WebSocket endpoint: ws://%s:%d/ws", HOST, PORT)
    log.info("=" * 50)

    uvicorn.run(app, host=HOST, port=PORT, log_level="info", ws_max_size=2**22)
