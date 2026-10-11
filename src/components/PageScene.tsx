import sceneManifest from "@/content/page-scenes.json";
import "@/page-scenes.css";

type Scene = { background: string; body: string; bodyWidth?: number; bodyHeight?: number; photographicBody?: boolean };
const scenes: Record<string, Scene> = sceneManifest;

export function getPageScene(key: string) {
  return scenes[key];
}

export default function PageScene({ pageKey, kind = "body", alt = "", backdrop = false }: { pageKey: string; kind?: "background" | "body"; alt?: string; backdrop?: boolean }) {
  const scene = getPageScene(pageKey);
  if (!scene) return null;
  const photographic = kind === "body" && scene.photographicBody && !backdrop;
  return <div className={`page-scene page-scene-${backdrop ? "background page-scene-content-background" : kind}${photographic ? " page-scene-photographic" : ""}`} aria-hidden={kind === "background" || backdrop ? true : undefined}>
    <img src={scene[kind]} alt={kind === "background" || backdrop ? "" : alt} loading={kind === "background" ? "eager" : "lazy"} decoding="async" width={kind === "body" ? scene.bodyWidth ?? 1536 : 1536} height={kind === "body" ? scene.bodyHeight ?? 864 : 864} />
  </div>;
}