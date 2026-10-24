import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import OrderView from "./OrderView";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const order = await store.getOrder(id);
  if (!order) notFound();
  return <OrderView initial={order} />;
}
