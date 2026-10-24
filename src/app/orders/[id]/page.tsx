import { notFound } from "next/navigation";
import { connection } from "next/server";
import { store } from "@/lib/store";
import { hasAccess } from "@/lib/access";
import { publicOrder } from "@/lib/http";
import OrderView from "./OrderView";

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  await connection();
  const { id } = await params;
  const order = await store.getOrder(id);
  // Only the browser that placed the order can see it
  if (!order || !(await hasAccess("o", id, order.accessHash))) notFound();
  return <OrderView initial={publicOrder(order)} />;
}
