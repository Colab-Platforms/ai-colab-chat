"use client";
import { motion } from "framer-motion";
import { TestimonialsColumn } from "@/components/ui/testimonials-columns-1";

const testimonials = [
  {
    text: "This platform revolutionized our team's AI workflow - multi-model access and rolling context windows keep us sharp and productive.",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face",
    name: "Briana Patton",
    role: "Operations Manager",
  },
  {
    text: "Switching between GPT-4, Claude, and Gemini in a single chat is a game changer. The token wallet gives us full cost visibility.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face",
    name: "Bilal Ahmed",
    role: "IT Manager",
  },
  {
    text: "The support team is exceptional - they guided us through onboarding and keep the platform running flawlessly.",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face",
    name: "Saman Malik",
    role: "Customer Support Lead",
  },
  {
    text: "The collaborative chat sessions are incredibly useful. Our whole engineering team can see and build on the same AI context.",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=face",
    name: "Omar Raza",
    role: "CEO",
  },
  {
    text: "Rolling context windows mean I never lose the thread of a long research session. This is how AI assistants should work.",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop&crop=face",
    name: "Zainab Hussain",
    role: "Project Manager",
  },
  {
    text: "The clean interface and model flexibility have made this our go-to tool for every AI-driven task across the business.",
    image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&h=80&fit=crop&crop=face",
    name: "Aliza Khan",
    role: "Business Analyst",
  },
  {
    text: "Our content team's output doubled after we started using this platform. The multi-model approach covers every use case.",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face",
    name: "Farhan Siddiqui",
    role: "Marketing Director",
  },
  {
    text: "Having one place to manage AI spend across multiple models has simplified our budgeting process enormously.",
    image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=80&h=80&fit=crop&crop=face",
    name: "Sana Sheikh",
    role: "Sales Manager",
  },
  {
    text: "Seamless API integrations and real-time collaboration made this platform indispensable for our distributed team.",
    image: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=80&h=80&fit=crop&crop=face",
    name: "Hassan Ali",
    role: "E-commerce Manager",
  },
];

const firstColumn = testimonials.slice(0, 3);
const secondColumn = testimonials.slice(3, 6);
const thirdColumn = testimonials.slice(6, 9);

export const Testimonials = () => {
  return (
    <section id="testimonials" className="py-24 bg-[#e7e4eb] dark:bg-[#060104] relative">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true }}
          className="flex flex-col items-center justify-center max-w-4xl mx-auto mb-18"
        >
          <div className="flex justify-center">
            <span className="border border-landing-primary/50 dark:border-landing-primary/60 text-landing-primary dark:landing-primary bg-landing-primary/10 dark:bg-landing-primary/40 py-1 px-4 rounded-full text-xs font-medium tracking-wide">
              Real People. Real Results.
            </span>
          </div>

          <h2 className="text-4xl max-md:text-3xl font-bold text-landing-primary dark:text-landing-primary mt-5 text-center tracking-tight">
            Trusted by teams who{" "}
            <span className="text-landing-primary dark:text-landing-primary">think with AI</span>
          </h2>
          <p className="text-center mt-4 text-gray-600 dark:text-gray-400 max-w-3xl text-balance">
            From solo founders to enterprise teams - see why professionals across industries rely on our platform every day.
          </p>
        </motion.div>

        {/* Scrolling columns with top/bottom fade */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true }}
          className="flex justify-center gap-6 mt-10 max-h-[740px] overflow-hidden"
          style={{
            maskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)",
          }}
        >
          <TestimonialsColumn testimonials={firstColumn} duration={15} className="w-80 lg:w-96" />
          <TestimonialsColumn
            testimonials={secondColumn}
            className="hidden md:flex w-80 lg:w-96"
            duration={19}
          />
          <TestimonialsColumn
            testimonials={thirdColumn}
            className="hidden lg:flex w-80 lg:w-96"
            duration={17}
          />
        </motion.div>
      </div>
    </section>
  );
};
