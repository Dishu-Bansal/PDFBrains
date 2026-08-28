import { Catalog } from "../components/Catalog";
import { Footer } from "../components/Footer";
import { Hero } from "../components/Hero";
import { Nav } from "../components/Nav";
import { PrivacyStrip } from "../components/PrivacyStrip";
import { Workspace } from "../components/Workspace";

export function Home() {
  return (
    <>
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
