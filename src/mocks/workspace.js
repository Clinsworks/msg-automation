const plans = {
  free: {
    name: "Free",
    status: "Active",
    expiry: "No expiry",
    sendingMethod: "Standard Bot"
  },
  pro: {
    name: "Pro",
    status: "Inactive",
    expiry: "Not subscribed",
    sendingMethod: "Standard Bot + Premium Personal Account"
  }
};

export const getWorkspace = (user) => ({
  businessName: user?.first_name ? `${user.first_name}'s Business` : "Your Business",
  plan: plans.free,
  stats: {
    campaigns: 0,
    sent: 0,
    successful: 0,
    failed: 0
  },
  upcoming: []
});

export const getMockCampaigns = () => [
  { id: "CMP-001", name: "Welcome campaign", status: "Draft", recipients: 0 },
  { id: "CMP-002", name: "Weekend promotion", status: "Scheduled", recipients: 12 }
];

export const getMockAudiences = () => [
  { id: "AUD-001", name: "All reachable contacts", size: 0 },
  { id: "AUD-002", name: "Telegram groups", size: 0 }
];

export const getMockTemplates = () => [
  { id: "TPL-001", name: "Welcome message", preview: "Welcome to our business!" },
  { id: "TPL-002", name: "Promotion", preview: "Our latest offer is here." }
];
