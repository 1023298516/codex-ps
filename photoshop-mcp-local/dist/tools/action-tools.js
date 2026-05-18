import { PhotoshopAPIFactory } from '../api/photoshop-api.js';
import { ExtendScriptSnippets } from '../api/extendscript.js';
export function createActionTools(connection) {
    return [
        {
            tool: {
                name: 'photoshop_play_action',
                description: 'Play a recorded action from the Actions palette',
                inputSchema: {
                    type: 'object',
                    properties: {
                        actionName: {
                            type: 'string',
                            description: 'Name of the action to play',
                        },
                        actionSetName: {
                            type: 'string',
                            description: 'Name of the action set containing the action',
                        },
                    },
                    required: ['actionName', 'actionSetName'],
                },
            },
            handler: async (args) => playAction(connection, args),
        },
        {
            tool: {
                name: 'photoshop_execute_script',
                description: 'Execute custom ExtendScript code (advanced)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        code: {
                            type: 'string',
                            description: 'ExtendScript code to execute',
                        },
                    },
                    required: ['code'],
                },
            },
            handler: async (args) => executeCustomScript(connection, args),
        },
    ];
}
async function playAction(connection, args) {
    const actionName = args.actionName;
    const actionSetName = args.actionSetName;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.playAction(actionName, actionSetName);
        await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Action played: "${actionName}" from set "${actionSetName}"`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error playing action: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
async function executeCustomScript(connection, args) {
    const code = args.code;
    try {
        const apiFactory = new PhotoshopAPIFactory(connection);
        const api = await apiFactory.createAPI();
        const script = ExtendScriptSnippets.executeCustomScript(code);
        const result = await api.executeScript(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Custom script executed\nResult: ${JSON.stringify(result)}`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error executing custom script: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
//# sourceMappingURL=action-tools.js.map