# Audio transcriber example

A standalone Node.js service that receives signed `audio.uploaded` webhooks, downloads each recording with a scoped Ontoplano token, sends it to OpenAI Whisper, and writes the transcript into that recording's notes. It has no dependency on the Ontoplano server's code or database.

Requires Node.js 20+, an OpenAI API key, and a reachable HTTPS webhook URL. For a self hosted instance, a local HTTP webhook URL also works. Audio is sent to OpenAI; only enable this for recordings you want processed there.

1. In **Settings → Integrations**, create a token with `audio:read`, `audio:write`, and `webhooks:manage`.
2. Set `ONTOPLANO_URL`, `ONTOPLANO_TOKEN`, `OPENAI_API_KEY`, and `PUBLIC_WEBHOOK_URL` in the service environment. The public URL must end in `/webhook`.
3. Run `npm run subscribe`. Save its one-time `WEBHOOK_SECRET` output in the service's secret manager.
4. Run `npm start`. Set `PORT` if the default `8080` is unsuitable.

The service accepts only a recent HMAC-signed `audio.uploaded` event. It acknowledges the webhook immediately, then fetches the recording and transcribes it. It writes only when notes are still empty, so a person's notes take precedence. A failed transcription is logged; Ontoplano's webhooks are best effort and do not retry deliveries. Restarting the process loses an in-flight job, so deploy with an external queue if that guarantee matters.

Run `npm test` for the signed webhook and transcription flow tests.
