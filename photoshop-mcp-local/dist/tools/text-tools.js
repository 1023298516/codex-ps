import { PhotoshopAPIFactory } from '../api/photoshop-api.js';
import { ExtendScriptSnippets } from '../api/extendscript.js';
export function createTextTools(connection) {
    return [
        {
            tool: {
                name: 'photoshop_set_text_font',
                description: 'Set font family and size for active text layer',
                inputSchema: {
                    type: 'object',
                    properties: {
                        fontName: {
                            type: 'string',
                            description: 'Font family name (e.g., "Arial", "Helvetica")',
                        },
                        fontSize: {
                            type: 'number',
                            description: 'Font size in points (optional)',
                            minimum: 1,
                        },
                    },
                    required: ['fontName'],
                },
            },
            handler: async (args) => setTextFont(connection, args),
        },
        {
            tool: {
                name: 'photoshop_set_text_color',
                description: 'Set color for active text layer',
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
            handler: async (args) => setTextColor(connection, args),
        },
        {
            tool: {
                name: 'photoshop_set_text_alignment',
                description: 'Set text alignment for active text layer',
                inputSchema: {
                    type: 'object',
                    properties: {
                        alignment: {
                            type: 'string',
                            description: 'Text alignment',
                            enum: ['LEFT', 'CENTER', 'RIGHT', 'LEFTJUSTIFIED', 'CENTERJUSTIFIED', 'RIGHTJUSTIFIED', 'FULLYJUSTIFIED'],
                        },
                    },
                    required: ['alignment'],
                },
            },
            handler: async (args) => setTextAlignment(connection, args),
        },
        {
            tool: {
                name: 'photoshop_update_text_content',
                description: 'Update the text content of active text layer',
                inputSchema: {
                    type: 'object',
                    properties: {
                        text: {
                            type: 'string',
                            description: 'New text content',
                        },
                    },
                    required: ['text'],
                },
            },
            handler: async (args) => updateTextContent(connection, args),
        },
    ];
}
async function setTextFont(connection, args) {
    const fontName = args.fontName;
    const fontSize = args.fontSize;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.setTextFont(fontName, fontSize);
        const result = await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Text font set to ${fontName}${fontSize ? `, size ${fontSize}pt` : ''}\nResult: ${JSON.stringify(result)}`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error setting text font: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function setTextColor(connection, args) {
    const red = args.red;
    const green = args.green;
    const blue = args.blue;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.setTextColor(red, green, blue);
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Text color set to RGB(${red}, ${green}, ${blue})`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error setting text color: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function setTextAlignment(connection, args) {
    const alignment = args.alignment;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.setTextAlignment(alignment);
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Text alignment set to ${alignment}`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error setting text alignment: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function updateTextContent(connection, args) {
    const text = args.text;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.updateTextContent(text);
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Text content updated to: "${text}"`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error updating text content: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
//# sourceMappingURL=text-tools.js.map