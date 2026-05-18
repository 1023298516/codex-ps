import { PhotoshopAPIFactory } from '../api/photoshop-api.js';
import { ExtendScriptSnippets } from '../api/extendscript.js';
export function createLayerTools(connection) {
    return [
        {
            tool: {
                name: 'photoshop_create_layer',
                description: 'Create a new layer in the active document',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Name for the new layer (optional)',
                        },
                    },
                },
            },
            handler: async (args) => createLayer(connection, args),
        },
        {
            tool: {
                name: 'photoshop_delete_layer',
                description: 'Delete the active layer',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => deleteLayer(connection),
        },
        {
            tool: {
                name: 'photoshop_create_text_layer',
                description: 'Create a text layer with specified content',
                inputSchema: {
                    type: 'object',
                    properties: {
                        text: {
                            type: 'string',
                            description: 'Text content',
                        },
                        x: {
                            type: 'number',
                            description: 'X position in pixels (default: 100)',
                            default: 100,
                        },
                        y: {
                            type: 'number',
                            description: 'Y position in pixels (default: 100)',
                            default: 100,
                        },
                        fontSize: {
                            type: 'number',
                            description: 'Font size in points (default: 24)',
                            default: 24,
                        },
                    },
                    required: ['text'],
                },
            },
            handler: async (args) => createTextLayer(connection, args),
        },
        {
            tool: {
                name: 'photoshop_fill_layer',
                description: 'Fill the active layer with a color',
                inputSchema: {
                    type: 'object',
                    properties: {
                        red: {
                            type: 'number',
                            description: 'Red component (0-255)',
                            minimum: 0,
                            maximum: 255,
                        },
                        green: {
                            type: 'number',
                            description: 'Green component (0-255)',
                            minimum: 0,
                            maximum: 255,
                        },
                        blue: {
                            type: 'number',
                            description: 'Blue component (0-255)',
                            minimum: 0,
                            maximum: 255,
                        },
                    },
                    required: ['red', 'green', 'blue'],
                },
            },
            handler: async (args) => fillLayer(connection, args),
        },
        {
            tool: {
                name: 'photoshop_get_layers',
                description: 'Get list of all layers in the active document',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => getLayers(connection),
        },
    ];
}
async function createLayer(connection, args) {
    const name = args.name;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.newLayer(name);
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Layer created${name ? `: ${name}` : ''}`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error creating layer: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function deleteLayer(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.deleteLayer();
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: 'Layer deleted successfully',
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error deleting layer: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function createTextLayer(connection, args) {
    const text = args.text;
    const x = args.x || 100;
    const y = args.y || 100;
    const fontSize = args.fontSize || 24;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.createTextLayer(text, x, y, fontSize);
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Text layer created: "${text}" at (${x}, ${y})`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error creating text layer: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function fillLayer(connection, args) {
    const red = args.red;
    const green = args.green;
    const blue = args.blue;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.fillLayer(red, green, blue);
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Layer filled with RGB(${red}, ${green}, ${blue})`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error filling layer: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function getLayers(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.getLayerNames();
        const result = await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Layers:\n${JSON.stringify(result, null, 2)}`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error getting layers: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
//# sourceMappingURL=layer-tools.js.map