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
    deity: "Sri Sri Radha Madhava", description: "Srila Prabhupada's most cherished project — one of the largest religious structures being built globally. The TOVP will house a Vedic planetarium demonstrating the cosmology described in the Srimad-Bhagavatam.",
    status: "construction", phase: "Interior finishing & dome work", constructionProgress: 78,
    fundraisingGoal: 100_000_000, fundraisingRaised: 82_000_000, startDate: "2010-01-01",
    expectedCompletion: "2025-12-31", projectLead: "TOVP Foundation",
    coverImage: null, donateUrl: "https://tovp.org/donate",
    latitude: 23.423, longitude: 88.388,
  },
  {
    id: 2, name: "ISKCON Delhi – Dwarka Temple", location: "Dwarka, New Delhi, India",
    deity: "Sri Sri Radha Parthasarathi", description: "A grand temple complex in southwest Delhi featuring a spiritual cultural center, Vedic museum, and community hall. Runs Food For Life feeding 7 crore+ people.",
    status: "construction", phase: "Structural construction", constructionProgress: 45,
    fundraisingGoal: 25_000_000, fundraisingRaised: 12_000_000, startDate: "2021-06-01",
    expectedCompletion: "2027-03-31", projectLead: "ISKCON Delhi",
    coverImage: null, donateUrl: "https://iskcondwarka.org/donate",
    latitude: 28.592, longitude: 77.045,
  },
  {
    id: 3, name: "ISKCON Navi Mumbai – Kharghar", location: "Navi Mumbai, Maharashtra, India",
    deity: "Sri Sri Radha Madan Mohan", description: "A magnificent 8-acre spiritual complex inaugurated by PM Narendra Modi on January 15, 2025 at a cost of ₹170 crore. Features a grand temple hall, Ayurvedic center, guesthouse, and community facilities serving the rapidly growing Navi Mumbai region.",
    status: "consecrated", phase: "Completed — inaugurated by PM Modi (January 2025)", constructionProgress: 100,
    fundraisingGoal: 20_500_000, fundraisingRaised: 20_500_000, startDate: "2020-03-01",
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
    deity: "Sri Sri Radha Govinda", description: "An ambitious temple construction project serving the large Indian-American congregation in the New Jersey / New York metro area. Steel framing delivered and structural construction underway with a planned opening in 2026. Features sponsor-a-square-foot program.",
    status: "construction", phase: "Steel framing & structural construction", constructionProgress: 55,
    fundraisingGoal: 30_000_000, fundraisingRaised: 14_000_000, startDate: "2022-06-01",
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
    deity: "Sri Sri Krishna Balaram", description: "A soaring tower temple envisioned as one of the tallest religious structures in India, located in the holy land of Lord Krishna.",
    status: "construction", phase: "Tower construction", constructionProgress: 52,
    fundraisingGoal: 40_000_000, fundraisingRaised: 25_000_000, startDate: "2014-01-01",
    expectedCompletion: "2027-12-31", projectLead: "ISKCON Vrindavan",
    coverImage: null, donateUrl: "https://iskconvrindavan.com/donate",
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
  {
    id: 17, name: "ISKCON Dumdum – Dayal Nitai Gaura Sundar Temple", location: "Dum Dum, Kolkata, West Bengal, India",
    deity: "Sri Sri Dayal Nitai Gaura Sundar", description: "Newly inaugurated temple serving North Kolkata, consecrated on January 3, 2026 during Pushya Abhishek celebrations. Strategically located near Netaji Subhas Chandra Bose International Airport, it fulfills Srila Prabhupada's vision of ten ISKCON temples in Kolkata.",
    status: "consecrated", phase: "Completed — inaugurated January 2026", constructionProgress: 100,
    fundraisingGoal: 3_000_000, fundraisingRaised: 3_000_000, startDate: "2021-01-01",
    expectedCompletion: "2026-01-03", projectLead: "ISKCON Dumdum",
    coverImage: null, donateUrl: "https://iskcondumdum.com",
    latitude: 22.648, longitude: 88.398,
  },
  {
    id: 18, name: "ISKCON Kurukshetra – Sri Krishna Arjuna Rath Mandir", location: "Kurukshetra, Haryana, India",
    deity: "Sri Sri Krishna-Arjuna", description: "A unique 6-acre chariot-shaped temple standing at the sacred site where the Bhagavad-gita was spoken. The foundation and main structure are complete with dome, interior, and altar finishing work underway. Over 1,200 donors have contributed ₹120 crore toward this dream project.",
    status: "finishing", phase: "Dome, interior finishing & altar work", constructionProgress: 78,
    fundraisingGoal: 18_000_000, fundraisingRaised: 14_500_000, startDate: "2018-06-01",
    expectedCompletion: "2026-12-31", projectLead: "ISKCON Kurukshetra",
    coverImage: null, donateUrl: "https://iskconkurukshetra.org/donate",
    latitude: 29.964, longitude: 76.818,
  },
  {
    id: 19, name: "ISKCON Gangasagar Temple", location: "Sagar Island, West Bengal, India",
    deity: "Sri Sri Radha-Krishna & Sri Jagannatha Baladeva Subhadra", description: "A 40-foot-high temple on the sacred Sagar Island where the Ganga meets the sea. All RCC works including iconic domes were completed by February 2025, with marble installation, interior decoration, and landscaping currently underway. Deities placed on the first floor as a protective measure against tidal events.",
    status: "finishing", phase: "Marble installation & interior decoration", constructionProgress: 82,
    fundraisingGoal: 5_500_000, fundraisingRaised: 4_500_000, startDate: "2022-01-01",
    expectedCompletion: "2026-12-31", projectLead: "ISKCON Gangasagar",
    coverImage: null, donateUrl: "https://www.iskcongangasagar.com/temple-construction.html",
    latitude: 21.651, longitude: 88.079,
  },
  {
    id: 20, name: "ISKCON Bhavnagar – Radha Murlidhar Temple", location: "Bhavnagar, Gujarat, India",
    deity: "Sri Sri Radha-Murlidhar", description: "A magnificent new temple fulfilling Srila Prabhupada's desire for an ISKCON temple in every major city of Gujarat. The Bhumi Pujan (groundbreaking) and Shilanyas (foundation stone ceremony) have been performed, with construction now underway for a temple hall and prasadam hall.",
    status: "construction", phase: "Foundation work & early construction", constructionProgress: 15,
    fundraisingGoal: 10_000_000, fundraisingRaised: 2_000_000, startDate: "2024-01-01",
    expectedCompletion: "2028-12-31", projectLead: "ISKCON Bhavnagar",
    coverImage: null, donateUrl: "https://iskconbhavnagar.com/new-temple",
    latitude: 21.763, longitude: 72.152,
  },
  {
    id: 21, name: "ISKCON Dublin – New Community Temple", location: "County Dublin, Ireland",
    deity: "Sri Sri Radha Govinda", description: "ISKCON Dublin's new temple campus outside the city, with land contracts signed on January 1, 2026. The purchase was enabled by a fundraising campaign of over €310,000 combined with a bank loan. Plans include a temple hall, farmland, and a Gosala (cow protection area) in an eco-community setting.",
    status: "planning", phase: "Land acquisition & architectural design", constructionProgress: 5,
    fundraisingGoal: 5_500_000, fundraisingRaised: 375_000, startDate: "2026-01-01",
    expectedCompletion: "2030-12-31", projectLead: "ISKCON Dublin",
    coverImage: null, donateUrl: "https://www.iskcondublin.com/new-temple-project",
    latitude: 53.350, longitude: -6.266,
  },
  {
    id: 22, name: "ISKCON Sydney – Hare Krishna Community & Culture Centre", location: "Vineyard, New South Wales, Australia",
    deity: "Sri Sri Radha Govindaji", description: "A major new A$20 million Hare Krishna Community and Cultural Centre (HKCCC) at Vineyard NSW, serving the growing Sydney congregation. The facility is under construction with the congregation holding programs at a temporary venue while awaiting completion.",
    status: "construction", phase: "Main structure construction", constructionProgress: 45,
    fundraisingGoal: 13_000_000, fundraisingRaised: 7_000_000, startDate: "2022-01-01",
    expectedCompletion: "2026-12-31", projectLead: "ISKCON West Sydney",
    coverImage: null, donateUrl: "https://hkccc.com.au",
    latitude: -33.677, longitude: 150.866,
  },
  {
    id: 23, name: "ISKCON Ichalkaranji – Radha Shyamsundar Temple", location: "Ichalkaranji, Kolhapur District, Maharashtra, India",
    deity: "Sri Sri Radha-Shyamsundar", description: "One of the largest ISKCON temples planned for the Kolhapur region, with capacity for over 2,000 devotees. The foundation stone has been laid and construction is underway, incorporating eco-friendly practices like solar energy, rainwater harvesting, and organic gardening.",
    status: "construction", phase: "Foundation & early superstructure", constructionProgress: 20,
    fundraisingGoal: 8_000_000, fundraisingRaised: 2_000_000, startDate: "2023-06-01",
    expectedCompletion: "2028-12-31", projectLead: "ISKCON Ichalkaranji",
    coverImage: null, donateUrl: null,
    latitude: 16.690, longitude: 74.461,
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
