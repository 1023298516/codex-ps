import { PhotoshopAPIFactory } from '../api/photoshop-api.js';
import { ExtendScriptSnippets } from '../api/extendscript.js';
export function createAdjustmentTools(connection) {
    return [
        {
            tool: {
                name: 'photoshop_adjust_brightness_contrast',
                description: 'Adjust brightness and contrast of the active layer',
                inputSchema: {
                    type: 'object',
                    properties: {
                        brightness: {
                            type: 'number',
                            description: 'Brightness adjustment (-100 to 100)',
                            minimum: -100,
                            maximum: 100,
                        },
                        contrast: {
                            type: 'number',
                            description: 'Contrast adjustment (-100 to 100)',
                            minimum: -100,
                            maximum: 100,
                        },
                    },
                    required: ['brightness', 'contrast'],
                },
            },
            handler: async (args) => adjustBrightnessContrast(connection, args),
        },
        {
            tool: {
                name: 'photoshop_adjust_hue_saturation',
                description: 'Adjust hue, saturation, and lightness of the active layer',
                inputSchema: {
                    type: 'object',
                    properties: {
                        hue: {
                            type: 'number',
                            description: 'Hue shift (-180 to 180)',
                            minimum: -180,
                            maximum: 180,
                        },
                        saturation: {
                            type: 'number',
                            description: 'Saturation adjustment (-100 to 100)',
                            minimum: -100,
                            maximum: 100,
                        },
                        lightness: {
                            type: 'number',
                            description: 'Lightness adjustment (-100 to 100)',
                            minimum: -100,
                            maximum: 100,
                        },
                    },
                    required: ['hue', 'saturation', 'lightness'],
                },
            },
            handler: async (args) => adjustHueSaturation(connection, args),
        },
        {
            tool: {
                name: 'photoshop_auto_levels',
                description: 'Apply auto levels adjustment to the active layer',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => autoLevels(connection),
        },
        {
            tool: {
                name: 'photoshop_auto_contrast',
                description: 'Apply auto contrast adjustment to the active layer',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => autoContrast(connection),
        },
        {
            tool: {
                name: 'photoshop_desaturate',
                description: 'Desaturate the active layer (convert to grayscale)',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => desaturate(connection),
        },
        {
            tool: {
                name: 'photoshop_invert',
                description: 'Invert colors of the active layer',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => invert(connection),
        },
    ];
}
async function adjustBrightnessContrast(connection, args) {
    const brightness = args.brightness;
    const contrast = args.contrast;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.adjustBrightnessContrast(brightness, contrast);
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Brightness/Contrast adjusted: brightness ${brightness}, contrast ${contrast}`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error adjusting brightness/contrast: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function adjustHueSaturation(connection, args) {
    const hue = args.hue;
    const saturation = args.saturation;
    const lightness = args.lightness;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.adjustHueSaturation(hue, saturation, lightness);
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Hue/Saturation adjusted: hue ${hue}, saturation ${saturation}, lightness ${lightness}`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error adjusting hue/saturation: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function autoLevels(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.autoLevels();
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: 'Auto Levels applied',
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error applying auto levels: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function autoContrast(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.autoContrast();
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: 'Auto Contrast applied',
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error applying auto contrast: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function desaturate(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.desaturate();
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: 'Layer desaturated (converted to grayscale)',
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error desaturating layer: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function invert(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.invert();
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: 'Colors inverted',
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error inverting colors: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
//# sourceMappingURL=adjustment-tools.js.map