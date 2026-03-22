import { db } from "@workspace/db";
import {
  templesTable,
  milestonesTable,
  projectUpdatesTable,
  contributorsTable,
} from "@workspace/db/schema";

async function seed() {
  console.log("Seeding temple project data...");

  const temples = await db
    .insert(templesTable)
    .values([
      {
        name: "Sri Radha Govinda Mandir",
        location: "Vrindavan, Uttar Pradesh",
        deity: "Radha Govinda",
        description:
          "A grand five-spired temple dedicated to the divine couple Radha and Govinda, designed in the classical Rajput style with intricate stone carvings depicting the Ras Lila.",
        status: "construction",
        phase: "Shikhara Construction",
        constructionProgress: "65",
        fundraisingGoal: "45000000",
        fundraisingRaised: "31500000",
        startDate: "2022-03-15",
        expectedCompletion: "2026-12-31",
        projectLead: "Swami Bhaktivedanta Dasa",
        coverImage: null,
      },
      {
        name: "Shri Venkateswara Temple",
        location: "Tirupati Hills, Andhra Pradesh",
        deity: "Lord Venkateswara",
        description:
          "A replica of the sacred Tirumala temple being constructed for the diaspora community, featuring traditional Dravidian architecture with a magnificent gopuram tower.",
        status: "finishing",
        phase: "Interior Sanctum Work",
        constructionProgress: "88",
        fundraisingGoal: "120000000",
        fundraisingRaised: "115000000",
        startDate: "2019-07-08",
        expectedCompletion: "2025-06-30",
        projectLead: "Sri Srinivasa Rao",
        coverImage: null,
      },
      {
        name: "Jagannath Dham",
        location: "Puri Heritage Zone, Odisha",
        deity: "Lord Jagannath",
        description:
          "A heritage restoration and expansion project of an ancient Jagannath temple, preserving the traditional Kalinga architecture while adding modern pilgrim facilities.",
        status: "planning",
        phase: "Architectural Design",
        constructionProgress: "12",
        fundraisingGoal: "75000000",
        fundraisingRaised: "18000000",
        startDate: "2024-01-01",
        expectedCompletion: "2028-04-15",
        projectLead: "Pandit Gajapati Mohapatra",
        coverImage: null,
      },
      {
        name: "Somnath Mahadev Mandir",
        location: "Saurashtra, Gujarat",
        deity: "Lord Shiva (Somnath)",
        description:
          "A magnificent temple to Shiva in the sacred Jyotirlinga tradition, incorporating Chalukya and Solanki architectural styles with a 108-foot shikhara.",
        status: "consecrated",
        phase: "Operational Phase",
        constructionProgress: "100",
        fundraisingGoal: "55000000",
        fundraisingRaised: "55000000",
        startDate: "2018-02-10",
        expectedCompletion: "2024-02-10",
        projectLead: "Mahamandaleshwar Swami Shankarananda",
        coverImage: null,
      },
      {
        name: "Devi Durga Shakti Peeth",
        location: "Vaishno Devi Route, Jammu",
        deity: "Goddess Durga",
        description:
          "A new Shakti Peeth temple on the sacred Vaishno Devi route, serving millions of pilgrims annually with a unique cave-style inner sanctum and open-air mandap.",
        status: "construction",
        phase: "Main Structure",
        constructionProgress: "45",
        fundraisingGoal: "38000000",
        fundraisingRaised: "22000000",
        startDate: "2023-04-14",
        expectedCompletion: "2027-10-02",
        projectLead: "Mataji Saraswati Devi",
        coverImage: null,
      },
    ])
    .returning();

  console.log(`Created ${temples.length} temples`);

  const milestones = await db
    .insert(milestonesTable)
    .values([
      {
        templeId: temples[0].id,
        title: "Foundation Consecration (Bhoomi Puja)",
        description: "Sacred ground-breaking ceremony with Vedic rituals",
        status: "completed",
        targetDate: "2022-03-15",
        completedDate: "2022-03-15",
      },
      {
        templeId: temples[0].id,
        title: "Garbhagriha (Sanctum) Completion",
        description: "Inner sanctum walls and ceiling construction finished",
        status: "completed",
        targetDate: "2023-12-01",
        completedDate: "2024-01-15",
      },
      {
        templeId: temples[0].id,
        title: "Shikhara (Tower) Completion",
        description: "Five-spire tower construction and stone carving",
        status: "in_progress",
        targetDate: "2025-06-30",
        completedDate: null,
      },
      {
        templeId: temples[0].id,
        title: "Murti Prana Pratishtha (Consecration)",
        description: "Sacred consecration ceremony installing the main deities",
        status: "pending",
        targetDate: "2026-10-15",
        completedDate: null,
      },
      {
        templeId: temples[1].id,
        title: "Gopuram Foundation",
        description: "Main tower foundation laid",
        status: "completed",
        targetDate: "2020-01-15",
        completedDate: "2020-01-20",
      },
      {
        templeId: temples[1].id,
        title: "Inner Gopuram Tiers",
        description: "All 7 tiers of the gopuram sculpted and installed",
        status: "completed",
        targetDate: "2023-06-30",
        completedDate: "2023-08-15",
      },
      {
        templeId: temples[1].id,
        title: "Sanctum Interior Work",
        description: "Gold plating, deity installation prep",
        status: "in_progress",
        targetDate: "2025-03-01",
        completedDate: null,
      },
      {
        templeId: temples[2].id,
        title: "Heritage Assessment",
        description: "Archaeological survey and structural assessment",
        status: "completed",
        targetDate: "2024-03-01",
        completedDate: "2024-02-28",
      },
      {
        templeId: temples[2].id,
        title: "Architectural Design Approval",
        description: "State heritage board approval for expansion design",
        status: "in_progress",
        targetDate: "2025-06-01",
        completedDate: null,
      },
      {
        templeId: temples[4].id,
        title: "Bhumi Puja",
        description: "Sacred ground-breaking ceremony",
        status: "completed",
        targetDate: "2023-04-14",
        completedDate: "2023-04-14",
      },
      {
        templeId: temples[4].id,
        title: "Cave Sanctum Excavation",
        description: "Natural cave-style sanctum carved into the hillside",
        status: "in_progress",
        targetDate: "2025-12-31",
        completedDate: null,
      },
    ])
    .returning();

  console.log(`Created ${milestones.length} milestones`);

  const updates = await db
    .insert(projectUpdatesTable)
    .values([
      {
        templeId: temples[0].id,
        title: "Shikhara Stone Carvings at 60% Completion",
        content:
          "The master sculptors from Rajasthan have completed the intricate floral motifs on the eastern and western faces of the main shikhara. The detailed depictions of the Ras Lila on the outer walls are breathtaking. We expect to complete all five spires by the end of the monsoon season.",
        author: "Swami Bhaktivedanta Dasa",
        category: "construction",
      },
      {
        templeId: temples[0].id,
        title: "Fundraising Milestone: ₹3 Crore in Single Month",
        content:
          "Inspired by our recent progress update, the global devotee community contributed an unprecedented ₹3 crore in a single month. A major donation of ₹1.5 crore came from the Vrindavan Foundation of the UK. We are deeply grateful for this outpouring of service and devotion.",
        author: "Treasurer Madhav Das",
        category: "fundraising",
      },
      {
        templeId: temples[1].id,
        title: "Gold Murti Installation Ceremony Scheduled",
        content:
          "After years of meticulous craftsmanship, the 6-foot gold-plated vigraha (deity form) of Lord Venkateswara has arrived from Kanchipuram. The Prana Pratishtha ceremony has been scheduled for March 2025 with blessings from the Tirumala Tirupati Devasthanams.",
        author: "Sri Srinivasa Rao",
        category: "spiritual",
      },
      {
        templeId: temples[3].id,
        title: "Temple Opens to Pilgrims",
        content:
          "After 6 years of devoted construction, Somnath Mahadev Mandir has been consecrated and opened its doors to pilgrims. The Maha Abhisheka ceremony drew over 50,000 devotees. The temple is now operational with daily pujas at Brahma Muhurta, Madhyanna, and Sayam times.",
        author: "Mahamandaleshwar Swami Shankarananda",
        category: "spiritual",
      },
      {
        templeId: temples[4].id,
        title: "Cave Sanctum Excavation Progressing",
        content:
          "The specialized rock excavation team has completed 40% of the inner cave sanctum. The natural rock formation is being shaped to create a 30-foot deep inner chamber. Preliminary Vastu analysis indicates this natural cave will create an extraordinarily powerful spiritual atmosphere.",
        author: "Mataji Saraswati Devi",
        category: "construction",
      },
    ])
    .returning();

  console.log(`Created ${updates.length} updates`);

  const contributors = await db
    .insert(contributorsTable)
    .values([
      {
        templeId: temples[0].id,
        name: "Vrindavan Foundation UK",
        role: "Major Donor",
        contribution: "Principal sponsor of the main shikhara construction",
        amount: "15000000",
      },
      {
        templeId: temples[0].id,
        name: "Pandit Ramdev Sharma",
        role: "Chief Architect",
        contribution: "Lead architect designing in authentic Rajput temple style",
        amount: null,
      },
      {
        templeId: temples[0].id,
        name: "ISKCON Vrindavan",
        role: "Spiritual Overseer",
        contribution: "Providing Vedic guidance and puja protocols",
        amount: "5000000",
      },
      {
        templeId: temples[1].id,
        name: "Tirumala Tirupati Devasthanams",
        role: "Spiritual Partner",
        contribution: "Sanctioning the replica temple and providing scriptural guidance",
        amount: null,
      },
      {
        templeId: temples[1].id,
        name: "Venkateswara Seva Trust",
        role: "Primary Fundraiser",
        contribution: "Coordinating global fundraising campaigns",
        amount: "80000000",
      },
      {
        templeId: temples[3].id,
        name: "Gujarat Heritage Foundation",
        role: "Government Partner",
        contribution: "Land grant and infrastructure support",
        amount: "20000000",
      },
    ])
    .returning();

  console.log(`Created ${contributors.length} contributors`);
  console.log("Seed complete!");
}

seed().catch(console.error);
