import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Draft and archived library images are private: the media route only serves them with the editor's bearer token,
 * which a plain <img> cannot send. This fetches them with the session and shows a local object URL.
 */
export default function AuthedImage({ src, isPublic, alt, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string; isPublic: boolean }) {
  const [url, setUrl] = useState<string | null>(isPublic ? src : null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (isPublic) {
      setUrl(src);
      return;
    }
    let revoked = false;
    let objectUrl = '';
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return setFailed(true);
      const res = await fetch(src, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (!res?.ok) return setFailed(true);
      objectUrl = URL.createObjectURL(await res.blob());
      if (!revoked) setUrl(objectUrl);
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, isPublic]);
  if (failed || !url)
    return (
      <span className={`flex items-center justify-center bg-muted text-muted-foreground ${rest.className ?? ''}`} role="img" aria-label={alt}>
        <ImageOff size={24} aria-hidden="true" />
      </span>
    );
  return <img src={url} alt={alt} {...rest} onError={() => setFailed(true)} />;
}
