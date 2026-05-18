import { Logger } from '../utils/logger.js';
export class PhotoshopAPIFactory {
    logger;
    connection;
    constructor(connection) {
        this.logger = new Logger('PhotoshopAPIFactory');
        this.connection = connection;
    }
    async createAPI() {
        const info = this.connection.getPhotoshopInfo();
        if (!info) {
            throw new Error('Photoshop info not available. Please detect Photoshop first.');
        }
        // Determine which API to use based on version
        const apiType = this.determineAPIType(info.version);
        this.logger.info(`Creating ${apiType} API for Photoshop version ${info.version}`);
        if (apiType === 'UXP') {
            return new UXPPhotoshopAPI(this.connection);
        }
        else {
            return new ExtendScriptPhotoshopAPI(this.connection);
        }
    }
    determineAPIType(version) {
        // IMPORTANT: When running scripts via AppleScript/COM, we can only use ExtendScript
        // UXP is only available for plugins, not for external script execution
        // Therefore, we always use ExtendScript for external automation
        this.logger.debug(`Using ExtendScript for version ${version} (UXP not available for external scripting)`);
        return 'ExtendScript';
    }
}
/**
 * UXP-based API for modern Photoshop (23.5+)
 * NOTE: UXP is not available for external script execution via AppleScript/COM
 * This class is kept for future plugin-based implementation
 */
class UXPPhotoshopAPI {
    connection;
    constructor(connection) {
        this.connection = connection;
    }
    async executeScript(script) {
        // UXP cannot be executed externally via AppleScript/COM
        // Fall back to ExtendScript
        return await this.connection.executeScript(script);
    }
    getAPIType() {
        return 'UXP';
    }
}
/**
 * ExtendScript-based API for legacy Photoshop (< 23.5)
 */
class ExtendScriptPhotoshopAPI {
    connection;
    constructor(connection) {
        this.connection = connection;
    }
    async executeScript(script) {
        // Wrap script in error handling
        const wrappedScript = this.wrapInErrorHandling(script);
        return await this.connection.executeScript(wrappedScript);
    }
    wrapInErrorHandling(script) {
        // ExtendScript has no JSON object, so the result is serialized via
        // toSource()/String(). Errors are surfaced with an "ERROR:" prefix
        // that platform executors translate back into thrown Errors.
        //
        // Ruler and type units are temporarily forced to pixels/points so that
        // every DOM API that accepts plain numbers (translate, textItem.size,
        // textItem.position, doc.crop bounds, etc.) behaves consistently
        // regardless of the user's Photoshop preferences. The user's original
        // preferences are restored in the finally block.
        return `
(function() {
  var __originalRulerUnits = null;
  var __originalTypeUnits = null;
  try { __originalRulerUnits = app.preferences.rulerUnits; } catch (e) {}
  try { __originalTypeUnits = app.preferences.typeUnits; } catch (e) {}

  try {
    try { app.preferences.rulerUnits = Units.PIXELS; } catch (e) {}
    try { app.preferences.typeUnits = TypeUnits.POINTS; } catch (e) {}

    var result = (function() {
      ${script}
    })();
    if (typeof result === 'object' && result !== null) {
      return result.toSource ? result.toSource() : String(result);
    }
    return String(result);
  } catch (error) {
    return 'ERROR: ' + (error.message || String(error));
  } finally {
    try { if (__originalRulerUnits !== null) app.preferences.rulerUnits = __originalRulerUnits; } catch (e) {}
    try { if (__originalTypeUnits !== null) app.preferences.typeUnits = __originalTypeUnits; } catch (e) {}
  }
})();
    `.trim();
    }
    getAPIType() {
        return 'ExtendScript';
    }
}
//# sourceMappingURL=photoshop-api.js.map