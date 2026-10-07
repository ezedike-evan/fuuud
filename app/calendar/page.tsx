import { redirect } from "next/navigation";
import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { requireAccount } from "@/lib/require-account.ts";
import { getPlanWeek } from "@/app/actions/plan";
import AppShell from "@/components/app-shell";
import MealCalendar from "@/components/meal-calendar";

export const dynamic = "force-dynamic";

async function CalendarPageInner() {
  const address = await getOwnerAddress();
  if (!address) redirect("/signin");
  requireAccount();

  const week = await getPlanWeek();

  return (
    <AppShell address={address} active="/calendar">
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-14 lg:py-10">
        <MealCalendar initial={week} />
      </div>
    </AppShell>
  );
}

// Wrapped so the person's memory account is in scope for everything above (see inScope).
export default function CalendarPage() {
  return inScope(CalendarPageInner);
}
