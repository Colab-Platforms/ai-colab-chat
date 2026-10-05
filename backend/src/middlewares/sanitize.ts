import { Request, Response, NextFunction } from "express";
import xss from "xss";

function sanitizeValue(value: any): any {
    if (typeof value === "string") return xss(value);
    if (Array.isArray(value)) return value.map(sanitizeValue);
    if (value && typeof value === "object") return sanitizeObject(value);
    return value;
}

function sanitizeObject(obj: Record<string, any>): Record<string, any> {
    for (const key of Object.keys(obj)) {
        obj[key] = sanitizeValue(obj[key]);
    }
    return obj;
}

/**
 * Source code must reach the code workspace byte-for-byte — xss() strips
 * attributes like className/onClick and escapes unknown tags, which silently
 * corrupts JSX/HTML. Code is only ever rendered as editor text or run inside
 * the sandboxed (cross-origin) preview iframe, never injected as HTML.
 *
 * Exempted: the code-workspace REST API, and the prompt of a chat turn sent
 * with the "Code" pill (chatType CODE) — the user often pastes code there.
 * Also the GitHub and Vercel integrations, which forward user input to those
 * APIs verbatim (repo descriptions, build commands, env var values).
 */
function isCodeWorkspaceBody(req: Request): boolean {
    const url = req.originalUrl || req.url;
    if (url.startsWith("/api/code-projects/")) return true;
    // Repo descriptions and pulled file names must not be HTML-escaped either.
    if (url.startsWith("/api/github/")) return true;
    // Build commands (`vite build && cp -r public dist`) and env values must not be escaped.
    if (url.startsWith("/api/vercel/")) return true;
    return (
        req.method === "POST" &&
        /^\/api\/chats\/\d+\/send(?:\?|$)/.test(url) &&
        req.body?.chatType === "CODE"
    );
}

export default function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction) {
    try {
        if (req.body && !isCodeWorkspaceBody(req)) sanitizeObject(req.body);
        if (req.query) sanitizeObject(req.query as any);
        if (req.params) sanitizeObject(req.params as any);
    } catch (e) {
        console.warn("Sanitize middleware error:", e);
    }
    next();
}
