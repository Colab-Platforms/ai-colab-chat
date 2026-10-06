import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as c from "./content.controller.js";

const router = Router();
const authed = auth("USER", "ADMIN", "SUPERADMIN");

router.get("/items", authed, c.listItems);
router.get("/items/:id", authed, c.getItem);
router.patch("/items/:id", authed, c.updateItem);
router.post("/items/:id/regenerate", authed, c.regenerateItem);
router.post("/items/:id/approve", authed, c.approveItem);
router.post("/items/:id/versions/:version/restore", authed, c.restoreVersion);
router.delete("/items/:id", authed, c.deleteItem);

router.get("/brand-kit", authed, c.getBrandKit);
router.put("/brand-kit", authed, c.saveBrandKit);
router.delete("/brand-kit/:id", authed, c.deleteBrandKit);

router.get("/products", authed, c.listProducts);
router.post("/products", authed, c.createProduct);
router.put("/products/:id", authed, c.updateProduct);
router.delete("/products/:id", authed, c.deleteProduct);

export default router;
