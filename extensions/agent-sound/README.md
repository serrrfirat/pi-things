# agent-sound

Global pi extension that plays configurable sounds when:

- an agent finishes (`agent_end`)
- an agent asks for user input via `ask_user`
- an agent opens an `interview`
- other input-request tools fire (fallback bucket)

## Install location

This extension is active because it lives at:

- `~/.pi/agent/extensions/agent-sound/index.ts`

Reload each active pi session with:

```text
/reload
```

## Fastest way to check if it works

```text
/agent-sound test all
```

Or open the interactive menu:

```text
/agent-sound
```

From there you can:

- view current mappings
- test each event sound individually
- configure separate sounds for completion / ask_user / interview / generic input requests
- reset everything to defaults

## Commands

```text
/agent-sound
/agent-sound status
/agent-sound test all
/agent-sound test completion
/agent-sound test ask_user
/agent-sound test interview
/agent-sound test input_request
/agent-sound reset
/agent-sound set completion system:Glass
/agent-sound set ask_user ~/Downloads/ping.mp3
/agent-sound set interview https://example.com/chime.mp3
/agent-sound set input_request silent
```

## Notes

- On macOS the defaults are `Glass` for completion and `Ping` for input requests.
- For remote URLs, audio files are cached in `~/.pi/agent/extensions/agent-sound/cache/`.
- For YouTube URLs, the extension uses `yt-dlp` if it is installed.
- If `oh-pi` is installed, completion keeps the existing oh-pi toast style and this extension only adds the sound.
