# Local audio transcriber

This Python script listens for Ontoplano's signed `audio.uploaded` webhook, downloads that recording, transcribes it with **Whisper running on your machine**, and writes the text to the recording's notes. It never calls a transcription API and needs no API key for Whisper. Whisper downloads its model weights on first use; transcription then runs locally.

## Install

Use Python 3.11 and install `ffmpeg` (for Debian or Ubuntu: `sudo apt install ffmpeg`). In this directory:

```sh
python3.11 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

The pinned `openai-whisper` package is the [open source Whisper implementation](https://github.com/openai/whisper). The package name does **not** mean this script sends audio to OpenAI. The dependency includes PyTorch; model loading and transcription can be slow on a CPU. `WHISPER_MODEL=base` is the default multilingual model.

## Connect to Ontoplano

1. In **Settings → Integrations → Connections**, choose **New API token**. Tick **Write notes on your recordings** (`audio:write`); its read permission is included automatically. Copy the token when it appears. The **AI assistant** token form on the main Integrations page is for MCP and does not offer this plugin permission.
2. On that same **Connections** page, choose **New webhook**. Enter the URL that reaches this script at `/webhook`, tick **a recording is uploaded**, and copy the signing secret shown once. The URL must be reachable from the Ontoplano server. A hosted instance requires a public HTTPS address that forwards to your local listener; a self hosted instance may use a local address.
3. Put the settings in a `.env` file beside the script. It is read on every start, so it lasts beyond the shell that started it:

```sh
cp .env.example .env
chmod 600 .env
$EDITOR .env        # ONTOPLANO_URL, ONTOPLANO_TOKEN, WEBHOOK_SECRET
python transcriber.py
```

`LISTEN_HOST` defaults to `127.0.0.1`, `PORT` to `8080`, and `WHISPER_MODEL` to `base`; uncomment them in `.env` to change them. A variable already set in the environment wins over the file. `.env` is ignored by git.

The webhook contains only a recording ID. The script verifies its HMAC signature and age before queuing work. It skips recordings that already have notes and uses a conditional update so a late transcript cannot overwrite notes written in the meantime. Audio is held in a temporary file only while local Whisper decodes it, then deleted. Ontoplano delivers webhooks once, so a failed or interrupted transcription must be retried by uploading again or handled manually.

Run the synthetic tests with `python -m unittest discover -s . -p 'test_*.py'`. They do not download a model or connect to an account.
