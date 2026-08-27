import { redirect } from "next/navigation";
import { getOwnerAddress } from "@/lib/session.ts";
import { getPlanWeek } from "@/app/actions/plan";
import AppShell from "@/components/app-shell";
import MealCalendar from "@/components/meal-calendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const address = await getOwnerAddress();
  if (!address) redirect("/signin");

  const week = await getPlanWeek();

  return (
    <AppShell address={address} active="/calendar">
      <div className="mx-auto w-full max-w-6xl px-14 py-10">
        <MealCalendar initial={week} />
      </div>
    </AppShell>
  );
}
