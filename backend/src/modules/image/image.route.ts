import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as imageController from "./image.controller.js";

const router = Router();

router.get("/", auth("USER", "ADMIN", "SUPERADMIN"), imageController.listImages);
router.get("/:id", auth("USER", "ADMIN", "SUPERADMIN"), imageController.getImageById);
router.delete("/:id", auth("USER", "ADMIN", "SUPERADMIN"), imageController.deleteImage);

export default router;
