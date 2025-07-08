import { auth } from "~/server/auth";

import Link from "next/link";
import { api } from "~/trpc/react";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
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

  return <PlansDashboard />;
}

function PlansDashboard() {
  return (
    <main className="container mx-auto p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tactical Plans</h1>
        <Link
          href="/tactical/new"
          className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          Create New Plan
        </Link>
      </div>

      <PlansGrid />
    </main>
  );
}

function PlansGrid() {
  const { data: plans, isLoading } = api.tactical.getPlans.useQuery();

  if (isLoading) {
    return <div>Loading plans...</div>;
  }

  if (!plans?.length) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-gray-500">No tactical plans yet</p>
        <Link
          href="/tactical/new"
          className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          Create Your First Plan
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan: any) => (
        <div
          key={plan.id}
          className="rounded-lg border p-4 transition-shadow hover:shadow-lg"
        >
          <div className="mb-2 flex items-start justify-between">
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <span className="text-xs text-gray-500">
              {plan.markers.length} markers
            </span>
          </div>

          <p className="mb-4 line-clamp-2 text-sm text-gray-600">
            {plan.description || "No description"}
          </p>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Updated {new Date(plan.updatedAt).toLocaleDateString()}
            </span>
            <Link
              href={`/tactical/${plan.id}`}
              className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
            >
              Open
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
