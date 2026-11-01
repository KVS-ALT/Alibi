import PortfolioView from "./PortfolioView";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PortfolioView slug={slug} />;
}
