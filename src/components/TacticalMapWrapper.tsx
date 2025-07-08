"use client";

import dynamic from "next/dynamic";

// Dynamic import with ssr: false in a client component
const TacticalMap = dynamic(() => import("~/components/TacticalMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-900">
      <div className="text-center text-white">
        <div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-b-2 border-white"></div>
        <div className="text-sm font-medium">Loading Map Components...</div>
      </div>
    </div>
  ),
});

interface TacticalMapWrapperProps {
  planId: string;
  mapImageUrl?: string;
  width?: number;
  height?: number;
  useTiles?: boolean;
}

export default function TacticalMapWrapper(props: TacticalMapWrapperProps) {
  return <TacticalMap {...props} />;
}
