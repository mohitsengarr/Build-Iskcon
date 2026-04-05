// ── Static temple project data (no API needed) ─────────────────────────────

export interface Temple {
  id: number;
  name: string;
  location: string;
  deity: string;
  description: string;
  status: string;
  phase: string;
  constructionProgress: number;
  fundraisingGoal: number;
  fundraisingRaised: number;
  startDate: string;
  expectedCompletion: string;
  projectLead: string;
  coverImage: string | null;
  donateUrl: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const TEMPLES: Temple[] = [
  {
    id: 1, name: "Temple of the Vedic Planetarium (TOVP)", location: "Mayapur, West Bengal, India",
    deity: "Sri Sri Radha Madhava", description: "Srila Prabhupada's most cherished project — one of the largest religious structures being built globally. The TOVP will house a Vedic planetarium demonstrating the cosmology described in the Srimad-Bhagavatam. Yajna Shala opened Feb 2026; grand opening celebration begins Nov 2027.",
    status: "construction", phase: "Interior marble, gold-leaf lattice & altar fit-out", constructionProgress: 85,
    fundraisingGoal: 100_000_000, fundraisingRaised: 85_000_000, startDate: "2010-01-01",
    expectedCompletion: "2027-11-01", projectLead: "TOVP Foundation",
    coverImage: null, donateUrl: "https://tovp.org/donate",
    latitude: 23.423, longitude: 88.388,
  },
  {
    id: 2, name: "ISKCON Delhi – Dwarka Temple", location: "Dwarka, New Delhi, India",
    deity: "Sri Sri Radha Parthasarathi", description: "A 2,00,000 sq-ft grand temple complex in southwest Delhi featuring a spiritual cultural center, Vedic museum, and community hall. Tile donations 94% committed (2,12,440 / 2,25,000 as of Nov 2025).",
    status: "construction", phase: "Tiling & interior finishing", constructionProgress: 55,
    fundraisingGoal: 25_000_000, fundraisingRaised: 14_000_000, startDate: "2021-06-01",
    expectedCompletion: "2026-12-31", projectLead: "ISKCON Delhi",
    coverImage: null, donateUrl: "https://iskcondwarka.org/donate",
    latitude: 28.592, longitude: 77.045,
  },
  {
    id: 3, name: "ISKCON Navi Mumbai – Kharghar", location: "Navi Mumbai, Maharashtra, India",
    deity: "Sri Sri Radha Madanmohan", description: "Inaugurated by PM Narendra Modi on 15 Jan 2025. A multi-purpose spiritual complex with temple, Ayurvedic Healing Centre, Bhaktivedanta College, Gaushala, and community facilities — now Asia's second-largest ISKCON temple.",
    status: "consecrated", phase: "Inaugurated", constructionProgress: 100,
    fundraisingGoal: 15_000_000, fundraisingRaised: 15_000_000, startDate: "2020-03-01",
    expectedCompletion: "2025-01-15", projectLead: "ISKCON Navi Mumbai",
    coverImage: null, donateUrl: "https://iskcon-navimumbai.org/donate",
    latitude: 19.047, longitude: 73.071,
  },
  {
    id: 4, name: "ISKCON Pune – New Vedic Cultural Center", location: "Pune, Maharashtra, India",
    deity: "Sri Sri Radha Vrindavan Chandra", description: "A state-of-the-art Vedic cultural center in one of India's largest university cities, designed for youth outreach and spiritual education.",
    status: "construction", phase: "Superstructure", constructionProgress: 38,
    fundraisingGoal: 20_000_000, fundraisingRaised: 8_500_000, startDate: "2022-01-01",
    expectedCompletion: "2027-06-30", projectLead: "ISKCON Pune NVCC",
    coverImage: null, donateUrl: "https://www.iskconpune.com/donate",
    latitude: 18.520, longitude: 73.856,
  },
  {
    id: 5, name: "ISKCON Parsippany Temple", location: "Parsippany, New Jersey, USA",
    deity: "Sri Sri Radha Govinda", description: "New temple in the heart of Northern New Jersey, replacing the Towaco location to serve the growing congregation. Steel framing and radiant floor heating installed. Opening in 2026.",
    status: "construction", phase: "Steel framing & interior build-out", constructionProgress: 65,
    fundraisingGoal: 8_000_000, fundraisingRaised: 4_500_000, startDate: "2022-06-01",
    expectedCompletion: "2026-12-31", projectLead: "ISKCON of New Jersey",
    coverImage: null, donateUrl: "https://www.iskconofnewjersey.org/donate",
    latitude: 40.857, longitude: -74.417,
  },
  {
    id: 6, name: "ISKCON Nairobi – Hare Krishna Land", location: "Nairobi, Kenya",
    deity: "Sri Sri Radha Banke Bihari", description: "East African headquarters expansion — a multi-story spiritual and cultural center serving as the regional coordination hub for ISKCON in Africa.",
    status: "planning", phase: "Architectural design", constructionProgress: 10,
    fundraisingGoal: 8_000_000, fundraisingRaised: 2_500_000, startDate: "2024-01-01",
    expectedCompletion: "2029-12-31", projectLead: "ISKCON East Africa",
    coverImage: null, donateUrl: "https://www.iskconnairobi.org/donate",
    latitude: -1.286, longitude: 36.817,
  },
  {
    id: 7, name: "ISKCON Melbourne Vedic Center", location: "Melbourne, Australia",
    deity: "Sri Sri Radha Ballabha", description: "Expansion of the Melbourne temple complex with a new Vedic cultural center, Govinda's restaurant facility, and community outreach programs.",
    status: "planning", phase: "Fundraising & permits", constructionProgress: 5,
    fundraisingGoal: 12_000_000, fundraisingRaised: 3_200_000, startDate: "2025-01-01",
    expectedCompletion: "2030-06-30", projectLead: "ISKCON Melbourne",
    coverImage: null, donateUrl: "https://www.iskconmelbourne.com.au/donate",
    latitude: -37.814, longitude: 144.963,
  },
  {
    id: 8, name: "ISKCON Greater Noida (Gaur Dham)", location: "Greater Noida, Uttar Pradesh, India",
    deity: "Sri Sri Radha Govinda", description: "Emerging center in the NCR corridor with active expansion, community programs, and temple construction in the growing suburban region.",
    status: "construction", phase: "Temple structure rising", constructionProgress: 40,
    fundraisingGoal: 10_000_000, fundraisingRaised: 4_500_000, startDate: "2021-09-01",
    expectedCompletion: "2027-03-31", projectLead: "ISKCON Greater Noida",
    coverImage: null, donateUrl: "https://www.iskcongreaternoida.com/donate",
    latitude: 28.474, longitude: 77.504,
  },
  {
    id: 9, name: "ISKCON Vrindavan Chandrodaya Mandir", location: "Vrindavan, Uttar Pradesh, India",
    deity: "Sri Sri Krishna Balaram", description: "A soaring 700-ft tower temple envisioned as the tallest religious structure in India. Phase 1 inauguration planned March 2026. Complex includes Krishna Lila Park, Heritage Museum, and retreat facilities. ₹120 crore raised.",
    status: "construction", phase: "Phase 1 inauguration prep, tower construction ongoing", constructionProgress: 65,
    fundraisingGoal: 40_000_000, fundraisingRaised: 28_500_000, startDate: "2014-01-01",
    expectedCompletion: "2027-12-31", projectLead: "ISKCON Bangalore",
    coverImage: null, donateUrl: "https://vcm.org.in/sqft-seva-campaign",
    latitude: 27.583, longitude: 77.696,
  },
  {
    id: 10, name: "ISKCON Bangalore – Hare Krishna Hill Expansion", location: "Bangalore, Karnataka, India",
    deity: "Sri Sri Radha Krishna Chandra", description: "Major expansion of the iconic Hare Krishna Hill complex, adding new prasadam halls, cultural museum, and pilgrim amenities. Home of the Akshaya Patra Foundation.",
    status: "finishing", phase: "Interior fit-out", constructionProgress: 88,
    fundraisingGoal: 18_000_000, fundraisingRaised: 17_200_000, startDate: "2019-06-01",
    expectedCompletion: "2025-06-30", projectLead: "ISKCON Bangalore",
    coverImage: null, donateUrl: "https://www.iskconbangalore.org/donate",
    latitude: 13.010, longitude: 77.551,
  },
  {
    id: 11, name: "ISKCON Budapest – Krishna Valley Expansion", location: "Somogyvamos, Hungary",
    deity: "Sri Sri Radha Syamasundara", description: "Expansion of one of Europe's most successful self-sustaining spiritual eco-village communities, including new guest facilities and agricultural center.",
    status: "planning", phase: "Master plan approval", constructionProgress: 8,
    fundraisingGoal: 5_000_000, fundraisingRaised: 1_800_000, startDate: "2025-06-01",
    expectedCompletion: "2030-12-31", projectLead: "ISKCON Hungary",
    coverImage: null, donateUrl: "https://www.iskcon.hu/donate",
    latitude: 46.695, longitude: 17.390,
  },
  {
    id: 12, name: "ISKCON Sao Paulo Expansion", location: "Sao Paulo, Brazil",
    deity: "Sri Sri Radha Govinda", description: "Expansion of the largest Latin American ISKCON temple to accommodate the growing Brazilian congregation with new cultural programs wing.",
    status: "planning", phase: "Design & fundraising", constructionProgress: 12,
    fundraisingGoal: 6_000_000, fundraisingRaised: 1_500_000, startDate: "2025-01-01",
    expectedCompletion: "2029-12-31", projectLead: "ISKCON Sao Paulo",
    coverImage: null, donateUrl: "https://www.iskconsp.com.br/donate",
    latitude: -23.543, longitude: -46.654,
  },
  {
    id: 13, name: "ISKCON Mumbai Juhu – Prasadam Complex", location: "Mumbai, Maharashtra, India",
    deity: "Sri Sri Radha Rasabihari", description: "New prasadam distribution and community facility at the iconic Juhu temple, expanding capacity for the massive daily food distribution program.",
    status: "finishing", phase: "Equipment installation", constructionProgress: 92,
    fundraisingGoal: 8_000_000, fundraisingRaised: 7_800_000, startDate: "2020-01-01",
    expectedCompletion: "2025-04-30", projectLead: "ISKCON Mumbai Juhu",
    coverImage: null, donateUrl: "https://www.iskconmumbai.com/donate",
    latitude: 19.098, longitude: 72.826,
  },
  {
    id: 14, name: "ISKCON Hyderabad Kokapet Temple", location: "Kokapet, Hyderabad, India",
    deity: "Sri Sri Radha Madanmohan", description: "A large new temple complex in the booming IT corridor of Hyderabad, designed to serve the city's tech professional community.",
    status: "construction", phase: "Foundation complete, walls rising", constructionProgress: 35,
    fundraisingGoal: 22_000_000, fundraisingRaised: 10_000_000, startDate: "2022-03-01",
    expectedCompletion: "2028-06-30", projectLead: "ISKCON Hyderabad",
    coverImage: null, donateUrl: "https://www.iskconhyderabad.com/donate",
    latitude: 17.415, longitude: 78.355,
  },
  {
    id: 15, name: "ISKCON Silicon Valley Temple", location: "San Jose, California, USA",
    deity: "Sri Sri Radha Madan Mohan", description: "New temple and cultural center serving the tech corridor. A 501(c)(3) non-profit with strong youth and professional outreach.",
    status: "construction", phase: "Interior construction", constructionProgress: 60,
    fundraisingGoal: 15_000_000, fundraisingRaised: 11_000_000, startDate: "2020-09-01",
    expectedCompletion: "2026-06-30", projectLead: "ISKCON Silicon Valley",
    coverImage: null, donateUrl: "https://iskconsv.com/donate",
    latitude: 37.335, longitude: -121.893,
  },
  {
    id: 16, name: "ISKCON London – Soho Renovation", location: "London, England, UK",
    deity: "Sri Sri Radha Londonisvara", description: "Historic renovation of the 10 Soho Street temple that has served as a spiritual sanctuary for 50+ years in London's West End.",
    status: "finishing", phase: "Final renovation phase", constructionProgress: 85,
    fundraisingGoal: 4_000_000, fundraisingRaised: 3_600_000, startDate: "2023-01-01",
    expectedCompletion: "2025-09-30", projectLead: "ISKCON London",
    coverImage: null, donateUrl: "https://iskcon.london/donate",
    latitude: 51.515, longitude: -0.133,
  },
];

// Pre-computed stats
const activeStatuses = ["planning", "construction", "finishing"];
const active = TEMPLES.filter((t) => activeStatuses.includes(t.status));
const templesByStatus: Record<string, number> = {};
for (const t of TEMPLES) {
  templesByStatus[t.status] = (templesByStatus[t.status] || 0) + 1;
}

export const TEMPLE_STATS = {
  totalTemples: TEMPLES.length,
  activeProjects: active.length,
  totalFundraisingGoal: TEMPLES.reduce((s, t) => s + t.fundraisingGoal, 0),
  totalFundraisingRaised: TEMPLES.reduce((s, t) => s + t.fundraisingRaised, 0),
  averageProgress: Math.round(TEMPLES.reduce((s, t) => s + t.constructionProgress, 0) / TEMPLES.length),
  templesByStatus,
  recentUpdates: [] as unknown[],
};
