import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-16 text-center">
      <h1 className="text-4xl font-bold text-brand">See What We&apos;ve Built in Your Neighborhood</h1>
      <p className="mt-4 text-slate-600">
        Real Herts projects. Real homes. Real results. Explore roofing, siding, and deck projects
        completed near you—and see exactly what&apos;s possible for your home.
      </p>
      <Link
        href="/near-me"
        className="mt-8 inline-block rounded bg-brand-accent px-6 py-3 font-medium text-white"
      >
        See Projects Near You
      </Link>
    </main>
  );
}
