import type { Metadata } from "next"
import ActivityHistory from "@/components/ActivityHistory"
import { PageHeader } from "@/components/ui"

export const metadata: Metadata = { title: "Activity" }

export default function ActivityPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        lead="Everything this wallet has done, in one list. Read from the Safix index when it is running, and straight from the chain when it is not."
      />
      <ActivityHistory />
    </div>
  )
}
