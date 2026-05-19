import { requireAllowedAction } from './policy.js';

const PHOTOSHOP_SERVER = 'photoshop';
const TARGET_GROUP_NAME = '圈选目标组';
const TARGET_LAYER_NAME = '目标 01';
const RESULT_GROUP_NAME = '替换结果组';
const RESULT_LAYER_NAME = '替换结果 01';

function quoted(value) {
  return JSON.stringify(String(value));
}

function createTargetLayerScript({
  groupName = TARGET_GROUP_NAME,
  layerName = TARGET_LAYER_NAME
} = {}) {
  return `
if (app.documents.length === 0) {
  throw new Error('No active document');
}
var doc = app.activeDocument;
var groupName = ${quoted(groupName)};
var layerName = ${quoted(layerName)};

function findLayerSet(parent, name) {
  for (var i = 0; i < parent.layerSets.length; i++) {
    if (parent.layerSets[i].name === name) return parent.layerSets[i];
  }
  return null;
}

var group = findLayerSet(doc, groupName);
if (!group) {
  group = doc.layerSets.add();
  group.name = groupName;
}

var width = doc.width.as('px');
var height = doc.height.as('px');
var left = Math.round(width * 0.34);
var top = Math.round(height * 0.12);
var right = Math.round(width * 0.66);
var bottom = Math.round(height * 0.78);

var layer = group.artLayers.add();
layer.name = layerName;
layer.opacity = 55;
doc.activeLayer = layer;

var color = new SolidColor();
color.rgb.red = 49;
color.rgb.green = 168;
color.rgb.blue = 255;

doc.selection.select([[left, top], [right, top], [right, bottom], [left, bottom]]);
doc.selection.stroke(color, 4, StrokeLocation.INSIDE);
doc.selection.deselect();

return {
  created: true,
  groupName: groupName,
  layerName: layer.name,
  bounds: { left: left, top: top, right: right, bottom: bottom }
};
`;
}

function readTargetLayerScript({
  layerName = TARGET_LAYER_NAME
} = {}) {
  return `
if (app.documents.length === 0) {
  throw new Error('No active document');
}
var doc = app.activeDocument;
var targetName = ${quoted(layerName)};

function findLayerByName(parent, name) {
  for (var i = 0; i < parent.layers.length; i++) {
    var layer = parent.layers[i];
    if (layer.name === name) return layer;
    if (layer.typename === 'LayerSet') {
      var found = findLayerByName(layer, name);
      if (found) return found;
    }
  }
  return null;
}

var target = findLayerByName(doc, targetName);
if (!target) {
  throw new Error('没有找到目标图层：' + targetName);
}

var bounds = target.bounds;
return {
  found: true,
  layerName: target.name,
  bounds: {
    left: bounds[0].as('px'),
    top: bounds[1].as('px'),
    right: bounds[2].as('px'),
    bottom: bounds[3].as('px')
  }
};
`;
}

function prepareReplacementResultLayerScript({
  groupName = RESULT_GROUP_NAME,
  layerName = RESULT_LAYER_NAME
} = {}) {
  return `
if (app.documents.length === 0) {
  throw new Error('No active document');
}
var doc = app.activeDocument;
var groupName = ${quoted(groupName)};
var layerName = ${quoted(layerName)};
var layer = doc.activeLayer;

function findLayerSet(parent, name) {
  for (var i = 0; i < parent.layerSets.length; i++) {
    if (parent.layerSets[i].name === name) return parent.layerSets[i];
  }
  return null;
}

var group = findLayerSet(doc, groupName);
if (!group) {
  group = doc.layerSets.add();
  group.name = groupName;
}

layer.name = layerName;
layer.move(group, ElementPlacement.INSIDE);

return {
  prepared: true,
  groupName: groupName,
  layerName: layerName
};
`;
}

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

    async createProductTargetLayer(args = {}) {
      allowed('create_product_target_layer');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_execute_script', {
        code: createTargetLayerScript(args)
      });
    },

    async readProductTargetLayer(args = {}) {
      allowed('read_product_target_layer');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_execute_script', {
        code: readTargetLayerScript(args)
      });
    },

    async exportCanvasPng(args = {}) {
      allowed('export_canvas');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_export_canvas_png', {
        outputPath: args.outputPath
      });
    },

    async prepareReplacementResultLayer(args = {}) {
      allowed('prepare_replacement_result_layer');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_execute_script', {
        code: prepareReplacementResultLayerScript(args)
      });
    },

    async deleteLayer(args = {}) {
      allowed('delete_layer');
      return appServer.callMcpTool(PHOTOSHOP_SERVER, 'photoshop_delete_layer', args);
    }
  };
}
