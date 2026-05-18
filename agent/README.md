# Codex PS Agent

This folder contains the Photoshop-side Codex agent MVP.

## Parts

- `bridge/`: local Node bridge between the Photoshop panel, Codex app-server, and Photoshop MCP.
- `panel/`: Photoshop UXP panel UI.
- `scripts/`: local development helpers.

## Local Development

Run tests:

```bash
npm test
```

Start the bridge:

```bash
npm run dev:bridge
```

The bridge listens on `http://127.0.0.1:17891` by default.

Image generation through Photoshop MCP requires an OpenAI API key. Put it in a local, git-ignored file:

```bash
OPENAI_API_KEY=sk-...
```

Save that as `.env.local` in the project root before starting the bridge.

## Safety Model

The default mode is `safe-auto`. It may create new smart-object layers and transform the newly created or currently selected layer. Destructive actions such as delete, merge, flatten, overwrite, and applying masks to existing layers are blocked unless `full-auto` is explicitly enabled and protection succeeds.
