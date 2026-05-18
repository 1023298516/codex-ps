#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import getPort from 'get-port';
import open from 'open';
import { startUIServer } from './server.js';
import { Logger } from '../utils/logger.js';
// dist/ui/cli.js -> ../../package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = (() => {
    try {
        const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
        return pkg.version ?? '0.0.0';
    }
    catch {
        return '0.0.0';
    }
})();
function parseFlags(argv) {
    const flags = { host: '127.0.0.1', noOpen: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--port' || arg === '-p') {
            const val = Number(argv[++i]);
            if (Number.isFinite(val) && val > 0)
                flags.port = val;
        }
        else if (arg === '--host') {
            flags.host = argv[++i] ?? flags.host;
        }
        else if (arg === '--no-open') {
            flags.noOpen = true;
        }
        else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
        else if (arg === '--version' || arg === '-v') {
            printVersion();
            process.exit(0);
        }
    }
    return flags;
}
function printHelp() {
    process.stdout.write([
        'photoshop-mcp-ui — Browser UI for the Photoshop MCP server',
        '',
        'Usage: photoshop-mcp-ui [options]',
        '',
        'Options:',
        '  -p, --port <number>   Port to listen on (default: random free port)',
        '      --host <host>     Host to bind to (default: 127.0.0.1)',
        '      --no-open         Do not auto-open the browser',
        '  -h, --help            Show this help',
        '  -v, --version         Show version',
        '',
        'Configuration is stored at ~/.photoshop-mcp/config.json (chmod 600).',
        '',
    ].join('\n'));
}
function printVersion() {
    process.stdout.write(`photoshop-mcp-ui ${PKG_VERSION}\n`);
}
async function main() {
    const logger = new Logger('UI');
    const flags = parseFlags(process.argv.slice(2));
    const port = flags.port ?? (await getPort({ port: [5174, 5175, 5176, 5180] }));
    const server = await startUIServer({
        host: flags.host,
        port,
    });
    const url = server.url;
    process.stdout.write(`\nPhotoshop MCP UI ready at:\n  ${url}\n\n`);
    if (!flags.noOpen) {
        try {
            await open(url);
        }
        catch (err) {
            logger.warn('Failed to auto-open browser', err);
        }
    }
    const shutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down`);
        await server.close();
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
main().catch((err) => {
    process.stderr.write(`Failed to start Photoshop MCP UI: ${err.message}\n`);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map