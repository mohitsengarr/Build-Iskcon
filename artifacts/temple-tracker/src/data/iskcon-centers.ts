export interface IskconCenter {
  name: string;
  city: string;
  country: string;
  website: string | null;
  donateUrl: string | null;
  insight: string;
}

export interface IskconRegion {
  name: string;
  centers: IskconCenter[];
}

export const ISKCON_STATS = {
  founded: "July 13, 1966",
  founder: "A.C. Bhaktivedanta Swami Prabhupada",
  foundingCity: "New York City, USA",
  globalHQ: "Sri Dham Mayapur, West Bengal, India",
  totalCenters: 800,
  countriesPresent: 100,
  approximateMembers: 1_000_000,
  tvHouseholds: 108_000_000,
  youtubeSubscribers: 29_700_000,
  continents: 6,
};

export const ISKCON_PROGRAMS = [
  {
    name: "Food For Life",
    description:
      "The world's largest plant-based food relief program, serving over 2 million free meals daily across 60+ countries.",
  },
  {
    name: "Akshaya Patra",
    description:
      "One of the world's largest school mid-day meal programs, feeding millions of children daily across India.",
  },
  {
    name: "Book Distribution",
    description:
      "Over 500 million books distributed worldwide in 80+ languages, making Vedic wisdom accessible to all.",
  },
  {
    name: "Gurukulas",
    description:
      "Spiritual education institutions combining traditional Vedic learning with modern academic curriculum.",
  },
];

export const ISKCON_REGIONS: IskconRegion[] = [
  {
    name: "India - Flagship & Heritage Temples",
    centers: [
      { name: "ISKCON Mayapur (Global HQ)", city: "Mayapur, West Bengal", country: "India", website: "https://mayapur.com", donateUrl: "https://mayapur.com/donate", insight: "Spiritual & administrative headquarters; home of the Temple of the Vedic Planetarium (TOVP), one of the largest religious structures under construction globally." },
      { name: "ISKCON Mumbai - Juhu", city: "Mumbai, Maharashtra", country: "India", website: "https://www.iskconmumbai.com", donateUrl: "https://www.iskconmumbai.com/donate", insight: "Opened in 1978, this marble temple complex is one of India's most visited spiritual centers, located in the commercial capital." },
      { name: "ISKCON Mumbai - Chowpatty", city: "Mumbai, Maharashtra", country: "India", website: "https://iskconchowpatty.com", donateUrl: "https://iskconchowpatty.com/donate", insight: "Led by Radhanath Swami; known for youth outreach, spiritual education programs, and a large congregation of professionals." },
      { name: "ISKCON Vrindavan", city: "Vrindavan, Uttar Pradesh", country: "India", website: "https://iskconvrindavan.com", donateUrl: "https://iskconvrindavan.com/donate", insight: "Sri Sri Krishna Balaram Temple; one of the first major Indian temples established by Srila Prabhupada in Krishna's holy land." },
      { name: "ISKCON Bangalore (Hare Krishna Hill)", city: "Bangalore, Karnataka", country: "India", website: "https://www.iskconbangalore.org", donateUrl: "https://www.iskconbangalore.org/donate", insight: "Operates the Akshaya Patra Foundation, one of the world's largest school mid-day meal programs feeding millions of children daily." },
      { name: "ISKCON Delhi - East of Kailash", city: "New Delhi", country: "India", website: "https://www.iskcondelhi.com", donateUrl: "https://www.iskcondelhi.com/donate", insight: "ISKCON's premier center in the national capital; hosts large festivals including Janmashtami and Ratha Yatra." },
      { name: "ISKCON Delhi - Dwarka", city: "New Delhi", country: "India", website: "https://iskcondwarka.org", donateUrl: "https://iskcondwarka.org/donate", insight: "Active temple construction project; runs Food For Life feeding 7 crore+ people; strong community welfare programs." },
      { name: "ISKCON Kolkata", city: "Kolkata, West Bengal", country: "India", website: "https://www.iskconkolkata.com", donateUrl: "https://www.iskconkolkata.com/donate", insight: "Sri Sri Radha Govinda Mandir near Minto Park; deep historical connection to Gaudiya Vaishnavism's Bengali roots." },
      { name: "ISKCON Chennai", city: "Chennai, Tamil Nadu", country: "India", website: "https://www.iskconchennai.com", donateUrl: "https://www.iskconchennai.com/donate", insight: "Major South Indian center with strong congregation; hosts annual Ratha Yatra drawing tens of thousands." },
      { name: "ISKCON Pune", city: "Pune, Maharashtra", country: "India", website: "https://www.iskconpune.com", donateUrl: "https://www.iskconpune.com/donate", insight: "NVCC (New Vedic Cultural Center); growing hub for student outreach in one of India's largest university cities." },
      { name: "ISKCON Hyderabad", city: "Hyderabad, Telangana", country: "India", website: "https://www.iskconhyderabad.com", donateUrl: "https://www.iskconhyderabad.com/donate", insight: "Located in Abids area; strong Annadanam (free food distribution) and youth preaching programs." },
      { name: "ISKCON Ahmedabad", city: "Ahmedabad, Gujarat", country: "India", website: "https://www.iskconahmedabad.com", donateUrl: "https://www.iskconahmedabad.com/donate", insight: "Satellite Road temple on Gandhinagar Highway; active Gujarati congregation with cultural programs." },
      { name: "ISKCON Jaipur", city: "Jaipur, Rajasthan", country: "India", website: "https://www.iskconjaipur.com", donateUrl: "https://www.iskconjaipur.com/donate", insight: "Growing temple in the Pink City; emphasis on Rajasthani cultural integration and tourism outreach." },
      { name: "ISKCON Noida", city: "Noida, Uttar Pradesh", country: "India", website: "https://www.iskconnoida.org", donateUrl: "https://www.iskconnoida.org/donate", insight: "Serves the NCR satellite city; strong youth and IT professional congregation." },
      { name: "ISKCON Navi Mumbai - Kharghar", city: "Navi Mumbai, Maharashtra", country: "India", website: "https://iskcon-navimumbai.org", donateUrl: "https://iskcon-navimumbai.org/donate", insight: "Sri Sri Radha Madan Mohan Temple; newer addition with temple construction, Ayurvedic center, and guesthouse." },
      { name: "ISKCON Greater Noida (Gaur Dham)", city: "Greater Noida, UP", country: "India", website: "https://www.iskcongreaternoida.com", donateUrl: "https://www.iskcongreaternoida.com/donate", insight: "Emerging center in the NCR corridor; active expansion and community programs." },
    ],
  },
  {
    name: "North America - United States",
    centers: [
      { name: "ISKCON Los Angeles (New Dwarka)", city: "Los Angeles, California", country: "USA", website: "https://www.iskconla.com", donateUrl: "https://www.iskconla.com/donate", insight: "Historic 3764 Watseka Ave temple; Srila Prabhupada's Western headquarters. 24-hour live streaming of temple programs." },
      { name: "ISKCON New York City", city: "Brooklyn, New York", country: "USA", website: "https://iskconnyc.com", donateUrl: "https://iskconnyc.com/donate", insight: "305 Schermerhorn St; birthplace of the Hare Krishna movement (originally at 26 Second Avenue, 1966)." },
      { name: "ISKCON Washington D.C.", city: "Potomac, Maryland", country: "USA", website: "https://www.iskconofdc.org", donateUrl: "https://www.iskconofdc.org/donate", insight: "10310 Oaklyn Dr; serves the capital region with spiritual education and outreach." },
      { name: "ISKCON Houston", city: "Houston, Texas", country: "USA", website: "https://www.iskconhouston.org", donateUrl: "https://www.iskconhouston.org/donate", insight: "Strong Indian diaspora community; active Sunday feast and cultural programs." },
      { name: "ISKCON Dallas", city: "Dallas, Texas", country: "USA", website: "https://www.krishnatemple.com", donateUrl: "https://www.krishnatemple.com/donate", insight: "Historic temple; hosts Kirtan 50, one of the prominent annual kirtan festivals in the US." },
      { name: "ISKCON Silicon Valley", city: "San Jose, California", country: "USA", website: "https://iskconsv.com", donateUrl: "https://iskconsv.com/donate", insight: "501(c)(3) non-profit serving the tech corridor; strong youth and professional outreach." },
      { name: "ISKCON Chicago", city: "Naperville, Illinois", country: "USA", website: "https://www.iskconnaperville.org", donateUrl: "https://www.iskconnaperville.org/donate", insight: "Sri Sri Radha Shyamasundara Temple; active deity worship programs and community feasts." },
      { name: "ISKCON Boston", city: "Boston, Massachusetts", country: "USA", website: "https://iskconboston.org", donateUrl: "https://iskconboston.org/donate", insight: "ISKCON of New England; 72 Commonwealth Ave. Active fundraising for altar renovation." },
      { name: "ISKCON Alachua (New Raman Reti)", city: "Alachua, Florida", country: "USA", website: "https://www.iskconalachua.com", donateUrl: "https://www.iskconalachua.com/donate", insight: "One of the largest ISKCON residential communities in the West; home to TOVP Foundation US office." },
      { name: "ISKCON New Vrindaban", city: "Moundsville, West Virginia", country: "USA", website: "https://www.newvrindaban.com", donateUrl: "https://www.newvrindaban.com/donate", insight: "First Hare Krishna farming commune (est. 1968); Prabhupada's Palace of Gold tourist attraction." },
      { name: "ISKCON Denver", city: "Denver, Colorado", country: "USA", website: "https://www.iskcondenver.org", donateUrl: "https://www.iskcondenver.org/donate", insight: "New Badarikasrama; active preaching and community kitchen programs." },
      { name: "ISKCON Atlanta", city: "Atlanta, Georgia", country: "USA", website: "https://www.iskconatlanta.com", donateUrl: "https://www.iskconatlanta.com/donate", insight: "Southeastern hub; strong Sunday feast tradition and book distribution." },
      { name: "ISKCON New Jersey", city: "Towaco, New Jersey", country: "USA", website: "https://www.iskconofnewjersey.org", donateUrl: "https://www.iskconofnewjersey.org/donate", insight: "Temple construction ongoing; sponsor-a-square-foot program; large Indian-American congregation." },
      { name: "ISKCON Spanish Fork", city: "Spanish Fork, Utah", country: "USA", website: "https://www.utahkrishnas.org", donateUrl: "https://www.utahkrishnas.org/donate", insight: "Famous for hosting the largest Krishna-themed Festival of Colors (Holi) in the Western world." },
      { name: "ISKCON Seattle", city: "Seattle, Washington", country: "USA", website: "https://www.iskconseattle.com", donateUrl: "https://www.iskconseattle.com/donate", insight: "Pacific Northwest center; Vedic Cultural Center in Sammamish serving the greater Seattle area." },
    ],
  },
  {
    name: "North America - Canada",
    centers: [
      { name: "ISKCON Toronto", city: "Toronto, Ontario", country: "Canada", website: "https://torontokrishna.com", donateUrl: "https://torontokrishna.com/donate", insight: "243 Avenue Road; one of the largest ISKCON congregations in Canada with registered charity status." },
      { name: "ISKCON Vancouver", city: "Vancouver, BC", country: "Canada", website: "https://www.iskconvancouver.org", donateUrl: "https://www.iskconvancouver.org/donate", insight: "West Coast Canadian center; active farming community at Saranagati Eco Village in Ashcroft, BC." },
      { name: "ISKCON Montreal", city: "Montreal, Quebec", country: "Canada", website: "https://www.iskconmontreal.com", donateUrl: "https://www.iskconmontreal.com/donate", insight: "Bilingual French-English congregation; cultural bridge for French-speaking devotees." },
      { name: "ISKCON Calgary", city: "Calgary, Alberta", country: "Canada", website: "https://www.iskconcalgary.com", donateUrl: "https://www.iskconcalgary.com/donate", insight: "Alberta's primary center; serves Western Canadian Krishna community." },
      { name: "ISKCON Ottawa", city: "Ottawa, Ontario", country: "Canada", website: "https://www.iskconottawa.ca", donateUrl: "https://www.iskconottawa.ca/donate", insight: "Capital city center; government-area outreach and cultural programs." },
      { name: "ISKCON Brampton", city: "Brampton, Ontario", country: "Canada", website: "https://www.iskconbrampton.com", donateUrl: "https://www.iskconbrampton.com/donate", insight: "Bhaktivedanta Cultural Center serving the large South Asian diaspora in the Greater Toronto Area." },
    ],
  },
  {
    name: "United Kingdom & Ireland",
    centers: [
      { name: "ISKCON London - Soho Street", city: "London, England", country: "UK", website: "https://iskcon.london", donateUrl: "https://iskcon.london/donate", insight: "10 Soho Street; the Radha-Krishna Temple has served as a spiritual sanctuary for 50+ years. Runs Food For All charity." },
      { name: "ISKCON Bhaktivedanta Manor", city: "Watford, Hertfordshire", country: "UK", website: "https://www.bhaktivedantamanor.co.uk", donateUrl: "https://www.bhaktivedantamanor.co.uk/donate", insight: "Donated by George Harrison of the Beatles in 1973; ISKCON UK's headquarters. Hosts Europe's largest Janmashtami celebration." },
      { name: "ISKCON Birmingham", city: "Birmingham, England", country: "UK", website: "https://www.iskconbirmingham.org", donateUrl: "https://www.iskconbirmingham.org/donate", insight: "Midlands center; active interfaith engagement and community outreach." },
      { name: "ISKCON Belfast", city: "Belfast, Northern Ireland", country: "UK", website: "https://www.iskconbelfast.com", donateUrl: "https://www.iskconbelfast.com/donate", insight: "Northern Ireland's ISKCON presence; cross-community spiritual engagement." },
      { name: "ISKCON Dublin", city: "Dublin", country: "Ireland", website: "https://www.iskcon.ie", donateUrl: "https://www.iskcon.ie/donate", insight: "Ireland's primary Hare Krishna center with growing European congregation." },
      { name: "ISKCON Coventry", city: "Coventry, England", country: "UK", website: "https://www.iskconcoventry.org", donateUrl: "https://www.iskconcoventry.org/donate", insight: "Active temple in the West Midlands serving university towns." },
    ],
  },
  {
    name: "Continental Europe",
    centers: [
      { name: "ISKCON Berlin", city: "Berlin", country: "Germany", website: "https://www.iskcon-berlin.de", donateUrl: "https://www.iskcon-berlin.de/donate", insight: "Germany's capital center; strong Eastern European outreach after reunification." },
      { name: "ISKCON Paris", city: "Paris", country: "France", website: "https://www.iskconparis.com", donateUrl: "https://www.iskconparis.com/donate", insight: "French headquarters; La Nouvelle Mayapura rural community in Chateauroux." },
      { name: "ISKCON Stockholm", city: "Stockholm", country: "Sweden", website: "https://www.iskcon.se", donateUrl: "https://www.iskcon.se/donate", insight: "Scandinavian headquarters at Fridhemsgatan; Korsnäs Gård rural community nearby." },
      { name: "ISKCON Budapest", city: "Budapest", country: "Hungary", website: "https://www.iskcon.hu", donateUrl: "https://www.iskcon.hu/donate", insight: "Krishna Valley eco-village at Somogyvamos is one of Europe's most successful self-sustaining spiritual communities." },
      { name: "ISKCON Rome", city: "Rome", country: "Italy", website: "https://www.iskconroma.it", donateUrl: "https://www.iskconroma.it/donate", insight: "Italian center; Villa Vrindavan farm community near Florence is a major European retreat center." },
      { name: "ISKCON Amsterdam", city: "Amsterdam", country: "Netherlands", website: "https://www.iskconamsterdam.nl", donateUrl: "https://www.iskconamsterdam.nl/donate", insight: "Dutch headquarters; active outreach in one of Europe's most liberal cities." },
      { name: "ISKCON Radhadesh", city: "Durbuy", country: "Belgium", website: "https://www.radhadesh.com", donateUrl: "https://www.radhadesh.com/donate", insight: "Castle-based temple and retreat; hosts the internationally renowned Radhadesh Mellows kirtan festival." },
      { name: "ISKCON Copenhagen", city: "Copenhagen", country: "Denmark", website: "https://www.iskcon.dk", donateUrl: "https://www.iskcon.dk/donate", insight: "Danish center with Nordic outreach; active Govinda's restaurant." },
      { name: "ISKCON Zurich", city: "Zurich", country: "Switzerland", website: "https://www.iskcon.ch", donateUrl: "https://www.iskcon.ch/donate", insight: "Swiss center serving the German-speaking Alpine region." },
      { name: "ISKCON Barcelona", city: "Barcelona", country: "Spain", website: "https://www.iskconbarcelona.com", donateUrl: "https://www.iskconbarcelona.com/donate", insight: "Spanish center; New Vraja Mandala farm community at Brihuega is a significant European project." },
    ],
  },
  {
    name: "Russia & CIS Countries",
    centers: [
      { name: "ISKCON Moscow", city: "Moscow", country: "Russia", website: "https://www.iskcon.moscow", donateUrl: "https://www.iskcon.moscow/donate", insight: "Largest ISKCON congregation in the world by membership; hundreds of thousands of practitioners across Russia." },
      { name: "ISKCON Saint Petersburg", city: "St. Petersburg", country: "Russia", website: "https://www.krishna.spb.ru", donateUrl: "https://www.krishna.spb.ru/donate", insight: "Second-largest Russian center; strong academic and cultural engagement." },
      { name: "ISKCON Kiev", city: "Kiev", country: "Ukraine", website: "https://www.iskcon.com.ua", donateUrl: "https://www.iskcon.com.ua/donate", insight: "Major CIS center; maintained operations despite regional conflicts." },
      { name: "ISKCON Minsk", city: "Minsk", country: "Belarus", website: "https://www.krishna.by", donateUrl: "https://www.krishna.by/donate", insight: "Belarusian headquarters for Krishna consciousness movement." },
    ],
  },
  {
    name: "Asia-Pacific",
    centers: [
      { name: "ISKCON Sydney", city: "North Sydney", country: "Australia", website: "https://www.iskcon.com.au", donateUrl: "https://www.iskcon.com.au/donate", insight: "Sri Sri Radha Gopinatha Temple at 180 Falcon Street; center of the Bhakti Yoga movement in Australia." },
      { name: "ISKCON Melbourne", city: "Melbourne", country: "Australia", website: "https://www.iskconmelbourne.com.au", donateUrl: "https://www.iskconmelbourne.com.au/donate", insight: "Strong Govinda's restaurant presence; active university outreach. New Gokula Farm community in Millfield." },
      { name: "ISKCON Auckland", city: "Auckland", country: "New Zealand", website: "https://www.iskcon.org.nz", donateUrl: "https://www.iskcon.org.nz/donate", insight: "New Zealand headquarters with rural New Varshana retreat property." },
      { name: "ISKCON Tokyo", city: "Tokyo", country: "Japan", website: "https://www.iskconjapan.com", donateUrl: "https://www.iskconjapan.com/donate", insight: "East Asian center bridging Vedic traditions with Japanese culture." },
      { name: "ISKCON Bangkok", city: "Bangkok", country: "Thailand", website: "https://www.harekrishnabangkok.com", donateUrl: "https://www.harekrishnabangkok.com/donate", insight: "Southeast Asian hub at 139 Soi Puttha Osotha; serves expat and local Thai community." },
      { name: "ISKCON Manila", city: "Manila", country: "Philippines", website: "https://www.iskconmanila.com", donateUrl: "https://www.iskconmanila.com/donate", insight: "Philippine headquarters; strong Harinam (public chanting) tradition." },
      { name: "ISKCON Kuala Lumpur", city: "Kuala Lumpur", country: "Malaysia", website: "https://www.iskconkl.com", donateUrl: "https://www.iskconkl.com/donate", insight: "Malaysian center serving the Hindu diaspora and local spiritual seekers." },
      { name: "ISKCON Hong Kong", city: "Hong Kong", country: "China", website: "https://www.iskconhk.com", donateUrl: "https://www.iskconhk.com/donate", insight: "Greater China outreach center; serves as contact point for Taiwan operations." },
      { name: "ISKCON Singapore", city: "Singapore", country: "Singapore", website: "https://www.iskconsingapore.com", donateUrl: "https://www.iskconsingapore.com/donate", insight: "City-state center; Govinda's Gifts at Mountbatten Road; serves multi-ethnic community." },
      { name: "ISKCON Fiji", city: "Suva", country: "Fiji", website: "https://www.iskconfigri.org", donateUrl: "https://www.iskconfigri.org/donate", insight: "Pacific Islands hub; strong Indo-Fijian community support with multiple centers across the islands." },
    ],
  },
  {
    name: "Africa",
    centers: [
      { name: "ISKCON Durban", city: "Durban", country: "South Africa", website: "https://iskcondurban.net", donateUrl: "https://iskcondurban.net/donate", insight: "Sri Sri Radha Radhanath Temple, celebrating 40th anniversary; runs Govinda's restaurant and sustainability conference." },
      { name: "ISKCON Cape Town", city: "Cape Town", country: "South Africa", website: "https://www.iskconcapetown.org.za", donateUrl: "https://www.iskconcapetown.org.za/donate", insight: "Western Cape center; active community outreach and Food For Life programs." },
      { name: "ISKCON Nairobi", city: "Nairobi", country: "Kenya", website: "https://www.iskconnairobi.org", donateUrl: "https://www.iskconnairobi.org/donate", insight: "East African headquarters; Hare Krishna Land serves as regional coordination center." },
      { name: "ISKCON Lagos", city: "Lagos", country: "Nigeria", website: "https://www.iskconlagos.org", donateUrl: "https://www.iskconlagos.org/donate", insight: "West African center serving Nigeria's largest city; Food For Life programs." },
      { name: "ISKCON Mauritius", city: "Phoenix", country: "Mauritius", website: "https://www.iskconmauritius.org", donateUrl: "https://www.iskconmauritius.org/donate", insight: "Hare Krishna Land at Pont Fer; ISKCON Vedic Farm in Bon Accueil; strong Indo-Mauritian community." },
      { name: "ISKCON Mombasa", city: "Mombasa", country: "Kenya", website: "https://www.iskconmombasa.org", donateUrl: "https://www.iskconmombasa.org/donate", insight: "Coastal Kenyan center; serves both local and Indian diaspora communities." },
    ],
  },
  {
    name: "Latin America & Caribbean",
    centers: [
      { name: "ISKCON Sao Paulo", city: "Sao Paulo", country: "Brazil", website: "https://www.iskconsp.com.br", donateUrl: "https://www.iskconsp.com.br/donate", insight: "Largest Latin American temple; Rua Itapolis in Pacaembu; strong cultural programs in Portuguese." },
      { name: "ISKCON Buenos Aires", city: "Buenos Aires", country: "Argentina", website: "https://www.iskcon.com.ar", donateUrl: "https://www.iskcon.com.ar/donate", insight: "Bhaktivedanta Center; New Gundica Dham farm in Los Corralitos; Spanish-speaking outreach hub." },
      { name: "ISKCON Mexico City", city: "Mexico City", country: "Mexico", website: "https://www.iskconmexico.com", donateUrl: "https://www.iskconmexico.com/donate", insight: "Central American headquarters; Tiburcio Montiel 45, Colonia San Miguel." },
      { name: "ISKCON Santiago", city: "Santiago", country: "Chile", website: "https://www.iskcon.cl", donateUrl: "https://www.iskcon.cl/donate", insight: "South American Pacific coast center; growing Chilean congregation." },
      { name: "ISKCON Lima", city: "Lima", country: "Peru", website: "https://www.iskconperu.com", donateUrl: "https://www.iskconperu.com/donate", insight: "ISKCON Chosica serves the Lima metropolitan area and Andean communities." },
      { name: "ISKCON Trinidad", city: "Debe/Longdenville", country: "Trinidad & Tobago", website: "https://www.iskcontinidad.com", donateUrl: "https://www.iskcontinidad.com/donate", insight: "Caribbean center; strong Indo-Trinidadian heritage community." },
    ],
  },
  {
    name: "Global Digital Platforms",
    centers: [
      { name: "ISKCON.org (Global Official Website)", city: "Global", country: "Global", website: "https://iskcon.org", donateUrl: "https://tovp.org/donate/", insight: "Central ISKCON website managed by the GBC; global events directory and news." },
      { name: "Temple of the Vedic Planetarium (TOVP)", city: "Mayapur, India", country: "India", website: "https://tovp.org", donateUrl: "https://tovp.org/donate", insight: "Srila Prabhupada's most cherished project; among the largest religious structures being built globally." },
      { name: "ISKCON Desire Tree", city: "Global (Digital)", country: "Global", website: "https://iskcondesiretree.com", donateUrl: "https://iskcondesiretree.com/donate", insight: "Largest online ISKCON resource; 108M+ TV households via Hare Krsna channel; 29.7M+ YouTube subscribers." },
      { name: "ISKCON Centres Directory", city: "Global (Digital)", country: "Global", website: "https://centres.iskcon.org", donateUrl: null, insight: "Official global directory for locating any ISKCON center worldwide with map and search." },
      { name: "Mayapur TV", city: "Global (Streaming)", country: "Global", website: "https://www.mayapur.tv", donateUrl: "https://www.mayapur.tv/donate", insight: "Live-streaming 150+ ISKCON centers worldwide; 20,000+ registered viewers; funded entirely by congregation." },
    ],
  },
];

export const TOTAL_CATALOGUED = ISKCON_REGIONS.reduce(
  (sum, r) => sum + r.centers.length,
  0,
);
