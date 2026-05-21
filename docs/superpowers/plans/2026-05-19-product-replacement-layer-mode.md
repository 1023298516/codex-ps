# Product Replacement Layer Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Photoshop panel flow for product replacement using a visible target layer, multi-angle product references, Codex image preview generation, and non-destructive result import.

**Architecture:** The UXP panel sends product-replacement commands to the existing local bridge over WebSocket. The bridge stores uploaded product reference images, drives Photoshop through the existing MCP adapter, asks Codex app-server to generate a preview using local image inputs, then imports the confirmed preview as a new Photoshop layer. Photoshop-specific operations remain behind `photoshop-tools.js` wrappers and policy checks.

**Tech Stack:** Node.js, node:test, WebSocket bridge, Photoshop MCP via Codex app-server, Photoshop UXP panel HTML/CSS/JS.

---

## Files

- Create: `agent/bridge/src/product-replacement.js`
  - Save/list/read uploaded product reference images.
  - Build Codex input items for product-replacement preview generation.
- Modify: `agent/bridge/src/photoshop-tools.js`
  - Add target layer creation/read wrappers.
  - Add canvas export wrapper.
  - Add replacement-result layer naming/grouping wrapper.
- Modify: `agent/bridge/src/policy.js`
  - Allow safe non-destructive product-replacement actions in B mode.
- Modify: `agent/bridge/src/server.js`
  - Add WebSocket commands for product replacement.
  - Serve uploaded product reference previews.
  - Track pending product-replacement preview generation.
- Modify: `agent/panel/index.html`
  - Add product-replacement modal and upload controls.
- Modify: `agent/panel/panel.js`
  - Add product-replacement UI state, uploads, preview confirmation, and bridge commands.
- Modify: `agent/panel/styles.css`
  - Add compact Photoshop-style product-replacement UI.
- Modify: `UPDATE_LOG.md`
  - Record feature implementation.
- Test: `agent/bridge/test/product-replacement.test.js`
- Test: `agent/bridge/test/photoshop-tools.test.js`
- Test: `agent/bridge/test/server.test.js`
- Test: `agent/panel/test/static.test.js`

## Task 1: Product Reference Storage

- [ ] Write failing tests in `agent/bridge/test/product-replacement.test.js` for saving a base64 image, rejecting non-image MIME types, listing saved references, and building Codex local image inputs.
- [ ] Run `npm run test:bridge` and verify the new tests fail because `product-replacement.js` does not exist.
- [ ] Implement `agent/bridge/src/product-replacement.js` with `saveProductReference`, `listProductReferences`, `readProductReferenceFile`, and `buildProductReplacementInput`.
- [ ] Run `npm run test:bridge` and verify the new tests pass.

## Task 2: Photoshop Product Tools

- [ ] Add failing tests in `agent/bridge/test/photoshop-tools.test.js` for `createProductTargetLayer`, `readProductTargetLayer`, `exportCanvasPng`, and `prepareReplacementResultLayer`.
- [ ] Run `npm run test:bridge` and verify these tests fail because the wrappers are missing.
- [ ] Implement wrappers in `agent/bridge/src/photoshop-tools.js` using existing Photoshop MCP tools: `photoshop_execute_script`, `photoshop_export_canvas_png`, and `photoshop_place_image` plus custom script naming/grouping.
- [ ] Add safe allowed actions in `agent/bridge/src/policy.js`.
- [ ] Run `npm run test:bridge` and verify the tests pass.

## Task 3: Bridge Product-Replacement Commands

- [ ] Add failing tests in `agent/bridge/test/server.test.js` for uploading references, listing references, creating a target layer, generating a preview request, receiving the generated preview on turn completion, and importing the confirmed preview.
- [ ] Run `npm run test:bridge` and verify the tests fail for missing commands.
- [ ] Implement WebSocket commands in `agent/bridge/src/server.js`: `upload_product_reference`, `list_product_references`, `create_product_target`, `read_product_target`, `generate_product_replacement_preview`, and `import_product_replacement_preview`.
- [ ] Add `GET /product-reference` for local reference previews.
- [ ] Run `npm run test:bridge` and verify the tests pass.

## Task 4: Panel UI

- [ ] Add failing static tests in `agent/panel/test/static.test.js` for the product replacement entry, modal, upload input, command names, preview rendering, and Chinese copy.
- [ ] Run `npm run test:panel` and verify the tests fail.
- [ ] Implement the panel HTML, JS, and CSS for the product replacement flow.
- [ ] Run `npm run test:panel` and verify tests pass.

## Task 5: Verification and Release Notes

- [ ] Run `npm test`.
- [ ] Sync `agent/panel` into the local UXP plugin folder if it exists.
- [ ] Update `UPDATE_LOG.md` with the implemented feature and verification result.
- [ ] Commit and push the implementation.

## Self-Review

- Spec coverage: This plan covers target layer creation/read, multi-angle references, anti-hallucination prompt constraints, detail-page style fusion constraints, preview before import, and non-destructive import as a new layer.
- Gaps: The first version generates a full-canvas replacement preview layer rather than a transparent isolated product-only layer. This is still non-destructive because it is imported as a separate layer and can be hidden/deleted.
- No destructive Photoshop actions are introduced in safe mode.
