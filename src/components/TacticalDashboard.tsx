"use client";

import Link from "next/link";
import { useTacticalPlans } from "~/hooks/useTactical";

export function TacticalDashboard() {
  return (
    <main className="container mx-auto p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tactical Plans</h1>
        <div className="flex gap-2">
          <Link
            href="/mortar"
            className="rounded bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
          >
            🎯 Mortar Calculator
          </Link>
          <CreatePlanButton />
        </div>
      </div>

      <PlansGrid />
    </main>
  );
}

function CreatePlanButton() {
  const { createPlan, isCreating } = useTacticalPlans();

  const handleCreatePlan = () => {
    createPlan({
      name: `Operation ${new Date().toLocaleDateString()}`,
      description: "New tactical operation plan",
      isPublic: false,
    });
  };

  return (
    <button
      onClick={handleCreatePlan}
      disabled={isCreating}
      className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
    >
      {isCreating ? "Creating..." : "Create New Plan"}
    </button>
  );
}

function PlansGrid() {
  const { plans, isLoading } = useTacticalPlans();

  if (isLoading) {
    return <div>Loading plans...</div>;
  }

  if (!plans?.length) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-gray-500">No tactical plans yet</p>
        <CreatePlanButton />
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
