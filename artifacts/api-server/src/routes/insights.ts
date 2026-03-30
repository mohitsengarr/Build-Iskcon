import { Router } from "express";

const router = Router();

router.get("/insights/regional", (_req, res) => {
  res.json({
    summary: {
      totalProjects: 16,
      totalInvestment: "$338M",
      totalRaised: "$214M",
      fundingPct: 63,
      regionsActive: 5,
      constructionCount: 9,
      planningCount: 4,
      completedCount: 3,
    },
    projectsByRegion: [
      { region: "South Asia", count: 10, investment: 258, raised: 176, fundingPct: 68 },
      { region: "Americas", count: 3, investment: 51, raised: 26, fundingPct: 51 },
      { region: "Europe", count: 2, investment: 9, raised: 5, fundingPct: 60 },
      { region: "Africa", count: 1, investment: 8, raised: 3, fundingPct: 31 },
    ],
    topCities: [
      { city: "Mumbai", region: "South Asia", projects: 2, investment: "$23M", status: "Active Construction" },
      { city: "Delhi", region: "South Asia", projects: 1, investment: "$25M", status: "Active Construction" },
      { city: "Mayapur", region: "South Asia", projects: 1, investment: "$100M", status: "Active Construction" },
      { city: "Hyderabad", region: "South Asia", projects: 1, investment: "$22M", status: "Active Construction" },
    ],
    upcomingVisions: [],
    narratives: [],
    generatedAt: new Date().toISOString(),
  });
});

router.get("/insights/components", (_req, res) => {
  res.json({ insights: [] });
});

export default router;
