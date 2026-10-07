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
      {/* Phone: brand and controls on one row, the nav on its own full-width row below. From sm up it is the
          original three-column strip. Nothing here may exceed ~358px at 390px wide. */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-3 px-4 py-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-6 sm:px-7 sm:py-4">
        <Link href="/agent" className="justify-self-start"><Wordmark /></Link>

        <nav className="segmented order-3 w-full text-[13.5px] sm:order-none sm:w-auto sm:justify-self-center">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-on={item.href === active}
              aria-current={item.href === active ? "page" : undefined}
              className="flex-1 py-2.5 text-center sm:flex-none sm:py-[0.4375rem]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 justify-self-end">
          <ThemeToggle />
          {/* Voice is not built yet; on a phone it only costs the space the account chip needs. */}
          <div className="hidden sm:block"><VoiceToggle /></div>
          <ApiKeysMenu />
          <AccountChip address={address} />
        </div>
      </header>

      {children}
    </div>
  );
}
