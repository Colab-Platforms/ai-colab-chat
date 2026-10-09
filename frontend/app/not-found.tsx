import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="flex flex-col items-center max-w-md text-center space-y-6">
        <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-full">
          <AlertCircle className="w-16 h-16 text-red-600 dark:text-red-500" />
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          404 - Not Found
        </h1>

        <p className="text-lg text-gray-600 dark:text-gray-400">
          Oops! The page you are looking for doesn't exist or has been moved.
        </p>

        <div className="pt-4">
          <Link href="/">
            <Button className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Return to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
