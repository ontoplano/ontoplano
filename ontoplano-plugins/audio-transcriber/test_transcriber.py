"""Synthetic webhook and transcription tests; no model download or live account."""

import hashlib
import hmac
import json
import threading
import unittest
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from transcriber import (
    Config,
    Receiver,
    load_env_file,
    recording_id_from,
    transcribe_recording,
    verify_webhook,
)


class FakeClient:
    def __init__(self, notes=""):
        self.notes = notes
        self.saved = None

    def metadata(self, recording_id):
        return {"id": recording_id, "mime": "audio/webm", "notes": self.notes}

    def audio(self, recording_id):
        return b"synthetic audio"

    def set_notes(self, recording_id, notes):
        self.saved = (recording_id, notes)
        return True


class FakeModel:
    def transcribe(self, path, **options):
        assert Path(path).read_bytes() == b"synthetic audio"
        assert options["task"] == "transcribe"
        self.path = path
        return {"text": "  Words spoken locally.  "}


class TranscriberTests(unittest.TestCase):
    def test_local_transcription_updates_only_empty_notes_and_removes_audio_file(self):
        client = FakeClient()
        model = FakeModel()
        self.assertEqual(transcribe_recording(42, client, model), "transcribed")
        self.assertEqual(client.saved, (42, "Words spoken locally."))
        self.assertFalse(Path(model.path).exists())

        client = FakeClient(notes="Written by a person")
        self.assertEqual(transcribe_recording(42, client, model), "already noted")
        self.assertIsNone(client.saved)

    def test_signature_and_event_validation(self):
        body = json.dumps(
            {"event": "audio.uploaded", "at": "2026-09-29T12:00:00Z", "data": {"id": 42}}
        ).encode()
        signature = "sha256=" + hmac.new(b"secret", body, hashlib.sha256).hexdigest()
        self.assertTrue(verify_webhook(body, signature, "secret"))
        self.assertFalse(verify_webhook(body + b" ", signature, "secret"))
        self.assertFalse(verify_webhook(body, "sha256=bad", "secret"))
        self.assertEqual(
            recording_id_from(body, "audio.uploaded", now=1790683200), 42
        )
        with self.assertRaises(ValueError):
            recording_id_from(body, "audio.uploaded", now=1790683200 + 600)

    def test_receiver_rejects_unsigned_requests_and_queues_signed_audio(self):
        config = Config("http://example.test/", "test-token", "secret", port=0)
        client = FakeClient()
        server = Receiver(config, client, FakeModel())
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        address = f"http://127.0.0.1:{server.server_port}/webhook"
        body = json.dumps(
            {
                "event": "audio.uploaded",
                "at": datetime.now(timezone.utc).isoformat(),
                "data": {"id": 7},
            }
        ).encode()
        try:
            with self.assertRaises(HTTPError) as refused:
                urlopen(Request(address, data=body, method="POST"), timeout=2)
            self.assertEqual(refused.exception.code, 401)

            signature = "sha256=" + hmac.new(b"secret", body, hashlib.sha256).hexdigest()
            with urlopen(
                Request(
                    address,
                    data=body,
                    method="POST",
                    headers={
                        "X-Ontoplano-Event": "audio.uploaded",
                        "X-Ontoplano-Signature": signature,
                    },
                ),
                timeout=2,
            ) as response:
                self.assertEqual(response.status, 202)
            server.jobs.join()
            self.assertEqual(client.saved, (7, "Words spoken locally."))
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.close()


class EnvFileTests(unittest.TestCase):
    def test_reads_the_file_and_the_environment_wins(self):
        import tempfile

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / ".env"
            path.write_text(
                "# comment\nONTOPLANO_URL='https://example.test'\n"
                "export PORT=9090\nWEBHOOK_SECRET=\"from file\"\n",
                encoding="utf-8",
            )
            environ = {"WEBHOOK_SECRET": "from shell"}
            load_env_file(path, environ)
        self.assertEqual(environ["ONTOPLANO_URL"], "https://example.test")
        self.assertEqual(environ["PORT"], "9090")
        self.assertEqual(environ["WEBHOOK_SECRET"], "from shell")

    def test_a_missing_file_changes_nothing(self):
        environ = {}
        load_env_file(Path("/nonexistent/.env"), environ)
        self.assertEqual(environ, {})


if __name__ == "__main__":
    unittest.main()
