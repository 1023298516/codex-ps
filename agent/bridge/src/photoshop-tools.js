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

    async placeImage(args = {}) {
      allowed('place_image');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_place_image', {
        filePath: args.filePath,
        x: args.x || 0,
        y: args.y || 0
      });
    },

    async openImage(args = {}) {
      allowed('open_image');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_open_image', {
        filePath: args.filePath
      });
    },

    async fitActiveLayerToDocument(args = {}) {
      allowed('fit_layer_to_document');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_fit_layer_to_document', {
        fillDocument: args.fillDocument === true
      });
    },

    async deleteLayer(args = {}) {
      allowed('delete_layer');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_delete_layer', args);
    }
  };
}
