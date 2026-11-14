export const plans = [
  {
    id: "free",
    name: "Free",
    price: 0,
    features: [
      "Offline analytics & synthetic demo",
      "Manual chat and Excel imports",
      "Local PDF library & CSV export",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 499,
    features: [
      "Everything in Free",
      "Connected business workspace",
      "Gemini extraction & reminders",
      "Private accounting documents",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 999,
    features: [
      "Everything in Starter",
      "OneDrive Excel synchronization",
      "Role-based team access",
      "Audit history & CA summaries",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: null,
    features: [
      "Business-specific onboarding",
      "Custom integration planning",
      "Deployment & support agreement",
    ],
  },
] as const;
export type PlanId = (typeof plans)[number]["id"];
