import Link from "next/link";
import Wordmark from "./wordmark";
import ThemeToggle from "./theme-toggle";
import VoiceToggle from "./voice-toggle";
import AccountChip from "./account-chip";
import ApiKeysMenu from "./api-keys-menu";

const NAV = [
  { href: "/agent", label: "Agent" },
  { href: "/calendar", label: "Calendar" },
  { href: "/settings", label: "Memory" },
];

/**
 * Wordmark left, one segmented nav centred, account right. The nav is a single
 * bordered object rather than three loose links so the header reads as one
 * control strip against the black.
 */
export default function AppShell({
  address, active, children, fixedViewport = false,
}: {
  address: string;
  active: string;
  children: React.ReactNode;
  /**
   * One screen, no page scroll — anything long scrolls inside its own region.
   * The agent view opts in so the header and the memory rail stay put while a
   * conversation grows. Document-shaped pages (the ledger, the calendar) leave
   * it off and scroll normally.
   */
  fixedViewport?: boolean;
}) {
  return (
    <div className={fixedViewport ? "flex h-dvh flex-col overflow-hidden" : "flex min-h-dvh flex-col"}>
      <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-6 px-7 py-4">
        <Link href="/agent" className="justify-self-start"><Wordmark /></Link>

        <nav className="segmented justify-self-center text-[13.5px]">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-on={item.href === active}
              aria-current={item.href === active ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 justify-self-end">
          <ThemeToggle />
          <VoiceToggle />
          <ApiKeysMenu />
          <AccountChip address={address} />
        </div>
      </header>

      {children}
    </div>
  );
}
