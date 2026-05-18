# Codex PS Agent

This folder contains the Photoshop-side Codex agent MVP.

## Parts

- `bridge/`: local Node bridge between the Photoshop panel, Codex app-server, and Photoshop MCP.
- `panel/`: Photoshop UXP panel UI.
- `scripts/`: local development helpers.

## Local Development

Project update notes are tracked in [`../UPDATE_LOG.md`](../UPDATE_LOG.md).

Run tests:

```bash
npm test
```

Start the bridge:

```bash
npm run dev:bridge
```

The bridge listens on `http://127.0.0.1:17891` by default.

Panel prompts like "生成一只猪" use Codex's built-in image generation, then import the newly generated image from `~/.codex/generated_images` into Photoshop. A local `.env.local` file is only needed if you deliberately call Photoshop MCP's separate OpenAI Image API tools.

## Safety Model

The default mode is `safe-auto`. It may create new smart-object layers and transform the newly created or currently selected layer. Destructive actions such as delete, merge, flatten, overwrite, and applying masks to existing layers are blocked unless `full-auto` is explicitly enabled and protection succeeds.
