import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ── Static temple data (no database needed) ──────────────────────────────────

const TEMPLES = [
  // ── India ────────────────────────────────────────────────────────────────────
  {
    id: 1, name: "Temple of the Vedic Planetarium (TOVP)", location: "Mayapur, West Bengal, India",
    deity: "Sri Sri Radha Madhava", description: "Srila Prabhupada's most cherished project — one of the largest religious structures being built globally. The TOVP will house a Vedic planetarium demonstrating the cosmology described in the Srimad-Bhagavatam.",
    status: "construction", phase: "Interior finishing & dome work", constructionProgress: 82,
    fundraisingGoal: 100_000_000, fundraisingRaised: 88_000_000, startDate: "2010-01-01",
    expectedCompletion: "2027-11-02", projectLead: "TOVP Foundation",
    coverImage: null, donateUrl: "https://tovp.org/donate",
    latitude: 23.423, longitude: 88.388,
  },
  {
    id: 2, name: "ISKCON Delhi – Dwarka Temple", location: "Dwarka, New Delhi, India",
    deity: "Sri Sri Radha Parthasarathi", description: "A grand temple complex in southwest Delhi featuring a spiritual cultural center, Vedic museum, and community hall. Runs Food For Life feeding 7 crore+ people.",
    status: "construction", phase: "Structural construction", constructionProgress: 48,
    fundraisingGoal: 25_000_000, fundraisingRaised: 13_000_000, startDate: "2021-06-01",
    expectedCompletion: "2027-03-31", projectLead: "ISKCON Delhi",
    coverImage: null, donateUrl: "https://iskcondwarka.org/donate",
    latitude: 28.592, longitude: 77.045,
  },
  {
    id: 3, name: "ISKCON Navi Mumbai – Kharghar", location: "Navi Mumbai, Maharashtra, India",
    deity: "Sri Sri Radha Madan Mohan", description: "A multi-purpose spiritual complex with temple, Ayurvedic center, guesthouse, and community facilities serving the rapidly growing Navi Mumbai region.",
    status: "construction", phase: "Temple hall construction", constructionProgress: 58,
    fundraisingGoal: 15_000_000, fundraisingRaised: 9_500_000, startDate: "2020-03-01",
    expectedCompletion: "2026-12-31", projectLead: "ISKCON Navi Mumbai",
    coverImage: null, donateUrl: "https://iskcon-navimumbai.org/donate",
    latitude: 19.047, longitude: 73.071,
  },
  {
    id: 4, name: "ISKCON Pune – New Vedic Cultural Center", location: "Pune, Maharashtra, India",
    deity: "Sri Sri Radha Vrindavan Chandra", description: "A state-of-the-art Vedic cultural center in one of India's largest university cities, designed for youth outreach and spiritual education.",
    status: "construction", phase: "Superstructure", constructionProgress: 40,
    fundraisingGoal: 20_000_000, fundraisingRaised: 11_500_000, startDate: "2022-01-01",
    expectedCompletion: "2027-06-30", projectLead: "ISKCON Pune NVCC",
    coverImage: null, donateUrl: "https://www.iskconpune.com/donate",
    latitude: 18.520, longitude: 73.856,
  },
  {
    id: 8, name: "ISKCON Greater Noida (Gaur Dham)", location: "Greater Noida, Uttar Pradesh, India",
    deity: "Sri Sri Radha Govinda", description: "Emerging center in the NCR corridor with active expansion, community programs, and temple construction in the growing suburban region.",
    status: "construction", phase: "Temple structure rising", constructionProgress: 42,
    fundraisingGoal: 10_000_000, fundraisingRaised: 5_500_000, startDate: "2021-09-01",
    expectedCompletion: "2027-03-31", projectLead: "ISKCON Greater Noida",
    coverImage: null, donateUrl: "https://www.iskcongreaternoida.com/donate",
    latitude: 28.474, longitude: 77.504,
  },
  {
    id: 9, name: "ISKCON Vrindavan Chandrodaya Mandir", location: "Vrindavan, Uttar Pradesh, India",
    deity: "Sri Sri Krishna Balaram", description: "A soaring 70-storey tower temple envisioned as the tallest religious structure in the world at 700 feet, located in the holy land of Lord Krishna. Estimated cost ₹668 crore.",
    status: "construction", phase: "Tower construction", constructionProgress: 55,
    fundraisingGoal: 40_000_000, fundraisingRaised: 25_000_000, startDate: "2014-01-01",
    expectedCompletion: "2028-12-31", projectLead: "ISKCON Bangalore / Vrindavan",
    coverImage: null, donateUrl: "https://iskconvrindavan.com/donate",
    latitude: 27.583, longitude: 77.696,
  },
  {
    id: 10, name: "ISKCON Bangalore – Hare Krishna Hill Expansion", location: "Bangalore, Karnataka, India",
    deity: "Sri Sri Radha Krishna Chandra", description: "Major expansion of the iconic Hare Krishna Hill complex, adding new prasadam halls, cultural museum, and pilgrim amenities. Home of the Akshaya Patra Foundation.",
    status: "finishing", phase: "Interior fit-out", constructionProgress: 90,
    fundraisingGoal: 18_000_000, fundraisingRaised: 17_500_000, startDate: "2019-06-01",
    expectedCompletion: "2026-06-30", projectLead: "ISKCON Bangalore",
    coverImage: null, donateUrl: "https://www.iskconbangalore.org/donate",
    latitude: 13.010, longitude: 77.551,
  },
  {
    id: 13, name: "ISKCON Mumbai Juhu – Prasadam Complex", location: "Mumbai, Maharashtra, India",
    deity: "Sri Sri Radha Rasabihari", description: "New prasadam distribution and community facility at the iconic Juhu temple, expanding capacity for the massive daily food distribution program.",
    status: "finishing", phase: "Equipment installation", constructionProgress: 95,
    fundraisingGoal: 8_000_000, fundraisingRaised: 7_800_000, startDate: "2020-01-01",
    expectedCompletion: "2026-06-30", projectLead: "ISKCON Mumbai Juhu",
    coverImage: null, donateUrl: "https://www.iskconmumbai.com/donate",
    latitude: 19.098, longitude: 72.826,
  },
  {
    id: 14, name: "ISKCON Hyderabad Kokapet Temple", location: "Kokapet, Hyderabad, Telangana, India",
    deity: "Sri Sri Radha Madanmohan", description: "A large new temple complex in the booming IT corridor of Hyderabad, designed to serve the city's tech professional community.",
    status: "construction", phase: "Foundation complete, walls rising", constructionProgress: 38,
    fundraisingGoal: 22_000_000, fundraisingRaised: 12_000_000, startDate: "2022-03-01",
    expectedCompletion: "2028-06-30", projectLead: "ISKCON Hyderabad",
    coverImage: null, donateUrl: "https://www.iskconhyderabad.com/donate",
    latitude: 17.415, longitude: 78.355,
  },
  {
    id: 17, name: "ISKCON Bhavnagar – Radha Murlidhar Temple", location: "Bhavnagar, Gujarat, India",
    deity: "Sri Sri Radha Murlidhar", description: "A beautiful new temple complex being built in Bhavnagar, Gujarat, to serve the devotee community in the Saurashtra region.",
    status: "construction", phase: "Main structure construction", constructionProgress: 35,
    fundraisingGoal: 8_000_000, fundraisingRaised: 3_500_000, startDate: "2022-06-01",
    expectedCompletion: "2028-03-31", projectLead: "ISKCON Bhavnagar",
    coverImage: null, donateUrl: null,
    latitude: 21.764, longitude: 72.153,
  },
  {
    id: 18, name: "ISKCON Ichalkaranji – Radha Shyamsundar Temple", location: "Ichalkaranji, Kolhapur District, Maharashtra, India",
    deity: "Sri Sri Radha Shyamsundar", description: "A new ISKCON temple serving the devotees in the Kolhapur district of Maharashtra, a growing spiritual community in western Maharashtra.",
    status: "construction", phase: "Construction underway", constructionProgress: 30,
    fundraisingGoal: 6_000_000, fundraisingRaised: 2_200_000, startDate: "2023-01-01",
    expectedCompletion: "2028-12-31", projectLead: "ISKCON Ichalkaranji",
    coverImage: null, donateUrl: null,
    latitude: 16.691, longitude: 74.460,
  },
  {
    id: 19, name: "ISKCON Ghaziabad Temple", location: "Ghaziabad, Uttar Pradesh, India",
    deity: "Sri Sri Radha Krishna", description: "New temple project in the rapidly expanding Ghaziabad NCR suburb, aiming to serve the large devotee community in the eastern Delhi corridor.",
    status: "construction", phase: "Foundation & structural work", constructionProgress: 25,
    fundraisingGoal: 8_000_000, fundraisingRaised: 3_000_000, startDate: "2023-06-01",
    expectedCompletion: "2028-06-30", projectLead: "ISKCON Ghaziabad",
    coverImage: null, donateUrl: null,
    latitude: 28.669, longitude: 77.438,
  },
  {
    id: 20, name: "ISKCON Kurukshetra Temple", location: "Kurukshetra, Haryana, India",
    deity: "Sri Sri Radha Krishna", description: "A new temple in the sacred land where Lord Krishna spoke the Bhagavad-gita to Arjuna — one of the holiest pilgrimage sites in Vedic tradition.",
    status: "construction", phase: "Temple structure rising", constructionProgress: 30,
    fundraisingGoal: 10_000_000, fundraisingRaised: 4_000_000, startDate: "2023-01-01",
    expectedCompletion: "2028-12-31", projectLead: "ISKCON Kurukshetra",
    coverImage: null, donateUrl: null,
    latitude: 29.969, longitude: 76.878,
  },
  {
    id: 21, name: "ISKCON Salem – Traditional Stone Temple", location: "Salem, Tamil Nadu, India",
    deity: "Sri Sri Radha Krishna", description: "ISKCON's first all-stone temple built without steel or RCC — a construction masterpiece designed to last thousands of years. Features 12,000 tons of granite and intricate carvings depicting Krishna's pastimes.",
    status: "construction", phase: "Shikara erection & carving", constructionProgress: 65,
    fundraisingGoal: 5_000_000, fundraisingRaised: 3_200_000, startDate: "2020-01-01",
    expectedCompletion: "2026-12-31", projectLead: "ISKCON Salem",
    coverImage: null, donateUrl: null,
    latitude: 11.664, longitude: 78.146,
  },
  {
    id: 22, name: "ISKCON Dumdum – North Kolkata Temple", location: "Dumdum, North Kolkata, West Bengal, India",
    deity: "Sri Sri Dayal Nitai Gaura Sundar", description: "Newly constructed 1,600 sq ft temple hall inaugurated on January 3, 2026 during Pushya Abhishek. Built in just 16 months from Radhashtami 2024, serving the growing Dumdum-Motijheel area.",
    status: "operational", phase: "Inaugurated", constructionProgress: 100,
    fundraisingGoal: 1_500_000, fundraisingRaised: 1_500_000, startDate: "2024-09-11",
    expectedCompletion: "2026-01-03", projectLead: "ISKCON Dumdum",
    coverImage: null, donateUrl: null,
    latitude: 22.620, longitude: 88.418,
  },
  {
    id: 23, name: "ISKCON Bhusawal Temple", location: "Bhusawal, Maharashtra, India",
    deity: "Sri Sri Radha Krishna", description: "Construction officially began in March 2026. A new centre for Krishna consciousness in this growing city in Jalgaon district of Maharashtra.",
    status: "construction", phase: "Foundation work", constructionProgress: 8,
    fundraisingGoal: 3_000_000, fundraisingRaised: 800_000, startDate: "2026-03-18",
    expectedCompletion: "2030-12-31", projectLead: "ISKCON Bhusawal",
    coverImage: null, donateUrl: null,
    latitude: 21.042, longitude: 75.782,
  },
  {
    id: 24, name: "ISKCON Ujjain – Radha Madan Mohan Temple", location: "Ujjain, Madhya Pradesh, India",
    deity: "Sri Sri Radha Madan Mohan", description: "Beautiful temple in pristine white Makrana marble with intricate carvings depicting Lord Krishna's life. A blend of traditional Hindu aesthetics and modern architecture in the holy city of Ujjain.",
    status: "construction", phase: "Marble cladding & interiors", constructionProgress: 60,
    fundraisingGoal: 6_000_000, fundraisingRaised: 4_000_000, startDate: "2021-01-01",
    expectedCompletion: "2027-06-30", projectLead: "ISKCON Ujjain",
    coverImage: null, donateUrl: null,
    latitude: 23.179, longitude: 75.784,
  },
  {
    id: 25, name: "ISKCON Kangra Temple & Gurukul", location: "Kangra, Himachal Pradesh, India",
    deity: "Sri Sri Radha Krishna", description: "A three-part project: Temple for spiritual reflection, Gurukul for Vedic education preserving ancient knowledge, and Goshala for abandoned cows.",
    status: "construction", phase: "Land development & construction", constructionProgress: 15,
    fundraisingGoal: 3_000_000, fundraisingRaised: 600_000, startDate: "2025-01-01",
    expectedCompletion: "2030-12-31", projectLead: "ISKCON Kangra",
    coverImage: null, donateUrl: "https://www.iskconkangra.com/donate",
    latitude: 32.099, longitude: 76.269,
  },
  {
    id: 26, name: "ISKCON Mangalore – Govardhan Hills", location: "Mangalore, Karnataka, India",
    deity: "Sri Sri Radha Krishna", description: "A cultural center encompassing devotional practices, educational services, and community gatherings for the coastal Karnataka devotee community.",
    status: "construction", phase: "Site development", constructionProgress: 20,
    fundraisingGoal: 5_000_000, fundraisingRaised: 1_500_000, startDate: "2024-01-01",
    expectedCompletion: "2029-12-31", projectLead: "ISKCON Mangalore",
    coverImage: null, donateUrl: null,
    latitude: 12.914, longitude: 74.856,
  },
  {
    id: 27, name: "ISKCON Cyberabad – Phase 2 Expansion", location: "Cyberabad, Hyderabad, Telangana, India",
    deity: "Sri Sri Radha Krishna", description: "Second phase expansion including Pancha Tattva block, Radha Krishna Temple, kitchen facility, and seva office on the Cyberabad campus. Stone blasting completed.",
    status: "construction", phase: "Site clearing & foundation", constructionProgress: 18,
    fundraisingGoal: 8_000_000, fundraisingRaised: 2_500_000, startDate: "2024-06-01",
    expectedCompletion: "2029-06-30", projectLead: "ISKCON Cyberabad",
    coverImage: null, donateUrl: "https://www.iskconcyberabad.com/donate",
    latitude: 17.445, longitude: 78.382,
  },

  // ── USA ───────────────────────────────────────────────────────────────────────
  {
    id: 5, name: "ISKCON Parsippany Temple", location: "Parsippany, New Jersey, USA",
    deity: "Sri Sri Radha Govinda", description: "An ambitious temple construction project serving the large Indian-American congregation in the New Jersey / New York metro area. Features sponsor-a-square-foot program.",
    status: "construction", phase: "Foundation & structural work", constructionProgress: 32,
    fundraisingGoal: 30_000_000, fundraisingRaised: 16_000_000, startDate: "2022-06-01",
    expectedCompletion: "2028-12-31", projectLead: "ISKCON of New Jersey",
    coverImage: null, donateUrl: "https://www.iskconofnewjersey.org/donate",
    latitude: 40.858, longitude: -74.426,
  },
  {
    id: 15, name: "ISKCON Silicon Valley Temple", location: "San Jose, California, USA",
    deity: "Sri Sri Radha Madan Mohan", description: "New temple and cultural center serving the tech corridor. A 501(c)(3) non-profit with strong youth and professional outreach.",
    status: "construction", phase: "Interior construction", constructionProgress: 62,
    fundraisingGoal: 15_000_000, fundraisingRaised: 11_000_000, startDate: "2020-09-01",
    expectedCompletion: "2026-06-30", projectLead: "ISKCON Silicon Valley",
    coverImage: null, donateUrl: "https://iskconsv.com/donate",
    latitude: 37.335, longitude: -121.893,
  },
  {
    id: 28, name: "ISKCON Potomac – Washington D.C. Temple", location: "Potomac, Maryland, USA",
    deity: "Sri Sri Radha Madan Mohan", description: "Newly opened 11,000 sq ft temple for the 50th anniversary of Washington area ISKCON. Features commercial kitchen, nursery, store, and 4,000 sq ft temple hall. Fundraised $14 million.",
    status: "operational", phase: "Inaugurated March 2024", constructionProgress: 100,
    fundraisingGoal: 14_000_000, fundraisingRaised: 14_000_000, startDate: "2020-01-01",
    expectedCompletion: "2024-03-23", projectLead: "ISKCON of D.C.",
    coverImage: null, donateUrl: null,
    latitude: 39.018, longitude: -77.208,
  },
  {
    id: 29, name: "ISKCON Pittsburgh – New Temple", location: "Pittsburgh, Pennsylvania, USA",
    deity: "Sri Sri Radha Krishna", description: "A new temple that will serve as a center for worshiping Lord Krishna and disseminating the teachings of the Bhagavad Gita and Vedic literature.",
    status: "construction", phase: "Construction underway", constructionProgress: 25,
    fundraisingGoal: 5_000_000, fundraisingRaised: 2_000_000, startDate: "2024-01-01",
    expectedCompletion: "2027-12-31", projectLead: "ISKCON Pittsburgh",
    coverImage: null, donateUrl: "https://iskconpittsburgh.com/donate",
    latitude: 40.441, longitude: -79.990,
  },
  {
    id: 30, name: "ISKCON New Mahavan Temple", location: "Corcoran, Minnesota, USA",
    deity: "Sri Sri Radha Krishna", description: "A new place of worship with land purchased in Feb 2024 and conditional use permit approved May 2025. Groundbreaking Aug 2025, interior renovation expected through 2026.",
    status: "construction", phase: "Exterior renovation", constructionProgress: 20,
    fundraisingGoal: 4_000_000, fundraisingRaised: 1_500_000, startDate: "2024-02-01",
    expectedCompletion: "2026-08-31", projectLead: "ISKCON New Mahavan",
    coverImage: null, donateUrl: "https://newmahavan.org/donate",
    latitude: 45.093, longitude: -93.542,
  },
  {
    id: 31, name: "ISKCON Somerset – Radha Madhava Temple", location: "Somerset, New Jersey, USA",
    deity: "Sri Sri Radha Madhava", description: "A magnificent new temple to create a spiritual haven for devotees and newcomers. $5 million fundraising goal for this foundational community project.",
    status: "construction", phase: "Fundraising & construction", constructionProgress: 15,
    fundraisingGoal: 5_000_000, fundraisingRaised: 1_800_000, startDate: "2024-01-01",
    expectedCompletion: "2029-12-31", projectLead: "ISKCON Somerset",
    coverImage: null, donateUrl: "https://www.iskconsomerset.org/donate",
    latitude: 40.498, longitude: -74.488,
  },
  {
    id: 32, name: "ISKCON Naperville – Radha Shyamasundara Temple", location: "Naperville, Illinois, USA",
    deity: "Sri Sri Radha Shyamasundara", description: "New building construction with Groundbreaking & 108 Kunda Yagna in June 2026. A dream of the Naperville community to build a grand temple. Framing, roofing, and elevator work progressing.",
    status: "construction", phase: "Ground breaking & foundation", constructionProgress: 12,
    fundraisingGoal: 8_000_000, fundraisingRaised: 3_000_000, startDate: "2023-01-01",
    expectedCompletion: "2028-12-31", projectLead: "ISKCON Naperville",
    coverImage: null, donateUrl: "https://www.iskconnaperville.org/donate",
    latitude: 41.750, longitude: -88.162,
  },
  {
    id: 33, name: "ISKCON New Talavan Temple", location: "Carriere, Mississippi, USA",
    deity: "Sri Sri Radha Radha-Kantha", description: "Newly constructed 8,000 sq ft temple for Sri Sri Radha Radha-Kantha and Sri Sri Gaura Nitai. Grand opening May 14-25, 2026 with Vastu Yajna, kirtan, and formal ceremony.",
    status: "finishing", phase: "Pre-inauguration preparations", constructionProgress: 95,
    fundraisingGoal: 3_000_000, fundraisingRaised: 2_800_000, startDate: "2022-01-01",
    expectedCompletion: "2026-05-25", projectLead: "ISKCON New Talavan",
    coverImage: null, donateUrl: null,
    latitude: 30.607, longitude: -89.676,
  },
  {
    id: 34, name: "ISKCON Sacramento Temple", location: "Sacramento, California, USA",
    deity: "Sri Sri Radha Krishna", description: "After 25 years of preaching in Sacramento and Folsom areas, devotees are building a new temple. All permits acquired March 2025, construction began April 2025.",
    status: "construction", phase: "Construction underway", constructionProgress: 15,
    fundraisingGoal: 5_000_000, fundraisingRaised: 2_000_000, startDate: "2025-04-01",
    expectedCompletion: "2028-12-31", projectLead: "ISKCON Sacramento",
    coverImage: null, donateUrl: null,
    latitude: 38.582, longitude: -121.494,
  },

  // ── Europe ───────────────────────────────────────────────────────────────────
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
    id: 16, name: "ISKCON London – Soho Renovation", location: "London, England, UK",
    deity: "Sri Sri Radha Londonisvara", description: "Historic renovation of the 10 Soho Street temple that has served as a spiritual sanctuary for 50+ years in London's West End.",
    status: "finishing", phase: "Final renovation phase", constructionProgress: 88,
    fundraisingGoal: 4_000_000, fundraisingRaised: 3_600_000, startDate: "2023-01-01",
    expectedCompletion: "2026-06-30", projectLead: "ISKCON London",
    coverImage: null, donateUrl: "https://iskcon.london/donate",
    latitude: 51.515, longitude: -0.133,
  },
  {
    id: 35, name: "ISKCON Moscow – New Temple Complex", location: "Moscow, Russia",
    deity: "Sri Sri Radha Krishna", description: "Moscow's second Krishna temple with spiritual centre, Indian history museum, Indo-Russian centre, art centre, library, and vegetarian restaurant.",
    status: "planning", phase: "Design & permits", constructionProgress: 10,
    fundraisingGoal: 8_000_000, fundraisingRaised: 2_000_000, startDate: "2025-01-01",
    expectedCompletion: "2030-12-31", projectLead: "ISKCON Russia",
    coverImage: null, donateUrl: null,
    latitude: 55.755, longitude: 37.617,
  },

  // ── Americas (non-USA) ───────────────────────────────────────────────────────
  {
    id: 12, name: "ISKCON Sao Paulo Expansion", location: "Sao Paulo, Brazil",
    deity: "Sri Sri Radha Govinda", description: "Expansion of the largest Latin American ISKCON temple to accommodate the growing Brazilian congregation with new cultural programs wing.",
    status: "planning", phase: "Design & fundraising", constructionProgress: 12,
    fundraisingGoal: 6_000_000, fundraisingRaised: 1_500_000, startDate: "2025-01-01",
    expectedCompletion: "2029-12-31", projectLead: "ISKCON Sao Paulo",
    coverImage: null, donateUrl: "https://www.iskconsp.com.br/donate",
    latitude: -23.543, longitude: -46.654,
  },

  // ── Canada ───────────────────────────────────────────────────────────────────
  {
    id: 36, name: "ISKCON Vancouver – New Mandir", location: "Burnaby, British Columbia, Canada",
    deity: "Sri Sri Radha Krishna", description: "State-of-the-art Mandir at the existing 9-acre compound. Will include community center, prasadam hall, educational facilities, and youth programs. Serving the community since 1974.",
    status: "planning", phase: "Design & approvals", constructionProgress: 8,
    fundraisingGoal: 10_000_000, fundraisingRaised: 2_500_000, startDate: "2025-06-01",
    expectedCompletion: "2031-12-31", projectLead: "ISKCON Vancouver",
    coverImage: null, donateUrl: "https://iskconvancouver.org/donate",
    latitude: 49.232, longitude: -122.979,
  },

  // ── Africa ───────────────────────────────────────────────────────────────────
  {
    id: 6, name: "ISKCON Nairobi – Hare Krishna Land", location: "Nairobi, Kenya",
    deity: "Sri Sri Radha Banke Bihari", description: "East African headquarters expansion — a multi-story spiritual and cultural center serving as the regional coordination hub for ISKCON in Africa.",
    status: "planning", phase: "Architectural design", constructionProgress: 10,
    fundraisingGoal: 8_000_000, fundraisingRaised: 2_500_000, startDate: "2024-01-01",
    expectedCompletion: "2029-12-31", projectLead: "ISKCON East Africa",
    coverImage: null, donateUrl: "https://www.iskconnairobi.org/donate",
    latitude: -1.286, longitude: 36.817,
  },

  // ── Asia-Pacific ─────────────────────────────────────────────────────────────
  {
    id: 37, name: "ISKCON Taguig – Radha Madhava Mandir", location: "Taguig City, Metro Manila, Philippines",
    deity: "Sri Sri Radha Madhava", description: "Grand opening celebrated January 30 – February 1, 2026 with 24-hour kirtan and ribbon-cutting with international dignitaries. A permanent home for Deities in the heart of Metro Manila.",
    status: "operational", phase: "Inaugurated Feb 2026", constructionProgress: 100,
    fundraisingGoal: 2_000_000, fundraisingRaised: 2_000_000, startDate: "2023-01-01",
    expectedCompletion: "2026-02-01", projectLead: "ISKCON Philippines",
    coverImage: null, donateUrl: null,
    latitude: 14.524, longitude: 121.050,
  },

  // ── Australia ────────────────────────────────────────────────────────────────
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
    id: 38, name: "ISKCON Sydney – Hare Krishna Community & Culture Centre", location: "Vineyard, New South Wales, Australia",
    deity: "Sri Sri Radha Gopinath", description: "A new community and cultural centre in Sydney's northwest, serving the growing Australian devotee community with temple, education, and outreach facilities.",
    status: "construction", phase: "Construction underway", constructionProgress: 25,
    fundraisingGoal: 10_000_000, fundraisingRaised: 6_000_000, startDate: "2023-06-01",
    expectedCompletion: "2028-12-31", projectLead: "ISKCON Sydney",
    coverImage: null, donateUrl: null,
    latitude: -33.652, longitude: 150.849,
  },
  {
    id: 39, name: "ISKCON Brisbane Temple", location: "Brisbane, Queensland, Australia",
    deity: "Sri Sri Radha Govinda", description: "New ISKCON temple in Brisbane opened in early 2026 with Indian consular general in attendance. Serving Queensland's growing devotee community.",
    status: "operational", phase: "Inaugurated 2026", constructionProgress: 100,
    fundraisingGoal: 4_000_000, fundraisingRaised: 4_000_000, startDate: "2023-01-01",
    expectedCompletion: "2026-03-07", projectLead: "ISKCON Brisbane",
    coverImage: null, donateUrl: null,
    latitude: -27.470, longitude: 153.021,
  },

  // ── New Discoveries (April 2026) ────────────────────────────────────────────
  {
    id: 40, name: "Abhay Tirtha – ISKCON Newtown", location: "Newtown, Kolkata, West Bengal, India",
    deity: "Sri Sri Gaur Nitai", description: "A monumental 25-acre spiritual complex in Srila Prabhupada's birthplace of Kolkata, envisioned as a 'hospital for the soul.' Features deity altars, meditation halls, youth guidance programs, Vedic education, and community outreach.",
    status: "construction", phase: "Foundation complete — main structure beginning", constructionProgress: 12,
    fundraisingGoal: 4_800_000, fundraisingRaised: 500_000, startDate: "2023-06-01",
    expectedCompletion: "2029-12-31", projectLead: "ISKCON Newtown",
    coverImage: null, donateUrl: "https://abhaytirtha.com/",
    latitude: 22.583, longitude: 88.468,
  },
  {
    id: 41, name: "ISKCON Punjabi Bagh – Temple Expansion", location: "Punjabi Bagh, New Delhi, India",
    deity: "Sri Sri Krishna Balaram, Sri Radha Radhika Raman", description: "Expansion of the beloved Punjabi Bagh temple (established 1984) onto an adjacent plot acquired in 2022. Serving over 1,000 families with enlarged temple hall, community spaces, and spiritual education facilities.",
    status: "construction", phase: "Expansion construction underway", constructionProgress: 25,
    fundraisingGoal: 3_000_000, fundraisingRaised: 1_200_000, startDate: "2022-01-01",
    expectedCompletion: "2027-09-15", projectLead: "ISKCON Punjabi Bagh",
    coverImage: null, donateUrl: "https://www.iskconpunjabibagh.com/temple-expansion-project/",
    latitude: 28.667, longitude: 77.130,
  },
  {
    id: 42, name: "Dakshina Dwaraka Dham – ISKCON Chennai", location: "Thiruvanmiyur, Chennai, Tamil Nadu, India",
    deity: "Sri Sri Rukmini Dwarakadhish", description: "A magnificent 40,000 sq. ft. cultural complex in Pallava-style architecture. Currently building the third-floor temple hall — envisioned as a centre for spiritual education, kirtan, and darshan in Chennai.",
    status: "construction", phase: "Third-floor temple hall construction", constructionProgress: 35,
    fundraisingGoal: 5_000_000, fundraisingRaised: 2_800_000, startDate: "2021-01-01",
    expectedCompletion: "2028-06-30", projectLead: "Hare Krishna Movement Chennai",
    coverImage: null, donateUrl: "https://hkmchennai.org/dakshina-dwaraka",
    latitude: 12.982, longitude: 80.263,
  },
];

const now = new Date().toISOString();

function toResponse(t: typeof TEMPLES[number]) {
  return {
    ...t,
    fundraisingProgress: t.fundraisingGoal > 0 ? (t.fundraisingRaised / t.fundraisingGoal) * 100 : 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.get("/stats", (_req, res) => {
  const activeStatuses = ["planning", "construction", "finishing"];
  const active = TEMPLES.filter((t) => activeStatuses.includes(t.status));

  const templesByStatus: Record<string, number> = {};
  for (const t of TEMPLES) {
    templesByStatus[t.status] = (templesByStatus[t.status] || 0) + 1;
  }

  const totalGoal = TEMPLES.reduce((s, t) => s + t.fundraisingGoal, 0);
  const totalRaised = TEMPLES.reduce((s, t) => s + t.fundraisingRaised, 0);
  const avgProgress = Math.round(TEMPLES.reduce((s, t) => s + t.constructionProgress, 0) / TEMPLES.length);

  res.json({
    totalTemples: TEMPLES.length,
    activeProjects: active.length,
    totalFundraisingGoal: totalGoal,
    totalFundraisingRaised: totalRaised,
    averageProgress: avgProgress,
    completedMilestones: 24,
    upcomingMilestones: 18,
    recentUpdates: [],
    templesByStatus,
  });
});

router.get("/temples", (_req, res) => {
  res.json(TEMPLES.map(toResponse));
});

router.post("/temples", (req, res) => {
  res.status(201).json({ ...req.body, id: TEMPLES.length + 1, createdAt: now, updatedAt: now });
});

router.get("/temples/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const temple = TEMPLES.find((t) => t.id === id);
  if (!temple) { res.status(404).json({ error: "Temple not found" }); return; }
  res.json({ ...toResponse(temple), milestones: [], updates: [], contributors: [] });
});

router.put("/temples/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const temple = TEMPLES.find((t) => t.id === id);
  if (!temple) { res.status(404).json({ error: "Temple not found" }); return; }
  res.json({ ...toResponse(temple), ...req.body, updatedAt: new Date().toISOString() });
});

router.get("/temples/:id/milestones", (_req, res) => { res.json([]); });
router.post("/temples/:id/milestones", (req, res) => { res.status(201).json({ ...req.body, id: 1, createdAt: now }); });
router.put("/milestones/:id", (req, res) => { res.json({ ...req.body, id: parseInt(req.params.id) }); });
router.get("/temples/:id/updates", (_req, res) => { res.json([]); });
router.post("/temples/:id/updates", (req, res) => { res.status(201).json({ ...req.body, id: 1, createdAt: now }); });
router.get("/temples/:id/contributors", (_req, res) => { res.json([]); });
router.post("/temples/:id/contributors", (req, res) => { res.status(201).json({ ...req.body, id: 1, createdAt: now }); });

export default router;
