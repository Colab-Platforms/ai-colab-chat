
export const VOICE_OPTIONS = [
  { id: "XwkIUwRxNu9PpezCu4Vg", name: "Sia" },
  { id: "dSEhEXLzhnZEytnJ2rRy", name: "Anita" },
  { id: "IvLWq57RKibBrqZGpQrC", name: "Rian" },
  { id: "o6qTxWUeRyzRYZyUNDVJ", name: "Irina" },
  { id: "3OUAuH7CeDSQhCCijs1Y", name: "Bunty" },
  { id: "3uuqz7fBxbNsCUVbBVKR", name: "Ankita" },
] as const;

export const VOICE_IDS = VOICE_OPTIONS.map((v) => v.id);
