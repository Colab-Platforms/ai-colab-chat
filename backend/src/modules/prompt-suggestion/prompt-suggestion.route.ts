import { Router } from "express";
import * as controller from "./prompt-suggestion.controller.js";

const router = Router();

// Public: plain starter text, also usable on the logged-out /try page.
router.get("/", controller.listLatest);

export default router;
