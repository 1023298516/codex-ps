/**
 * Helper functions for ExtendScript API
 * ExtendScript is the legacy scripting API for Photoshop
 */
/**
 * Common ExtendScript snippets
 */
export declare const ExtendScriptSnippets: {
    /**
     * Get Photoshop application info
     */
    getAppInfo: () => string;
    /**
     * Create a new document
     */
    newDocument: (width: number, height: number, resolution?: number, colorMode?: string) => string;
    /**
     * Get active document info
     */
    getDocumentInfo: () => string;
    /**
     * Create a text layer
     */
    createTextLayer: (text: string, x?: number, y?: number, fontSize?: number) => string;
    /**
     * Place an image file as a layer
     */
    placeImage: (filePath: string, x?: number, y?: number) => string;
    /**
     * Open an image file as a new document
     */
    openImage: (filePath: string) => string;
    /**
     * Save document as PSD
     */
    saveAsPSD: (path: string) => string;
    /**
     * Save document as JPEG
     */
    saveAsJPEG: (path: string, quality?: number) => string;
    /**
     * Save document as PNG
     */
    saveAsPNG: (path: string) => string;
    /**
     * Close active document
     */
    closeDocument: (save?: boolean) => string;
    /**
     * Create a new layer
     */
    newLayer: (name?: string) => string;
    /**
     * Delete active layer
     */
    deleteLayer: () => string;
    /**
     * Fill the active layer with a solid RGB color.
     *
     * ArtLayer has no fillPath() method (that exists on PathItem only).
     * The correct approach is Selection.fill(): preserve any existing
     * selection, otherwise select the whole canvas, fill, then deselect.
     * Background / fully-locked layers cannot be filled, so fail clearly.
     */
    fillLayer: (red: number, green: number, blue: number) => string;
    /**
     * Resize image
     */
    resizeImage: (width: number, height: number) => string;
    /**
     * Get all layer names
     */
    getLayerNames: () => string;
    /**
     * Select layer by name
     */
    selectLayer: (name: string) => string;
    /**
     * Scale active layer to fit document (maintain aspect ratio)
     */
    fitLayerToDocument: (fillDocument?: boolean) => string;
    /**
     * Scale active layer by percentage
     */
    scaleLayer: (scalePercent: number, centerAnchor?: boolean) => string;
    /**
     * Move/translate active layer
     */
    moveLayer: (deltaX: number, deltaY: number) => string;
    /**
     * Rotate active layer
     */
    rotateLayer: (degrees: number) => string;
    /**
     * Set layer opacity
     */
    setLayerOpacity: (opacity: number) => string;
    /**
     * Set layer blend mode
     */
    setLayerBlendMode: (blendMode: string) => string;
    /**
     * Set layer visibility
     */
    setLayerVisibility: (visible: boolean) => string;
    /**
     * Lock/unlock layer
     */
    setLayerLocked: (locked: boolean) => string;
    /**
     * Rename active layer
     */
    renameLayer: (newName: string) => string;
    /**
     * Duplicate active layer
     */
    duplicateLayer: (newName?: string) => string;
    /**
     * Merge visible layers
     */
    mergeVisibleLayers: () => string;
    /**
     * Flatten image (merge all layers)
     */
    flattenImage: () => string;
    /**
     * Apply Gaussian Blur filter
     */
    applyGaussianBlur: (radius: number) => string;
    /**
     * Apply Unsharp Mask (sharpen)
     */
    applyUnsharpMask: (amount: number, radius: number, threshold: number) => string;
    /**
     * Apply Add Noise filter
     */
    applyAddNoise: (amount: number, distribution: string, monochromatic: boolean) => string;
    /**
     * Apply Motion Blur filter
     */
    applyMotionBlur: (angle: number, radius: number) => string;
    /**
     * Adjust brightness and contrast
     */
    adjustBrightnessContrast: (brightness: number, contrast: number) => string;
    /**
     * Adjust hue, saturation and lightness on the active layer.
     *
     * ArtLayer has no DOM method for Hue/Saturation - adjustColorBalance()
     * is for Color Balance (cyan/red, magenta/green, yellow/blue) and would
     * throw here. The correct path is the "HStr" Action Descriptor which
     * matches the Image > Adjustments > Hue/Saturation menu command.
     */
    adjustHueSaturation: (hue: number, saturation: number, lightness: number) => string;
    /**
     * Auto levels adjustment
     */
    autoLevels: () => string;
    /**
     * Auto contrast adjustment
     */
    autoContrast: () => string;
    /**
     * Desaturate (convert to grayscale without changing color mode)
     */
    desaturate: () => string;
    /**
     * Invert colors
     */
    invert: () => string;
    /**
     * Crop document
     */
    cropDocument: (left: number, top: number, right: number, bottom: number) => string;
    /**
     * Set text layer font
     */
    setTextFont: (fontName: string, fontSize?: number) => string;
    /**
     * Set text color
     */
    setTextColor: (red: number, green: number, blue: number) => string;
    /**
     * Set text alignment
     */
    setTextAlignment: (alignment: string) => string;
    /**
     * Update text content
     */
    updateTextContent: (newText: string) => string;
    /**
     * Create rectangular selection
     */
    selectRectangle: (left: number, top: number, right: number, bottom: number) => string;
    /**
     * Select all
     */
    selectAll: () => string;
    /**
     * Deselect
     */
    deselect: () => string;
    /**
     * Invert selection
     */
    invertSelection: () => string;
    /**
     * Create layer mask from selection
     */
    createLayerMask: () => string;
    /**
     * Delete layer mask
     */
    deleteLayerMask: () => string;
    /**
     * Apply layer mask
     */
    applyLayerMask: () => string;
    /**
     * Play an action from Actions palette
     */
    playAction: (actionName: string, actionSetName: string) => string;
    /**
     * Execute custom JavaScript code
     */
    executeCustomScript: (code: string) => string;
    /**
     * Rasterize active layer
     */
    rasterizeLayer: () => string;
    /**
     * Undo last operation (step backward in history)
     */
    undo: (steps?: number) => string;
    /**
     * Redo operation (step forward in history)
     */
    redo: (steps?: number) => string;
    /**
     * Get history states
     */
    getHistoryStates: () => string;
    /**
     * Move layer to specific position (reorder)
     */
    moveLayerToPosition: (targetLayerName: string, position: string) => string;
    /**
     * Move layer to top of layer stack
     */
    moveLayerToTop: () => string;
    /**
     * Move layer to bottom of layer stack
     */
    moveLayerToBottom: () => string;
    /**
     * Move layer up one position
     */
    moveLayerUp: () => string;
    /**
     * Move layer down one position
     */
    moveLayerDown: () => string;
};
/**
 * Generate ExtendScript code with error handling
 */
export declare function generateExtendScript(code: string): string;
//# sourceMappingURL=extendscript.d.ts.map