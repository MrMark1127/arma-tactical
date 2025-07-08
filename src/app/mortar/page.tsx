import { auth } from "~/server/auth";
import MortarCalculatorWrapper from "~/components/MortarCalculatorWrapper";

export default async function MortarCalculatorPage() {
  const session = await auth();
  const isDev = process.env.NODE_ENV === "development";

  // Allow access in development mode
  if (!session && !isDev) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <h1 className="mb-4 text-2xl font-bold">
            🎯 Authentication Required
          </h1>
          <p>Please sign in to access the mortar calculator.</p>
          <a
            href="/"
            className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden">
      <MortarCalculatorWrapper
        mapImageUrl="/Everon-1989-min.jpg"
        width={16384}
        height={16384}
      />
    </main>
  );
}
