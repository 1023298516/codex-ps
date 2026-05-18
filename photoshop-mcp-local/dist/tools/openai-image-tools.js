import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { PhotoshopAPIFactory } from '../api/photoshop-api.js';

const DEFAULT_OUTPUT_DIR = '/Users/susu/.codex/generated_images/photoshop-mcp';
const DEFAULT_MODEL = 'gpt-image-2';

function escapeJsString(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function requireOpenAIKey() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set. Add it to the Codex MCP server env before using OpenAI image tools.');
    }
    return apiKey;
}

function openAIBaseUrl() {
    return (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
}

function outputPath(prefix) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return join(DEFAULT_OUTPUT_DIR, `${prefix}-${stamp}-${randomUUID().slice(0, 8)}.png`);
}

async function callOpenAIJson(path, body) {
    const response = await fetch(`${openAIBaseUrl()}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${requireOpenAIKey()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        json = { raw: text };
    }
    if (!response.ok) {
        const message = json?.error?.message || text || `OpenAI request failed with status ${response.status}`;
        throw new Error(message);
    }
    return json;
}

async function callOpenAIMultipart(path, form) {
    const response = await fetch(`${openAIBaseUrl()}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${requireOpenAIKey()}`,
        },
        body: form,
    });
    const text = await response.text();
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        json = { raw: text };
    }
    if (!response.ok) {
        const message = json?.error?.message || text || `OpenAI request failed with status ${response.status}`;
        throw new Error(message);
    }
    return json;
}

function extractBase64Image(response) {
    const image = response?.data?.[0]?.b64_json;
    if (!image) {
        throw new Error(`OpenAI response did not include data[0].b64_json: ${JSON.stringify(response).slice(0, 1000)}`);
    }
    return image;
}

function appendOptionalImageOptions(target, args) {
    if (args.size) target.size = args.size;
    if (args.quality) target.quality = args.quality;
    if (args.outputFormat) target.output_format = args.outputFormat;
    if (args.background) target.background = args.background;
    if (args.moderation) target.moderation = args.moderation;
}

function appendOptionalImageFormOptions(form, args) {
    if (args.size) form.append('size', args.size);
    if (args.quality) form.append('quality', args.quality);
    if (args.outputFormat) form.append('output_format', args.outputFormat);
    if (args.background) form.append('background', args.background);
    if (args.moderation) form.append('moderation', args.moderation);
}

async function executeScript(connection, script) {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();
    return coerceExtendScriptResult(await api.executeScript(script));
}

function coerceExtendScriptResult(result) {
    if (typeof result !== 'string') return result;
    const trimmed = result.trim();
    if (!trimmed.startsWith('(') && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return result;
    }
    try {
        // Photoshop ExtendScript serializes objects with toSource(), which is a
        // JavaScript literal rather than strict JSON. Evaluate only local script
        // results produced by this MCP server.
        return Function(`"use strict"; return (${trimmed});`)();
    }
    catch {
        return result;
    }
}

async function exportCanvasPng(connection, filePath) {
    await mkdir(dirname(filePath), { recursive: true });
    const script = `
    if (app.documents.length === 0) {
      throw new Error('No active document');
    }
    var sourceDoc = app.activeDocument;
    var outputFile = new File("${escapeJsString(filePath)}");
    var exportDoc = sourceDoc.duplicate("MCP AI Canvas Export", true);
    app.activeDocument = exportDoc;
    var pngOptions = new PNGSaveOptions();
    pngOptions.compression = 6;
    exportDoc.saveAs(outputFile, pngOptions, true, Extension.LOWERCASE);
    exportDoc.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = sourceDoc;
    return {
      path: outputFile.fsName,
      documentName: sourceDoc.name,
      width: sourceDoc.width.as('px'),
      height: sourceDoc.height.as('px'),
      resolution: sourceDoc.resolution
    };
  `;
    return await executeScript(connection, script);
}

async function placeImage(connection, filePath, layerName, fitMode = 'fit') {
    const safeLayerName = layerName || 'AI Image';
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

async function generateImage(args) {
    const body = {
        model: args.model || DEFAULT_MODEL,
        prompt: args.prompt,
        n: 1,
    };
    appendOptionalImageOptions(body, args);
    const response = await callOpenAIJson('/images/generations', body);
    return Buffer.from(extractBase64Image(response), 'base64');
}

async function editImage(inputPath, args) {
    const form = new FormData();
    form.append('model', args.model || DEFAULT_MODEL);
    form.append('prompt', args.prompt);
    appendOptionalImageFormOptions(form, args);
    const inputImage = await readFile(inputPath);
    form.append('image[]', new Blob([inputImage], { type: 'image/png' }), 'canvas.png');
    const response = await callOpenAIMultipart('/images/edits', form);
    return Buffer.from(extractBase64Image(response), 'base64');
}

function resultText(title, values) {
    return `${title}\n${Object.entries(values)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')}`;
}

export function createOpenAIImageTools(connection) {
    return [
        {
            tool: {
                name: 'photoshop_export_canvas_png',
                description: 'Export the current Photoshop canvas as a flattened PNG file without modifying the open document',
                inputSchema: {
                    type: 'object',
                    properties: {
                        outputPath: {
                            type: 'string',
                            description: 'Optional full output PNG path. Defaults to ~/.codex/generated_images/photoshop-mcp/.',
                        },
                    },
                },
            },
            handler: async (args) => exportCanvasTool(connection, args),
        },
        {
            tool: {
                name: 'photoshop_ai_generate_and_place',
                description: 'Generate an image with OpenAI Image API and place it into the active Photoshop document as a new layer',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prompt: { type: 'string', description: 'Image generation prompt' },
                        model: { type: 'string', description: `OpenAI image model. Default: ${DEFAULT_MODEL}` },
                        size: { type: 'string', description: 'Output size, e.g. auto, 1024x1024, 1536x1024, 1024x1536' },
                        quality: { type: 'string', enum: ['low', 'medium', 'high', 'auto'], description: 'Image quality' },
                        outputFormat: { type: 'string', enum: ['png', 'jpeg', 'webp'], description: 'Output file format requested from API' },
                        background: { type: 'string', enum: ['auto', 'opaque', 'transparent'], description: 'Background mode when supported by the selected model' },
                        moderation: { type: 'string', enum: ['auto', 'low'], description: 'Image moderation strictness' },
                        layerName: { type: 'string', description: 'Photoshop layer name for the placed result' },
                        fitMode: { type: 'string', enum: ['fit', 'fill', 'none'], default: 'fit', description: 'How to scale the placed image in the current canvas' },
                    },
                    required: ['prompt'],
                },
            },
            handler: async (args) => generateAndPlaceTool(connection, args),
        },
        {
            tool: {
                name: 'photoshop_ai_edit_current_canvas',
                description: 'Export the active Photoshop canvas, edit it with OpenAI Image API using a prompt, then place the result back as a new layer',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prompt: { type: 'string', description: 'Instruction for how to edit the current canvas' },
                        model: { type: 'string', description: `OpenAI image model. Default: ${DEFAULT_MODEL}` },
                        size: { type: 'string', description: 'Output size, e.g. auto, 1024x1024, 1536x1024, 1024x1536' },
                        quality: { type: 'string', enum: ['low', 'medium', 'high', 'auto'], description: 'Image quality' },
                        outputFormat: { type: 'string', enum: ['png', 'jpeg', 'webp'], description: 'Output file format requested from API' },
                        background: { type: 'string', enum: ['auto', 'opaque', 'transparent'], description: 'Background mode when supported by the selected model' },
                        moderation: { type: 'string', enum: ['auto', 'low'], description: 'Image moderation strictness' },
                        layerName: { type: 'string', description: 'Photoshop layer name for the placed edited result' },
                        fitMode: { type: 'string', enum: ['fit', 'fill', 'none'], default: 'fit', description: 'How to scale the placed image in the current canvas' },
                    },
                    required: ['prompt'],
                },
            },
            handler: async (args) => editCurrentCanvasTool(connection, args),
        },
    ];
}

async function exportCanvasTool(connection, args) {
    try {
        const path = args.outputPath || outputPath('canvas-export');
        const result = await exportCanvasPng(connection, path);
        return {
            content: [
                {
                    type: 'text',
                    text: resultText('Canvas exported', {
                        path: result.path || path,
                        document: result.documentName || '',
                        size: `${result.width || '?'}x${result.height || '?'} px`,
                    }),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error exporting canvas: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

async function generateAndPlaceTool(connection, args) {
    try {
        requireOpenAIKey();
        await mkdir(DEFAULT_OUTPUT_DIR, { recursive: true });
        const imagePath = outputPath('openai-generate');
        const imageBytes = await generateImage(args);
        await writeFile(imagePath, imageBytes);
        const placeResult = await placeImage(connection, imagePath, args.layerName || 'OpenAI Generated Image', args.fitMode || 'fit');
        return {
            content: [
                {
                    type: 'text',
                    text: resultText('OpenAI image generated and placed', {
                        imagePath,
                        model: args.model || DEFAULT_MODEL,
                        layer: placeResult.layerName || args.layerName || 'OpenAI Generated Image',
                        fitMode: args.fitMode || 'fit',
                    }),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error generating/placing image: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

async function editCurrentCanvasTool(connection, args) {
    try {
        requireOpenAIKey();
        await mkdir(DEFAULT_OUTPUT_DIR, { recursive: true });
        const inputPath = outputPath('canvas-input');
        const outputImagePath = outputPath('openai-edit');
        const exportResult = await exportCanvasPng(connection, inputPath);
        const imageBytes = await editImage(inputPath, args);
        await writeFile(outputImagePath, imageBytes);
        const placeResult = await placeImage(connection, outputImagePath, args.layerName || 'OpenAI Edited Canvas', args.fitMode || 'fit');
        return {
            content: [
                {
                    type: 'text',
                    text: resultText('Current Photoshop canvas edited with OpenAI and placed', {
                        inputPath,
                        outputImagePath,
                        model: args.model || DEFAULT_MODEL,
                        sourceDocument: exportResult.documentName || '',
                        layer: placeResult.layerName || args.layerName || 'OpenAI Edited Canvas',
                        fitMode: args.fitMode || 'fit',
                    }),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error editing current canvas: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}
