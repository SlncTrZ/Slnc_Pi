from __future__ import annotations

import base64
import ctypes
import json
import os
import queue
import re
import socketserver
import sys
import threading
import time
import traceback
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from huggingface_hub import snapshot_download

MODEL_ID = "mistralai/Voxtral-Mini-4B-Realtime-2602"
DEFAULT_SAMPLE_RATE = 16000
SILENCE_TIMEOUT_SECONDS = 0.8
MIN_SPEECH_SECONDS = 0.35
MIN_INTERIM_SECONDS = 0.9
INTERIM_TRANSCRIBE_SECONDS = 1.3
ENERGY_THRESHOLD = 50.0
PRE_ROLL_SECONDS = 0.5


def log(message: str) -> None:
    print(f"[voice-worker] {message}", flush=True)


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def env_json_list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(item) for item in data]
    except Exception:
        pass
    return default


def process_exists(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        # Windows OpenProcess check without adding a psutil dependency.
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)
            return True
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def start_parent_watchdog(server: socketserver.BaseServer, parent_pid: int) -> None:
    if parent_pid <= 0:
        return

    def watch() -> None:
        log(f"parent watchdog active for pid={parent_pid}")
        while True:
            time.sleep(3.0)
            if process_exists(parent_pid):
                continue
            log(f"parent pid {parent_pid} is gone; shutting down voice worker")
            server.shutdown()
            return

    threading.Thread(target=watch, daemon=True).start()


@dataclass
class Transcriber:
    sample_rate: int = DEFAULT_SAMPLE_RATE
    model_id: str = MODEL_ID
    processor: Any | None = None
    model: Any | None = None
    torch: Any | None = None
    torch_version: str = ""
    cuda_available: bool = False
    cuda_device: str = ""
    lock: threading.Lock = field(default_factory=threading.Lock)

    def download_model(self, emit) -> None:
        emit({"type": "download_progress", "message": f"downloading {self.model_id} to Hugging Face cache"})
        path = snapshot_download(self.model_id)
        emit({"type": "download_progress", "message": f"download complete: {path}"})

    def ensure_loaded(self, emit) -> None:
        if self.model is not None and self.processor is not None:
            return
        with self.lock:
            if self.model is not None and self.processor is not None:
                return
            emit({"type": "status", "status": "starting", "detail": "loading Voxtral"})
            import torch
            from transformers import VoxtralRealtimeForConditionalGeneration, VoxtralRealtimeProcessor

            self.torch = torch
            self.torch_version = getattr(torch, "__version__", "unknown")
            self.cuda_available = bool(torch.cuda.is_available())
            if not self.cuda_available and os.environ.get("VOICE_INPUT_REQUIRE_CUDA", "1") != "0":
                raise RuntimeError(
                    f"CUDA is not available to torch {self.torch_version}. Install a CUDA PyTorch build (cu128 for Blackwell) or set VOICE_INPUT_REQUIRE_CUDA=0 to allow slow CPU fallback."
                )
            self.cuda_device = torch.cuda.get_device_name(0) if self.cuda_available else "cpu"
            emit({"type": "status", "status": "starting", "detail": f"torch={self.torch_version} cuda={self.cuda_available} device={self.cuda_device}"})
            self.processor = VoxtralRealtimeProcessor.from_pretrained(self.model_id)
            dtype = torch.bfloat16 if self.cuda_available else torch.float32
            device_map = "cuda:0" if self.cuda_available else "cpu"
            self.model = VoxtralRealtimeForConditionalGeneration.from_pretrained(
                self.model_id,
                device_map=device_map,
                torch_dtype=dtype,
            )
            self.model.eval()
            emit({"type": "ready", "pid": os.getpid(), "torchVersion": self.torch_version, "cudaAvailable": self.cuda_available, "cudaDevice": self.cuda_device})

    def transcribe(self, pcm: bytes, emit, *, max_new_tokens: int = 192) -> str:
        self.ensure_loaded(emit)
        assert self.processor is not None
        assert self.model is not None
        assert self.torch is not None
        if len(pcm) < 2:
            return ""
        audio_i16 = np.frombuffer(pcm, dtype=np.int16)
        if audio_i16.size == 0:
            return ""
        audio = audio_i16.astype(np.float32) / 32768.0
        inputs = self.processor(audio, sampling_rate=self.sample_rate, return_tensors="pt")
        inputs = inputs.to(self.model.device, dtype=self.model.dtype)
        with self.torch.inference_mode():
            outputs = self.model.generate(**inputs, max_new_tokens=max_new_tokens)
        decoded = self.processor.batch_decode(outputs, skip_special_tokens=True)
        return decoded[0].strip() if decoded else ""


class LiveStreamingSession:
    def __init__(self, transcriber: Transcriber, emit):
        transcriber.ensure_loaded(emit)
        assert transcriber.processor is not None
        assert transcriber.model is not None
        assert transcriber.torch is not None
        self.transcriber = transcriber
        self.processor = transcriber.processor
        self.model = transcriber.model
        self.torch = transcriber.torch
        self.emit = emit
        self.audio = np.array([], dtype=np.float32)
        self.feature_queue: queue.Queue[Any] = queue.Queue(maxsize=8)
        self.started = False
        self.closed = False
        self.cumulative_text = ""
        self.generate_thread: threading.Thread | None = None
        self.streamer_thread: threading.Thread | None = None
        self.streamer: Any | None = None
        self.mel_frame_idx = 0

    def feed_pcm(self, pcm: bytes) -> None:
        if self.closed or len(pcm) < 2:
            return
        audio_i16 = np.frombuffer(pcm, dtype=np.int16)
        if audio_i16.size == 0:
            return
        chunk = audio_i16.astype(np.float32) / 32768.0
        self.audio = np.concatenate([self.audio, chunk])
        self._pump_available_features()

    def close(self, timeout: float = 2.0) -> str:
        self.closed = True
        if self.started:
            self.feature_queue.put(None)
            if self.generate_thread:
                self.generate_thread.join(timeout=timeout)
            if self.streamer_thread:
                self.streamer_thread.join(timeout=timeout)
        return self.cumulative_text.strip()

    def _pump_available_features(self) -> None:
        if not self.started:
            first_n = int(self.processor.num_samples_first_audio_chunk)
            if self.audio.shape[0] < first_n:
                return
            first_chunk = self.audio[:first_n]
            first_inputs = self.processor(
                first_chunk,
                is_streaming=True,
                is_first_audio_chunk=True,
                return_tensors="pt",
            )
            first_inputs.to(self.model.device, dtype=self.model.dtype)
            self.mel_frame_idx = int(self.processor.num_mel_frames_first_audio_chunk)
            self._start_generate(first_inputs)
            self._put_feature(first_inputs.input_features)

        hop_length = int(self.processor.feature_extractor.hop_length)
        win_length = int(self.processor.feature_extractor.win_length)
        samples_per_chunk = int(self.processor.num_samples_per_audio_chunk)
        audio_length_per_tok = int(self.processor.audio_length_per_tok)

        while True:
            start_idx = self.mel_frame_idx * hop_length - win_length // 2
            end_idx = start_idx + samples_per_chunk
            if start_idx < 0 or self.audio.shape[0] < end_idx:
                return
            inputs = self.processor(
                self.audio[start_idx:end_idx],
                is_streaming=True,
                is_first_audio_chunk=False,
                return_tensors="pt",
            )
            inputs.to(self.model.device, dtype=self.model.dtype)
            self._put_feature(inputs.input_features)
            self.mel_frame_idx += audio_length_per_tok

    def _put_feature(self, input_features) -> None:
        if self.closed:
            return
        self.feature_queue.put(input_features)

    def _feature_generator(self):
        while True:
            item = self.feature_queue.get()
            if item is None:
                return
            yield item

    def _start_generate(self, first_inputs) -> None:
        from transformers import TextIteratorStreamer

        self.started = True
        self.streamer = TextIteratorStreamer(
            self.processor.tokenizer,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=True,
        )

        def run_generate() -> None:
            try:
                with self.torch.inference_mode():
                    self.model.generate(
                        input_ids=first_inputs.input_ids,
                        input_features=self._feature_generator(),
                        num_delay_tokens=first_inputs.num_delay_tokens,
                        streamer=self.streamer,
                        max_new_tokens=192,
                    )
            except Exception as exc:
                self.emit({"type": "error", "message": f"streaming generate failed: {exc}\n{traceback.format_exc()}"})

        def run_streamer() -> None:
            try:
                assert self.streamer is not None
                for text_chunk in self.streamer:
                    if not text_chunk:
                        continue
                    self.cumulative_text += text_chunk
                    text = self.cumulative_text.strip()
                    if text:
                        self.emit({"type": "partial", "text": text})
            except Exception as exc:
                self.emit({"type": "error", "message": f"streaming decode failed: {exc}\n{traceback.format_exc()}"})

        self.generate_thread = threading.Thread(target=run_generate, daemon=True)
        self.streamer_thread = threading.Thread(target=run_streamer, daemon=True)
        self.generate_thread.start()
        self.streamer_thread.start()


@dataclass
class SessionState:
    mode: str = "toggle"
    wake_phrases: list[str] = field(default_factory=lambda: ["hey emi", "hey emy", "hey emilia", "hey emmy", "emi", "emy", "emilia", "emmy"])
    listening: bool = False
    awake: bool = False
    speech_buffer: bytearray = field(default_factory=bytearray)
    pre_roll_buffer: bytearray = field(default_factory=bytearray)
    utterance_buffer: bytearray = field(default_factory=bytearray)
    last_voice_time: float = 0.0
    last_level_emit_time: float = 0.0
    last_interim_time: float = 0.0
    in_speech: bool = False
    last_error: str = ""
    stream: LiveStreamingSession | None = None


class VoiceHandler(socketserver.StreamRequestHandler):
    transcriber = Transcriber(sample_rate=env_int("VOICE_INPUT_SAMPLE_RATE", DEFAULT_SAMPLE_RATE))
    session = SessionState(wake_phrases=env_json_list("VOICE_INPUT_WAKE_PHRASES", ["hey emi", "hey emy", "hey emilia", "hey emmy", "emi", "emy", "emilia", "emmy"]))
    work_queue: queue.Queue[bytes] = queue.Queue()
    worker_thread_started = False
    send_lock = threading.Lock()

    def setup(self) -> None:
        super().setup()
        self.ensure_transcription_thread()

    def handle(self) -> None:
        self.emit({"type": "ready", "pid": os.getpid()})
        try:
            for raw in self.rfile:
                try:
                    msg = json.loads(raw.decode("utf-8"))
                    self.handle_message(msg)
                except Exception as exc:
                    self.emit({"type": "error", "message": str(exc)})
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            return

    def handle_message(self, msg: dict[str, Any]) -> None:
        msg_type = msg.get("type")
        if msg_type == "ping":
            self.emit({
                "type": "pong",
                "id": msg.get("id"),
                "pid": os.getpid(),
                "modelLoaded": self.transcriber.model is not None and self.transcriber.processor is not None,
                "torchVersion": self.transcriber.torch_version,
                "cudaAvailable": self.transcriber.cuda_available,
                "cudaDevice": self.transcriber.cuda_device,
                "listening": self.session.listening,
                "mode": self.session.mode,
                "awake": self.session.awake,
                "lastError": self.session.last_error,
            })
            return
        if msg_type == "start":
            self.session.mode = str(msg.get("mode") or "toggle")
            phrases = msg.get("wakePhrases")
            if isinstance(phrases, list):
                self.session.wake_phrases = [str(p) for p in phrases]
            self.session.listening = True
            self.session.awake = self.session.mode != "always"
            self.session.speech_buffer.clear()
            self.session.pre_roll_buffer.clear()
            self.session.utterance_buffer.clear()
            self.session.last_interim_time = 0.0
            self.close_stream(emit_final=False)
            self.emit({"type": "status", "status": "listening", "detail": self.session.mode})
            threading.Thread(target=lambda: self.safe_load_model(), daemon=True).start()
            return
        if msg_type == "stop":
            self.flush_segment(force=True)
            self.close_stream(emit_final=True)
            self.session.listening = False
            self.session.awake = False
            self.emit({"type": "status", "status": "ready"})
            return
        if msg_type == "audio":
            if not self.session.listening:
                return
            data = base64.b64decode(str(msg.get("data") or ""))
            self.accept_audio(data)
            return
        if msg_type == "download_model":
            threading.Thread(target=lambda: self.safe_download(), daemon=True).start()
            return
        if msg_type == "load_model":
            threading.Thread(target=lambda: self.safe_load_model(), daemon=True).start()
            return
        if msg_type == "reset_wake":
            self.close_stream(emit_final=False)
            self.session.speech_buffer.clear()
            self.session.pre_roll_buffer.clear()
            self.session.utterance_buffer.clear()
            self.session.in_speech = False
            self.session.last_interim_time = 0.0
            self.session.awake = False
            self.emit({"type": "status", "status": "listening", "detail": "wake gate reset"})
            return
        if msg_type == "shutdown":
            self.server.shutdown()
            return

    def accept_audio(self, data: bytes) -> None:
        if not data:
            return
        energy = rms_energy(data)
        now = time.monotonic()
        if now - self.session.last_level_emit_time >= 1.0:
            self.session.last_level_emit_time = now
            self.emit({"type": "audio_level", "energy": energy, "threshold": ENERGY_THRESHOLD, "inSpeech": self.session.in_speech})
        if energy >= ENERGY_THRESHOLD:
            if not self.session.in_speech and self.session.pre_roll_buffer:
                self.session.speech_buffer.extend(self.session.pre_roll_buffer)
                self.session.pre_roll_buffer.clear()
            self.session.in_speech = True
            self.session.last_voice_time = now
            self.session.speech_buffer.extend(data)
            if self.streaming_enabled():
                self.feed_stream(data)
            else:
                self.maybe_queue_interim(now)
            return
        if self.session.in_speech:
            self.session.speech_buffer.extend(data)
            # Keep feeding the live decoder during the trailing quiet window.
            # Without this, soft final syllables/words that fall below the RMS
            # threshold are kept for buffered transcription but never reach the
            # streaming path, so the live final can lose the end of the utterance.
            if self.streaming_enabled():
                self.feed_stream(data)
            if now - self.session.last_voice_time >= SILENCE_TIMEOUT_SECONDS:
                self.flush_segment(force=False)
            return

        self.session.pre_roll_buffer.extend(data)
        max_pre_roll_bytes = int(PRE_ROLL_SECONDS * self.transcriber.sample_rate * 2)
        if len(self.session.pre_roll_buffer) > max_pre_roll_bytes:
            del self.session.pre_roll_buffer[:-max_pre_roll_bytes]

    def streaming_enabled(self) -> bool:
        return self.session.mode != "always" or self.session.awake

    def feed_stream(self, data: bytes) -> None:
        try:
            if self.session.stream is None:
                self.session.stream = LiveStreamingSession(self.transcriber, self.emit)
            self.session.stream.feed_pcm(data)
        except Exception as exc:
            self.session.last_error = f"stream feed failed: {exc}\n{traceback.format_exc()}"
            self.emit({"type": "error", "message": self.session.last_error})

    def close_stream(self, emit_final: bool) -> str:
        stream = self.session.stream
        self.session.stream = None
        if stream is None:
            return ""
        text = stream.close()
        if emit_final and text:
            self.emit({"type": "final", "text": text})
        return text

    def maybe_queue_interim(self, now: float) -> None:
        if self.work_queue.qsize() > 0:
            return
        seconds = len(self.session.speech_buffer) / 2 / self.transcriber.sample_rate
        if seconds < MIN_INTERIM_SECONDS:
            return
        if now - self.session.last_interim_time < INTERIM_TRANSCRIBE_SECONDS:
            return
        self.session.last_interim_time = now
        self.emit({"type": "status", "status": "transcribing", "detail": "streaming preview"})
        self.work_queue.put({"pcm": bytes(self.session.speech_buffer), "interim": True})

    def flush_segment(self, force: bool) -> None:
        data = bytes(self.session.speech_buffer)
        self.session.speech_buffer.clear()
        self.session.in_speech = False
        if not data:
            return
        seconds = len(data) / 2 / self.transcriber.sample_rate
        if not force and seconds < MIN_SPEECH_SECONDS:
            self.emit({"type": "audio_rejected", "reason": "too_short", "seconds": seconds, "minSeconds": MIN_SPEECH_SECONDS})
            return
        self.emit({"type": "audio_accepted", "seconds": seconds})
        if self.streaming_enabled():
            text = self.close_stream(emit_final=True)
            if text:
                return
        self.work_queue.put({"pcm": data, "interim": False})

    def ensure_transcription_thread(self) -> None:
        cls = type(self)
        if cls.worker_thread_started:
            return
        cls.worker_thread_started = True
        threading.Thread(target=self.transcription_loop, daemon=True).start()

    def transcription_loop(self) -> None:
        while True:
            work = self.work_queue.get()
            data = work["pcm"] if isinstance(work, dict) else work
            interim = bool(work.get("interim")) if isinstance(work, dict) else False
            try:
                self.emit({"type": "status", "status": "transcribing", "detail": "interim" if interim else "final"})
                text = self.transcriber.transcribe(data, self.emit, max_new_tokens=96 if interim else 192)
                if not text:
                    continue
                if self.session.mode == "always":
                    phrase, remainder = match_wake_phrase(text, self.session.wake_phrases)
                    if not self.session.awake:
                        if phrase:
                            self.session.awake = True
                            self.emit({"type": "wake", "phrase": phrase})
                            text = remainder
                        else:
                            self.emit({"type": "audio_rejected", "reason": "wake_not_found"})
                            continue
                    elif phrase:
                        text = remainder
                    if not text:
                        continue
                self.emit({"type": "partial", "text": text})
                if not interim:
                    self.emit({"type": "final", "text": text})
            except Exception as exc:
                self.emit({"type": "error", "message": str(exc)})
            finally:
                self.emit({"type": "status", "status": "listening" if self.session.listening else "ready"})

    def safe_load_model(self) -> None:
        try:
            self.session.last_error = ""
            self.transcriber.ensure_loaded(self.emit)
        except Exception as exc:
            detail = f"{exc}\n{traceback.format_exc()}"
            self.session.last_error = detail
            self.emit({"type": "error", "message": detail})

    def safe_download(self) -> None:
        try:
            self.session.last_error = ""
            self.transcriber.download_model(self.emit)
        except Exception as exc:
            detail = f"{exc}\n{traceback.format_exc()}"
            self.session.last_error = detail
            self.emit({"type": "error", "message": detail})

    def emit(self, event: dict[str, Any]) -> None:
        payload = (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8")
        with self.send_lock:
            try:
                self.wfile.write(payload)
                self.wfile.flush()
            except Exception:
                pass


def rms_energy(pcm: bytes) -> float:
    if len(pcm) < 2:
        return 0.0
    arr = np.frombuffer(pcm, dtype=np.int16)
    if arr.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(arr.astype(np.float32) ** 2)))


def normalize_text(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", text.lower()).strip()


def wake_word_matches(candidate: str, expected: str) -> bool:
    aliases = {
        "hey": {"hey", "hay"},
        "emi": {"emi", "emy", "emmy", "amy"},
        "emy": {"emi", "emy", "emmy", "amy"},
        "emmy": {"emi", "emy", "emmy", "amy"},
        "emilia": {"emilia", "amelia"},
    }
    return candidate in aliases.get(expected, {expected})


def match_wake_phrase(text: str, phrases: list[str]) -> tuple[str | None, str]:
    tokens = [(match.group(0).lower(), match.start(), match.end()) for match in re.finditer(r"[a-zA-Z0-9]+", text)]
    if not tokens:
        return None, text

    for phrase in phrases:
        phrase_words = normalize_text(phrase).split()
        if not phrase_words:
            continue
        phrase_len = len(phrase_words)
        # Only accept wake phrases near the beginning of the recognized segment.
        # This permits short accidental/preamble text before the wake phrase while
        # preventing unrelated later mentions from opening the gate.
        max_start = min(12, max(0, len(tokens) - phrase_len))
        for start in range(max_start + 1):
            candidate = [word for word, _, _ in tokens[start:start + phrase_len]]
            if len(candidate) != phrase_len or any(not wake_word_matches(word, phrase_words[i]) for i, word in enumerate(candidate)):
                continue
            phrase_end = tokens[start + phrase_len - 1][2]
            remainder = text[phrase_end:].lstrip(" \t\r\n,.!?;:-—")
            return phrase, remainder.strip()

    return None, text


class ThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


def main() -> None:
    host = os.environ.get("VOICE_INPUT_HOST", "127.0.0.1")
    port = env_int("VOICE_INPUT_PORT", 8765)
    parent_pid = env_int("VOICE_INPUT_PARENT_PID", 0)
    log(f"listening on {host}:{port}")
    with ThreadingTCPServer((host, port), VoiceHandler) as server:
        start_parent_watchdog(server, parent_pid)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            log("shutting down")
            sys.exit(0)


if __name__ == "__main__":
    main()
