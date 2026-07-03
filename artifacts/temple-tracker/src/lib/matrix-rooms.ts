// slug -> Matrix roomId (web). Filled from scripts/create-rooms.sh output; the
// bridge also returns this map at provision time and overrides via setRoomIds().
export let ROOM_IDS: Record<string, string> = {
  sangha: "",
  bhagavatam: "",
  chaitanya: "",
  kirtan: "",
};

export function setRoomIds(map: Record<string, string>): void {
  ROOM_IDS = { ...ROOM_IDS, ...map };
}

export const roomIdFor = (slug: string): string => ROOM_IDS[slug] || "";

export const slugForRoomId = (roomId: string): string =>
  Object.keys(ROOM_IDS).find((s) => ROOM_IDS[s] === roomId) || roomId;
