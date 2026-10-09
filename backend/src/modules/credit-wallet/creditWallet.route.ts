import { Router } from "express";
import { auth } from "@/middlewares/authMiddleware.js";
import * as creditWalletController from "./creditWallet.controller.js";

const router = Router();

router.get("/", auth("USER", "ADMIN", "SUPERADMIN"), creditWalletController.getCreditWallet);
router.get("/transactions", auth("USER", "ADMIN", "SUPERADMIN"), creditWalletController.getCreditTransactions);
router.get("/pricing", auth("USER", "ADMIN", "SUPERADMIN"), creditWalletController.getCreditPricing);
// Pay-as-you-go: no plan gate — any authenticated user can top up video credits.
router.post("/topup", auth("USER", "ADMIN", "SUPERADMIN"), creditWalletController.createTopUp);

export default router;
