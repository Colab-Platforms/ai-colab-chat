"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Star, ArrowLeft, ArrowRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";

// ─────────────────────────────────────────────────────
//  Types & Interfaces
// ─────────────────────────────────────────────────────
interface Testimonial {
  id: number;
  stars: number;
  text: string;
  avatar: string;
  name: string;
  role: string;
}

// ─────────────────────────────────────────────────────
//  Data Array
// ─────────────────────────────────────────────────────
const TESTIMONIALS: Testimonial[] = [
  {
    id: 1,
    stars: 5,
    text: "Colab AI helped us cut project delays by 40%. Everything-from tasks to docs to chats-is finally in one place. My team is moving faster than ever.",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face",
    name: "Sarah Mendez",
    role: "Head of Operations, AltForms",
  },
  {
    id: 2,
    stars: 5,
    text: "Switching between GPT-4, Claude, and Gemini in a single chat is a game changer. The token wallet and comparison tools are built for productivity.",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face",
    name: "Bilal Ahmed",
    role: "IT Manager, TechCorp",
  },
  {
    id: 3,
    stars: 5,
    text: "Rolling context windows mean I never lose details during research sessions. Highly recommended for any engineering or design team.",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&crop=face",
    name: "Briana Patton",
    role: "Product Owner, FlowState",
  },
  {
    id: 4,
    stars: 5,
    text: "Attaching code/wireframes and getting feedback from three different models side-by-side saves us hours of iteration every single day.",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&crop=face",
    name: "Elena Rostova",
    role: "Lead Designer, Vertex",
  },
  {
    id: 5,
    stars: 5,
    text: "Unified token billing and multiple API models solved all our subscription headaches. Our developers are 2x more productive with Colab AI.",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop&crop=face",
    name: "Omar Raza",
    role: "CTO, NexusDev",
  },
];

// ─────────────────────────────────────────────────────
//  Card Component
// ─────────────────────────────────────────────────────
function TestimonialCard({
  testimonial,
  isMiddle,
}: {
  testimonial: Testimonial;
  isMiddle: boolean;
}) {
  return (
    <div
      className={`relative group rounded-[24px] border p-8 h-full flex flex-col justify-between transition-all duration-300 overflow-hidden min-h-[280px] ${
        isMiddle
          ? "border-neutral-700 bg-neutral-900/40 shadow-[0_0_30px_rgba(168,85,247,0.06)]"
          : "border-neutral-900 bg-neutral-950/40 hover:border-neutral-800 hover:bg-neutral-900/20"
      }`}
    >
      {/* Subtle top purple glow on card */}
      <div
        className={`absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent transition-opacity duration-300 ${
          isMiddle ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      />
      
      {/* Bloom glow background inside the card */}
      <div
        className={`absolute -top-12 -right-12 w-24 h-24 rounded-full blur-2xl transition-colors duration-300 ${
          isMiddle ? "bg-purple-600/10" : "bg-purple-600/5 group-hover:bg-purple-600/10"
        }`}
      />

      <div className="relative z-10">
        {/* Stars */}
        <div className="flex gap-1.5 mb-5 text-amber-500">
          {[...Array(testimonial.stars)].map((_, i) => (
            <Star key={i} className="w-[18px] h-[18px] fill-current text-[#f59e0b]" />
          ))}
        </div>

        {/* Content text (1 size smaller) */}
        <p className="text-neutral-300 text-sm md:text-base leading-relaxed font-normal mb-8">
          "{testimonial.text}"
        </p>
      </div>

      {/* Author Info */}
      <div className="flex items-center gap-4 mt-auto relative z-10">
        <img
          src={testimonial.avatar}
          alt={testimonial.name}
          className="w-12 h-12 rounded-full object-cover border border-neutral-800"
          loading="lazy"
        />
        <div>
          <h4 className="text-white font-semibold text-sm md:text-base tracking-tight">
            {testimonial.name}
          </h4>
          <p className="text-neutral-400 text-xs md:text-sm">
            {testimonial.role}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
//  Main Section Component
// ─────────────────────────────────────────────────────
export default function Testimonials() {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      align: "center",
      loop: true,
    },
    [
      Autoplay({
        delay: 4000,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      }),
    ]
  );
  const [activeIndex, setActiveIndex] = useState(0);

  const onSelect = useCallback((api: any) => {
    setActiveIndex(api.selectedScrollSnap());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect(emblaApi);
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  return (
    <section
      id="testimonials"
      className="bg-[#09090b] text-white py-16 md:py-24 border-t border-[#111115] relative overflow-hidden"
    >
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[130px] pointer-events-none" />

      <div className="container max-w-7xl mx-auto px-5 relative z-10 flex flex-col items-center">
        {/* Badge */}
        <div className="px-6 py-2 rounded-full bg-[#292929] flex items-center justify-center gap-3 w-fit border-2 border-[#3f3f3f] mb-4">
          <div className="w-3 h-3 bg-[#3c3b3b] rounded-full" />
          <p className="text-foreground text-sm font-medium">Testimonials</p>
        </div>

        {/* Header Title */}
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight text-center mb-16">
          Trusted By Teams Who Think With AI
        </h2>

        {/* Carousel Container */}
        <div className="w-full relative px-0 sm:px-4">
          <div className="w-full overflow-hidden" ref={emblaRef}>
            <div className="flex -ml-4 md:-ml-6">
              {TESTIMONIALS.map((item, idx) => (
                <div
                  key={item.id}
                  className="pl-4 md:pl-6 min-w-0 shrink-0 grow-0 basis-full md:basis-1/2 lg:basis-1/3"
                >
                  <TestimonialCard testimonial={item} isMiddle={idx === activeIndex} />
                </div>
              ))}
            </div>
          </div>

          {/* Custom styled Next & Prev buttons */}
          <button
            onClick={scrollPrev}
            className="hidden md:flex items-center justify-center bg-purple-600 hover:bg-purple-500 hover:text-white text-white border-none h-12 w-12 rounded-full absolute -left-6 lg:-left-16 top-1/2 -translate-y-1/2 shadow-xl shadow-purple-900/30 transition-all duration-300 z-20 cursor-pointer"
            aria-label="Previous slide"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            onClick={scrollNext}
            className="hidden md:flex items-center justify-center bg-purple-600 hover:bg-purple-500 hover:text-white text-white border-none h-12 w-12 rounded-full absolute -right-6 lg:-right-16 top-1/2 -translate-y-1/2 shadow-xl shadow-purple-900/30 transition-all duration-300 z-20 cursor-pointer"
            aria-label="Next slide"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
