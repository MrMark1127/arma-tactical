import { auth } from "~/server/auth";
import Link from "next/link";
import { TacticalDashboard } from "~/components/TacticalDashboard";

export default async function Home() {
  const session = await auth();
  const isDev = process.env.NODE_ENV === "development";

  if (!session?.user && !isDev) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c]">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-[5rem]">
            Arma <span className="text-[hsl(280,100%,70%)]">Tactical</span>
          </h1>
          <div className="flex flex-col items-center gap-2">
            <p className="text-2xl text-white">
              Professional tactical planning for Arma Reforger
            </p>
            <Link
              href="/api/auth/signin"
              className="rounded-full bg-white/10 px-10 py-3 font-semibold text-white no-underline transition hover:bg-white/20"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <TacticalDashboard />;
}
