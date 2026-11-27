"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTheme } from "@/context/theme-context";

const HeroGrid = dynamic(() => import("./HeroGrid"));
const HeroMock = dynamic(() => import("./HeroMock"));

const SUBTEXT =
  "Experience the future of AI conversation with our multichat interface.";

export function Hero() {
  const { theme } = useTheme();
  return (
    <section className="flex flex-col text-foreground transition-all duration-300 pb-[clamp(64px,9vw,140px)]">
      <div className="container max-w-7xl mx-auto flex flex-1 flex-col px-5 sm:px-10 z-50">
        <div className="flex flex-col items-center justify-center gap-5 pt-48 z-50">
          <h1 className="text-3xl md:text-4xl lg:text-4xl xl:text-6xl font-bold text-center text-black dark:text-white leading-tight text-balance">
            Multiple Models <br />
            <span className="text-black dark:text-white">One Powerful Interface</span>
          </h1>

          <p className="text-xl max-md:text-lg text-gray-600 dark:text-gray-400 max-w-3xl text-center text-balance">
            {SUBTEXT}
          </p>

          <Link
            href="/register"
            className="px-8 py-4 mt-2 bg-[linear-gradient(145deg,#6A45D9,#4A3198)] dark:bg-[linear-gradient(145deg,#9677FF,#6953B3)] hover:brightness-110 rounded-full text-white font-medium flex items-center gap-2 transition-all duration-300"
          >
            Get Started
            <ArrowUpRight className="w-4 h-4 text-white" />
          </Link>
        </div>

        <HeroGrid />
        <HeroMock dark={theme === "dark"} />
      </div>
    </section>
  );
}
