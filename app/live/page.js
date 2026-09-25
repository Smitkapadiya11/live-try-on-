import Studio from "./Studio";

export const metadata = { title: "Live Fitting Room — Kapadiya & Sons" };

export default async function LivePage({ searchParams }) {
  const { g } = await searchParams;
  return <Studio initialGarmentId={typeof g === "string" ? g : null} />;
}
