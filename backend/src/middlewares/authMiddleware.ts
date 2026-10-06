import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const auth = (...allowedRoles: Array<"USER" | "ADMIN" | "SUPERADMIN">) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                sendResponse(res, false, null, "Unauthorized: Token missing", STATUS_CODES.UNAUTHORIZED);
                return;
            }

            const token = authHeader.split(" ")[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as Express.User;

            req.user = decoded;

            if (allowedRoles.length && !allowedRoles.includes(decoded.role)) {
                sendResponse(res, false, null, "Forbidden: You don't have access", STATUS_CODES.FORBIDDEN);
                return;
            }

            next();
        } catch (err: any) {
            console.error("Auth Middleware Error:", err);
            sendResponse(res, false, null, "Unauthorized: " + err.message, STATUS_CODES.UNAUTHORIZED);
            return;
        }
    };
};

// Attaches req.user when a valid Bearer token is present, but never blocks the
// request - for public endpoints that want to associate the caller when logged in.
export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            const token = authHeader.split(" ")[1];
            req.user = jwt.verify(token, process.env.JWT_SECRET!) as Express.User;
        } catch {
            // Invalid/expired token on a public route - proceed unauthenticated.
        }
    }
    next();
};