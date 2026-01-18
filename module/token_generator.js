
const PIXELS_PER_MM = 20;

export class TokenGenerator {

    /**
     * Generates a token image for the given name and size.
     * @param {string} name - The text to display on the token.
     * @param {Object} size - The size in inches {width, height}.
     * @returns {Promise<string>} - The path to the generated image file.
     */
    static async generate(name, size) {
        if (!size) return null;

        const widthMm = size.width * 25.4;
        const heightMm = size.height * 25.4;

        // Create canvas
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const widthPx = widthMm * PIXELS_PER_MM;
        const heightPx = heightMm * PIXELS_PER_MM;

        canvas.width = widthPx;
        canvas.height = heightPx;

        // Draw Token
        this._drawToken(ctx, name, widthPx, heightPx);

        // Convert to Blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const file = new File([blob], `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`, { type: "image/png" });

        // Upload
        const uploadDir = "generated-tokens";
        try {
            // Create directory if not exists? FilePicker doesn't easily create dirs via API sometimes, 
            // but let's try to upload to a folder. 
            // We usually check if source exists.
            // For now, let's try "data" source.
            const result = await FilePicker.upload("data", uploadDir, file, { bucket: null });
            return result.path;
        } catch (e) {
            console.error("Token Generation | Upload failed:", e);
            // Retry at root if folder fails? Or just log error.
            // If folder doesn't exist, FilePicker might fail. 
            // Users might need to create the folder manually or we rely on it creating it?
            // "If the target directory does not exist, it will be marked as invalid."
            try {
                await FilePicker.createDirectory("data", uploadDir);
                const result = await FilePicker.upload("data", uploadDir, file, { bucket: null });
                return result.path;
            } catch (err2) {
                console.error("Token Generation | Could not create directory or upload:", err2);
            }
            return null;
        }
    }

    static _drawToken(ctx, name, widthPx, heightPx) {
        const baseColor = '#333333';
        const textColor = '#ffd700';
        const hasRing = true;  // Default to ring for style

        const isCircle = Math.abs(widthPx - heightPx) < 1;

        // 1. Draw Base
        ctx.fillStyle = baseColor;
        if (isCircle) {
            ctx.beginPath();
            ctx.arc(widthPx / 2, heightPx / 2, widthPx / 2, 0, 2 * Math.PI);
            ctx.fill();
        } else {
            // Ellipse/Oval
            ctx.beginPath();
            ctx.ellipse(widthPx / 2, heightPx / 2, widthPx / 2, heightPx / 2, 0, 0, 2 * Math.PI);
            ctx.fill();
        }

        // 2. Draw Ring
        if (hasRing) {
            ctx.lineWidth = 2 * PIXELS_PER_MM;
            ctx.strokeStyle = textColor;
            const inset = ctx.lineWidth / 2;

            if (isCircle) {
                ctx.beginPath();
                ctx.arc(widthPx / 2, heightPx / 2, widthPx / 2 - inset, 0, 2 * Math.PI);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.ellipse(widthPx / 2, heightPx / 2, widthPx / 2 - inset, heightPx / 2 - inset, 0, 0, 2 * Math.PI);
                ctx.stroke();
            }
        }

        // 3. Draw Text
        const text = (name || "Unit").trim();
        if (!text) return;

        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const minDim = Math.min(widthPx, heightPx);
        let fontSize = minDim * 0.3;
        ctx.font = `bold ${fontSize}px sans-serif`;

        const words = text.split(/\s+/).filter(w => w.length > 0);
        const lineHeight = fontSize * 1.2;
        const totalTextHeight = words.length * lineHeight;

        // Margin
        const margin = minDim * 0.1;
        const maxW = widthPx - (hasRing ? 4 * PIXELS_PER_MM : margin * 2);
        const maxH = heightPx - (hasRing ? 4 * PIXELS_PER_MM : margin * 2);

        // Fit text
        let maxWidth = 0;
        words.forEach(word => {
            const w = ctx.measureText(word).width;
            if (w > maxWidth) maxWidth = w;
        });

        let scale = 1;
        if (maxWidth > maxW) scale = Math.min(scale, maxW / maxWidth);
        if (totalTextHeight > maxH) scale = Math.min(scale, maxH / totalTextHeight);

        fontSize *= scale;
        ctx.font = `bold ${fontSize}px sans-serif`;

        const finalLineHeight = fontSize * 1.2;
        const startY = (heightPx - (words.length * finalLineHeight)) / 2 + (finalLineHeight / 2);

        words.forEach((word, i) => {
            ctx.fillText(word, widthPx / 2, startY + (i * finalLineHeight));
        });
    }
}
