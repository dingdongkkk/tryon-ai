import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { store } from "@/lib/store";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";

// Stand-in for the Pine Labs hosted checkout page when no Pine Labs credentials are set.
export default async function MockPay({ searchParams }: PageProps<"/pay/mock">) {
  if (config.pinelabs.enabled) notFound();
  const ref = String((await searchParams).ref ?? "");
  const order = await store.getOrder(ref);
  if (!order?.pinelabs) notFound();
  const cb = (status: string) =>
    `/api/payments/pinelabs/callback?ref=${order.id}&order_id=${order.pinelabs!.orderId}&status=${status}`;
  return (
    <div className="mx-auto max-w-sm rounded-2xl bg-white p-8 text-center shadow">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pine Labs (mock checkout)</p>
      <p className="my-4 text-3xl font-bold">{inr(order.totalPaise)}</p>
      <p className="mb-6 text-sm text-neutral-500">Add PINELABS_CLIENT_ID / SECRET to use the real UAT checkout.</p>
      <div className="grid gap-2">
        <a href={cb("PROCESSED")} className="rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500">Simulate success</a>
        <a href={cb("FAILED")} className="rounded-xl border border-neutral-300 py-3 font-semibold hover:border-neutral-500">Simulate failure</a>
      </div>
    </div>
  );
}
