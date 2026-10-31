import { Router } from "express";
import { checkAuth } from "../middleware/index.js";
import { ask, insights } from "../controllers/aiAnalytics.controller.js";

const router = Router();
router.use(checkAuth);
router.get("/:orgId/ai/insights", insights);
router.post("/:orgId/ai/ask", ask);
export default router;
