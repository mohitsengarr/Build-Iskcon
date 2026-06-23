import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Route, Switch } from "wouter";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import HowToBuildTemple from "@/pages/how-to-build-temple";
import KrishnaJanmabhoomi from "@/pages/krishna-janmabhoomi";
import Bhagwatham from "@/pages/bhagwatham";
import Chaitanya from "@/pages/chaitanya";
import Gita from "@/pages/gita";
import Library from "@/pages/library";
import JapaCounter from "@/pages/japa-counter";
import PersonaGallery from "@/pages/persona-gallery";
import Admin from "@/pages/admin";
import Gallery from "@/pages/gallery";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import PageNotFound from "@/pages/page-not-found";

const queryClient = new QueryClient();

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Switch>
            <Route path="/how-to-build-temple" component={HowToBuildTemple} />
            <Route path="/krishna-janmabhoomi" component={KrishnaJanmabhoomi} />
            <Route path="/bhagwatham" component={Bhagwatham} />
            <Route path="/chaitanya" component={Chaitanya} />
            <Route path="/gita" component={Gita} />
            <Route path="/library" component={Library} />
            <Route path="/admin" component={Admin} />
            <Route path="/japa" component={JapaCounter} />
            <Route path="/personas" component={PersonaGallery} />
            <Route path="/gallery" component={Gallery} />
            {/* /bhaktigram — the BuildIskcon devotional feed (was /instagram).
                Gallery reads useLocation() and sets filterType="instagram"
                when the path matches. The internal filterType value stays
                "instagram" so existing data + filters don't churn. */}
            <Route path="/bhaktigram" component={Gallery} />
            {/* /bhaktigram/profile — Instagram-style profile page for the
                bhaktigram channel: header + stats + grid of all approved posts. */}
            <Route path="/bhaktigram/profile" component={Gallery} />
            {/* Footer links to these — without routes they rendered blank. */}
            <Route path="/privacy" component={Privacy} />
            <Route path="/terms" component={Terms} />
            <Route path="/" component={Home} />
            {/* Catch-all 404 — a pathless <Route> always matches, and inside
                <Switch> it only renders when nothing above did. */}
            <Route component={PageNotFound} />
          </Switch>
          <Toaster />
          <Analytics />
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
