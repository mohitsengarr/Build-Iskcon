import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp, staggerContainer, viewportOnce } from "@/lib/animations";
import { ChevronDown, ChevronUp, MapPin, Building2, Target, Heart, Filter } from "lucide-react";
import { Link } from "wouter";

interface City {
  name: string;
  note: string;
  priority: "high" | "medium" | "low";
  existing: boolean;
}

interface StateEntry {
  state: string;
  type: "state" | "ut";
  region: "North" | "South" | "East" | "West" | "Central" | "Northeast";
  capital: string;
  cities: City[];
  phase: 1 | 2 | 3;
  totalTarget: number;
}

const STATES: StateEntry[] = [
  { state: "Uttar Pradesh", type: "state", region: "North", capital: "Lucknow", phase: 1, totalTarget: 7, cities: [
    { name: "Vrindavan", note: "Krishna Janmabhoomi region — flagship expansion", priority: "high", existing: true },
    { name: "Lucknow", note: "State capital outreach centre", priority: "high", existing: true },
    { name: "Varanasi", note: "Spiritual capital of India", priority: "high", existing: false },
    { name: "Agra", note: "Tourist corridor temple", priority: "medium", existing: false },
    { name: "Kanpur", note: "Industrial city community centre", priority: "medium", existing: false },
    { name: "Prayagraj", note: "Triveni Sangam pilgrimage hub", priority: "high", existing: false },
    { name: "Noida", note: "NCR satellite city", priority: "medium", existing: true },
  ]},
  { state: "Maharashtra", type: "state", region: "West", capital: "Mumbai", phase: 1, totalTarget: 7, cities: [
    { name: "Mumbai (Juhu)", note: "Historic Hare Krishna Land", priority: "high", existing: true },
    { name: "Pune", note: "NVCC campus expansion", priority: "high", existing: true },
    { name: "Nagpur", note: "Central India gateway", priority: "high", existing: false },
    { name: "Nashik", note: "Kumbh Mela city", priority: "medium", existing: false },
    { name: "Aurangabad", note: "Ajanta-Ellora cultural corridor", priority: "medium", existing: false },
    { name: "Thane", note: "Mumbai Metropolitan Region", priority: "medium", existing: false },
    { name: "Kolhapur", note: "Mahalakshmi pilgrimage circuit", priority: "low", existing: false },
  ]},
  { state: "Karnataka", type: "state", region: "South", capital: "Bengaluru", phase: 1, totalTarget: 7, cities: [
    { name: "Bengaluru", note: "Rajajinagar flagship temple", priority: "high", existing: true },
    { name: "Mysuru", note: "Heritage city centre", priority: "high", existing: false },
    { name: "Hubli-Dharwad", note: "North Karnataka hub", priority: "medium", existing: false },
    { name: "Mangaluru", note: "Coastal Karnataka", priority: "medium", existing: false },
    { name: "Belgaum", note: "Border city outreach", priority: "medium", existing: false },
    { name: "Udupi", note: "Sri Krishna Matha pilgrimage area", priority: "high", existing: false },
    { name: "Gulbarga", note: "Hyderabad-Karnataka region", priority: "low", existing: false },
  ]},
  { state: "Tamil Nadu", type: "state", region: "South", capital: "Chennai", phase: 1, totalTarget: 7, cities: [
    { name: "Chennai", note: "Injambakkam temple complex", priority: "high", existing: true },
    { name: "Madurai", note: "Temple city of South India", priority: "high", existing: false },
    { name: "Coimbatore", note: "Western Tamil Nadu hub", priority: "medium", existing: false },
    { name: "Tiruchirappalli", note: "Rock Fort temple corridor", priority: "medium", existing: false },
    { name: "Salem", note: "Central Tamil Nadu outreach", priority: "medium", existing: false },
    { name: "Tirunelveli", note: "Southern Tamil Nadu", priority: "low", existing: false },
    { name: "Thanjavur", note: "Chola temple heritage zone", priority: "medium", existing: false },
  ]},
  { state: "West Bengal", type: "state", region: "East", capital: "Kolkata", phase: 1, totalTarget: 7, cities: [
    { name: "Mayapur", note: "World headquarters — TOVP", priority: "high", existing: true },
    { name: "Kolkata", note: "Albert Road & Dumdum centres", priority: "high", existing: true },
    { name: "Siliguri", note: "North Bengal gateway", priority: "medium", existing: false },
    { name: "Durgapur", note: "Industrial belt community", priority: "medium", existing: false },
    { name: "Asansol", note: "Western Bengal mining region", priority: "low", existing: false },
    { name: "Kharagpur", note: "IIT campus outreach", priority: "medium", existing: false },
    { name: "Howrah", note: "Twin city of Kolkata", priority: "medium", existing: false },
  ]},
  { state: "Rajasthan", type: "state", region: "North", capital: "Jaipur", phase: 1, totalTarget: 7, cities: [
    { name: "Jaipur", note: "Pink City cultural centre", priority: "high", existing: true },
    { name: "Jodhpur", note: "Blue City heritage temple", priority: "high", existing: false },
    { name: "Udaipur", note: "Lake city spiritual retreat", priority: "medium", existing: false },
    { name: "Kota", note: "Student city outreach", priority: "medium", existing: false },
    { name: "Ajmer", note: "Pushkar pilgrimage corridor", priority: "high", existing: false },
    { name: "Bikaner", note: "Desert region outreach", priority: "low", existing: false },
    { name: "Jaisalmer", note: "Golden City tourism hub", priority: "low", existing: false },
  ]},
  { state: "Gujarat", type: "state", region: "West", capital: "Gandhinagar", phase: 1, totalTarget: 7, cities: [
    { name: "Ahmedabad", note: "Mega temple under construction", priority: "high", existing: true },
    { name: "Vadodara", note: "Cultural capital of Gujarat", priority: "high", existing: true },
    { name: "Surat", note: "Diamond city community centre", priority: "high", existing: false },
    { name: "Rajkot", note: "Saurashtra region hub", priority: "medium", existing: false },
    { name: "Gandhinagar", note: "State capital", priority: "medium", existing: false },
    { name: "Dwarka", note: "Dwarkadhish pilgrimage site", priority: "high", existing: false },
    { name: "Bhavnagar", note: "Gulf of Khambhat coastal", priority: "low", existing: false },
  ]},
  { state: "Madhya Pradesh", type: "state", region: "Central", capital: "Bhopal", phase: 1, totalTarget: 7, cities: [
    { name: "Bhopal", note: "State capital centre", priority: "high", existing: false },
    { name: "Indore", note: "Largest city in MP", priority: "high", existing: true },
    { name: "Ujjain", note: "Mahakaleshwar Jyotirlinga city", priority: "high", existing: false },
    { name: "Gwalior", note: "Northern MP gateway", priority: "medium", existing: false },
    { name: "Jabalpur", note: "Central India node", priority: "medium", existing: false },
    { name: "Rewa", note: "Vindhya region outreach", priority: "low", existing: false },
    { name: "Sagar", note: "Bundelkhand centre", priority: "low", existing: false },
  ]},
  { state: "Kerala", type: "state", region: "South", capital: "Thiruvananthapuram", phase: 1, totalTarget: 7, cities: [
    { name: "Thiruvananthapuram", note: "State capital temple", priority: "high", existing: true },
    { name: "Kochi", note: "Commercial capital", priority: "high", existing: false },
    { name: "Kozhikode", note: "Malabar region hub", priority: "medium", existing: false },
    { name: "Thrissur", note: "Cultural capital of Kerala", priority: "high", existing: false },
    { name: "Kollam", note: "Southern Kerala outreach", priority: "medium", existing: false },
    { name: "Kannur", note: "North Kerala centre", priority: "low", existing: false },
    { name: "Palakkad", note: "Gateway to Kerala", priority: "low", existing: false },
  ]},
  { state: "Telangana", type: "state", region: "South", capital: "Hyderabad", phase: 1, totalTarget: 7, cities: [
    { name: "Hyderabad", note: "Abids Road temple complex", priority: "high", existing: true },
    { name: "Warangal", note: "Kakatiya heritage city", priority: "medium", existing: false },
    { name: "Nizamabad", note: "Northern Telangana hub", priority: "medium", existing: false },
    { name: "Karimnagar", note: "Cultural outreach centre", priority: "low", existing: false },
    { name: "Khammam", note: "Eastern Telangana", priority: "low", existing: false },
    { name: "Secunderabad", note: "Twin city expansion", priority: "high", existing: false },
    { name: "Nalgonda", note: "Southern corridor", priority: "low", existing: false },
  ]},
  { state: "Odisha", type: "state", region: "East", capital: "Bhubaneswar", phase: 1, totalTarget: 7, cities: [
    { name: "Bhubaneswar", note: "Temple city of India", priority: "high", existing: true },
    { name: "Puri", note: "Jagannath Dham — holiest site", priority: "high", existing: true },
    { name: "Cuttack", note: "Silver City community centre", priority: "medium", existing: false },
    { name: "Rourkela", note: "Steel city outreach", priority: "medium", existing: false },
    { name: "Sambalpur", note: "Western Odisha hub", priority: "low", existing: false },
    { name: "Berhampur", note: "Southern Odisha", priority: "low", existing: false },
    { name: "Balasore", note: "Northern coastal Odisha", priority: "medium", existing: false },
  ]},
  { state: "Punjab", type: "state", region: "North", capital: "Chandigarh", phase: 1, totalTarget: 7, cities: [
    { name: "Chandigarh", note: "Sector 36 temple expansion", priority: "high", existing: true },
    { name: "Amritsar", note: "Holy city interfaith centre", priority: "high", existing: false },
    { name: "Ludhiana", note: "Industrial city hub", priority: "medium", existing: false },
    { name: "Jalandhar", note: "Doaba region centre", priority: "medium", existing: false },
    { name: "Patiala", note: "Royal city heritage temple", priority: "medium", existing: false },
    { name: "Bathinda", note: "Malwa region outreach", priority: "low", existing: false },
    { name: "Mohali", note: "Chandigarh tricity", priority: "medium", existing: false },
  ]},
  { state: "Andhra Pradesh", type: "state", region: "South", capital: "Amaravati", phase: 1, totalTarget: 7, cities: [
    { name: "Visakhapatnam", note: "Coastal Andhra flagship", priority: "high", existing: true },
    { name: "Vijayawada", note: "Capital region centre", priority: "high", existing: false },
    { name: "Tirupati", note: "Tirumala pilgrimage corridor", priority: "high", existing: false },
    { name: "Guntur", note: "Krishna district hub", priority: "medium", existing: false },
    { name: "Nellore", note: "Southern AP outreach", priority: "low", existing: false },
    { name: "Kakinada", note: "Godavari delta", priority: "medium", existing: false },
    { name: "Rajahmundry", note: "East Godavari cultural centre", priority: "medium", existing: false },
  ]},
  { state: "Haryana", type: "state", region: "North", capital: "Chandigarh", phase: 1, totalTarget: 7, cities: [
    { name: "Gurugram", note: "Millennium City temple", priority: "high", existing: true },
    { name: "Faridabad", note: "NCR industrial belt", priority: "high", existing: false },
    { name: "Kurukshetra", note: "Bhagavad Gita battlefield", priority: "high", existing: false },
    { name: "Panipat", note: "Historic city centre", priority: "medium", existing: false },
    { name: "Ambala", note: "Northern Haryana hub", priority: "medium", existing: false },
    { name: "Karnal", note: "Agricultural heartland", priority: "low", existing: false },
    { name: "Hisar", note: "Western Haryana outreach", priority: "low", existing: false },
  ]},
  { state: "Himachal Pradesh", type: "state", region: "North", capital: "Shimla", phase: 2, totalTarget: 7, cities: [
    { name: "Shimla", note: "Hill station spiritual retreat", priority: "high", existing: false },
    { name: "Dharamshala", note: "Kangra Valley centre", priority: "high", existing: false },
    { name: "Manali", note: "Tourist hub outreach", priority: "medium", existing: false },
    { name: "Mandi", note: "Central HP hub", priority: "medium", existing: false },
    { name: "Solan", note: "Chandigarh-Shimla corridor", priority: "medium", existing: false },
    { name: "Kullu", note: "Valley of Gods", priority: "low", existing: false },
    { name: "Hamirpur", note: "Southern HP outreach", priority: "low", existing: false },
  ]},
  { state: "Bihar", type: "state", region: "East", capital: "Patna", phase: 2, totalTarget: 7, cities: [
    { name: "Patna", note: "State capital centre", priority: "high", existing: true },
    { name: "Gaya", note: "Buddhist-Hindu pilgrimage site", priority: "high", existing: false },
    { name: "Muzaffarpur", note: "North Bihar hub", priority: "medium", existing: false },
    { name: "Bhagalpur", note: "Silk city outreach", priority: "medium", existing: false },
    { name: "Darbhanga", note: "Mithila cultural centre", priority: "medium", existing: false },
    { name: "Purnia", note: "Eastern Bihar", priority: "low", existing: false },
    { name: "Nalanda", note: "Ancient university city", priority: "high", existing: false },
  ]},
  { state: "Jharkhand", type: "state", region: "East", capital: "Ranchi", phase: 2, totalTarget: 7, cities: [
    { name: "Ranchi", note: "State capital temple", priority: "high", existing: false },
    { name: "Jamshedpur", note: "Steel city community", priority: "high", existing: false },
    { name: "Dhanbad", note: "Coal capital outreach", priority: "medium", existing: false },
    { name: "Bokaro", note: "Industrial city centre", priority: "medium", existing: false },
    { name: "Hazaribagh", note: "Central Jharkhand", priority: "low", existing: false },
    { name: "Deoghar", note: "Baidyanath Dham pilgrimage", priority: "high", existing: false },
    { name: "Giridih", note: "Parasnath Hill region", priority: "low", existing: false },
  ]},
  { state: "Assam", type: "state", region: "Northeast", capital: "Dispur", phase: 2, totalTarget: 7, cities: [
    { name: "Guwahati", note: "Gateway to Northeast", priority: "high", existing: true },
    { name: "Silchar", note: "Barak Valley hub", priority: "medium", existing: false },
    { name: "Dibrugarh", note: "Upper Assam centre", priority: "medium", existing: false },
    { name: "Jorhat", note: "Tea capital region", priority: "medium", existing: false },
    { name: "Tezpur", note: "Cultural city outreach", priority: "low", existing: false },
    { name: "Nagaon", note: "Central Assam", priority: "low", existing: false },
    { name: "Tinsukia", note: "Eastern Assam border", priority: "low", existing: false },
  ]},
  { state: "Goa", type: "state", region: "West", capital: "Panaji", phase: 2, totalTarget: 7, cities: [
    { name: "Panaji", note: "State capital centre", priority: "high", existing: false },
    { name: "Margao", note: "South Goa hub", priority: "high", existing: false },
    { name: "Vasco da Gama", note: "Port city outreach", priority: "medium", existing: false },
    { name: "Mapusa", note: "North Goa market town", priority: "medium", existing: false },
    { name: "Ponda", note: "Temple corridor of Goa", priority: "high", existing: false },
    { name: "Bicholim", note: "Mining region centre", priority: "low", existing: false },
    { name: "Canacona", note: "Southern coastal Goa", priority: "low", existing: false },
  ]},
  { state: "Chhattisgarh", type: "state", region: "Central", capital: "Raipur", phase: 2, totalTarget: 7, cities: [
    { name: "Raipur", note: "State capital temple", priority: "high", existing: false },
    { name: "Bilaspur", note: "Northern CG hub", priority: "high", existing: false },
    { name: "Durg-Bhilai", note: "Steel city community", priority: "medium", existing: false },
    { name: "Korba", note: "Power capital outreach", priority: "medium", existing: false },
    { name: "Rajnandgaon", note: "Central CG centre", priority: "low", existing: false },
    { name: "Jagdalpur", note: "Bastar tribal region", priority: "medium", existing: false },
    { name: "Ambikapur", note: "Northern hills outreach", priority: "low", existing: false },
  ]},
  { state: "Uttarakhand", type: "state", region: "North", capital: "Dehradun", phase: 2, totalTarget: 7, cities: [
    { name: "Dehradun", note: "State capital centre", priority: "high", existing: true },
    { name: "Haridwar", note: "Holy city on the Ganges", priority: "high", existing: false },
    { name: "Rishikesh", note: "Yoga capital of the world", priority: "high", existing: false },
    { name: "Haldwani", note: "Kumaon gateway", priority: "medium", existing: false },
    { name: "Roorkee", note: "IIT campus outreach", priority: "medium", existing: false },
    { name: "Nainital", note: "Hill station retreat", priority: "low", existing: false },
    { name: "Mussoorie", note: "Queen of the Hills", priority: "low", existing: false },
  ]},
  { state: "Tripura", type: "state", region: "Northeast", capital: "Agartala", phase: 2, totalTarget: 7, cities: [
    { name: "Agartala", note: "State capital centre", priority: "high", existing: false },
    { name: "Udaipur", note: "Tripura Sundari temple area", priority: "high", existing: false },
    { name: "Dharmanagar", note: "North Tripura hub", priority: "medium", existing: false },
    { name: "Kailashahar", note: "Unakoti heritage site", priority: "medium", existing: false },
    { name: "Belonia", note: "South Tripura border", priority: "low", existing: false },
    { name: "Ambassa", note: "Central Tripura", priority: "low", existing: false },
    { name: "Sabroom", note: "Southern tip outreach", priority: "low", existing: false },
  ]},
  { state: "Meghalaya", type: "state", region: "Northeast", capital: "Shillong", phase: 2, totalTarget: 7, cities: [
    { name: "Shillong", note: "Scotland of the East", priority: "high", existing: false },
    { name: "Tura", note: "West Garo Hills hub", priority: "medium", existing: false },
    { name: "Jowai", note: "West Jaintia Hills", priority: "medium", existing: false },
    { name: "Nongstoin", note: "West Khasi Hills", priority: "low", existing: false },
    { name: "Williamnagar", note: "East Garo Hills", priority: "low", existing: false },
    { name: "Cherrapunji", note: "Wettest place on Earth", priority: "medium", existing: false },
    { name: "Baghmara", note: "South Garo Hills", priority: "low", existing: false },
  ]},
  { state: "Manipur", type: "state", region: "Northeast", capital: "Imphal", phase: 3, totalTarget: 7, cities: [
    { name: "Imphal", note: "State capital & Vaishnava heartland", priority: "high", existing: false },
    { name: "Thoubal", note: "Eastern Manipur hub", priority: "medium", existing: false },
    { name: "Bishnupur", note: "Vaishnava heritage town", priority: "high", existing: false },
    { name: "Churachandpur", note: "Hill district centre", priority: "medium", existing: false },
    { name: "Kakching", note: "Southern valley", priority: "low", existing: false },
    { name: "Ukhrul", note: "Northern hills outreach", priority: "low", existing: false },
    { name: "Senapati", note: "NH2 corridor", priority: "low", existing: false },
  ]},
  { state: "Nagaland", type: "state", region: "Northeast", capital: "Kohima", phase: 3, totalTarget: 7, cities: [
    { name: "Kohima", note: "State capital temple", priority: "high", existing: false },
    { name: "Dimapur", note: "Commercial capital", priority: "high", existing: false },
    { name: "Mokokchung", note: "Ao Naga cultural hub", priority: "medium", existing: false },
    { name: "Tuensang", note: "Eastern Nagaland", priority: "low", existing: false },
    { name: "Wokha", note: "Central hills centre", priority: "low", existing: false },
    { name: "Zunheboto", note: "Sumi Naga region", priority: "low", existing: false },
    { name: "Mon", note: "Konyak territory outreach", priority: "low", existing: false },
  ]},
  { state: "Mizoram", type: "state", region: "Northeast", capital: "Aizawl", phase: 3, totalTarget: 7, cities: [
    { name: "Aizawl", note: "State capital centre", priority: "high", existing: false },
    { name: "Lunglei", note: "Southern Mizoram hub", priority: "medium", existing: false },
    { name: "Champhai", note: "Myanmar border town", priority: "medium", existing: false },
    { name: "Serchhip", note: "Central Mizoram", priority: "low", existing: false },
    { name: "Kolasib", note: "Northern gateway", priority: "low", existing: false },
    { name: "Lawngtlai", note: "Lai autonomous region", priority: "low", existing: false },
    { name: "Saiha", note: "Southeastern tip", priority: "low", existing: false },
  ]},
  { state: "Arunachal Pradesh", type: "state", region: "Northeast", capital: "Itanagar", phase: 3, totalTarget: 7, cities: [
    { name: "Itanagar", note: "State capital temple", priority: "high", existing: false },
    { name: "Naharlagun", note: "Twin city of Itanagar", priority: "high", existing: false },
    { name: "Pasighat", note: "Gateway to eastern AP", priority: "medium", existing: false },
    { name: "Tawang", note: "Buddhist-Hindu hill station", priority: "medium", existing: false },
    { name: "Ziro", note: "Apatani Valley cultural site", priority: "low", existing: false },
    { name: "Tezu", note: "Lohit district hub", priority: "low", existing: false },
    { name: "Along", note: "West Siang centre", priority: "low", existing: false },
  ]},
  { state: "Sikkim", type: "state", region: "Northeast", capital: "Gangtok", phase: 3, totalTarget: 7, cities: [
    { name: "Gangtok", note: "State capital retreat", priority: "high", existing: false },
    { name: "Namchi", note: "South Sikkim hub", priority: "medium", existing: false },
    { name: "Gyalshing", note: "West Sikkim centre", priority: "medium", existing: false },
    { name: "Mangan", note: "North Sikkim gateway", priority: "low", existing: false },
    { name: "Ravangla", note: "Buddha Park spiritual area", priority: "medium", existing: false },
    { name: "Jorethang", note: "Southern valley town", priority: "low", existing: false },
    { name: "Singtam", note: "East Sikkim hub", priority: "low", existing: false },
  ]},
  { state: "Delhi", type: "ut", region: "North", capital: "New Delhi", phase: 1, totalTarget: 7, cities: [
    { name: "East of Kailash", note: "Glory of India temple", priority: "high", existing: true },
    { name: "Dwarka", note: "Sub-city centre", priority: "high", existing: false },
    { name: "Rohini", note: "North Delhi outreach", priority: "medium", existing: false },
    { name: "Noida Extension", note: "NCR expansion", priority: "medium", existing: false },
    { name: "Mehrauli", note: "South Delhi heritage area", priority: "medium", existing: false },
    { name: "Janakpuri", note: "West Delhi community", priority: "low", existing: false },
    { name: "Shahdara", note: "Trans-Yamuna outreach", priority: "low", existing: false },
  ]},
  { state: "Jammu & Kashmir", type: "ut", region: "North", capital: "Srinagar", phase: 2, totalTarget: 7, cities: [
    { name: "Jammu", note: "Winter capital temple", priority: "high", existing: true },
    { name: "Srinagar", note: "Valley outreach centre", priority: "high", existing: false },
    { name: "Udhampur", note: "Vaishno Devi corridor", priority: "high", existing: false },
    { name: "Kathua", note: "Southern J&K hub", priority: "medium", existing: false },
    { name: "Rajouri", note: "Pir Panjal region", priority: "low", existing: false },
    { name: "Anantnag", note: "South Kashmir centre", priority: "medium", existing: false },
    { name: "Baramulla", note: "North Kashmir outreach", priority: "low", existing: false },
  ]},
  { state: "Chandigarh", type: "ut", region: "North", capital: "Chandigarh", phase: 2, totalTarget: 7, cities: [
    { name: "Sector 36", note: "Existing ISKCON centre", priority: "high", existing: true },
    { name: "Sector 22", note: "City centre outreach", priority: "medium", existing: false },
    { name: "Manimajra", note: "Eastern Chandigarh", priority: "medium", existing: false },
    { name: "Industrial Area", note: "Worker community centre", priority: "low", existing: false },
    { name: "Sector 43", note: "Institutional area", priority: "low", existing: false },
    { name: "Panchkula Extension", note: "Tricity expansion", priority: "medium", existing: false },
    { name: "Zirakpur", note: "Chandigarh-Ambala corridor", priority: "medium", existing: false },
  ]},
  { state: "Puducherry", type: "ut", region: "South", capital: "Puducherry", phase: 2, totalTarget: 5, cities: [
    { name: "Puducherry", note: "French Quarter spiritual centre", priority: "high", existing: false },
    { name: "Karaikal", note: "Coastal heritage town", priority: "medium", existing: false },
    { name: "Yanam", note: "Andhra enclave outreach", priority: "low", existing: false },
    { name: "Mahe", note: "Kerala enclave centre", priority: "low", existing: false },
    { name: "Villianur", note: "Inner Puducherry", priority: "medium", existing: false },
  ]},
  { state: "Dadra & Nagar Haveli and Daman & Diu", type: "ut", region: "West", capital: "Daman", phase: 3, totalTarget: 7, cities: [
    { name: "Daman", note: "Coastal UT temple", priority: "high", existing: false },
    { name: "Diu", note: "Island heritage centre", priority: "medium", existing: false },
    { name: "Silvassa", note: "UT capital", priority: "high", existing: false },
    { name: "Nani Daman", note: "Historic port area", priority: "low", existing: false },
    { name: "Moti Daman", note: "Fort area outreach", priority: "low", existing: false },
    { name: "Khanvel", note: "Interior tribal region", priority: "low", existing: false },
    { name: "Vapi Corridor", note: "Industrial belt nearby", priority: "medium", existing: false },
  ]},
  { state: "Ladakh", type: "ut", region: "North", capital: "Leh", phase: 3, totalTarget: 7, cities: [
    { name: "Leh", note: "High-altitude spiritual retreat", priority: "high", existing: false },
    { name: "Kargil", note: "Ladakh's second city", priority: "high", existing: false },
    { name: "Diskit", note: "Nubra Valley centre", priority: "medium", existing: false },
    { name: "Hemis", note: "Historic monastery corridor", priority: "medium", existing: false },
    { name: "Zanskar", note: "Remote valley outreach", priority: "low", existing: false },
    { name: "Turtuk", note: "Northernmost village", priority: "low", existing: false },
    { name: "Nyoma", note: "Changthang plateau", priority: "low", existing: false },
  ]},
  { state: "Andaman & Nicobar Islands", type: "ut", region: "South", capital: "Port Blair", phase: 3, totalTarget: 7, cities: [
    { name: "Port Blair", note: "Island capital temple", priority: "high", existing: false },
    { name: "Diglipur", note: "North Andaman hub", priority: "medium", existing: false },
    { name: "Rangat", note: "Middle Andaman centre", priority: "medium", existing: false },
    { name: "Mayabunder", note: "Northern settlement", priority: "low", existing: false },
    { name: "Car Nicobar", note: "Nicobar chain hub", priority: "medium", existing: false },
    { name: "Havelock Island", note: "Tourism outreach", priority: "low", existing: false },
    { name: "Little Andaman", note: "Southern island centre", priority: "low", existing: false },
  ]},
  { state: "Lakshadweep", type: "ut", region: "South", capital: "Kavaratti", phase: 3, totalTarget: 7, cities: [
    { name: "Kavaratti", note: "UT capital temple", priority: "high", existing: false },
    { name: "Agatti", note: "Airport island centre", priority: "medium", existing: false },
    { name: "Minicoy", note: "Southernmost island", priority: "medium", existing: false },
    { name: "Andrott", note: "Largest island outreach", priority: "medium", existing: false },
    { name: "Amini", note: "Northern island hub", priority: "low", existing: false },
    { name: "Kalpeni", note: "Tourism development area", priority: "low", existing: false },
    { name: "Kadmat", note: "Coral island retreat", priority: "low", existing: false },
  ]},
];

const PHASE_INFO = [
  { phase: 1, label: "Phase 1", years: "2026–2031", title: "Anchor States", desc: "Major states with existing ISKCON infrastructure — filling tier-2 and tier-3 city gaps.", color: "#c87000" },
  { phase: 2, label: "Phase 2", years: "2031–2041", title: "Expansion Corridor", desc: "Growing communities in underserved states — community-scaled 5,000–15,000 sq ft centres.", color: "#8f4e00" },
  { phase: 3, label: "Phase 3", years: "2041–2051", title: "Last Mile", desc: "Northeast hill states, high-altitude UTs, and island territories — modular & climate-adaptive designs.", color: "#554336" },
];

const REGIONS = ["All", "North", "South", "East", "West", "Central", "Northeast"] as const;
const PHASES = ["All", "Phase 1", "Phase 2", "Phase 3"] as const;

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-primary",
  medium: "bg-secondary",
  low: "bg-on-surface-variant/30",
};

function StateCard({ entry }: { entry: StateEntry }) {
  const [open, setOpen] = useState(false);
  const existing = entry.cities.filter((c) => c.existing).length;
  const planned = entry.cities.length - existing;
  const phaseInfo = PHASE_INFO.find((p) => p.phase === entry.phase)!;

  return (
    <motion.div variants={fadeInUp} className="bg-surface-container-low rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(27,28,28,0.06)]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-surface-container-low/80 transition-colors"
      >
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: phaseInfo.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-base font-bold text-on-surface truncate">{entry.state}</h3>
            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant shrink-0">
              {entry.type === "ut" ? "UT" : "State"}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-on-surface-variant font-medium">
            <span>{entry.region}</span>
            <span className="text-on-surface-variant/30">|</span>
            <span>{entry.cities.length} cities</span>
            <span className="text-on-surface-variant/30">|</span>
            <span style={{ color: phaseInfo.color }}>{phaseInfo.years}</span>
            {existing > 0 && (
              <>
                <span className="text-on-surface-variant/30">|</span>
                <span className="text-primary font-bold">{existing} existing</span>
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 text-on-surface-variant">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-2">
              <div className="h-px bg-outline-variant/15 mb-3" />
              {entry.cities.map((city) => (
                <div key={city.name} className="flex items-start gap-3 py-1.5">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[city.priority]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-on-surface">{city.name}</span>
                      {city.existing && (
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Existing</span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant mt-0.5">{city.note}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-4 pt-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" /> High</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-secondary" /> Medium</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-on-surface-variant/30" /> Low</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Vision2051() {
  const [regionFilter, setRegionFilter] = useState<string>("All");
  const [phaseFilter, setPhaseFilter] = useState<string>("All");

  const filtered = useMemo(() => {
    return STATES.filter((s) => {
      if (regionFilter !== "All" && s.region !== regionFilter) return false;
      if (phaseFilter !== "All" && `Phase ${s.phase}` !== phaseFilter) return false;
      return true;
    });
  }, [regionFilter, phaseFilter]);

  const totalCities = STATES.reduce((sum, s) => sum + s.cities.length, 0);
  const totalExisting = STATES.reduce((sum, s) => sum + s.cities.filter((c) => c.existing).length, 0);
  const totalStates = STATES.filter((s) => s.type === "state").length;
  const totalUTs = STATES.filter((s) => s.type === "ut").length;

  return (
    <Layout>
      <SEOHead
        title="Vision 2051 — 211 Temples Across India"
        description="ISKCON's 25-year strategic roadmap to establish temples in every state and union territory of India."
        canonicalPath="/vision2051"
      />
      <div className="px-4 md:px-8 max-w-screen-2xl mx-auto space-y-12">
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
          <motion.div variants={fadeInUp} className="max-w-3xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Target className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">Strategic Roadmap</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-on-surface">Vision 2051</h1>
            <p className="text-on-surface-variant text-base mt-2 leading-relaxed">
              A 25-year plan to establish <strong className="text-on-surface">{totalCities} ISKCON temples</strong> across all {totalStates} states and {totalUTs} union territories of India — fulfilling Srila Prabhupada's vision of a temple in every town and village.
            </p>
          </motion.div>

          <motion.div variants={fadeInUp} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Temples", value: totalCities, icon: Building2 },
              { label: "States & UTs", value: `${totalStates} + ${totalUTs}`, icon: MapPin },
              { label: "Existing Centres", value: totalExisting, icon: Target },
              { label: "New Projects", value: totalCities - totalExisting, icon: Building2 },
            ].map((stat) => (
              <div key={stat.label} className="bg-surface-container-low rounded-xl p-5 text-center">
                <stat.icon className="w-5 h-5 text-primary mx-auto mb-2" />
                <p className="text-2xl font-black text-on-surface font-serif">{stat.value}</p>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mt-1">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {PHASE_INFO.map((p) => {
            const phaseStates = STATES.filter((s) => s.phase === p.phase);
            const phaseCities = phaseStates.reduce((sum, s) => sum + s.cities.length, 0);
            return (
              <motion.div key={p.phase} variants={fadeInUp} className="rounded-2xl p-6 border border-outline-variant/15 bg-surface-container-low">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-4 h-4 rounded-full" style={{ background: p.color }} />
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{p.label}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest ml-2" style={{ color: p.color }}>{p.years}</span>
                  </div>
                </div>
                <h3 className="font-serif text-xl font-bold text-on-surface mb-2">{p.title}</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed mb-4">{p.desc}</p>
                <div className="flex items-center gap-4 text-xs font-bold">
                  <span className="text-on-surface">{phaseStates.length} regions</span>
                  <span className="text-on-surface-variant/30">|</span>
                  <span style={{ color: p.color }}>{phaseCities} temples</span>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-2 text-sm font-bold text-on-surface">
              <Filter className="w-4 h-4 text-primary" />
              Filter:
            </div>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRegionFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                    regionFilter === r
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {PHASES.map((p) => (
                <button
                  key={p}
                  onClick={() => setPhaseFilter(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                    phaseFilter === p
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-on-surface-variant">
            Showing <strong className="text-on-surface">{filtered.length}</strong> of {STATES.length} regions
            {" · "}
            <strong className="text-on-surface">{filtered.reduce((s, e) => s + e.cities.length, 0)}</strong> temple sites
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {filtered.map((entry) => (
            <StateCard key={entry.state} entry={entry} />
          ))}
        </motion.div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-on-surface-variant">
            <p className="text-sm">No regions match the selected filters.</p>
          </div>
        )}

        <motion.section
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <div className="relative overflow-hidden bg-primary text-on-primary rounded-2xl px-6 sm:px-12 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="absolute -top-16 -right-16 w-64 h-64 bg-on-primary/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-primary/70 mb-1.5">Join the Mission</p>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold leading-tight">Help Build 211 Temples</h2>
              <p className="text-sm text-on-primary/80 mt-2">
                Every donation brings Srila Prabhupada's vision closer to reality. Support Vision 2051 and help establish Krishna consciousness in every corner of India.
              </p>
            </div>
            <a href="https://www.iskcon.org/donate" target="_blank" rel="noopener noreferrer" className="relative z-10 shrink-0">
              <button className="bg-on-primary text-primary px-7 py-3 rounded-xl font-bold text-sm tracking-wide hover:bg-on-primary/90 transition-colors whitespace-nowrap flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Donate Now
              </button>
            </a>
          </div>
        </motion.section>

        <motion.blockquote
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          className="border-l-2 border-primary pl-6 py-4 max-w-2xl mx-auto"
        >
          <p className="font-serif text-lg italic text-on-surface/90 leading-relaxed">
            "By 2051 — the centenary of Srila Prabhupada's arrival in New York — every Indian state should echo with the Hare Krishna maha-mantra from a dedicated ISKCON temple."
          </p>
          <cite className="text-xs text-on-surface-variant font-semibold uppercase tracking-widest mt-3 block not-italic">
            — Vision 2051 Charter
          </cite>
        </motion.blockquote>
      </div>
    </Layout>
  );
}
