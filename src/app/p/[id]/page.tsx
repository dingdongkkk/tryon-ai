import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { catalog, getProduct } from "@/lib/catalog";
import ProductView from "./ProductView";

export function generateStaticParams() {
  return catalog.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const p = await getProduct((await params).id);
  return p ? { title: p.name, description: p.description } : {};
}

export default async function ProductPage({ params }: PageProps<"/p/[id]">) {
  const p = await getProduct((await params).id);
  if (!p) notFound();
  const related = [...catalog.filter((x) => x.id !== p.id && x.category === p.category), ...catalog.filter((x) => x.id !== p.id && x.category !== p.category)].slice(0, 4);
  return <ProductView key={p.id} product={p} related={related} />;
}
