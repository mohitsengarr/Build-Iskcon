import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp, staggerContainer, viewportOnce } from "@/lib/animations";
import { Link } from "wouter";
import {
  MapPin, Building2, Globe, ChevronDown, ChevronUp,
  Flame, CheckCircle2, Clock, Star, Heart, Calendar,
} from "lucide-react";

// ── Data ──────────────────────────────────────────────────────────────────────

interface CityEntry {
  name: string;
  note: string;
  priority: "high" | "medium" | "planned";
  existing?: boolean;
}

interface StateEntry {
  state: string;
  type: "state" | "ut";
  region: "North" | "South" | "East" | "West" | "Central" | "Northeast" | "Island";
  capital: string;
  cities: CityEntry[];
  phase: 1 | 2 | 3;
  totalTarget: number;
}

const STATES: StateEntry[] = [
  // ── North India ──
  {
    state: "Uttar Pradesh", type: "state", region: "North", capital: "Lucknow", phase: 1, totalTarget: 7,
    cities: [
      { name: "Mathura–Vrindavan", note: "Birthplace of Krishna; existing ISKCON presence — expand to larger complex", priority: "high", existing: true },
      { name: "Prayagraj (Allahabad)", note: "Kumbh Mela site; major pilgrimage hub with huge footfall", priority: "high", existing: true },
      { name: "Varanasi", note: "Oldest living city; significant Vaishnava heritage and spiritual tourism", priority: "high", existing: true },
      { name: "Lucknow", note: "State capital; large educated professional community ideal for outreach", priority: "high", existing: true },
      { name: "Agra", note: "High tourist inflow; opportunity for cultural & spiritual outreach", priority: "medium" },
      { name: "Kanpur", note: "Industrial city; large working-class population underserved by spiritual centres", priority: "medium", existing: true },
      { name: "Gorakhpur", note: "Gateway to Himalayan pilgrimage routes; rapidly growing city", priority: "planned" },
    ],
  },
  {
    state: "Punjab", type: "state", region: "North", capital: "Chandigarh", phase: 1, totalTarget: 7,
    cities: [
      { name: "Chandigarh", note: "Shared capital with Haryana; highly educated urban population", priority: "high", existing: true },
      { name: "Amritsar", note: "Major pilgrimage city; Harmandir Sahib draws millions — interfaith opportunity", priority: "high", existing: true },
      { name: "Ludhiana", note: "Largest city in Punjab; major commercial and industrial centre", priority: "high", existing: true },
      { name: "Jalandhar", note: "Prominent educational hub with large diaspora connections", priority: "medium" },
      { name: "Patiala", note: "Historical royal city with deep cultural roots", priority: "medium" },
      { name: "Bathinda", note: "Emerging industrial and educational city in southwest Punjab", priority: "planned" },
      { name: "Mohali", note: "IT hub adjacent to Chandigarh; young professional demographic", priority: "planned" },
    ],
  },
  {
    state: "Haryana", type: "state", region: "North", capital: "Chandigarh", phase: 1, totalTarget: 7,
    cities: [
      { name: "Gurugram", note: "India's corporate capital; massive professional population seeking spiritual anchor", priority: "high", existing: true },
      { name: "Faridabad", note: "Largest city in Haryana; industrial belt with dense residential population", priority: "high", existing: true },
      { name: "Kurukshetra", note: "Birthplace of the Bhagavad Gita; essential for ISKCON's mission", priority: "high", existing: true },
      { name: "Panipat", note: "Historic city; growing industrial and residential base", priority: "medium" },
      { name: "Rohtak", note: "Educational centre; Maharshi Dayanand University draws large student body", priority: "medium" },
      { name: "Ambala", note: "Strategic cantonment city; trade and transport hub", priority: "medium" },
      { name: "Hisar", note: "Agricultural and industrial city; serves vast rural hinterland", priority: "planned" },
    ],
  },
  {
    state: "Rajasthan", type: "state", region: "North", capital: "Jaipur", phase: 1, totalTarget: 7,
    cities: [
      { name: "Jaipur", note: "State capital and Pink City; major tourism destination and commercial hub", priority: "high", existing: true },
      { name: "Jodhpur", note: "Blue City; educational and cultural hub of western Rajasthan", priority: "high", existing: true },
      { name: "Udaipur", note: "Lake City; high tourist inflow; strong cultural heritage", priority: "high", existing: true },
      { name: "Kota", note: "Education city; hundreds of thousands of students — ideal for Gita outreach", priority: "high" },
      { name: "Ajmer", note: "Pilgrimage hub; Pushkar nearby has established Vaishnava connection", priority: "medium" },
      { name: "Bikaner", note: "Historical city in Thar; gateway to desert communities", priority: "medium" },
      { name: "Sikar", note: "Fast-growing city serving massive student and business population", priority: "planned" },
    ],
  },
  {
    state: "Himachal Pradesh", type: "state", region: "North", capital: "Shimla", phase: 2, totalTarget: 7,
    cities: [
      { name: "Shimla", note: "State capital; mountain tourism capital of north India", priority: "high" },
      { name: "Dharamshala", note: "International spiritual hub; high inflow of seekers from around the world", priority: "high" },
      { name: "Manali", note: "Gateway to Ladakh; popular youth and adventure tourism destination", priority: "medium" },
      { name: "Mandi", note: "Commercial and cultural hub of the Kullu-Mandi valley", priority: "medium" },
      { name: "Solan", note: "Industrial city near Chandigarh; growing residential population", priority: "medium" },
      { name: "Baddi", note: "Largest industrial town in HP; significant workforce community", priority: "planned" },
      { name: "Palampur", note: "University town; gateway to Kangra valley", priority: "planned" },
    ],
  },
  {
    state: "Uttarakhand", type: "state", region: "North", capital: "Dehradun", phase: 1, totalTarget: 7,
    cities: [
      { name: "Haridwar", note: "Holiest Ganga ghats; Hare Krishna chanting resonates deeply here", priority: "high", existing: true },
      { name: "Rishikesh", note: "World yoga capital; global spiritual seekers converge year-round", priority: "high", existing: true },
      { name: "Dehradun", note: "State capital; growing IT and education hub in the Doon Valley", priority: "high", existing: true },
      { name: "Roorkee", note: "IIT Roorkee city; large student population ideal for Bhakti-Yoga outreach", priority: "medium" },
      { name: "Haldwani", note: "Commercial gateway to Kumaon; largest city in the hills", priority: "medium" },
      { name: "Nainital", note: "Tourism and education hub in Kumaon hills", priority: "medium" },
      { name: "Kotdwar", note: "Gateway to Pauri Garhwal; serves vast hill district population", priority: "planned" },
    ],
  },
  // ── Central India ──
  {
    state: "Madhya Pradesh", type: "state", region: "Central", capital: "Bhopal", phase: 1, totalTarget: 7,
    cities: [
      { name: "Indore", note: "Cleanest city in India; thriving business and education ecosystem", priority: "high", existing: true },
      { name: "Bhopal", note: "State capital; large government and professional community", priority: "high", existing: true },
      { name: "Ujjain", note: "Ancient sacred city; one of the twelve Jyotirlinga sites and Kumbh Mela venue", priority: "high", existing: true },
      { name: "Jabalpur", note: "Educational and military hub of central MP", priority: "medium", existing: true },
      { name: "Gwalior", note: "Historical fortress city; cultural capital of northern MP", priority: "medium" },
      { name: "Rewa", note: "Educational and administrative centre for eastern MP", priority: "planned" },
      { name: "Satna", note: "Cement industry hub; gateway to Khajuraho pilgrimage circuit", priority: "planned" },
    ],
  },
  {
    state: "Chhattisgarh", type: "state", region: "Central", capital: "Raipur", phase: 2, totalTarget: 7,
    cities: [
      { name: "Raipur", note: "State capital; fastest-growing city in central India", priority: "high", existing: true },
      { name: "Bhilai", note: "Steel city; large workers' township with community building potential", priority: "high" },
      { name: "Bilaspur", note: "Educational and judicial hub; Bilaspur High Court city", priority: "medium" },
      { name: "Durg", note: "Twin city of Bhilai; dense residential and commercial area", priority: "medium" },
      { name: "Korba", note: "Industrial power city; significant workforce requiring spiritual support", priority: "medium" },
      { name: "Jagdalpur", note: "Tribal heartland and capital of Bastar; unique outreach opportunity", priority: "planned" },
      { name: "Ambikapur", note: "Educational hub for tribal north Chhattisgarh", priority: "planned" },
    ],
  },
  // ── West India ──
  {
    state: "Maharashtra", type: "state", region: "West", capital: "Mumbai", phase: 1, totalTarget: 7,
    cities: [
      { name: "Mumbai", note: "Financial capital; existing Juhu ISKCON temple — expand with additional centre", priority: "high", existing: true },
      { name: "Pune", note: "Education and IT hub; strong existing devotee community", priority: "high", existing: true },
      { name: "Nagpur", note: "Geographical centre of India; gateway to central and eastern India", priority: "high", existing: true },
      { name: "Nashik", note: "Wine and grapes city; Kumbh Mela venue; strong religious culture", priority: "medium", existing: true },
      { name: "Aurangabad (Chhatrapati Sambhajinagar)", note: "Ajanta–Ellora tourism hub; historical cultural significance", priority: "medium", existing: true },
      { name: "Solapur", note: "Textile industry city; gateway to Pandharpur pilgrimage", priority: "planned", existing: true },
      { name: "Kolhapur", note: "Historical princely city; strong Varkari devotional tradition nearby", priority: "planned", existing: true },
    ],
  },
  {
    state: "Gujarat", type: "state", region: "West", capital: "Gandhinagar", phase: 1, totalTarget: 7,
    cities: [
      { name: "Ahmedabad", note: "Largest city in Gujarat; existing ISKCON temple; strong devotee base", priority: "high", existing: true },
      { name: "Surat", note: "Diamond and textile capital; massive business community", priority: "high", existing: true },
      { name: "Vadodara", note: "Cultural capital of Gujarat; Baroda University hub", priority: "high", existing: true },
      { name: "Rajkot", note: "Rapidly growing city; strong business and industrial base", priority: "medium", existing: true },
      { name: "Bhavnagar", note: "Coastal city; significant port activity and educational institutions", priority: "medium" },
      { name: "Jamnagar", note: "Brass city; Jio Refinery hub; growing industrial township", priority: "medium" },
      { name: "Gandhinagar", note: "State capital and IT hub; proximity to Akshardham Gandhinagar", priority: "planned" },
    ],
  },
  {
    state: "Goa", type: "state", region: "West", capital: "Panaji", phase: 2, totalTarget: 7,
    cities: [
      { name: "Panaji", note: "State capital; international tourism gateway", priority: "high", existing: true },
      { name: "Margao", note: "Largest commercial city in South Goa", priority: "high" },
      { name: "Vasco da Gama", note: "Port and industrial city; Mormugao harbour hub", priority: "medium" },
      { name: "Mapusa", note: "Northern Goa trade hub; weekly flea market draws thousands", priority: "medium" },
      { name: "Ponda", note: "Temple town of Goa; rich Hindu temple culture", priority: "medium" },
      { name: "Calangute", note: "Biggest beach resort; opportunity for spiritual outreach to tourists", priority: "planned" },
      { name: "Pernem", note: "Northernmost Goa; quieter demographics ideal for retreat-style temple", priority: "planned" },
    ],
  },
  // ── South India ──
  {
    state: "Karnataka", type: "state", region: "South", capital: "Bengaluru", phase: 1, totalTarget: 7,
    cities: [
      { name: "Bengaluru", note: "IT capital of India; large cosmopolitan and youth population", priority: "high", existing: true },
      { name: "Mysuru", note: "City of Palaces; major cultural and pilgrimage centre", priority: "high" },
      { name: "Mangaluru", note: "Coastal educational hub; gateway to Tulu Nadu", priority: "high", existing: true },
      { name: "Hubballi-Dharwad", note: "Largest twin city in north Karnataka; educational and commercial hub", priority: "medium" },
      { name: "Belagavi", note: "Border city between Maharashtra and Karnataka; trilingual community", priority: "medium", existing: true },
      { name: "Udupi", note: "Birthplace of Madhvacharya; deep Vaishnava heritage — ideal spiritual anchor", priority: "high", existing: true },
      { name: "Shivamogga", note: "Western Ghats gateway; emerging educational and commercial city", priority: "planned" },
    ],
  },
  {
    state: "Tamil Nadu", type: "state", region: "South", capital: "Chennai", phase: 1, totalTarget: 7,
    cities: [
      { name: "Chennai", note: "Metro capital; established ISKCON presence — additional centre needed", priority: "high", existing: true },
      { name: "Coimbatore", note: "Manchester of India; large industrial and entrepreneurial population", priority: "high", existing: true },
      { name: "Madurai", note: "Temple city; ancient Vaishnava and Shaiva heritage", priority: "high", existing: true },
      { name: "Tiruchirappalli (Trichy)", note: "Spiritual and educational hub; Sri Ranganathaswamy near vicinity", priority: "medium" },
      { name: "Salem", note: "Steel city of Tamil Nadu; growing commercial and educational centre", priority: "medium", existing: true },
      { name: "Tirunelveli", note: "Southern most major city; gateway to Kanyakumari pilgrimage", priority: "planned", existing: true },
      { name: "Vellore", note: "Medical and educational hub; CMC Vellore draws pan-India population", priority: "planned", existing: true },
    ],
  },
  {
    state: "Telangana", type: "state", region: "South", capital: "Hyderabad", phase: 1, totalTarget: 7,
    cities: [
      { name: "Hyderabad", note: "Cyberabad tech hub; existing ISKCON temple — expand with second centre", priority: "high", existing: true },
      { name: "Warangal", note: "Ancient Kakatiya capital; growing educational and commercial city", priority: "high", existing: true },
      { name: "Nizamabad", note: "Northern Telangana's trade hub; gateway to Marathwada", priority: "medium" },
      { name: "Karimnagar", note: "Granite city; industrially significant with growing urban population", priority: "medium" },
      { name: "Khammam", note: "Minerals and coal hub; large workforce community", priority: "medium" },
      { name: "Ramagundam", note: "NTPC power city; significant township population", priority: "planned" },
      { name: "Nalgonda", note: "Agricultural city; serves vast Krishna-Godavari delta region", priority: "planned" },
    ],
  },
  {
    state: "Andhra Pradesh", type: "state", region: "South", capital: "Amaravati", phase: 1, totalTarget: 7,
    cities: [
      { name: "Tirupati", note: "World's most visited pilgrimage site; ISKCON presence essential", priority: "high", existing: true },
      { name: "Visakhapatnam", note: "Port city and IT hub; rapidly growing metro", priority: "high", existing: true },
      { name: "Vijayawada", note: "Commercial capital of AP; gateway to Krishna-Godavari delta", priority: "high", existing: true },
      { name: "Guntur", note: "Chilli and cotton trade city; large business community", priority: "medium", existing: true },
      { name: "Nellore", note: "Aquaculture hub; gateway to coastal Andhra", priority: "medium", existing: true },
      { name: "Kurnool", note: "Former state capital; strategic location on NH-44 corridor", priority: "planned" },
      { name: "Rajamahendravaram (Rajahmundry)", note: "Cultural capital of AP; gateway to Godavari region", priority: "planned", existing: true },
    ],
  },
  {
    state: "Kerala", type: "state", region: "South", capital: "Thiruvananthapuram", phase: 1, totalTarget: 7,
    cities: [
      { name: "Thiruvananthapuram", note: "State capital and IT hub; Padmanabhaswamy temple district", priority: "high", existing: true },
      { name: "Kochi", note: "Commercial capital; cosmopolitan port city with international exposure", priority: "high" },
      { name: "Kozhikode (Calicut)", note: "Cultural capital of north Kerala; major educational centre", priority: "high" },
      { name: "Thrissur", note: "Cultural capital of Kerala; home of Thrissur Pooram", priority: "medium" },
      { name: "Kollam", note: "Cashew export hub; gateway to Ashtamudi backwaters", priority: "medium" },
      { name: "Palakkad", note: "Gateway to Kerala through the Palakkad Gap; rapidly growing", priority: "planned" },
      { name: "Kannur", note: "Malabar's cultural hub; strong community identity", priority: "planned", existing: true },
    ],
  },
  // ── East India ──
  {
    state: "West Bengal", type: "state", region: "East", capital: "Kolkata", phase: 1, totalTarget: 7,
    cities: [
      { name: "Kolkata", note: "Cultural capital; Mayapur is the global ISKCON HQ — additional city centre needed", priority: "high", existing: true },
      { name: "Mayapur (Nadia)", note: "ISKCON World Headquarters; TOVP 2027 Grand Opening site", priority: "high", existing: true },
      { name: "Siliguri", note: "Gateway to Northeast India and Bhutan; major commercial city", priority: "high", existing: true },
      { name: "Durgapur", note: "Steel city; planned industrial township with large workforce", priority: "medium", existing: true },
      { name: "Asansol", note: "Coal capital of India; second largest city in WB", priority: "medium" },
      { name: "Kharagpur", note: "IIT Kharagpur city; large student and academic community", priority: "planned" },
      { name: "Haldia", note: "Port city and petrochem hub; major industrial township", priority: "planned" },
    ],
  },
  {
    state: "Odisha", type: "state", region: "East", capital: "Bhubaneswar", phase: 1, totalTarget: 7,
    cities: [
      { name: "Puri", note: "Jagannath Dham — one of the four sacred dhams; ISKCON has deep roots here", priority: "high", existing: true },
      { name: "Bhubaneswar", note: "Temple city and IT hub; fastest growing state capital", priority: "high", existing: true },
      { name: "Cuttack", note: "Silver city; major commercial and cultural hub of Odisha", priority: "high", existing: true },
      { name: "Rourkela", note: "Steel city; NIT Rourkela — large academic and industrial community", priority: "medium" },
      { name: "Berhampur", note: "Commercial capital of south Odisha; gateway to Ganjam district", priority: "medium" },
      { name: "Sambalpur", note: "Cultural capital of western Odisha; Hirakud reservoir region", priority: "planned" },
      { name: "Brahmapur", note: "Silk weaving heritage city; serves coastal south Odisha", priority: "planned" },
    ],
  },
  {
    state: "Bihar", type: "state", region: "East", capital: "Patna", phase: 2, totalTarget: 7,
    cities: [
      { name: "Patna", note: "State capital and one of the oldest cities; massive student population", priority: "high", existing: true },
      { name: "Gaya", note: "Major pilgrimage site; Bodh Gaya nearby draws international seekers", priority: "high" },
      { name: "Muzaffarpur", note: "Commercial hub of north Bihar; large agrarian community", priority: "medium" },
      { name: "Bhagalpur", note: "Silk city on the Ganges; gateway to Jharkhand and WB", priority: "medium" },
      { name: "Darbhanga", note: "Cultural capital of Mithila; Maithili language and arts heritage", priority: "medium" },
      { name: "Purnia", note: "Emerging commercial hub; gateway to northeast India", priority: "planned" },
      { name: "Begusarai", note: "Industrial city; petrochemical hub of Bihar", priority: "planned" },
    ],
  },
  {
    state: "Jharkhand", type: "state", region: "East", capital: "Ranchi", phase: 2, totalTarget: 7,
    cities: [
      { name: "Ranchi", note: "State capital and IT hub; growing tribal and cosmopolitan mix", priority: "high" },
      { name: "Jamshedpur", note: "Tata Steel city; one of India's best-planned industrial townships", priority: "high" },
      { name: "Dhanbad", note: "Coal capital of India; large mining community", priority: "medium" },
      { name: "Bokaro", note: "Bokaro Steel City; planned township with diverse workforce", priority: "medium" },
      { name: "Hazaribagh", note: "Historical city with educational institutions; scenic hill environment", priority: "medium" },
      { name: "Deoghar", note: "Baidyanath Jyotirlinga pilgrimage city; massive religious footfall", priority: "planned" },
      { name: "Giridih", note: "Mining city; serves Chota Nagpur plateau community", priority: "planned" },
    ],
  },
  // ── Northeast India ──
  {
    state: "Assam", type: "state", region: "Northeast", capital: "Dispur", phase: 2, totalTarget: 7,
    cities: [
      { name: "Guwahati", note: "Gateway city to all of Northeast India; rapid urbanisation", priority: "high", existing: true },
      { name: "Dibrugarh", note: "Tea capital of the world; economic hub of upper Assam", priority: "high", existing: true },
      { name: "Silchar", note: "Commercial hub of the Barak Valley; gateway to Mizoram and Manipur", priority: "medium", existing: true },
      { name: "Jorhat", note: "Historical tea garden city; agricultural and educational centre", priority: "medium" },
      { name: "Nagaon", note: "Largest city on the south bank; central Assam trade hub", priority: "medium" },
      { name: "Tinsukia", note: "Oil and tea trading hub; rapidly growing border city", priority: "planned" },
      { name: "Tezpur", note: "Cultural city on the Brahmaputra; Tezpur University hub", priority: "planned" },
    ],
  },
  {
    state: "Manipur", type: "state", region: "Northeast", capital: "Imphal", phase: 3, totalTarget: 7,
    cities: [
      { name: "Imphal", note: "State capital; Manipuris have deep Vaishnava cultural roots", priority: "high", existing: true },
      { name: "Bishnupur", note: "Ancient Vaishnava kingdom; named after Lord Vishnu — ideal site", priority: "high" },
      { name: "Thoubal", note: "Commercial hub of the Imphal Valley; growing residential area", priority: "medium" },
      { name: "Churachandpur", note: "Hub of southern Manipur hill districts; diverse community", priority: "medium" },
      { name: "Senapati", note: "Northern hills gateway; serves Naga and Kuki communities", priority: "planned" },
      { name: "Ukhrul", note: "Strategic border town; growing educational institutions", priority: "planned" },
      { name: "Moreh", note: "India-Myanmar border trade town; international gateway opportunity", priority: "planned" },
    ],
  },
  {
    state: "Meghalaya", type: "state", region: "Northeast", capital: "Shillong", phase: 3, totalTarget: 7,
    cities: [
      { name: "Shillong", note: "Scotland of the East; major educational and cultural hub", priority: "high" },
      { name: "Tura", note: "Commercial hub of the Garo Hills; gateway to Bangladesh border", priority: "medium" },
      { name: "Jowai", note: "Administrative centre of the Jaintia Hills", priority: "medium" },
      { name: "Nongstoin", note: "West Khasi Hills district headquarters", priority: "planned" },
      { name: "Baghmara", note: "South Garo Hills commercial centre", priority: "planned" },
      { name: "Williamnagar", note: "East Garo Hills headquarters; emerging administrative town", priority: "planned" },
      { name: "Resubelpara", note: "North Garo Hills gateway; growing border community", priority: "planned" },
    ],
  },
  {
    state: "Nagaland", type: "state", region: "Northeast", capital: "Kohima", phase: 3, totalTarget: 7,
    cities: [
      { name: "Kohima", note: "State capital; WWII heritage and cultural significance", priority: "high" },
      { name: "Dimapur", note: "Largest city and commercial gateway of Nagaland", priority: "high" },
      { name: "Mokokchung", note: "Cultural heartland of the Ao Nagas; educational hub", priority: "medium" },
      { name: "Tuensang", note: "Largest district HQ in Nagaland; eastern gateway", priority: "medium" },
      { name: "Wokha", note: "Lotha Naga cultural centre; growing urban population", priority: "planned" },
      { name: "Zunheboto", note: "Sumi Naga cultural centre; gateway to rural Nagaland", priority: "planned" },
      { name: "Mon", note: "Konyak Naga territory; strategic Indo-Myanmar border area", priority: "planned" },
    ],
  },
  {
    state: "Arunachal Pradesh", type: "state", region: "Northeast", capital: "Itanagar", phase: 3, totalTarget: 7,
    cities: [
      { name: "Itanagar", note: "State capital; growing administrative and commercial centre", priority: "high" },
      { name: "Naharlagun", note: "Twin city of Itanagar; major commercial township", priority: "high" },
      { name: "Pasighat", note: "Oldest town in AP; gateway to Siang district", priority: "medium" },
      { name: "Tawang", note: "Buddhist monastery town; international border area; spiritual significance", priority: "medium" },
      { name: "Ziro", note: "UNESCO-listed Apatani cultural landscape; tourism potential", priority: "planned" },
      { name: "Tezu", note: "Commercial hub of Lohit district; border trade centre", priority: "planned" },
      { name: "Bomdila", note: "Gateway to Tawang; strategic mountain town", priority: "planned" },
    ],
  },
  {
    state: "Mizoram", type: "state", region: "Northeast", capital: "Aizawl", phase: 3, totalTarget: 7,
    cities: [
      { name: "Aizawl", note: "State capital perched on hills; the most literate state capital in India", priority: "high" },
      { name: "Lunglei", note: "Second largest city; southern Mizoram commercial hub", priority: "medium" },
      { name: "Champhai", note: "Myanmar border town; Rice Bowl of Mizoram", priority: "medium" },
      { name: "Kolasib", note: "Northern Mizoram gateway; border with Assam", priority: "planned" },
      { name: "Serchhip", note: "Industrial and educational town; district headquarters", priority: "planned" },
      { name: "Saiha", note: "Southernmost district HQ; gateway to Chin State, Myanmar", priority: "planned" },
      { name: "Lawngtlai", note: "Southernmost Mizoram; diverse tribal community outreach", priority: "planned" },
    ],
  },
  {
    state: "Tripura", type: "state", region: "Northeast", capital: "Agartala", phase: 3, totalTarget: 7,
    cities: [
      { name: "Agartala", note: "State capital; major commercial and cultural hub of Tripura", priority: "high", existing: true },
      { name: "Udaipur", note: "Historical pilgrimage city; Tripura Sundari temple", priority: "high" },
      { name: "Dharmanagar", note: "Northern Tripura's largest commercial city", priority: "medium" },
      { name: "Kailasahar", note: "Educational and administrative hub of Unakoti district", priority: "medium" },
      { name: "Belonia", note: "Southern Tripura gateway; Bangladesh border trade point", priority: "planned" },
      { name: "Sabroom", note: "Southernmost tip of Tripura; Feni river gateway to Bangladesh", priority: "planned" },
      { name: "Ambassa", note: "Gateway to Khowai district; growing commercial centre", priority: "planned" },
    ],
  },
  {
    state: "Sikkim", type: "state", region: "Northeast", capital: "Gangtok", phase: 3, totalTarget: 7,
    cities: [
      { name: "Gangtok", note: "State capital; major Buddhist culture hub and tourism centre", priority: "high" },
      { name: "Namchi", note: "South Sikkim; hosts the famous Char Dham replica park", priority: "high" },
      { name: "Jorethang", note: "Commercial hub of south Sikkim; gateway to West Bengal", priority: "medium" },
      { name: "Geyzing", note: "West Sikkim headquarters; cultural heartland", priority: "medium" },
      { name: "Mangan", note: "North Sikkim gateway; Teesta river valley", priority: "planned" },
      { name: "Ravangla", note: "High altitude spiritual retreat town; growing tourism", priority: "planned" },
      { name: "Rangpo", note: "Eastern gateway to Sikkim; major border crossing from WB", priority: "planned" },
    ],
  },
  // ── Union Territories ──
  {
    state: "Delhi NCT", type: "ut", region: "North", capital: "New Delhi", phase: 1, totalTarget: 7,
    cities: [
      { name: "East Delhi (ISKCON Temple, Noida)", note: "Existing ISKCON Temple near East Delhi — flagship centre", priority: "high", existing: true },
      { name: "Dwarka", note: "Fastest-growing sub-city; over 1 million residents", priority: "high" },
      { name: "Rohini", note: "Largest residential zone in Delhi; underserved by spiritual centres", priority: "high" },
      { name: "Janakpuri", note: "West Delhi hub; major residential and commercial district", priority: "medium" },
      { name: "Saket–South Delhi", note: "High-income residential belt; educated professional community", priority: "medium" },
      { name: "Shahdara", note: "Dense East Delhi township; large working-class community", priority: "planned" },
      { name: "Najafgarh", note: "Outer Delhi rural-urban fringe; rapidly urbanising", priority: "planned" },
    ],
  },
  {
    state: "Jammu & Kashmir", type: "ut", region: "North", capital: "Srinagar (S) / Jammu (W)", phase: 2, totalTarget: 7,
    cities: [
      { name: "Jammu", note: "Winter capital; Hindu pilgrimage hub and gateway to Vaishno Devi", priority: "high", existing: true },
      { name: "Srinagar", note: "Summer capital; Dal Lake and Shankaracharya Hill — spiritual heritage", priority: "high", existing: true },
      { name: "Anantnag", note: "Kashmir Valley commercial hub; gateway to Pahalgam", priority: "medium" },
      { name: "Kathua", note: "Jammu's industrial gateway; border with Himachal Pradesh", priority: "medium" },
      { name: "Udhampur", note: "Army and civil hub on NH-44; gateway to Kashmir Valley", priority: "medium" },
      { name: "Rajouri", note: "Pir Panjal gateway; diverse religious demographic", priority: "planned" },
      { name: "Kulgam", note: "Southern Kashmir; emerging developmental centre", priority: "planned" },
    ],
  },
  {
    state: "Ladakh", type: "ut", region: "North", capital: "Leh", phase: 3, totalTarget: 7,
    cities: [
      { name: "Leh", note: "Administrative capital; international tourism and spiritual retreat destination", priority: "high" },
      { name: "Kargil", note: "Second largest city; gateway to Zanskar Valley", priority: "medium" },
      { name: "Diskit", note: "Nubra Valley hub; Hundur sand dunes and Bactrian camels", priority: "planned" },
      { name: "Padum", note: "Zanskar Valley capital; remote but spiritually significant", priority: "planned" },
      { name: "Nyoma", note: "Remote Changthang plateau; border community outreach", priority: "planned" },
      { name: "Sankoo", note: "Suru Valley gateway; growing administrative centre", priority: "planned" },
      { name: "Turtuk", note: "Northernmost Indian village accessible by road", priority: "planned" },
    ],
  },
  {
    state: "Puducherry", type: "ut", region: "South", capital: "Puducherry", phase: 2, totalTarget: 5,
    cities: [
      { name: "Puducherry", note: "Former French colony; international spiritual tourism; Auroville nearby", priority: "high", existing: true },
      { name: "Karaikal", note: "Coastal enclave; significant Tamil Hindu population", priority: "medium" },
      { name: "Mahe", note: "Kerala enclave; Malayalam-speaking coastal community", priority: "medium" },
      { name: "Yanam", note: "Andhra enclave; Telugu-speaking community near Godavari delta", priority: "planned" },
      { name: "Oulgaret", note: "Largest commune in Puducherry; growing residential suburb", priority: "planned" },
    ],
  },
  {
    state: "Andaman & Nicobar Islands", type: "ut", region: "Island", capital: "Port Blair", phase: 3, totalTarget: 7,
    cities: [
      { name: "Port Blair", note: "Capital and largest city; major naval and tourist base", priority: "high", existing: true },
      { name: "Diglipur", note: "Northernmost town of Andaman; agriculture and eco-tourism", priority: "medium" },
      { name: "Rangat", note: "Middle Andaman hub; growing residential and commercial centre", priority: "medium" },
      { name: "Mayabunder", note: "Karen community area; diverse ethnic and cultural mix", priority: "planned" },
      { name: "Neil Island (Shaheed Dweep)", note: "Tourism island; spiritually peaceful location", priority: "planned" },
      { name: "Havelock Island (Swaraj Dweep)", note: "International scuba diving destination", priority: "planned" },
      { name: "Car Nicobar", note: "Nicobar group; strategic community outreach opportunity", priority: "planned" },
    ],
  },
  {
    state: "Lakshadweep", type: "ut", region: "Island", capital: "Kavaratti", phase: 3, totalTarget: 7,
    cities: [
      { name: "Kavaratti", note: "Administrative capital; central Lakshadweep island", priority: "high" },
      { name: "Agatti", note: "Only airport island; tourism gateway to the archipelago", priority: "medium" },
      { name: "Minicoy", note: "Southernmost island; closest to Maldives; unique Mahl culture", priority: "medium" },
      { name: "Amini", note: "Oldest inhabited island; deep-rooted community", priority: "planned" },
      { name: "Andrott", note: "Most populous island; largest community in Lakshadweep", priority: "planned" },
      { name: "Kalpeni", note: "Tourist island with coral atoll; environmental significance", priority: "planned" },
      { name: "Kadmat", note: "Water sports and eco-tourism island", priority: "planned" },
    ],
  },
];

// ── Summary Stats ─────────────────────────────────────────────────────────────

const TOTAL_TARGET = 211;
const TOTAL_STATES = STATES.length;
const EXISTING = STATES.flatMap((s) => s.cities).filter((c) => c.existing).length;
const PHASE_COUNTS = [1, 2, 3].map((p) => ({
  phase: p,
  count: STATES.filter((s) => s.phase === p).reduce((acc, s) => acc + s.totalTarget, 0),
  states: STATES.filter((s) => s.phase === p).length,
}));

const PRIORITY_COLOR = {
  high: "text-amber-400",
  medium: "text-orange-400",
  planned: "text-on-surface-variant/50",
};

const PHASE_LABELS: Record<number, string> = {
  1: "2026–2031",
  2: "2031–2041",
  3: "2041–2051",
};
const PHASE_COLORS: Record<number, string> = {
  1: "bg-amber-900/30 text-amber-300 border-amber-700/30",
  2: "bg-amber-800/20 text-amber-200 border-amber-600/30",
  3: "bg-amber-700/15 text-amber-100 border-amber-500/30",
};
const REGION_LIST = ["All", "North", "South", "East", "West", "Central", "Northeast", "Island"];

// ── Gauge Meter ──────────────────────────────────────────────────────────────

interface GaugeProps {
  title: string;
  subtitle: string;
  goal: number;
  raised: number;
  max: number;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000_000) { const v = n / 1_000_000_000; return `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}B`; }
  if (n >= 1_000_000) { const v = n / 1_000_000; return `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`; }
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function GaugeMeter({ title, subtitle, goal, raised, max }: GaugeProps) {
  const pct = Math.min(raised / max, 1);
  const startAngle = -210;
  const endAngle = 30;
  const sweep = endAngle - startAngle;
  const needleAngle = startAngle + pct * sweep;
  const r = 80;
  const cx = 100;
  const cy = 100;

  const arcSegments = [
    { frac: 0.33, color: "#E65100" },
    { frac: 0.33, color: "#F9A825" },
    { frac: 0.34, color: "#2E7D32" },
  ];

  function polarToCartesian(angle: number) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(start: number, end: number) {
    const s = polarToCartesian(start);
    const e = polarToCartesian(end);
    const largeArc = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  }

  let segStart = startAngle;
  const segments = arcSegments.map((seg) => {
    const segEnd = segStart + seg.frac * sweep;
    const path = arcPath(segStart, segEnd);
    segStart = segEnd;
    return { path, color: seg.color };
  });

  const ticks = 8;
  const tickLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const angle = startAngle + (i / ticks) * sweep;
    const inner = polarToCartesian(angle);
    const outerR = r + 8;
    const rad = (angle * Math.PI) / 180;
    const outer = { x: cx + outerR * Math.cos(rad), y: cy + outerR * Math.sin(rad) };
    const labelR = r + 18;
    const labelPos = { x: cx + labelR * Math.cos(rad), y: cy + labelR * Math.sin(rad) };
    const val = Math.round((i / ticks) * max);
    return { inner, outer, labelPos, val };
  });

  const needleTip = polarToCartesian(needleAngle);
  const needleRad = (needleAngle * Math.PI) / 180;
  const bw = 4;
  const baseL = { x: cx + bw * Math.cos(needleRad + Math.PI / 2), y: cy + bw * Math.sin(needleRad + Math.PI / 2) };
  const baseR = { x: cx + bw * Math.cos(needleRad - Math.PI / 2), y: cy + bw * Math.sin(needleRad - Math.PI / 2) };

  return (
    <div className="flex flex-col items-center">
      <h3 className="font-serif text-lg sm:text-xl font-black text-on-surface text-center">{title}</h3>
      <p className="text-xs text-on-surface-variant text-center mb-2">{subtitle}: {formatAmount(goal)}</p>
      <svg viewBox="0 0 200 130" className="w-full max-w-[220px]">
        {segments.map((seg, i) => (
          <path key={i} d={seg.path} fill="none" stroke={seg.color} strokeWidth="14" strokeLinecap="butt" opacity="0.85" />
        ))}
        {tickLines.map((t, i) => (
          <g key={i}>
            <line x1={t.inner.x} y1={t.inner.y} x2={t.outer.x} y2={t.outer.y} stroke="#5C4033" strokeWidth="1" opacity="0.3" />
            <text x={t.labelPos.x} y={t.labelPos.y} textAnchor="middle" dominantBaseline="middle" fill="#5C4033" fontSize="6" fontWeight="600" opacity="0.5">
              {formatAmount(t.val)}
            </text>
          </g>
        ))}
        <polygon points={`${needleTip.x},${needleTip.y} ${baseL.x},${baseL.y} ${baseR.x},${baseR.y}`} fill="#3D2B1F" />
        <circle cx={cx} cy={cy} r="6" fill="#3D2B1F" />
        <circle cx={cx} cy={cy} r="3" fill="#FFFBF5" />
      </svg>
      <p className="font-black text-2xl sm:text-3xl text-primary mt-1 font-serif">{formatAmount(raised)}</p>
      <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mt-0.5">
        {Math.round((raised / goal) * 100)}% of goal
      </p>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function StateCard({ entry }: { entry: StateEntry }) {
  const [open, setOpen] = useState(false);
  const existingCount = entry.cities.filter(c => c.existing).length;
  const progressPct = entry.totalTarget > 0 ? (existingCount / entry.totalTarget) * 100 : 0;

  return (
    <motion.div variants={fadeInUp} className="bg-surface-container rounded-2xl border border-on-surface-variant/10 overflow-hidden">
      {/* Header */}
      <button
        className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-primary/5 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${entry.type === "ut" ? "bg-primary/8" : "bg-primary/10"}`}>
            {entry.type === "ut" ? <Globe className="w-4 h-4 text-primary" /> : <MapPin className="w-4 h-4 text-primary" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif font-bold text-on-surface text-base">{entry.state}</h3>
              <span className="text-xs text-on-surface-variant/50 hidden sm:inline">({entry.capital})</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${PHASE_COLORS[entry.phase]}`}>
                Phase {entry.phase} · {PHASE_LABELS[entry.phase]}
              </span>
              <span className="text-xs text-on-surface-variant/60">{entry.region}</span>
              {existingCount > 0 && (
                <span className="text-xs text-primary font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {existingCount} existing
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-24 h-1.5 bg-on-surface-variant/10 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-[10px] font-bold text-on-surface-variant/50">{existingCount} / {entry.totalTarget} built</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-on-surface-variant/60">Target</p>
            <p className="font-black text-primary text-lg leading-none">{entry.totalTarget}</p>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-on-surface-variant/60" /> : <ChevronDown className="w-4 h-4 text-on-surface-variant/60" />}
        </div>
      </button>

      {/* City list */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5 pt-1 border-t border-on-surface-variant/10">
              <div className="flex flex-col gap-3 mt-3">
                {entry.cities.map((city, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      <span className="text-xs font-black text-on-surface-variant/40 w-5">{i + 1}.</span>
                      {city.existing ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                      ) : (
                        <Star className={`w-3.5 h-3.5 shrink-0 ${PRIORITY_COLOR[city.priority]}`} />
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-bold text-on-surface">{city.name}</span>
                      {city.existing && <span className="ml-2 text-xs text-primary font-semibold">Existing ISKCON</span>}
                      <p className="text-xs text-on-surface-variant/60 mt-0.5 leading-relaxed">{city.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Vision2051() {
  const [activeRegion, setActiveRegion] = useState("All");
  const [activePhase, setActivePhase] = useState<number | "All">("All");

  const filtered = STATES.filter((s) => {
    const regionMatch = activeRegion === "All" || s.region === activeRegion;
    const phaseMatch = activePhase === "All" || s.phase === activePhase;
    return regionMatch && phaseMatch;
  });

  return (
    <Layout>
      <SEOHead
        title="Vision 2051 — 211 Temples Across India | Build Iskcon"
        description="A comprehensive plan to establish ISKCON temples in every major city across all 28 states and 8 Union Territories of India by 2051."
      />

      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-primary/8 via-surface to-surface pt-4 pb-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-secondary/5 rounded-full blur-3xl" />
        </div>
        <div className="max-w-screen-xl mx-auto px-4 sm:px-8 relative z-10">
          <motion.div
            className="text-center py-12"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.h1 variants={fadeInUp} className="font-serif text-4xl sm:text-5xl md:text-6xl font-black text-on-surface mb-4 leading-tight">
              211 Temples Across India<br /><span className="text-primary">by 2051</span>
            </motion.h1>
            <motion.p variants={fadeInUp} className="text-lg sm:text-xl text-on-surface-variant max-w-3xl mx-auto leading-relaxed mb-5">
              A plan to bring ISKCON to every major city in all {TOTAL_STATES} states and Union Territories — at least 7 cities per state, by ISKCON's centenary year.
            </motion.p>
            <motion.figure variants={fadeInUp} className="max-w-md mx-auto border-l-2 border-primary/40 pl-4 mb-6 text-left">
              <blockquote className="font-serif text-base italic text-on-surface/80 leading-snug">
                "A temple in every town and village."
              </blockquote>
              <figcaption className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60 mt-1.5">
                — Srila Prabhupada
              </figcaption>
            </motion.figure>
            <motion.div variants={fadeInUp} className="flex flex-wrap gap-3 justify-center">
              <Link href="/temples" className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold text-sm tracking-wide shadow-lg hover:bg-primary/90 transition-all active:scale-95">
                Choose a Project
              </Link>
              <a
                href="https://www.iskcon.org/donate"
                target="_blank"
                rel="noopener noreferrer"
                className="border-2 border-primary/40 text-primary px-8 py-3 rounded-xl font-bold text-sm tracking-wide hover:bg-primary/5 transition-all active:scale-95"
              >
                Donate Now
              </a>
            </motion.div>
          </motion.div>

          {/* ── Stats Row ── */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {[
              { label: "Target Temples", value: TOTAL_TARGET, icon: <Building2 className="w-5 h-5" /> },
              { label: "States & UTs", value: TOTAL_STATES, icon: <Globe className="w-5 h-5" /> },
              { label: "Existing ISKCON", value: EXISTING, icon: <CheckCircle2 className="w-5 h-5" /> },
              { label: "Years to 2051", value: 2051 - new Date().getFullYear(), icon: <Clock className="w-5 h-5" /> },
            ].map((stat, i) => (
              <motion.div key={i} variants={fadeInUp} className="bg-surface-container rounded-2xl border border-on-surface-variant/10 p-5 text-center">
                <div className="flex justify-center mb-2 text-primary">{stat.icon}</div>
                <p className="font-black text-4xl text-primary">{stat.value}</p>
                <p className="text-[11px] text-on-surface-variant/70 uppercase tracking-[0.08em] mt-1.5 font-bold">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ── Fundraising Gauges ── */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-8 pt-16 pb-4">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          {...viewportOnce}
        >
          <motion.div variants={fadeInUp} className="text-center mb-10">
            <h2 className="font-serif text-3xl font-black text-on-surface mb-2">Fundraising Progress</h2>
            <p className="text-on-surface-variant max-w-2xl mx-auto">Tracking the financial fuel behind the 211-temple mission — from this year to the full vision.</p>
          </motion.div>
          <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div variants={fadeInUp} className="bg-surface-container rounded-2xl border border-on-surface-variant/10 p-6 sm:p-8">
              <GaugeMeter
                title="Year 2026"
                subtitle="Yearly goal"
                goal={10_000_000}
                raised={1_818_398}
                max={12_000_000}
              />
            </motion.div>
            <motion.div variants={fadeInUp} className="bg-surface-container rounded-2xl border border-on-surface-variant/10 p-6 sm:p-8">
              <GaugeMeter
                title="Phase 1 · 2026–2031"
                subtitle="5-year goal"
                goal={35_000_000}
                raised={25_393_577}
                max={40_000_000}
              />
            </motion.div>
            <motion.div variants={fadeInUp} className="bg-surface-container rounded-2xl border border-on-surface-variant/10 p-6 sm:p-8">
              <GaugeMeter
                title="Full Vision · 2051"
                subtitle="Lifetime goal"
                goal={1_000_000_000}
                raised={72_000_000}
                max={1_200_000_000}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {/* ── Phase Overview ── */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-8 py-20">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          {...viewportOnce}
          className="mb-12"
        >
          <motion.h2 variants={fadeInUp} className="font-serif text-3xl font-black text-on-surface mb-2">Phased Implementation</motion.h2>
          <motion.p variants={fadeInUp} className="text-on-surface-variant mb-8">Three phases spanning 25 years, each building on the last.</motion.p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PHASE_COUNTS.map(({ phase, count, states }) => (
              <motion.div key={phase} variants={fadeInUp} className="rounded-2xl border border-on-surface-variant/10 bg-white p-6">
                <div className="text-xs font-bold uppercase tracking-[0.08em] text-on-surface-variant/60 mb-1">Phase {phase} · {PHASE_LABELS[phase]}</div>
                <div className="flex items-end gap-4 mt-3">
                  <div>
                    <p className="text-4xl font-black text-primary">{count}</p>
                    <p className="text-[11px] text-on-surface-variant/70 uppercase tracking-[0.08em] font-bold">temples</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-on-surface-variant/60">{states}</p>
                    <p className="text-[11px] text-on-surface-variant/70 uppercase tracking-[0.08em] font-bold">states / UTs</p>
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant/60 mt-3 leading-relaxed">
                  {phase === 1 && "State capitals, tier-1 cities, and regions with existing devotee communities."}
                  {phase === 2 && "Tier-2 cities, Northeast gateways, and island territories."}
                  {phase === 3 && "Deep interior, hill states, remote territories, and final completion."}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Legend ── */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          {...viewportOnce}
          className="flex flex-wrap gap-4 items-center bg-surface-container rounded-2xl border border-on-surface-variant/10 px-6 py-4 mb-8"
        >
          <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mr-2">Priority:</span>
          <span className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold"><Star className="w-3.5 h-3.5" /> High Priority</span>
          <span className="flex items-center gap-1.5 text-xs text-orange-400 font-semibold"><Star className="w-3.5 h-3.5" /> Medium Priority</span>
          <span className="flex items-center gap-1.5 text-xs text-on-surface-variant/50 font-semibold"><Star className="w-3.5 h-3.5" /> Planned</span>
          <span className="flex items-center gap-1.5 text-xs text-lime-600 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Existing ISKCON</span>
        </motion.div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-on-surface-variant/60">Region:</span>
            {REGION_LIST.map((r) => (
              <button
                key={r}
                onClick={() => setActiveRegion(r)}
                className={`text-xs font-bold uppercase tracking-[0.08em] px-3 py-1.5 rounded-full border transition-all ${
                  activeRegion === r ? "bg-primary text-white border-primary shadow-sm" : "border-on-surface-variant/20 text-on-surface-variant hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-8">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-on-surface-variant/60">Phase:</span>
          {(["All", 1, 2, 3] as (number | "All")[]).map((p) => (
            <button
              key={p}
              onClick={() => setActivePhase(p)}
              className={`text-xs font-bold uppercase tracking-[0.08em] px-3 py-1.5 rounded-full border transition-all ${
                activePhase === p ? "bg-primary text-white border-primary shadow-sm" : "border-on-surface-variant/20 text-on-surface-variant hover:border-primary/40 hover:bg-primary/5"
              }`}
            >
              {p === "All" ? "All Phases" : `Phase ${p} · ${PHASE_LABELS[p as number]}`}
            </button>
          ))}
        </div>

        {/* ── State Cards grouped by region ── */}
        <div className="flex flex-col gap-8">
          <p className="text-xs text-on-surface-variant/50 font-semibold uppercase tracking-[0.08em]">
            Showing {filtered.length} states & UTs · {filtered.reduce((a, s) => a + s.totalTarget, 0)} temples
          </p>
          {REGION_LIST.filter(r => r !== "All").map((region) => {
            const regionStates = filtered.filter(s => s.region === region);
            if (regionStates.length === 0) return null;
            return (
              <motion.div
                key={region}
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                {...viewportOnce}
              >
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-serif text-lg font-black text-on-surface">{region} India</h3>
                  <div className="flex-1 h-px bg-on-surface-variant/10" />
                  <span className="text-xs font-bold text-on-surface-variant/50">{regionStates.length} {regionStates.length === 1 ? "state" : "states"} · {regionStates.reduce((a, s) => a + s.totalTarget, 0)} temples</span>
                </div>
                <div className="flex flex-col gap-3">
                  {regionStates.map((entry) => (
                    <StateCard key={entry.state} entry={entry} />
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ── CTA ── */}
        <motion.div
          className="mt-16 rounded-3xl bg-gradient-to-br from-primary/10 to-secondary/5 border border-primary/20 p-8 sm:p-12 text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          {...viewportOnce}
        >
          <Heart className="w-10 h-10 text-primary mx-auto mb-4" />
          <h2 className="font-serif text-3xl sm:text-4xl font-black text-on-surface mb-3">Help Build the Vision</h2>
          <p className="text-on-surface-variant max-w-xl mx-auto mb-8 leading-relaxed">
            Every rupee contributed to an ISKCON temple project brings this vision one step closer. Your seva today is a temple tomorrow.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/temples" className="bg-primary text-on-primary font-bold px-8 py-3 rounded-xl hover:bg-primary/90 transition-all active:scale-95">
              Choose a Project
            </Link>
            <a
              href="https://www.iskcon.org/donate"
              target="_blank"
              rel="noopener noreferrer"
              className="border-2 border-primary/40 text-primary font-bold px-8 py-3 rounded-xl hover:bg-primary/5 transition-all active:scale-95"
            >
              Donate Now
            </a>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
