import sceneManifest from "@/content/page-scenes.json";
import "@/page-scenes.css";

type Scene = { background: string; body: string };
const scenes: Record<string, Scene> = sceneManifest;

export function getPageScene(key: string) {
  return scenes[key];
}

export default function PageScene({ pageKey, kind = "body", alt = "" }: { pageKey: string; kind?: "background" | "body"; alt?: string }) {
  const scene = getPageScene(pageKey);
  if (!scene) return null;
  return <div className={`page-scene page-scene-${kind}`} aria-hidden={kind === "background" ? true : undefined}>
    <img src={scene[kind]} alt={kind === "background" ? "" : alt} loading={kind === "background" ? "eager" : "lazy"} decoding="async" width={1536} height={864} />
  </div>;
}