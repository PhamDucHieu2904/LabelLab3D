export type CoinUsageEntry = {
  id: string;
  description: string;
  when: string;
  coins: number;
};

export type UserProfileSummary = {
  name: string;
  title: string;
  avatar: string;
  daysLoggedIn: number;
  coinBalance: number;
  recentUsage: readonly CoinUsageEntry[];
};

// Design preview only. Replace this fixture with authenticated account data
// when the account and coin ledger services are implemented.
export const PROFILE_PREVIEW: UserProfileSummary = {
  name: "Guest designer",
  title: "Rising creator",
  avatar: "/home/avatar-female-3d.jpg",
  daysLoggedIn: 12,
  coinBalance: 300,
  recentUsage: [
    { id: "preview-1", description: "Image render", when: "2h ago", coins: 2 },
    { id: "preview-2", description: "Image render", when: "Yesterday", coins: 2 },
    { id: "preview-3", description: "Image render", when: "Oct 28", coins: 2 },
  ],
};
