import { NewLandingPage } from "@/components/NewLanding/NewLandingPage";
import { noindexMetadata, SITE_URL } from "@/lib/seo";

/** Duplicate of the homepage. Kept reachable, but not a second indexable URL. */
export const metadata = {
  ...noindexMetadata,
  alternates: { canonical: `${SITE_URL}/` },
};

export default function NewLandingRoute() {
  return <NewLandingPage />;
}