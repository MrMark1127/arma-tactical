import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import TacticalMapWrapper from "./TacticalMapWrapper";

interface TacticalPageProps {
  params: {
    planId: string;
  };
}

export default async function TacticalPage({ params }: TacticalPageProps) {
  const session = await auth();

  // if (!session) {
  //   redirect("/api/auth/signin");
  // }

  return (
    <main className="h-screen w-screen overflow-hidden">
      <TacticalMapWrapper
        planId={params.planId}
        // Update this path to match your actual image location
        mapImageUrl="/Everon-1989-min.jpg" // Should be in public folder
        width={16384}
        height={16384}
      />
    </main>
  );
}
