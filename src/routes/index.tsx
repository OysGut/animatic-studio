import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Animatic Studio" },
      {
        name: "description",
        content: "Animatic Studio – lag animatics og storyboards.",
      },
      { property: "og:title", content: "Animatic Studio" },
      {
        property: "og:description",
        content: "Animatic Studio – lag animatics og storyboards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <h1 className="text-5xl font-bold tracking-tight text-foreground">
        Animatic Studio
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Vi setter i gang snart.
      </p>
    </div>
  );
}
