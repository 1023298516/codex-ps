import { requireAllowedAction } from './policy.js';

const PHOTOSHOP_SERVER = 'photoshop';

export function createPhotoshopTools({ appServer, mode = 'safe-auto', protectionReady = false } = {}) {
  if (!appServer) throw new Error('createPhotoshopTools requires appServer');

  function allowed(action) {
    return requireAllowedAction(mode, action, { protectionReady });
  }

  return {
    async readDocument() {
      allowed('read_document');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_get_document_info', {});
    },

    async readLayers() {
      allowed('read_layers');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_get_layers', {});
    },

    async placeLatestCodexImage(args = {}) {
      allowed('place_latest_codex_image');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_place_latest_codex_image', {
        fitMode: args.fitMode || 'fit',
        layerName: args.layerName || 'Codex Generated Image'
      });
    },

    async generateAndPlaceImage(args = {}) {
      allowed('generate_and_place_image');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_ai_generate_and_place', {
        prompt: args.prompt,
        fitMode: args.fitMode || 'fit',
        layerName: args.layerName || 'AI Generated Image',
        size: args.size || '1024x1024',
        quality: args.quality || 'auto'
      });
    },

    async deleteLayer(args = {}) {
      allowed('delete_layer');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_delete_layer', args);
    }
  };
}
