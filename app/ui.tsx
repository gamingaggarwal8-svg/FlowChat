const paths: Record<string, string> = {
  Overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  Customers:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  Suppliers:
    "M2 4h13v12H2z M15 9h4l3 4v3h-7 M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  "Inventory & growth": "M3 7l9-5 9 5v10l-9 5-9-5V7 M3 7l9 5 9-5 M12 12v10",
  "Payment promises": "M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  "Chat review": "M21 11a8 8 0 0 1-8 8H9l-6 3 2-6a8 8 0 1 1 16-5",
  "Voice transcripts":
    "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3 M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  "Approval queue": "M9 12l2 2 4-4 M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11",
  Bargaining: "M20 12V4H4v16h8 M16 16l3 3 3-3 M19 12v7",
  upload: "M12 16V3 M7 8l5-5 5 5 M3 16v5h18v-5",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  external: "M7 17L17 7 M7 7h10v10",
  spark: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  check: "M5 12l4 4L19 6",
  file: "M14 2H6v20h14V8z M14 2v6h6 M8 13h8 M8 17h5",
  chevron: "M9 5l7 7-7 7",
  down: "M6 9l6 6 6-6",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  play: "M8 4v16l13-8z",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "M6 6l12 12 M18 6L6 18",
  reset: "M3 10a9 9 0 1 1 3 9 M3 3v7h7",
  wave: "M3 10v4 M7 6v12 M11 3v18 M15 7v10 M19 9v6 M23 11v2",
  brand: "M4 19V5h12 M4 12h8 M16 12h4 M16 17h4",
  alert: "M12 3L2 21h20L12 3 M12 9v5 M12 17v1",
};
export function AppIcon({
  name,
  size = 18,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.file} />
    </svg>
  );
}
