import { Router, type IRouter } from "express";
import healthRouter from "./health";
import templesRouter from "./temples";
import syncRouter from "./sync";

const router: IRouter = Router();

router.use(healthRouter);
router.use(templesRouter);
router.use(syncRouter);

export default router;
