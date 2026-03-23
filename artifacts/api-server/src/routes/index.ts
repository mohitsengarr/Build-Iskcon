import { Router, type IRouter } from "express";
import healthRouter from "./health";
import templesRouter from "./temples";
import syncRouter from "./sync";
import socialRouter from "./social";
import insightsRouter from "./insights";

const router: IRouter = Router();

router.use(healthRouter);
router.use(templesRouter);
router.use(syncRouter);
router.use(socialRouter);
router.use(insightsRouter);

export default router;
