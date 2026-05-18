import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from '../utils/logger.js';
const execAsync = promisify(exec);
export class WindowsExecutor {
    logger;
    scriptQueue = [];
    isProcessing = false;
    constructor() {
        this.logger = new Logger('WindowsExecutor');
    }
    async execute(script, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Script execution timeout'));
            }, timeout);
            this.scriptQueue.push(async () => {
                try {
                    const result = await this.executeScript(script);
                    clearTimeout(timeoutId);
                    resolve(result);
                    return result;
                }
                catch (error) {
                    clearTimeout(timeoutId);
                    reject(error);
                    throw error;
                }
            });
            this.processQueue();
        });
    }
    async processQueue() {
        if (this.isProcessing || this.scriptQueue.length === 0) {
            return;
        }
        this.isProcessing = true;
        while (this.scriptQueue.length > 0) {
            const task = this.scriptQueue.shift();
            if (task) {
                try {
                    await task();
                }
                catch (error) {
                    this.logger.error('Script execution failed:', error);
                }
            }
        }
        this.isProcessing = false;
    }
    async executeScript(script) {
        // For Windows, we'll use a combination of VBScript/JScript to communicate with Photoshop via COM
        // Write script to temporary file
        const tempScriptPath = join(tmpdir(), `photoshop-script-${Date.now()}.jsx`);
        try {
            await writeFile(tempScriptPath, script, 'utf8');
            // Use VBScript to execute the JSX script via COM
            const vbsScript = this.createVBSWrapper(tempScriptPath);
            const vbsPath = join(tmpdir(), `photoshop-vbs-${Date.now()}.vbs`);
            await writeFile(vbsPath, vbsScript, 'utf8');
            try {
                // Execute VBScript
                const { stdout, stderr } = await execAsync(`cscript //nologo "${vbsPath}"`);
                if (stderr) {
                    this.logger.warn('Script execution warning:', stderr);
                }
                // Parse result
                return this.parseResult(stdout);
            }
            finally {
                // Cleanup VBS file
                await unlink(vbsPath).catch(() => { });
            }
        }
        finally {
            // Cleanup JSX file
            await unlink(tempScriptPath).catch(() => { });
        }
    }
    createVBSWrapper(jsxPath) {
        return `
On Error Resume Next
Dim photoshopApp
Set photoshopApp = CreateObject("Photoshop.Application")

If Err.Number <> 0 Then
    WScript.Echo "ERROR: Failed to connect to Photoshop - " & Err.Description
    WScript.Quit 1
End If

' Execute the JSX script
Dim result
result = photoshopApp.DoJavaScript("$.evalFile('" & Replace("${jsxPath}", "\\", "\\\\") & "');")

If Err.Number <> 0 Then
    WScript.Echo "ERROR: " & Err.Description
    WScript.Quit 1
Else
    WScript.Echo result
End If
`.trim();
    }
    parseResult(output) {
        const trimmed = output.trim();
        // Check for error
        if (trimmed.startsWith('ERROR:')) {
            throw new Error(trimmed.substring(6).trim());
        }
        // Try to parse as JSON
        try {
            return JSON.parse(trimmed);
        }
        catch {
            // Return as string if not JSON
            return trimmed;
        }
    }
    async isPhotoshopRunning() {
        try {
            const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq Photoshop.exe"');
            return stdout.toLowerCase().includes('photoshop.exe');
        }
        catch (error) {
            return false;
        }
    }
    async launchPhotoshop(photoshopPath) {
        return new Promise((resolve, reject) => {
            this.logger.info(`Launching Photoshop: ${photoshopPath}`);
            const child = spawn(photoshopPath, [], {
                detached: true,
                stdio: 'ignore',
            });
            child.unref();
            // Wait a bit for Photoshop to start
            setTimeout(() => {
                resolve();
            }, 5000);
            child.on('error', (error) => {
                reject(new Error(`Failed to launch Photoshop: ${error.message}`));
            });
        });
    }
}
//# sourceMappingURL=windows-executor.js.map