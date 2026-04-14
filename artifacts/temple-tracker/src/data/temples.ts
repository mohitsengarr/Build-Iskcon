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
    coverImage: null, donateUrl: "https://iskcondumdum.com/donate",
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
    coverImage: null, donateUrl: "https://iskconichalkaranji.com/donate",
    latitude: 16.690, longitude: 74.461,
  },
  // ── Discovered via Firecrawl April 2026 ──────────────────────────────────
  {
    id: 24, name: "ISKCON Ghaziabad Temple", location: "Ghaziabad, Uttar Pradesh, India",
    deity: "Sri Sri Radha Krishna", description: "New temple project in the rapidly expanding Ghaziabad NCR suburb, aiming to serve the large devotee community in the eastern Delhi corridor.",
    status: "construction", phase: "Foundation & structural work", constructionProgress: 25,
    fundraisingGoal: 8_000_000, fundraisingRaised: 3_000_000, startDate: "2023-06-01",
    expectedCompletion: "2028-06-30", projectLead: "ISKCON Ghaziabad",
    coverImage: null, donateUrl: null,
    latitude: 28.669, longitude: 77.438,
  },
  {
    id: 25, name: "ISKCON Salem – Traditional Stone Temple", location: "Salem, Tamil Nadu, India",
    deity: "Sri Sri Radha Krishna", description: "ISKCON's first all-stone temple built without steel or RCC — a construction masterpiece designed to last thousands of years. Features 12,000 tons of granite with a 108-foot Shikara and intricate carvings depicting Krishna's pastimes.",
    status: "construction", phase: "Shikara erection & carving", constructionProgress: 65,
    fundraisingGoal: 5_000_000, fundraisingRaised: 3_200_000, startDate: "2020-01-01",
    expectedCompletion: "2026-12-31", projectLead: "ISKCON Salem",
    coverImage: null, donateUrl: null,
    latitude: 11.664, longitude: 78.146,
  },
  {
    id: 26, name: "ISKCON Bhusawal Temple", location: "Bhusawal, Maharashtra, India",
    deity: "Sri Sri Radha Krishna", description: "Construction officially began in March 2026. A new centre for Krishna consciousness in this growing city in Jalgaon district of Maharashtra.",
    status: "construction", phase: "Foundation work", constructionProgress: 8,
    fundraisingGoal: 3_000_000, fundraisingRaised: 800_000, startDate: "2026-03-18",
    expectedCompletion: "2030-12-31", projectLead: "ISKCON Bhusawal",
    coverImage: null, donateUrl: null,
    latitude: 21.042, longitude: 75.782,
  },
  {
    id: 27, name: "ISKCON Ujjain – Radha Madan Mohan Temple", location: "Ujjain, Madhya Pradesh, India",
    deity: "Sri Sri Radha Madan Mohan", description: "Beautiful temple in pristine white Makrana marble with intricate carvings depicting Lord Krishna's life. A blend of traditional Hindu aesthetics and modern architecture in the holy city of Ujjain.",
    status: "construction", phase: "Marble cladding & interiors", constructionProgress: 60,
    fundraisingGoal: 6_000_000, fundraisingRaised: 4_000_000, startDate: "2021-01-01",
    expectedCompletion: "2027-06-30", projectLead: "ISKCON Ujjain",
    coverImage: null, donateUrl: null,
    latitude: 23.179, longitude: 75.784,
  },
  {
    id: 28, name: "ISKCON Kangra Temple & Gurukul", location: "Kangra, Himachal Pradesh, India",
    deity: "Sri Sri Radha Krishna", description: "A three-part project: Temple for spiritual reflection, Gurukul for Vedic education, and Goshala for cow protection — nestled in the foothills of the Himalayas.",
    status: "construction", phase: "Land development & construction", constructionProgress: 15,
    fundraisingGoal: 3_000_000, fundraisingRaised: 600_000, startDate: "2025-01-01",
    expectedCompletion: "2030-12-31", projectLead: "ISKCON Kangra",
    coverImage: null, donateUrl: "https://www.iskconkangra.com/donate",
    latitude: 32.099, longitude: 76.269,
  },
  {
    id: 29, name: "ISKCON Mangalore – Govardhan Hills", location: "Mangalore, Karnataka, India",
    deity: "Sri Sri Radha Krishna", description: "A cultural center for devotional practices, educational services, and community gatherings for the coastal Karnataka devotee community.",
    status: "construction", phase: "Site development", constructionProgress: 20,
    fundraisingGoal: 5_000_000, fundraisingRaised: 1_500_000, startDate: "2024-01-01",
    expectedCompletion: "2029-12-31", projectLead: "ISKCON Mangalore",
    coverImage: null, donateUrl: null,
    latitude: 12.914, longitude: 74.856,
  },
  {
    id: 30, name: "ISKCON Cyberabad – Phase 2 Expansion", location: "Cyberabad, Hyderabad, Telangana, India",
    deity: "Sri Sri Radha Krishna", description: "Second phase expansion including Pancha Tattva block, Radha Krishna Temple, kitchen facility, and seva office on the Cyberabad campus.",
    status: "construction", phase: "Site clearing & foundation", constructionProgress: 18,
    fundraisingGoal: 8_000_000, fundraisingRaised: 2_500_000, startDate: "2024-06-01",
    expectedCompletion: "2029-06-30", projectLead: "ISKCON Cyberabad",
    coverImage: null, donateUrl: "https://www.iskconcyberabad.com/donate",
    latitude: 17.445, longitude: 78.382,
  },
  {
    id: 31, name: "ISKCON Potomac – Washington D.C. Temple", location: "Potomac, Maryland, USA",
    deity: "Sri Sri Radha Madan Mohan", description: "11,000 sq ft temple opened March 2024 for the 50th anniversary of Washington area ISKCON. Features commercial kitchen, nursery, and 4,000 sq ft temple hall. $14 million fundraised.",
    status: "consecrated", phase: "Inaugurated March 2024", constructionProgress: 100,
    fundraisingGoal: 14_000_000, fundraisingRaised: 14_000_000, startDate: "2020-01-01",
    expectedCompletion: "2024-03-23", projectLead: "ISKCON of D.C.",
    coverImage: null, donateUrl: null,
    latitude: 39.018, longitude: -77.208,
  },
  {
    id: 32, name: "ISKCON Pittsburgh – New Temple", location: "Pittsburgh, Pennsylvania, USA",
    deity: "Sri Sri Radha Krishna", description: "A new temple to serve as a center for worshiping Lord Krishna and disseminating the teachings of the Bhagavad Gita and Vedic literature.",
    status: "construction", phase: "Construction underway", constructionProgress: 25,
    fundraisingGoal: 5_000_000, fundraisingRaised: 2_000_000, startDate: "2024-01-01",
    expectedCompletion: "2027-12-31", projectLead: "ISKCON Pittsburgh",
    coverImage: null, donateUrl: "https://iskconpittsburgh.com/donate",
    latitude: 40.441, longitude: -79.990,
  },
  {
    id: 33, name: "ISKCON New Mahavan Temple", location: "Corcoran, Minnesota, USA",
    deity: "Sri Sri Radha Krishna", description: "Land purchased Feb 2024, permits approved May 2025, groundbreaking Aug 2025. A new place of worship for the Twin Cities devotee community.",
    status: "construction", phase: "Exterior renovation", constructionProgress: 20,
    fundraisingGoal: 4_000_000, fundraisingRaised: 1_500_000, startDate: "2024-02-01",
    expectedCompletion: "2026-08-31", projectLead: "ISKCON New Mahavan",
    coverImage: null, donateUrl: "https://newmahavan.org/donate",
    latitude: 45.093, longitude: -93.542,
  },
  {
    id: 34, name: "ISKCON Somerset – Radha Madhava Temple", location: "Somerset, New Jersey, USA",
    deity: "Sri Sri Radha Madhava", description: "A magnificent new temple to be a spiritual haven for devotees and newcomers, with a $5 million fundraising goal.",
    status: "construction", phase: "Fundraising & construction", constructionProgress: 15,
    fundraisingGoal: 5_000_000, fundraisingRaised: 1_800_000, startDate: "2024-01-01",
    expectedCompletion: "2029-12-31", projectLead: "ISKCON Somerset",
    coverImage: null, donateUrl: "https://www.iskconsomerset.org/donate",
    latitude: 40.498, longitude: -74.488,
  },
  {
    id: 35, name: "ISKCON Naperville – Radha Shyamasundara Temple", location: "Naperville, Illinois, USA",
    deity: "Sri Sri Radha Shyamasundara", description: "Groundbreaking & 108 Kunda Yagna in June 2026. The dream of the Naperville community to build a grand temple, with framing and roofing progressing.",
    status: "construction", phase: "Ground breaking & foundation", constructionProgress: 12,
    fundraisingGoal: 8_000_000, fundraisingRaised: 3_000_000, startDate: "2023-01-01",
    expectedCompletion: "2028-12-31", projectLead: "ISKCON Naperville",
    coverImage: null, donateUrl: "https://www.iskconnaperville.org/donate",
    latitude: 41.750, longitude: -88.162,
  },
  {
    id: 36, name: "ISKCON New Talavan Temple", location: "Carriere, Mississippi, USA",
    deity: "Sri Sri Radha Radha-Kantha", description: "Newly constructed 8,000 sq ft temple with grand opening May 14-25, 2026. Features Vastu Yajna, kirtan, and formal ceremony with traditional and locally produced architectural elements.",
    status: "finishing", phase: "Pre-inauguration preparations", constructionProgress: 95,
    fundraisingGoal: 3_000_000, fundraisingRaised: 2_800_000, startDate: "2022-01-01",
    expectedCompletion: "2026-05-25", projectLead: "ISKCON New Talavan",
    coverImage: null, donateUrl: null,
    latitude: 30.607, longitude: -89.676,
  },
  {
    id: 37, name: "ISKCON Sacramento Temple", location: "Sacramento, California, USA",
    deity: "Sri Sri Radha Krishna", description: "After 25 years of preaching in Sacramento and Folsom areas, all permits acquired March 2025, construction began April 2025.",
    status: "construction", phase: "Construction underway", constructionProgress: 15,
    fundraisingGoal: 5_000_000, fundraisingRaised: 2_000_000, startDate: "2025-04-01",
    expectedCompletion: "2028-12-31", projectLead: "ISKCON Sacramento",
    coverImage: null, donateUrl: null,
    latitude: 38.582, longitude: -121.494,
  },
  {
    id: 38, name: "ISKCON Moscow – New Temple Complex", location: "Moscow, Russia",
    deity: "Sri Sri Radha Krishna", description: "Moscow's second Krishna temple with spiritual centre, Indian history museum, Indo-Russian centre, art centre, library, and vegetarian restaurant.",
    status: "planning", phase: "Design & permits", constructionProgress: 10,
    fundraisingGoal: 8_000_000, fundraisingRaised: 2_000_000, startDate: "2025-01-01",
    expectedCompletion: "2030-12-31", projectLead: "ISKCON Russia",
    coverImage: null, donateUrl: null,
    latitude: 55.755, longitude: 37.617,
  },
  {
    id: 39, name: "ISKCON Vancouver – New Mandir", location: "Burnaby, British Columbia, Canada",
    deity: "Sri Sri Radha Krishna", description: "State-of-the-art Mandir at the existing 9-acre compound since 1974. Will include community center, prasadam hall, educational facilities, and youth programs.",
    status: "planning", phase: "Design & approvals", constructionProgress: 8,
    fundraisingGoal: 10_000_000, fundraisingRaised: 2_500_000, startDate: "2025-06-01",
    expectedCompletion: "2031-12-31", projectLead: "ISKCON Vancouver",
    coverImage: null, donateUrl: "https://iskconvancouver.org/donate",
    latitude: 49.232, longitude: -122.979,
  },
  {
    id: 40, name: "ISKCON Taguig – Radha Madhava Mandir", location: "Taguig City, Metro Manila, Philippines",
    deity: "Sri Sri Radha Madhava", description: "Grand opening celebrated January 30 – February 1, 2026 with 24-hour kirtan and ribbon-cutting with international dignitaries. A permanent home for Deities in Metro Manila.",
    status: "consecrated", phase: "Inaugurated Feb 2026", constructionProgress: 100,
    fundraisingGoal: 2_000_000, fundraisingRaised: 2_000_000, startDate: "2023-01-01",
    expectedCompletion: "2026-02-01", projectLead: "ISKCON Philippines",
    coverImage: null, donateUrl: null,
    latitude: 14.524, longitude: 121.050,
  },
  {
    id: 41, name: "ISKCON Brisbane Temple", location: "Brisbane, Queensland, Australia",
    deity: "Sri Sri Radha Govinda", description: "New ISKCON temple opened in early 2026 with Indian consular general in attendance. Serving Queensland's growing devotee community.",
    status: "consecrated", phase: "Inaugurated 2026", constructionProgress: 100,
    fundraisingGoal: 4_000_000, fundraisingRaised: 4_000_000, startDate: "2023-01-01",
    expectedCompletion: "2026-03-07", projectLead: "ISKCON Brisbane",
    coverImage: null, donateUrl: null,
    latitude: -27.470, longitude: 153.021,
  },

  // ── New Discoveries (April 2026 Firecrawl) ──────────────────────────────────
  {
    id: 42, name: "Abhay Tirtha – ISKCON Newtown", location: "Newtown, Kolkata, West Bengal, India",
    deity: "Sri Sri Gaur Nitai", description: "A monumental 25-acre spiritual complex in Srila Prabhupada's birthplace of Kolkata, envisioned as a 'hospital for the soul.' The Abhay Tirtha project aims to immortalize Srila Prabhupada's legacy with deity altars, meditation halls, youth guidance programs, Vedic education facilities, and community outreach.",
    status: "construction", phase: "Foundation complete — main structure beginning", constructionProgress: 12,
    fundraisingGoal: 4_800_000, fundraisingRaised: 500_000, startDate: "2023-06-01",
    expectedCompletion: "2029-12-31", projectLead: "ISKCON Newtown",
    coverImage: null, donateUrl: "https://abhaytirtha.com/",
    latitude: 22.583, longitude: 88.468,
  },
  {
    id: 43, name: "ISKCON Punjabi Bagh – Temple Expansion", location: "Punjabi Bagh, New Delhi, India",
    deity: "Sri Sri Krishna Balaram, Sri Radha Radhika Raman", description: "Expansion of the beloved Punjabi Bagh temple (established 1984) onto an adjacent plot acquired in 2022. Serving a vibrant community of over 1,000 families with an enlarged temple hall, community spaces, and enhanced facilities for spiritual education and cultural programs.",
    status: "construction", phase: "Expansion construction underway", constructionProgress: 25,
    fundraisingGoal: 3_000_000, fundraisingRaised: 1_200_000, startDate: "2022-01-01",
    expectedCompletion: "2027-09-15", projectLead: "ISKCON Punjabi Bagh",
    coverImage: null, donateUrl: "https://www.iskconpunjabibagh.com/temple-expansion-project/",
    latitude: 28.667, longitude: 77.130,
  },
  {
    id: 44, name: "Dakshina Dwaraka Dham – ISKCON Chennai", location: "Thiruvanmiyur, Chennai, Tamil Nadu, India",
    deity: "Sri Sri Rukmini Dwarakadhish", description: "A magnificent 40,000 sq. ft. cultural complex designed in Pallava-style architecture as a tribute to ancient South India. Currently building the third-floor temple hall — envisioned as a premier centre for spiritual education, kirtan, and darshan in the heart of Chennai.",
    status: "construction", phase: "Third-floor temple hall construction", constructionProgress: 35,
    fundraisingGoal: 5_000_000, fundraisingRaised: 2_800_000, startDate: "2021-01-01",
    expectedCompletion: "2028-06-30", projectLead: "Hare Krishna Movement Chennai",
    coverImage: null, donateUrl: "https://hkmchennai.org/dakshina-dwaraka",
    latitude: 12.982, longitude: 80.263,
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

// ── Supabase live data ──────────────────────────────────────────────────────

const SUPABASE_URL = "https://etfmndcrchundvgtvmot.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs";

/** Fetch temples from Supabase (live data). Falls back to static TEMPLES on error. */
export async function fetchLiveTemples(): Promise<Temple[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/discovered_temples?select=*&order=id.asc`,
      {
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
        },
      },
    );
    if (!res.ok) return TEMPLES;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return TEMPLES;

    return rows.map((r: any, i: number) => ({
      id: r.id || i + 1,
      name: r.name,
      location: r.location,
      deity: r.deity || "Sri Sri Radha Krishna",
      description: r.description || "",
      status: r.status || "construction",
      phase: r.phase || "",
      constructionProgress: Number(r.construction_progress) || 0,
      fundraisingGoal: Number(r.fundraising_goal) || 0,
      fundraisingRaised: Number(r.fundraising_raised) || 0,
      startDate: r.start_date || "",
      expectedCompletion: r.expected_completion || "",
      projectLead: r.project_lead || "",
      coverImage: r.cover_image || null,
      donateUrl: r.donate_url || null,
      latitude: r.latitude ? Number(r.latitude) : null,
      longitude: r.longitude ? Number(r.longitude) : null,
    }));
  } catch {
    return TEMPLES;
  }
}

export function computeStats(temples: Temple[]) {
  const activeStatuses2 = ["planning", "construction", "finishing"];
  const active2 = temples.filter((t) => activeStatuses2.includes(t.status));
  const byStatus: Record<string, number> = {};
  for (const t of temples) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  return {
    totalTemples: temples.length,
    activeProjects: active2.length,
    totalFundraisingGoal: temples.reduce((s, t) => s + t.fundraisingGoal, 0),
    totalFundraisingRaised: temples.reduce((s, t) => s + t.fundraisingRaised, 0),
    averageProgress: temples.length > 0 ? Math.round(temples.reduce((s, t) => s + t.constructionProgress, 0) / temples.length) : 0,
    templesByStatus: byStatus,
    recentUpdates: [] as unknown[],
  };
}
