import { Suspense } from "react";
import { NewLandingPage } from "@/components/NewLanding/NewLandingPage";
import { HomeSessionRedirect } from "@/components/home/home-session-redirect";
import { HomeJsonLd } from "@/components/seo/home-json-ld";
import {
  HOME_DESCRIPTION,
  HOME_SESSION_REDIRECT_SCRIPT,
  HOME_TITLE,
  publicMetadata,
} from "@/lib/seo";

export const metadata = publicMetadata({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: "/",
});

export default function HomePage() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: HOME_SESSION_REDIRECT_SCRIPT }}
      />
      <Suspense fallback={null}>
        <HomeSessionRedirect />
      </Suspense>
      <main>
        <NewLandingPage />
      </main>
      <HomeJsonLd />
    </>
  );
}
