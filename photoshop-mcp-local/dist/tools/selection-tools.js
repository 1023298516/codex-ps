import { PhotoshopAPIFactory } from '../api/photoshop-api.js';
import { ExtendScriptSnippets } from '../api/extendscript.js';
export function createSelectionTools(connection) {
    return [
        {
            tool: {
                name: 'photoshop_select_rectangle',
                description: 'Create a rectangular selection',
                inputSchema: {
                    type: 'object',
                    properties: {
                        left: {
                            type: 'number',
                            description: 'Left edge in pixels',
                        },
                        top: {
                            type: 'number',
                            description: 'Top edge in pixels',
                        },
                        right: {
                            type: 'number',
                            description: 'Right edge in pixels',
                        },
                        bottom: {
                            type: 'number',
                            description: 'Bottom edge in pixels',
                        },
                    },
                    required: ['left', 'top', 'right', 'bottom'],
                },
            },
            handler: async (args) => selectRectangle(connection, args),
        },
        {
            tool: {
                name: 'photoshop_select_all',
                description: 'Select the entire document',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => selectAll(connection),
        },
        {
            tool: {
                name: 'photoshop_deselect',
                description: 'Deselect all selections',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => deselect(connection),
        },
        {
            tool: {
                name: 'photoshop_invert_selection',
                description: 'Invert the current selection',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => invertSelection(connection),
        },
        {
            tool: {
                name: 'photoshop_create_layer_mask',
                description: 'Create a layer mask from the current selection',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => createLayerMask(connection),
        },
        {
            tool: {
                name: 'photoshop_delete_layer_mask',
                description: 'Delete the layer mask from active layer',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => deleteLayerMask(connection),
        },
        {
            tool: {
                name: 'photoshop_apply_layer_mask',
                description: 'Apply (merge) the layer mask to the layer',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            handler: async () => applyLayerMask(connection),
        },
    ];
}
async function selectRectangle(connection, args) {
    const left = args.left;
    const top = args.top;
    const right = args.right;
    const bottom = args.bottom;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.selectRectangle(left, top, right, bottom);
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Rectangular selection created: (${left}, ${top}) to (${right}, ${bottom})`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error creating selection: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function selectAll(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.selectAll();
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: 'All selected',
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error selecting all: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function deselect(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.deselect();
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: 'Selection cleared',
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error deselecting: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function invertSelection(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.invertSelection();
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: 'Selection inverted',
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error inverting selection: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function createLayerMask(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.createLayerMask();
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: 'Layer mask created from selection',
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error creating layer mask: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function deleteLayerMask(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.deleteLayerMask();
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: 'Layer mask deleted',
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error deleting layer mask: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function applyLayerMask(connection) {
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.applyLayerMask();
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: 'Layer mask applied (merged to layer)',
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error applying layer mask: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
//# sourceMappingURL=selection-tools.js.map