import { getServerAuthSession } from "~/server/auth";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";

const TacticalMap = dynamic(() => import("~/components/TacticalMap"), {
  ssr: false,
});

interface TacticalPageProps {
  params: {
    planId: string;
  };
}

export default async function TacticalPage({ params }: TacticalPageProps) {
  const session = await getServerAuthSession();

  if (!session) {
    redirect("/api/auth/signin");
  }

  return (
    <main className="h-screen w-screen overflow-hidden">
      <TacticalMap
        planId={params.planId}
        mapImageUrl="/your-16k-map.webp"
        width={16384}
        height={16384}
      />
    </main>
  );
}
