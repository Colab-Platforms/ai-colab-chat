import * as express from "express";
import type { PlanContext } from "@/modules/plan-access/planAccess.service.js";

declare global {
    namespace Express {
        interface User {
            id: number;
            role: "USER" | "ADMIN" | "SUPERADMIN";
            timezone: string;
        }

        interface Request {
            user?: User;
            planContext?: PlanContext;
        }
    }
}