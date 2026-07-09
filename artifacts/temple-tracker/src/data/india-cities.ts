// ── Vision 2051 · 211 Indian cities, grouped by state ──────────────────────────
// Powers the "Design Your Temple" location picker. 28 states × 7 cities = 196,
// plus Union Territories (Delhi 7, J&K 4, Ladakh 2, Puducherry 1, Chandigarh 1)
// = 15, for a total of exactly 211. Coordinates are approximate city centres.

export interface IndiaCity {
  state: string;
  city: string;
  lat: number;
  lng: number;
  tier?: 1 | 2 | 3; // rough population/importance tier (1 = metro/major pilgrimage)
}

export const INDIA_CITIES: IndiaCity[] = [
  // Andhra Pradesh
  { state: "Andhra Pradesh", city: "Visakhapatnam", lat: 17.69, lng: 83.22, tier: 1 },
  { state: "Andhra Pradesh", city: "Vijayawada", lat: 16.51, lng: 80.65, tier: 1 },
  { state: "Andhra Pradesh", city: "Guntur", lat: 16.31, lng: 80.44, tier: 2 },
  { state: "Andhra Pradesh", city: "Tirupati", lat: 13.63, lng: 79.42, tier: 1 },
  { state: "Andhra Pradesh", city: "Nellore", lat: 14.44, lng: 79.99, tier: 2 },
  { state: "Andhra Pradesh", city: "Kurnool", lat: 15.83, lng: 78.04, tier: 2 },
  { state: "Andhra Pradesh", city: "Rajahmundry", lat: 17.0, lng: 81.78, tier: 2 },

  // Arunachal Pradesh
  { state: "Arunachal Pradesh", city: "Itanagar", lat: 27.08, lng: 93.61, tier: 2 },
  { state: "Arunachal Pradesh", city: "Naharlagun", lat: 27.1, lng: 93.69, tier: 3 },
  { state: "Arunachal Pradesh", city: "Pasighat", lat: 28.07, lng: 95.33, tier: 3 },
  { state: "Arunachal Pradesh", city: "Tawang", lat: 27.59, lng: 91.86, tier: 3 },
  { state: "Arunachal Pradesh", city: "Ziro", lat: 27.63, lng: 93.83, tier: 3 },
  { state: "Arunachal Pradesh", city: "Bomdila", lat: 27.26, lng: 92.4, tier: 3 },
  { state: "Arunachal Pradesh", city: "Tezu", lat: 27.92, lng: 96.17, tier: 3 },

  // Assam
  { state: "Assam", city: "Guwahati", lat: 26.14, lng: 91.74, tier: 1 },
  { state: "Assam", city: "Silchar", lat: 24.83, lng: 92.78, tier: 2 },
  { state: "Assam", city: "Dibrugarh", lat: 27.47, lng: 94.91, tier: 2 },
  { state: "Assam", city: "Jorhat", lat: 26.75, lng: 94.22, tier: 2 },
  { state: "Assam", city: "Nagaon", lat: 26.35, lng: 92.69, tier: 3 },
  { state: "Assam", city: "Tinsukia", lat: 27.49, lng: 95.36, tier: 3 },
  { state: "Assam", city: "Tezpur", lat: 26.63, lng: 92.79, tier: 3 },

  // Bihar
  { state: "Bihar", city: "Patna", lat: 25.59, lng: 85.14, tier: 1 },
  { state: "Bihar", city: "Gaya", lat: 24.8, lng: 85.0, tier: 1 },
  { state: "Bihar", city: "Bhagalpur", lat: 25.24, lng: 86.98, tier: 2 },
  { state: "Bihar", city: "Muzaffarpur", lat: 26.12, lng: 85.39, tier: 2 },
  { state: "Bihar", city: "Darbhanga", lat: 26.15, lng: 85.9, tier: 2 },
  { state: "Bihar", city: "Purnia", lat: 25.78, lng: 87.47, tier: 3 },
  { state: "Bihar", city: "Bihar Sharif", lat: 25.2, lng: 85.52, tier: 3 },

  // Chhattisgarh
  { state: "Chhattisgarh", city: "Raipur", lat: 21.25, lng: 81.63, tier: 1 },
  { state: "Chhattisgarh", city: "Bhilai", lat: 21.19, lng: 81.38, tier: 2 },
  { state: "Chhattisgarh", city: "Bilaspur", lat: 22.08, lng: 82.15, tier: 2 },
  { state: "Chhattisgarh", city: "Korba", lat: 22.35, lng: 82.68, tier: 3 },
  { state: "Chhattisgarh", city: "Durg", lat: 21.19, lng: 81.28, tier: 2 },
  { state: "Chhattisgarh", city: "Rajnandgaon", lat: 21.1, lng: 81.03, tier: 3 },
  { state: "Chhattisgarh", city: "Jagdalpur", lat: 19.08, lng: 82.03, tier: 3 },

  // Goa
  { state: "Goa", city: "Panaji", lat: 15.49, lng: 73.83, tier: 2 },
  { state: "Goa", city: "Margao", lat: 15.27, lng: 73.96, tier: 2 },
  { state: "Goa", city: "Vasco da Gama", lat: 15.4, lng: 73.81, tier: 2 },
  { state: "Goa", city: "Mapusa", lat: 15.59, lng: 73.81, tier: 3 },
  { state: "Goa", city: "Ponda", lat: 15.4, lng: 74.01, tier: 3 },
  { state: "Goa", city: "Bicholim", lat: 15.6, lng: 73.95, tier: 3 },
  { state: "Goa", city: "Curchorem", lat: 15.26, lng: 74.11, tier: 3 },

  // Gujarat
  { state: "Gujarat", city: "Ahmedabad", lat: 23.02, lng: 72.57, tier: 1 },
  { state: "Gujarat", city: "Surat", lat: 21.17, lng: 72.83, tier: 1 },
  { state: "Gujarat", city: "Vadodara", lat: 22.31, lng: 73.18, tier: 1 },
  { state: "Gujarat", city: "Rajkot", lat: 22.3, lng: 70.8, tier: 2 },
  { state: "Gujarat", city: "Bhavnagar", lat: 21.76, lng: 72.15, tier: 2 },
  { state: "Gujarat", city: "Jamnagar", lat: 22.47, lng: 70.06, tier: 2 },
  { state: "Gujarat", city: "Dwarka", lat: 22.24, lng: 68.97, tier: 1 },

  // Haryana
  { state: "Haryana", city: "Faridabad", lat: 28.41, lng: 77.31, tier: 1 },
  { state: "Haryana", city: "Gurugram", lat: 28.46, lng: 77.03, tier: 1 },
  { state: "Haryana", city: "Panipat", lat: 29.39, lng: 76.97, tier: 2 },
  { state: "Haryana", city: "Ambala", lat: 30.38, lng: 76.78, tier: 2 },
  { state: "Haryana", city: "Hisar", lat: 29.15, lng: 75.72, tier: 2 },
  { state: "Haryana", city: "Karnal", lat: 29.69, lng: 76.99, tier: 2 },
  { state: "Haryana", city: "Rohtak", lat: 28.9, lng: 76.61, tier: 2 },

  // Himachal Pradesh
  { state: "Himachal Pradesh", city: "Shimla", lat: 31.1, lng: 77.17, tier: 2 },
  { state: "Himachal Pradesh", city: "Dharamshala", lat: 32.22, lng: 76.32, tier: 2 },
  { state: "Himachal Pradesh", city: "Solan", lat: 30.9, lng: 77.1, tier: 3 },
  { state: "Himachal Pradesh", city: "Mandi", lat: 31.71, lng: 76.93, tier: 3 },
  { state: "Himachal Pradesh", city: "Kullu", lat: 31.96, lng: 77.11, tier: 3 },
  { state: "Himachal Pradesh", city: "Manali", lat: 32.24, lng: 77.19, tier: 2 },
  { state: "Himachal Pradesh", city: "Bilaspur", lat: 31.33, lng: 76.76, tier: 3 },

  // Jharkhand
  { state: "Jharkhand", city: "Ranchi", lat: 23.34, lng: 85.31, tier: 1 },
  { state: "Jharkhand", city: "Jamshedpur", lat: 22.8, lng: 86.2, tier: 1 },
  { state: "Jharkhand", city: "Dhanbad", lat: 23.8, lng: 86.43, tier: 2 },
  { state: "Jharkhand", city: "Bokaro", lat: 23.67, lng: 86.15, tier: 2 },
  { state: "Jharkhand", city: "Deoghar", lat: 24.48, lng: 86.7, tier: 2 },
  { state: "Jharkhand", city: "Hazaribagh", lat: 23.99, lng: 85.36, tier: 3 },
  { state: "Jharkhand", city: "Giridih", lat: 24.18, lng: 86.3, tier: 3 },

  // Karnataka
  { state: "Karnataka", city: "Bengaluru", lat: 12.97, lng: 77.59, tier: 1 },
  { state: "Karnataka", city: "Mysuru", lat: 12.3, lng: 76.64, tier: 1 },
  { state: "Karnataka", city: "Hubballi", lat: 15.36, lng: 75.12, tier: 2 },
  { state: "Karnataka", city: "Mangaluru", lat: 12.91, lng: 74.86, tier: 2 },
  { state: "Karnataka", city: "Belagavi", lat: 15.85, lng: 74.5, tier: 2 },
  { state: "Karnataka", city: "Udupi", lat: 13.34, lng: 74.75, tier: 1 },
  { state: "Karnataka", city: "Kalaburagi", lat: 17.33, lng: 76.83, tier: 2 },

  // Kerala
  { state: "Kerala", city: "Thiruvananthapuram", lat: 8.52, lng: 76.94, tier: 1 },
  { state: "Kerala", city: "Kochi", lat: 9.93, lng: 76.27, tier: 1 },
  { state: "Kerala", city: "Kozhikode", lat: 11.26, lng: 75.78, tier: 1 },
  { state: "Kerala", city: "Thrissur", lat: 10.53, lng: 76.21, tier: 2 },
  { state: "Kerala", city: "Kollam", lat: 8.89, lng: 76.61, tier: 2 },
  { state: "Kerala", city: "Kannur", lat: 11.87, lng: 75.37, tier: 2 },
  { state: "Kerala", city: "Guruvayur", lat: 10.59, lng: 76.04, tier: 1 },

  // Madhya Pradesh
  { state: "Madhya Pradesh", city: "Bhopal", lat: 23.26, lng: 77.41, tier: 1 },
  { state: "Madhya Pradesh", city: "Indore", lat: 22.72, lng: 75.86, tier: 1 },
  { state: "Madhya Pradesh", city: "Gwalior", lat: 26.22, lng: 78.18, tier: 1 },
  { state: "Madhya Pradesh", city: "Jabalpur", lat: 23.18, lng: 79.99, tier: 1 },
  { state: "Madhya Pradesh", city: "Ujjain", lat: 23.18, lng: 75.78, tier: 1 },
  { state: "Madhya Pradesh", city: "Sagar", lat: 23.84, lng: 78.74, tier: 3 },
  { state: "Madhya Pradesh", city: "Rewa", lat: 24.53, lng: 81.3, tier: 3 },

  // Maharashtra
  { state: "Maharashtra", city: "Mumbai", lat: 19.08, lng: 72.88, tier: 1 },
  { state: "Maharashtra", city: "Pune", lat: 18.52, lng: 73.86, tier: 1 },
  { state: "Maharashtra", city: "Nagpur", lat: 21.15, lng: 79.09, tier: 1 },
  { state: "Maharashtra", city: "Nashik", lat: 20.0, lng: 73.79, tier: 1 },
  { state: "Maharashtra", city: "Chhatrapati Sambhajinagar", lat: 19.88, lng: 75.34, tier: 2 },
  { state: "Maharashtra", city: "Solapur", lat: 17.66, lng: 75.91, tier: 2 },
  { state: "Maharashtra", city: "Kolhapur", lat: 16.7, lng: 74.24, tier: 2 },

  // Manipur
  { state: "Manipur", city: "Imphal", lat: 24.82, lng: 93.94, tier: 2 },
  { state: "Manipur", city: "Thoubal", lat: 24.64, lng: 94.01, tier: 3 },
  { state: "Manipur", city: "Bishnupur", lat: 24.63, lng: 93.77, tier: 3 },
  { state: "Manipur", city: "Churachandpur", lat: 24.33, lng: 93.68, tier: 3 },
  { state: "Manipur", city: "Kakching", lat: 24.5, lng: 93.98, tier: 3 },
  { state: "Manipur", city: "Ukhrul", lat: 25.05, lng: 94.36, tier: 3 },
  { state: "Manipur", city: "Senapati", lat: 25.27, lng: 94.02, tier: 3 },

  // Meghalaya
  { state: "Meghalaya", city: "Shillong", lat: 25.57, lng: 91.88, tier: 2 },
  { state: "Meghalaya", city: "Tura", lat: 25.51, lng: 90.2, tier: 3 },
  { state: "Meghalaya", city: "Jowai", lat: 25.45, lng: 92.2, tier: 3 },
  { state: "Meghalaya", city: "Nongstoin", lat: 25.52, lng: 91.27, tier: 3 },
  { state: "Meghalaya", city: "Baghmara", lat: 25.2, lng: 90.63, tier: 3 },
  { state: "Meghalaya", city: "Williamnagar", lat: 25.49, lng: 90.62, tier: 3 },
  { state: "Meghalaya", city: "Resubelpara", lat: 25.87, lng: 90.63, tier: 3 },

  // Mizoram
  { state: "Mizoram", city: "Aizawl", lat: 23.73, lng: 92.72, tier: 2 },
  { state: "Mizoram", city: "Lunglei", lat: 22.88, lng: 92.73, tier: 3 },
  { state: "Mizoram", city: "Champhai", lat: 23.46, lng: 93.33, tier: 3 },
  { state: "Mizoram", city: "Serchhip", lat: 23.3, lng: 92.85, tier: 3 },
  { state: "Mizoram", city: "Kolasib", lat: 24.23, lng: 92.68, tier: 3 },
  { state: "Mizoram", city: "Saiha", lat: 22.49, lng: 92.98, tier: 3 },
  { state: "Mizoram", city: "Mamit", lat: 23.93, lng: 92.49, tier: 3 },

  // Nagaland
  { state: "Nagaland", city: "Kohima", lat: 25.67, lng: 94.11, tier: 2 },
  { state: "Nagaland", city: "Dimapur", lat: 25.91, lng: 93.72, tier: 2 },
  { state: "Nagaland", city: "Mokokchung", lat: 26.32, lng: 94.52, tier: 3 },
  { state: "Nagaland", city: "Tuensang", lat: 26.28, lng: 94.83, tier: 3 },
  { state: "Nagaland", city: "Wokha", lat: 26.09, lng: 94.26, tier: 3 },
  { state: "Nagaland", city: "Zunheboto", lat: 26.01, lng: 94.52, tier: 3 },
  { state: "Nagaland", city: "Mon", lat: 26.72, lng: 95.1, tier: 3 },

  // Odisha
  { state: "Odisha", city: "Bhubaneswar", lat: 20.3, lng: 85.82, tier: 1 },
  { state: "Odisha", city: "Cuttack", lat: 20.46, lng: 85.88, tier: 2 },
  { state: "Odisha", city: "Puri", lat: 19.81, lng: 85.83, tier: 1 },
  { state: "Odisha", city: "Rourkela", lat: 22.26, lng: 84.85, tier: 2 },
  { state: "Odisha", city: "Sambalpur", lat: 21.47, lng: 83.97, tier: 3 },
  { state: "Odisha", city: "Berhampur", lat: 19.31, lng: 84.79, tier: 2 },
  { state: "Odisha", city: "Balasore", lat: 21.49, lng: 86.93, tier: 3 },

  // Punjab
  { state: "Punjab", city: "Ludhiana", lat: 30.9, lng: 75.85, tier: 1 },
  { state: "Punjab", city: "Amritsar", lat: 31.63, lng: 74.87, tier: 1 },
  { state: "Punjab", city: "Jalandhar", lat: 31.33, lng: 75.58, tier: 1 },
  { state: "Punjab", city: "Patiala", lat: 30.34, lng: 76.39, tier: 2 },
  { state: "Punjab", city: "Bathinda", lat: 30.21, lng: 74.94, tier: 2 },
  { state: "Punjab", city: "Mohali", lat: 30.7, lng: 76.72, tier: 2 },
  { state: "Punjab", city: "Hoshiarpur", lat: 31.53, lng: 75.91, tier: 3 },

  // Rajasthan
  { state: "Rajasthan", city: "Jaipur", lat: 26.91, lng: 75.79, tier: 1 },
  { state: "Rajasthan", city: "Jodhpur", lat: 26.24, lng: 73.02, tier: 1 },
  { state: "Rajasthan", city: "Udaipur", lat: 24.58, lng: 73.68, tier: 1 },
  { state: "Rajasthan", city: "Kota", lat: 25.21, lng: 75.86, tier: 2 },
  { state: "Rajasthan", city: "Bikaner", lat: 28.02, lng: 73.31, tier: 2 },
  { state: "Rajasthan", city: "Ajmer", lat: 26.45, lng: 74.64, tier: 2 },
  { state: "Rajasthan", city: "Pushkar", lat: 26.49, lng: 74.55, tier: 1 },

  // Sikkim
  { state: "Sikkim", city: "Gangtok", lat: 27.34, lng: 88.61, tier: 2 },
  { state: "Sikkim", city: "Namchi", lat: 27.17, lng: 88.35, tier: 3 },
  { state: "Sikkim", city: "Gyalshing", lat: 27.28, lng: 88.26, tier: 3 },
  { state: "Sikkim", city: "Mangan", lat: 27.51, lng: 88.53, tier: 3 },
  { state: "Sikkim", city: "Rangpo", lat: 27.18, lng: 88.53, tier: 3 },
  { state: "Sikkim", city: "Singtam", lat: 27.23, lng: 88.5, tier: 3 },
  { state: "Sikkim", city: "Jorethang", lat: 27.11, lng: 88.32, tier: 3 },

  // Tamil Nadu
  { state: "Tamil Nadu", city: "Chennai", lat: 13.08, lng: 80.27, tier: 1 },
  { state: "Tamil Nadu", city: "Coimbatore", lat: 11.02, lng: 76.96, tier: 1 },
  { state: "Tamil Nadu", city: "Madurai", lat: 9.93, lng: 78.12, tier: 1 },
  { state: "Tamil Nadu", city: "Tiruchirappalli", lat: 10.79, lng: 78.7, tier: 2 },
  { state: "Tamil Nadu", city: "Salem", lat: 11.66, lng: 78.15, tier: 2 },
  { state: "Tamil Nadu", city: "Tirunelveli", lat: 8.71, lng: 77.76, tier: 2 },
  { state: "Tamil Nadu", city: "Kanchipuram", lat: 12.84, lng: 79.7, tier: 1 },

  // Telangana
  { state: "Telangana", city: "Hyderabad", lat: 17.39, lng: 78.49, tier: 1 },
  { state: "Telangana", city: "Warangal", lat: 17.97, lng: 79.59, tier: 2 },
  { state: "Telangana", city: "Nizamabad", lat: 18.67, lng: 78.09, tier: 2 },
  { state: "Telangana", city: "Karimnagar", lat: 18.44, lng: 79.13, tier: 2 },
  { state: "Telangana", city: "Khammam", lat: 17.25, lng: 80.15, tier: 3 },
  { state: "Telangana", city: "Ramagundam", lat: 18.8, lng: 79.45, tier: 3 },
  { state: "Telangana", city: "Mahbubnagar", lat: 16.74, lng: 78.0, tier: 3 },

  // Tripura
  { state: "Tripura", city: "Agartala", lat: 23.83, lng: 91.28, tier: 2 },
  { state: "Tripura", city: "Udaipur", lat: 23.53, lng: 91.48, tier: 3 },
  { state: "Tripura", city: "Dharmanagar", lat: 24.37, lng: 92.17, tier: 3 },
  { state: "Tripura", city: "Kailashahar", lat: 24.33, lng: 92.01, tier: 3 },
  { state: "Tripura", city: "Belonia", lat: 23.25, lng: 91.45, tier: 3 },
  { state: "Tripura", city: "Ambassa", lat: 23.93, lng: 91.85, tier: 3 },
  { state: "Tripura", city: "Khowai", lat: 24.06, lng: 91.6, tier: 3 },

  // Uttar Pradesh
  { state: "Uttar Pradesh", city: "Vrindavan", lat: 27.58, lng: 77.7, tier: 1 },
  { state: "Uttar Pradesh", city: "Mathura", lat: 27.49, lng: 77.67, tier: 1 },
  { state: "Uttar Pradesh", city: "Ayodhya", lat: 26.8, lng: 82.2, tier: 1 },
  { state: "Uttar Pradesh", city: "Varanasi", lat: 25.32, lng: 82.97, tier: 1 },
  { state: "Uttar Pradesh", city: "Prayagraj", lat: 25.44, lng: 81.85, tier: 1 },
  { state: "Uttar Pradesh", city: "Lucknow", lat: 26.85, lng: 80.95, tier: 1 },
  { state: "Uttar Pradesh", city: "Kanpur", lat: 26.45, lng: 80.33, tier: 1 },

  // Uttarakhand
  { state: "Uttarakhand", city: "Dehradun", lat: 30.32, lng: 78.03, tier: 1 },
  { state: "Uttarakhand", city: "Haridwar", lat: 29.95, lng: 78.16, tier: 1 },
  { state: "Uttarakhand", city: "Rishikesh", lat: 30.09, lng: 78.27, tier: 1 },
  { state: "Uttarakhand", city: "Nainital", lat: 29.38, lng: 79.46, tier: 2 },
  { state: "Uttarakhand", city: "Haldwani", lat: 29.22, lng: 79.51, tier: 2 },
  { state: "Uttarakhand", city: "Roorkee", lat: 29.87, lng: 77.89, tier: 3 },
  { state: "Uttarakhand", city: "Rudrapur", lat: 28.98, lng: 79.4, tier: 3 },

  // West Bengal
  { state: "West Bengal", city: "Kolkata", lat: 22.57, lng: 88.36, tier: 1 },
  { state: "West Bengal", city: "Mayapur", lat: 23.42, lng: 88.39, tier: 1 },
  { state: "West Bengal", city: "Siliguri", lat: 26.73, lng: 88.4, tier: 2 },
  { state: "West Bengal", city: "Durgapur", lat: 23.52, lng: 87.31, tier: 2 },
  { state: "West Bengal", city: "Asansol", lat: 23.68, lng: 86.98, tier: 2 },
  { state: "West Bengal", city: "Howrah", lat: 22.59, lng: 88.31, tier: 1 },
  { state: "West Bengal", city: "Darjeeling", lat: 27.04, lng: 88.26, tier: 2 },

  // Delhi (NCT)
  { state: "Delhi", city: "New Delhi", lat: 28.61, lng: 77.21, tier: 1 },
  { state: "Delhi", city: "Dwarka", lat: 28.59, lng: 77.05, tier: 1 },
  { state: "Delhi", city: "Rohini", lat: 28.74, lng: 77.07, tier: 2 },
  { state: "Delhi", city: "Saket", lat: 28.52, lng: 77.21, tier: 2 },
  { state: "Delhi", city: "Pitampura", lat: 28.7, lng: 77.13, tier: 2 },
  { state: "Delhi", city: "Karol Bagh", lat: 28.65, lng: 77.19, tier: 2 },
  { state: "Delhi", city: "Najafgarh", lat: 28.61, lng: 76.98, tier: 3 },

  // Jammu & Kashmir
  { state: "Jammu & Kashmir", city: "Srinagar", lat: 34.08, lng: 74.8, tier: 1 },
  { state: "Jammu & Kashmir", city: "Jammu", lat: 32.73, lng: 74.87, tier: 1 },
  { state: "Jammu & Kashmir", city: "Anantnag", lat: 33.73, lng: 75.15, tier: 3 },
  { state: "Jammu & Kashmir", city: "Baramulla", lat: 34.2, lng: 74.34, tier: 3 },

  // Ladakh
  { state: "Ladakh", city: "Leh", lat: 34.15, lng: 77.58, tier: 2 },
  { state: "Ladakh", city: "Kargil", lat: 34.56, lng: 76.13, tier: 3 },

  // Puducherry
  { state: "Puducherry", city: "Puducherry", lat: 11.94, lng: 79.83, tier: 2 },

  // Chandigarh
  { state: "Chandigarh", city: "Chandigarh", lat: 30.73, lng: 76.78, tier: 1 },
];

/** URL-safe slug for a city, e.g. slugForCity("Uttar Pradesh","Vrindavan") → "uttar-pradesh-vrindavan". */
export function slugForCity(state: string, city: string): string {
  return `${state} ${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Unique states in first-appearance (display) order. */
export const INDIA_STATES: string[] = INDIA_CITIES.reduce<string[]>((acc, c) => {
  if (!acc.includes(c.state)) acc.push(c.state);
  return acc;
}, []);

/** Cities grouped by state (derived, so it can't drift from INDIA_CITIES). */
export const CITIES_BY_STATE: Record<string, IndiaCity[]> = INDIA_CITIES.reduce<Record<string, IndiaCity[]>>(
  (acc, c) => {
    (acc[c.state] ||= []).push(c);
    return acc;
  },
  {},
);

/** Total city count (Vision 2051 target). */
export const INDIA_CITY_COUNT = INDIA_CITIES.length; // 211
