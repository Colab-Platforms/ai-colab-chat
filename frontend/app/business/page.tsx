import { BusinessFrame } from "@/components/business/business-frame";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({
  title: "Colab Platforms AI for Business",
  description:
    "Give your team the world’s best AI in one simple workspace. Write, research and create faster, with one login and one bill.",
  path: "/business",
});

export default function BusinessPage() {
  return (
    <>
      <header className="sr-only">
        <h1>Every top AI model, one workspace for your whole team</h1>
        <p>
          Give your team the world’s best AI in one simple workspace. Write,
          research and create faster, with one login and one bill.
        </p>
      </header>
      <BusinessFrame />
    </>
  );
}
