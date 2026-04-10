import { Router, type IRouter } from "express";
import healthRouter from "./health";
import templesRouter from "./temples";
import syncRouter from "./sync";
import socialRouter from "./social";
import insightsRouter from "./insights";
import videosRouter from "./videos";
import bhagwathamRouter from "./bhagwatham";

const router: IRouter = Router();

router.use(healthRouter);
router.use(templesRouter);
router.use(syncRouter);
router.use(socialRouter);
router.use(insightsRouter);
router.use(videosRouter);
router.use(bhagwathamRouter);

export default router;
