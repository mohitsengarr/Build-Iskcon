import { Router, type IRouter } from "express";
import healthRouter from "./health";
import templesRouter from "./temples";

const router: IRouter = Router();

router.use(healthRouter);
router.use(templesRouter);

export default router;
