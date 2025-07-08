import { api } from "~/utils/api";
import { useSession } from "next-auth/react";

export function useTacticalPlans() {
  const { data: session } = useSession();

  const {
    data: plans,
    isLoading,
    refetch,
  } = api.tactical.getPlans.useQuery(undefined, { enabled: !!session });

  const createPlanMutation = api.tactical.createPlan.useMutation({
    onSuccess: () => refetch(),
  });

  const deletePlanMutation = api.tactical.deletePlan.useMutation({
    onSuccess: () => refetch(),
  });

  return {
    plans: plans ?? [],
    isLoading,
    createPlan: createPlanMutation.mutate,
    deletePlan: deletePlanMutation.mutate,
    isCreating: createPlanMutation.isPending,
    isDeleting: deletePlanMutation.isPending,
  };
}

export function useTacticalPlan(planId: string | undefined) {
  const { data: session } = useSession();

  const {
    data: plan,
    isLoading,
    refetch,
  } = api.tactical.getPlan.useQuery(
    { id: planId! },
    { enabled: !!session && !!planId },
  );

  const createMarkerMutation = api.tactical.createMarker.useMutation({
    onSuccess: () => refetch(),
  });

  const updateMarkerMutation = api.tactical.updateMarker.useMutation({
    onSuccess: () => refetch(),
  });

  const deleteMarkerMutation = api.tactical.deleteMarker.useMutation({
    onSuccess: () => refetch(),
  });

  const createRouteMutation = api.tactical.createRoute.useMutation({
    onSuccess: () => refetch(),
  });

  return {
    plan,
    isLoading,
    createMarker: createMarkerMutation.mutate,
    updateMarker: updateMarkerMutation.mutate,
    deleteMarker: deleteMarkerMutation.mutate,
    createRoute: createRouteMutation.mutate,
    refetch,
  };
}
