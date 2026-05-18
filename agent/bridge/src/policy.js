const SAFE_AUTO_ALLOWED = new Set([
  'read_document',
  'read_layers',
  'read_selection',
  'list_recent_codex_images',
  'create_new_layer',
  'generate_and_place_image',
  'place_latest_codex_image',
  'rename_new_layer',
  'transform_new_or_selected_layer',
  'selection_to_new_layer_result'
]);

const FULL_AUTO_PROTECTED = new Set([
  'delete_layer',
  'merge_layers',
  'flatten_document',
  'apply_mask',
  'overwrite_file'
]);

const FULL_AUTO_ALLOWED = new Set([
  ...SAFE_AUTO_ALLOWED,
  'modify_arbitrary_layer',
  ...FULL_AUTO_PROTECTED
]);

export function normalizeMode(mode = 'safe-auto') {
  if (mode === 'B' || mode === 'safe-auto') return 'safe-auto';
  if (mode === 'C' || mode === 'full-auto') return 'full-auto';
  return 'safe-auto';
}

export function canRunAction(mode, action, context = {}) {
  const normalizedMode = normalizeMode(mode);

  if (normalizedMode === 'safe-auto') {
    if (SAFE_AUTO_ALLOWED.has(action)) return { allowed: true, mode: normalizedMode };
    return {
      allowed: false,
      mode: normalizedMode,
      reason: `${action} blocked in B safe-auto mode`
    };
  }

  if (!FULL_AUTO_ALLOWED.has(action)) {
    return {
      allowed: false,
      mode: normalizedMode,
      reason: `${action} is not registered as an allowed Photoshop action`
    };
  }

  if (FULL_AUTO_PROTECTED.has(action) && context.protectionReady !== true) {
    return {
      allowed: false,
      mode: normalizedMode,
      reason: `${action} requires a protection point in C full-auto mode`
    };
  }

  return { allowed: true, mode: normalizedMode };
}

export function requireAllowedAction(mode, action, context = {}) {
  const result = canRunAction(mode, action, context);
  if (!result.allowed) {
    const error = new Error(result.reason);
    error.code = 'ACTION_BLOCKED';
    error.action = action;
    error.mode = result.mode;
    throw error;
  }
  return result;
}
