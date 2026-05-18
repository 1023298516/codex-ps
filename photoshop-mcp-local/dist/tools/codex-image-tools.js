import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { PhotoshopAPIFactory } from '../api/photoshop-api.js';

const DEFAULT_CODEX_IMAGE_DIR = '/Users/susu/.codex/generated_images';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.psd', '.tif', '.tiff']);

function escapeJsString(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function imageExt(filePath) {
    const lower = filePath.toLowerCase();
    const dot = lower.lastIndexOf('.');
    return dot >= 0 ? lower.slice(dot) : '';
}

async function collectImages(dir, options = {}, depth = 0) {
    const maxDepth = options.maxDepth ?? 6;
    const excludePhotoshopMcpOutput = options.excludePhotoshopMcpOutput !== false;
    const entries = [];
    if (depth > maxDepth) return entries;
    let dirents;
    try {
        dirents = await readdir(dir, { withFileTypes: true });
    }
    catch {
        return entries;
    }
    for (const dirent of dirents) {
        const fullPath = join(dir, dirent.name);
        if (dirent.isDirectory()) {
            if (excludePhotoshopMcpOutput && basename(fullPath) === 'photoshop-mcp') continue;
            entries.push(...(await collectImages(fullPath, options, depth + 1)));
            continue;
        }
        if (!dirent.isFile() || !IMAGE_EXTENSIONS.has(imageExt(fullPath))) continue;
        try {
            const info = await stat(fullPath);
            entries.push({
                path: fullPath,
                size: info.size,
                mtimeMs: info.mtimeMs,
                modified: info.mtime.toISOString(),
            });
        }
        catch {
            // Ignore files that disappear while scanning.
        }
    }
    return entries;
}

async function recentCodexImages(args = {}) {
    const searchDir = args.searchDir || DEFAULT_CODEX_IMAGE_DIR;
    const images = await collectImages(searchDir, {
        maxDepth: args.maxDepth ?? 6,
        excludePhotoshopMcpOutput: args.excludePhotoshopMcpOutput !== false,
    });
    return images.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function executeScript(connection, script) {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();
    return await api.executeScript(script);
}

async function placeImage(connection, filePath, layerName, fitMode = 'fit') {
    const safeLayerName = layerName || `Codex Image - ${basename(filePath)}`;
    const script = `
    function cTID(s) { return app.charIDToTypeID(s); }
    if (app.documents.length === 0) {
      throw new Error('No active document');
    }
    var imageFile = new File("${escapeJsString(filePath)}");
    if (!imageFile.exists) {
      throw new Error('Image file not found: ${escapeJsString(filePath)}');
    }
    var doc = app.activeDocument;
    var desc = new ActionDescriptor();
    desc.putPath(cTID('null'), imageFile);
    desc.putEnumerated(cTID('FTcs'), cTID('QCSt'), cTID('Qcsa'));
    var offsetDesc = new ActionDescriptor();
    offsetDesc.putUnitDouble(cTID('Hrzn'), cTID('#Pxl'), 0);
    offsetDesc.putUnitDouble(cTID('Vrtc'), cTID('#Pxl'), 0);
    desc.putObject(cTID('Ofst'), cTID('Ofst'), offsetDesc);
    executeAction(cTID('Plc '), desc, DialogModes.NO);

    var layer = doc.activeLayer;
    layer.name = "${escapeJsString(safeLayerName)}";

    var fitMode = "${escapeJsString(fitMode)}";
    if (fitMode !== 'none') {
      var canvasWidth = doc.width.as('px');
      var canvasHeight = doc.height.as('px');
      var bounds = layer.bounds;
      var layerWidth = bounds[2].as('px') - bounds[0].as('px');
      var layerHeight = bounds[3].as('px') - bounds[1].as('px');
      if (layerWidth > 0 && layerHeight > 0) {
        var widthRatio = canvasWidth / layerWidth;
        var heightRatio = canvasHeight / layerHeight;
        var scaleFactor = fitMode === 'fill' ? Math.max(widthRatio, heightRatio) : Math.min(widthRatio, heightRatio);
        var scalePercent = scaleFactor * 100;
        layer.resize(scalePercent, scalePercent, AnchorPosition.MIDDLECENTER);
        bounds = layer.bounds;
        var newLeft = bounds[0].as('px');
        var newTop = bounds[1].as('px');
        var newRight = bounds[2].as('px');
        var newBottom = bounds[3].as('px');
        layer.translate(
          canvasWidth / 2 - (newLeft + (newRight - newLeft) / 2),
          canvasHeight / 2 - (newTop + (newBottom - newTop) / 2)
        );
      }
    }

    return {
      placed: true,
      layerName: layer.name,
      fitMode: fitMode,
      filePath: imageFile.fsName
    };
  `;
    return await executeScript(connection, script);
}

function textBlock(title, values) {
    return `${title}\n${Object.entries(values)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')}`;
}

export function createCodexImageTools(connection) {
    return [
        {
            tool: {
                name: 'photoshop_list_recent_codex_images',
                description: 'List recent images generated by Codex from ~/.codex/generated_images',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
                        searchDir: { type: 'string', description: 'Optional directory to scan instead of ~/.codex/generated_images' },
                        maxDepth: { type: 'number', minimum: 0, maximum: 12, default: 6 },
                        excludePhotoshopMcpOutput: { type: 'boolean', default: true },
                    },
                },
            },
            handler: async (args) => listRecentCodexImages(args),
        },
        {
            tool: {
                name: 'photoshop_place_latest_codex_image',
                description: 'Place the latest Codex-generated image from ~/.codex/generated_images into the active Photoshop document',
                inputSchema: {
                    type: 'object',
                    properties: {
                        index: { type: 'number', minimum: 0, default: 0, description: '0 places the latest image, 1 places the previous image, etc.' },
                        searchDir: { type: 'string', description: 'Optional directory to scan instead of ~/.codex/generated_images' },
                        maxDepth: { type: 'number', minimum: 0, maximum: 12, default: 6 },
                        excludePhotoshopMcpOutput: { type: 'boolean', default: true },
                        layerName: { type: 'string', description: 'Optional Photoshop layer name' },
                        fitMode: { type: 'string', enum: ['fit', 'fill', 'none'], default: 'fit', description: 'How to scale the placed image in the current canvas' },
                    },
                },
            },
            handler: async (args) => placeLatestCodexImage(connection, args),
        },
    ];
}

async function listRecentCodexImages(args = {}) {
    try {
        const limit = Math.max(1, Math.min(Number(args.limit || 10), 50));
        const images = (await recentCodexImages(args)).slice(0, limit);
        if (images.length === 0) {
            return {
                content: [{ type: 'text', text: `No Codex images found in ${args.searchDir || DEFAULT_CODEX_IMAGE_DIR}` }],
                isError: true,
            };
        }
        return {
            content: [
                {
                    type: 'text',
                    text: images
                        .map((image, index) => `${index}: ${image.path}\n   modified: ${image.modified}\n   size: ${image.size} bytes`)
                        .join('\n'),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error listing Codex images: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

async function placeLatestCodexImage(connection, args = {}) {
    try {
        const index = Math.max(0, Number(args.index || 0));
        const images = await recentCodexImages(args);
        if (images.length === 0) {
            return {
                content: [{ type: 'text', text: `No Codex images found in ${args.searchDir || DEFAULT_CODEX_IMAGE_DIR}` }],
                isError: true,
            };
        }
        if (index >= images.length) {
            return {
                content: [{ type: 'text', text: `Requested index ${index}, but only found ${images.length} Codex image(s).` }],
                isError: true,
            };
        }
        const image = images[index];
        const result = await placeImage(connection, image.path, args.layerName, args.fitMode || 'fit');
        return {
            content: [
                {
                    type: 'text',
                    text: textBlock('Latest Codex image placed into Photoshop', {
                        imagePath: image.path,
                        modified: image.modified,
                        layer: result.layerName || args.layerName || '',
                        fitMode: args.fitMode || 'fit',
                        index,
                    }),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error placing Codex image: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}
