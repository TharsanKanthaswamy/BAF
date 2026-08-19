import { SignUp } from "@clerk/nextjs";
import Image from "next/image";

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-8">
      <div className="flex items-center gap-3">
        <div className="relative size-10 overflow-hidden rounded-xl bg-muted ring-1 ring-border shadow-sm">
          <Image
            src="/logo.jpeg"
            alt="Sentinel Logo"
            width={40}
            height={40}
            className="size-full object-cover"
            priority
          />
        </div>
        <div>
          <h1 className="text-xl font-semibold leading-none">Sentinel</h1>
          <p className="mt-1 text-xs text-muted-foreground">Fraud Operations Console</p>
        </div>
      </div>
      <SignUp />
    </div>
  );
}
