"use client";

import { BentoFeatures } from "./BentoFeatures";
import { ScrollReveal } from "./ScrollReveal";

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-[#e7e4eb] dark:bg-[#060104]">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <ScrollReveal className="mb-12 text-center">
          <h2 className="text-4xl max-md:text-3xl font-bold text-landing-primary dark:text-landing-primary mb-4">
            Everything you need in one platform
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto text-balance dark:text-gray-400">
            Write, code, compare, and create - all inside one unified AI workspace. No more tab-switching, no
            more context-switching.
          </p>
        </ScrollReveal>

        <BentoFeatures />
      </div>
    </section>
  );
}

