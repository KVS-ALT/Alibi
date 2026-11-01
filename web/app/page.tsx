import Link from "next/link";

// Capture screen lands in build step 2/4. For now, link to the demo portfolio.
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Link href="/p/demo-backup" className="underline">
        View demo portfolio
      </Link>
    </main>
  );
}
