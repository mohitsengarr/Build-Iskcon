import { Router, type IRouter } from "express";
import healthRouter from "./health";
import templesRouter from "./temples";
import syncRouter from "./sync";
import socialRouter from "./social";

const router: IRouter = Router();

router.use(healthRouter);
router.use(templesRouter);
router.use(syncRouter);
router.use(socialRouter);

export default router;
