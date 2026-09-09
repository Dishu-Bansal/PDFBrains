import { Catalog } from "../components/Catalog";
import { Footer } from "../components/Footer";
import { Hero } from "../components/Hero";
import { Nav } from "../components/Nav";
import { PrivacyStrip } from "../components/PrivacyStrip";
import { Seo } from "../components/Seo";
import { Workspace } from "../components/Workspace";
import { HOME_SEO } from "../lib/seo";

export function Home() {
  return (
    <>
      <Seo {...HOME_SEO} />
      <Nav />
      <main>
        <Hero />
        <PrivacyStrip />
        <Catalog />
        <Workspace />
      </main>
      <Footer />
    </>
  );
}
