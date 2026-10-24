import { NextResponse } from "next/server";
import { listProducts } from "@/lib/catalog";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    return NextResponse.json({ products: await listProducts() });
  } catch (err) {
    return jsonError(err, 502);
  }
}
