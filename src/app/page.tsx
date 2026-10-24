import TryOnStudio from "@/components/TryOnStudio";
import { listProducts } from "@/lib/shift4shop";

export const dynamic = "force-dynamic";

export default async function Home() {
  let products;
  try {
    products = await listProducts();
  } catch (err) {
    return (
      <div className="rounded-xl bg-red-50 p-6 text-red-800">
        Could not load the catalog from 3dcart: {(err as Error).message}
      </div>
    );
  }
  if (!products.length) return <p>No products in the catalog yet.</p>;
  return <TryOnStudio products={products} />;
}
