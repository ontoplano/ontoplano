"""Receive Ontoplano audio webhooks and transcribe locally with Whisper."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import queue
import tempfile
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

EVENT = "audio.uploaded"
WEBHOOK_PATH = "/webhook"
MAX_WEBHOOK_BYTES = 16_384
MAX_AUDIO_BYTES = 25 * 1024 * 1024
MAX_NOTES_CHARS = 100_000
MAX_EVENT_AGE_SECONDS = 5 * 60
MAX_PENDING = 32
REQUEST_TIMEOUT_SECONDS = 20
DEFAULT_PORT = 8080
DEFAULT_MODEL = "base"
# Settings kept beside the script, so they outlive the shell that started it.
ENV_FILE = Path(__file__).with_name(".env")
EXTENSIONS = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


HTTP = build_opener(NoRedirect)


def load_env_file(path: Path, environ: dict | None = None) -> None:
    """Read KEY=value lines into the environment; a variable already set wins."""
    environ = os.environ if environ is None else environ
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.removeprefix("export ").strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        environ.setdefault(key, value)


@dataclass(frozen=True)
class Config:
    ontoplano_url: str
    token: str
    secret: str = ""
    listen_host: str = "127.0.0.1"
    port: int = DEFAULT_PORT
    model_name: str = DEFAULT_MODEL

    @classmethod
    def from_env(cls) -> Config:
        url = os.environ.get("ONTOPLANO_URL", "").rstrip("/") + "/"
        token = os.environ.get("ONTOPLANO_TOKEN", "")
        secret = os.environ.get("WEBHOOK_SECRET", "")
        address = urlsplit(url)
        if address.scheme not in ("http", "https") or not address.netloc:
            raise ValueError("ONTOPLANO_URL must be an HTTP(S) URL")
        if not token or not secret:
            raise ValueError("ONTOPLANO_TOKEN and WEBHOOK_SECRET are required")
        port = int(os.environ.get("PORT", DEFAULT_PORT))
        if not 1 <= port <= 65535:
            raise ValueError("PORT must be between 1 and 65535")
        return cls(
            ontoplano_url=url,
            token=token,
            secret=secret,
            listen_host=os.environ.get("LISTEN_HOST", "127.0.0.1"),
            port=port,
            model_name=os.environ.get("WHISPER_MODEL", DEFAULT_MODEL),
        )


class ApiError(Exception):
    def __init__(self, status: int, path: str):
        super().__init__(f"Ontoplano {path}: HTTP {status}")
        self.status = status


class Ontoplano:
    def __init__(self, config: Config):
        self.config = config

    def request(self, path: str, method: str = "GET", body: dict | None = None) -> tuple[bytes, str]:
        headers = {"Authorization": f"Bearer {self.config.token}"}
        payload = None
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = Request(
            urljoin(self.config.ontoplano_url, path.lstrip("/")),
            data=payload,
            headers=headers,
            method=method,
        )
        try:
            with HTTP.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                data = response.read(MAX_AUDIO_BYTES + 1)
                if len(data) > MAX_AUDIO_BYTES:
                    raise ValueError("Recording exceeds the local audio limit")
                return data, response.headers.get("Content-Type", "")
        except HTTPError as error:
            raise ApiError(error.code, path) from error

    def metadata(self, recording_id: int) -> dict:
        data, _ = self.request(f"api/v1/audio/{recording_id}")
        return json.loads(data)

    def audio(self, recording_id: int) -> bytes:
        data, _ = self.request(f"api/v1/audio/{recording_id}/file")
        return data

    def set_notes(self, recording_id: int, notes: str) -> bool:
        try:
            self.request(
                f"api/v1/audio/{recording_id}",
                "PATCH",
                {"notes": notes, "onlyIfEmpty": True},
            )
        except ApiError as error:
            if error.status == 409:
                return False
            raise
        return True


def verify_webhook(body: bytes, signature: str, secret: str) -> bool:
    if not secret or not signature.startswith("sha256="):
        return False
    given = signature.removeprefix("sha256=")
    if len(given) != 64 or any(character not in "0123456789abcdefABCDEF" for character in given):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, given.lower())


def recording_id_from(body: bytes, event_header: str, now: float | None = None) -> int:
    message = json.loads(body)
    if not isinstance(message, dict):
        raise ValueError("Webhook body must be an object")
    at = message.get("at")
    if message.get("event") != EVENT or event_header != EVENT or not isinstance(at, str):
        raise ValueError("Unexpected webhook event")
    moment = datetime.fromisoformat(at.replace("Z", "+00:00"))
    if moment.utcoffset() is None:
        raise ValueError("Webhook timestamp needs a timezone")
    timestamp = moment.timestamp()
    if abs((now if now is not None else time.time()) - timestamp) > MAX_EVENT_AGE_SECONDS:
        raise ValueError("Webhook event is too old")
    data = message.get("data")
    if not isinstance(data, dict):
        raise ValueError("Webhook has no recording data")
    recording_id = data.get("id")
    if type(recording_id) is not int or recording_id <= 0:
        raise ValueError("Webhook has no recording ID")
    return recording_id


def transcribe_recording(recording_id: int, client: Ontoplano, model: object) -> str:
    metadata = client.metadata(recording_id)
    if metadata.get("notes"):
        return "already noted"
    suffix = EXTENSIONS.get(metadata.get("mime"))
    if suffix is None:
        raise ValueError("Unsupported recording type")

    audio = client.audio(recording_id)
    if not audio:
        raise ValueError("Recording is empty")
    path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
            path = Path(temporary.name)
            temporary.write(audio)
        result = model.transcribe(str(path), task="transcribe", fp16=False, verbose=False)
    finally:
        if path is not None:
            path.unlink(missing_ok=True)

    text = result.get("text", "").strip()
    if not text:
        return "empty transcription"
    if len(text) > MAX_NOTES_CHARS:
        raise ValueError("Transcription exceeds recording notes limit")
    return "transcribed" if client.set_notes(recording_id, text) else "already noted"


class Receiver(ThreadingHTTPServer):
    def __init__(self, config: Config, client: Ontoplano, model: object):
        super().__init__((config.listen_host, config.port), WebhookHandler)
        self.config = config
        self.client = client
        self.model = model
        self.pending: set[int] = set()
        self.pending_lock = threading.Lock()
        self.jobs: queue.Queue[int | None] = queue.Queue(maxsize=MAX_PENDING)
        self.worker = threading.Thread(target=self.work, name="whisper-worker", daemon=True)
        self.worker.start()

    def enqueue(self, recording_id: int) -> bool:
        with self.pending_lock:
            if recording_id in self.pending:
                return True
            try:
                self.jobs.put_nowait(recording_id)
            except queue.Full:
                return False
            self.pending.add(recording_id)
        return True

    def work(self) -> None:
        while (recording_id := self.jobs.get()) is not None:
            try:
                outcome = transcribe_recording(recording_id, self.client, self.model)
                logging.info("Recording %s: %s", recording_id, outcome)
            except Exception:
                logging.exception("Recording %s: transcription failed", recording_id)
            finally:
                with self.pending_lock:
                    self.pending.discard(recording_id)
                self.jobs.task_done()
        self.jobs.task_done()

    def close(self) -> None:
        self.server_close()
        self.jobs.join()
        self.jobs.put(None)
        self.worker.join()


class WebhookHandler(BaseHTTPRequestHandler):
    server: Receiver

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(REQUEST_TIMEOUT_SECONDS)

    def do_POST(self) -> None:
        if self.path != WEBHOOK_PATH:
            self.answer(404)
            return
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.answer(400)
            return
        if length < 1 or length > MAX_WEBHOOK_BYTES:
            self.answer(413)
            return
        body = self.rfile.read(length)
        if not verify_webhook(
            body, self.headers.get("X-Ontoplano-Signature", ""), self.server.config.secret
        ):
            self.answer(401)
            return
        try:
            recording_id = recording_id_from(body, self.headers.get("X-Ontoplano-Event", ""))
        except (ValueError, KeyError, TypeError, OverflowError):
            self.answer(400)
            return
        self.answer(202 if self.server.enqueue(recording_id) else 503)

    def answer(self, status: int) -> None:
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()


def main() -> None:
    load_env_file(ENV_FILE)
    config = Config.from_env()
    client = Ontoplano(config)
    import whisper

    model = whisper.load_model(config.model_name)
    server = Receiver(config, client, model)
    logging.info("Listening at http://%s:%s%s", config.listen_host, config.port, WEBHOOK_PATH)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        logging.info("Finishing accepted transcription jobs")
        server.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()
