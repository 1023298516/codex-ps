# Codex PS Agent Design

## Status

Design approved on 2026-05-18.

This spec captures the MVP for a Photoshop-side Codex agent panel. It is based on the visual brainstorming decisions:

- First version is a Photoshop side-docked panel, not a full-width desktop clone.
- Interaction is chat-first.
- Execution is automatic.
- Default mode is B: safe auto mode that can modify newly created layers and the currently selected layer.
- C: full auto mode is retained as an advanced switch, not the default.
- Template placement and fixed layout-slot mapping are out of scope for the MVP.

## Goal

Build a Photoshop plugin experience where the user can chat with Codex inside Photoshop and ask it to generate images, import the latest Codex-generated image into the current document, read Photoshop state, and perform safe automatic layer adjustments without leaving the Photoshop workflow.

## Non-Goals

- Do not build template-slot mapping in the MVP.
- Do not embed the existing Codex desktop app window inside Photoshop.
- Do not build marketplace packaging or public distribution in the MVP.
- Do not require the user to manually copy image files between Codex and Photoshop.
- Do not enable destructive all-document editing by default.
- Do not depend on an OpenAI API key in the Photoshop plugin for the basic Codex-generated-image import flow.

## User Experience

The plugin is a dockable Photoshop panel with a compact dark UI that matches Photoshop's working environment.

The panel has:

- A chat transcript as the primary interaction area.
- A composer for natural-language instructions.
- A visible mode indicator: `B 安全自动` by default, with `C 全自动` available as an advanced mode.
- A streaming event log that shows what Codex is doing, such as generating an image, importing a file, reading layers, or transforming a layer.
- Minimal quick actions only where they help recovery or repeated work, such as `导入最新图`, `读取画布`, and `读取图层`.

The MVP flow:

1. User opens Photoshop and opens or creates a document.
2. User opens the Codex PS panel.
3. User types a task such as: `生成高级香水图，导入当前画布，再帮我整理构图。`
4. Codex runs automatically.
5. The panel streams status events.
6. Codex imports the generated image as a new smart object layer.
7. Codex may transform the new layer or the currently selected layer according to the active mode.
8. The panel shows a completion message and operation log.

## Modes

### B. Safe Auto Mode

This is the default mode.

Allowed automatically:

- Read current Photoshop document information.
- Read current layer and layer list information.
- Read selection state.
- Generate or locate the latest Codex image.
- Import an image as a new smart object layer.
- Rename the newly imported layer.
- Move, scale, and position the newly imported layer.
- Move and scale the currently selected layer.
- Use the current selection as input for a non-destructive operation when the result is created on a new layer.

Blocked in B mode:

- Delete layers.
- Merge layers.
- Flatten the document.
- Apply or delete masks on existing layers.
- Overwrite the saved PSD file.
- Modify hidden, locked, or arbitrary non-selected layers.
- Perform destructive canvas-wide edits without creating a new layer or backup.

### C. Full Auto Mode

This is an advanced mode. It can be exposed in the UI as a switch, but it must be visually distinct from the default B mode.

Allowed when C mode is explicitly enabled:

- Modify any editable layer.
- Apply or delete masks.
- Merge layers.
- Delete layers.
- Perform broader document-structure operations.

C mode must create a protection point before high-risk actions. The protection point can be a duplicate document, saved copy, or a grouped Photoshop history state, depending on what the Photoshop integration supports reliably.

If the protection point fails, C mode must refuse the destructive action and explain why.

## Architecture

The system has four pieces:

1. **Photoshop UXP Panel**
   - Provides the chat UI and mode controls.
   - Connects to the local bridge over HTTP or WebSocket.
   - Displays streamed text, tool events, errors, and completion state.

2. **Local Bridge**
   - Runs on the user's machine.
   - Starts or connects to Codex app-server.
   - Holds the dedicated Photoshop thread id.
   - Forwards chat turns from the UXP panel to Codex.
   - Streams app-server events back to the panel.
   - Stores local UI settings such as current mode and last known thread id.

3. **Codex App-Server**
   - Owns the agent thread.
   - Receives user messages from the bridge.
   - Streams turn updates, tool events, and completion messages.
   - Calls registered MCP tools, including the Photoshop MCP tools.

4. **Photoshop MCP Layer**
   - Performs Photoshop operations.
   - Uses the patched local `photoshop-mcp-local` server already registered with Codex.
   - Provides image import, document/layer inspection, selection-aware operations, export, and safe layer operations.

The UXP panel should not try to run the Codex model directly. It should treat the local bridge as its backend.

## Data Flow

### Starting A Session

1. Panel loads.
2. Panel connects to local bridge.
3. Bridge checks whether Codex app-server is available.
4. Bridge starts or resumes a dedicated `Codex PS` thread.
5. Bridge returns connection state to the panel.

### Running A Chat Task

1. Panel sends `{ message, mode }` to the bridge.
2. Bridge sends the message to Codex app-server.
3. Codex streams text and tool events.
4. Bridge normalizes the stream into panel events.
5. Panel renders each event in the transcript.
6. Codex calls Photoshop MCP tools when needed.
7. Photoshop MCP updates the current Photoshop document.
8. Bridge sends final result and operation log to the panel.

### Importing A Codex Image

The MVP import path uses existing local generated-image output:

1. Codex generates an image through the normal Codex image flow.
2. The image appears under the local Codex generated image directory.
3. Photoshop MCP `photoshop_place_latest_codex_image` finds the newest eligible image.
4. Photoshop MCP places it into the current Photoshop document as a smart object.
5. The imported layer is named clearly, such as `Codex Generated Image`.

## Permission Policy

The bridge should attach a mode policy to every Photoshop-related operation.

The policy decides whether an operation is allowed:

- `read` operations are always allowed when Photoshop is connected.
- `create_new_layer` operations are allowed in B and C.
- `transform_new_or_selected_layer` operations are allowed in B and C.
- `modify_arbitrary_layer` operations are allowed only in C.
- `delete`, `merge`, `flatten`, `apply_mask`, and `overwrite_file` operations are allowed only in C and only after protection succeeds.

The UI should show the current mode near the top of the panel so the user always knows how much autonomy Codex has.

## Error Handling

The panel must handle these states:

- Photoshop not running or MCP disconnected.
- No document is open.
- Codex app-server is unavailable.
- The dedicated thread cannot be started or resumed.
- Image generation fails.
- No recent Codex image is found.
- Image import fails.
- A Photoshop operation is blocked by the current mode.
- A C-mode protection point cannot be created.

When an error occurs, the transcript should show:

- What failed.
- Whether the Photoshop document was modified.
- The next safe action, such as reconnect, open a document, import latest image again, or switch mode.

## Persistence

The bridge may store:

- Current mode, defaulting to B.
- Dedicated Photoshop thread id.
- Last known Photoshop connection status.
- Recent operation log.
- Last imported generated image path.

The bridge must not store secret API keys in plain UI settings. The MVP should use Codex's existing authenticated environment and local generated-image output instead of asking for new image API credentials.

## Testing

### Unit Tests

Add tests for:

- Mode-policy decisions for B and C.
- App-server event normalization.
- Generated-image discovery ordering.
- Import command construction.
- Error messages for no Photoshop document, no recent image, and blocked operations.

### Integration Tests

Use the existing Photoshop MCP smoke-test pattern to verify:

- Photoshop MCP can connect.
- Current document info can be read.
- A generated or fixture image can be imported as a smart object.
- New or selected layer can be moved and scaled.
- B mode blocks destructive operations.

### Manual Verification

Manually verify in Photoshop:

- Panel opens in a docked side position.
- Chat messages stream without freezing the panel.
- Generated image is imported into the current document.
- Imported image remains editable as a smart object.
- B mode does not delete, merge, flatten, or overwrite existing work.
- C mode is visibly different from B mode.

## Acceptance Criteria

The MVP is complete when:

- The user can open a Photoshop panel and chat with Codex from inside it.
- The panel uses a dedicated or resumable Codex thread.
- The panel streams Codex text and operation events.
- Codex can import the latest generated image into the current Photoshop document.
- The default mode is B safe auto mode.
- B mode allows safe automatic layer operations and blocks destructive operations.
- C mode is present as an advanced mode but is not the default.
- Template placement is absent from the first version.
- The system has a clear error message for disconnected Photoshop, missing document, missing recent image, and blocked operations.

## Implementation Readiness

This spec is ready for an implementation plan after user review.

The implementation should be split into:

1. UXP panel shell and chat UI.
2. Local bridge and app-server connection.
3. Event stream normalization.
4. Photoshop MCP command adapter.
5. Mode policy enforcement.
6. Image import flow.
7. Integration and manual verification.
