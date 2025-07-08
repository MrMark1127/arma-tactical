"use client";

import dynamic from "next/dynamic";

const MortarCalculator = dynamic(
  () => import("~/components/MortarCalculator"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-green-500 border-t-transparent"></div>
          <p className="text-lg text-white">Loading Mortar Calculator...</p>
          <p className="mt-2 text-sm text-gray-400">
            🎯 Preparing ballistic tables...
          </p>
        </div>
      </div>
    ),
  },
);

interface MortarCalculatorWrapperProps {
  mapImageUrl: string;
  width: number;
  height: number;
}

export default function MortarCalculatorWrapper({
  mapImageUrl,
  width,
  height,
}: MortarCalculatorWrapperProps) {
  return (
    <MortarCalculator mapImageUrl={mapImageUrl} width={width} height={height} />
  );
}
