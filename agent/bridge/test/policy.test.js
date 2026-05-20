import test from 'node:test';
import assert from 'node:assert/strict';
import { canRunAction, normalizeMode, requireAllowedAction } from '../src/policy.js';

test('normalizeMode defaults to safe-auto', () => {
  assert.equal(normalizeMode(), 'safe-auto');
  assert.equal(normalizeMode('B'), 'safe-auto');
  assert.equal(normalizeMode('safe-auto'), 'safe-auto');
  assert.equal(normalizeMode('C'), 'full-auto');
  assert.equal(normalizeMode('full-auto'), 'full-auto');
});

test('safe-auto allows reads and safe layer creation/transforms', () => {
  assert.equal(canRunAction('safe-auto', 'read_document').allowed, true);
  assert.equal(canRunAction('safe-auto', 'create_new_layer').allowed, true);
  assert.equal(canRunAction('safe-auto', 'transform_new_or_selected_layer').allowed, true);
  assert.equal(canRunAction('safe-auto', 'generate_and_place_image').allowed, true);
  assert.equal(canRunAction('safe-auto', 'open_image').allowed, true);
  assert.equal(canRunAction('safe-auto', 'place_image').allowed, true);
  assert.equal(canRunAction('safe-auto', 'fit_layer_to_document').allowed, true);
  assert.equal(canRunAction('safe-auto', 'read_selection').allowed, true);
  assert.equal(canRunAction('safe-auto', 'create_product_target_layer').allowed, true);
  assert.equal(canRunAction('safe-auto', 'read_product_target_layer').allowed, true);
  assert.equal(canRunAction('safe-auto', 'export_canvas').allowed, true);
  assert.equal(canRunAction('safe-auto', 'prepare_replacement_result_layer').allowed, true);
  assert.equal(canRunAction('safe-auto', 'create_retouch_target_layer').allowed, true);
  assert.equal(canRunAction('safe-auto', 'read_retouch_target_layer').allowed, true);
  assert.equal(canRunAction('safe-auto', 'prepare_retouch_result_layer').allowed, true);
  assert.equal(canRunAction('safe-auto', 'hide_latest_retouch_layer').allowed, true);
});

test('safe-auto blocks destructive operations', () => {
  for (const action of ['delete_layer', 'merge_layers', 'flatten_document', 'apply_mask', 'overwrite_file', 'modify_arbitrary_layer']) {
    const result = canRunAction('safe-auto', action);
    assert.equal(result.allowed, false, action);
    assert.match(result.reason, /blocked in B safe-auto mode/);
  }
});

test('full-auto allows destructive operations only when protection succeeded', () => {
  assert.equal(canRunAction('full-auto', 'delete_layer').allowed, false);
  assert.equal(canRunAction('full-auto', 'delete_layer', { protectionReady: true }).allowed, true);
  assert.equal(canRunAction('full-auto', 'modify_arbitrary_layer').allowed, true);
});

test('requireAllowedAction throws a readable blocked-operation error', () => {
  assert.throws(
    () => requireAllowedAction('safe-auto', 'delete_layer'),
    /delete_layer blocked in B safe-auto mode/
  );
});
