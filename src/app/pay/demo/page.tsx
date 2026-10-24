import { notFound } from "next/navigation";
import { connection } from "next/server";
import { config } from "@/lib/config";
import { store } from "@/lib/store";
import { hasAccess } from "@/lib/access";
import { inr } from "@/lib/format";

// Stand-in for Pine Labs hosted checkout, only when Pine Labs isn't configured.
export default async function DemoPay({ searchParams }: PageProps<"/pay/demo">) {
  await connection();
  if (!config.payments.demo) notFound();
  const ref = String((await searchParams).ref ?? "");
  const order = await store.getOrder(ref);
  if (!order?.demo || order.status !== "awaiting_payment" || !(await hasAccess("o", ref, order.accessHash))) notFound();
  return (
    <div className="shell mt-12 max-w-sm">
      <div className="card overflow-hidden text-center">
        <div className="bg-[repeating-linear-gradient(135deg,#fdf7ec_0_12px,#f8eed9_12px_24px)] px-6 py-3 text-xs font-bold uppercase tracking-[.2em] text-warn">
          Demo checkout · no real money
        </div>
        <div className="p-8">
          <p className="eyebrow">Amount</p>
          <p className="display mt-1 text-6xl">{inr(order.totalPaise)}</p>
          <p className="mt-3 text-sm text-mute">Add Pine Labs UAT credentials to use the real sandbox checkout instead.</p>
          <form action="/api/payments/demo" method="post" className="mt-8 grid gap-2">
            <input type="hidden" name="ref" value={order.id} />
            <button name="outcome" value="PROCESSED" className="btn btn-primary h-12">Simulate successful payment</button>
            <button name="outcome" value="FAILED" className="btn btn-ghost h-12">Simulate failed payment</button>
          </form>
        </div>
      </div>
    </div>
  );
}
