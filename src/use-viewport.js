import { useEffect, useState } from 'react';

export function useViewport() {
  const [size, setSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSize({ width: window.innerWidth, height: window.innerHeight }));
    };
    window.addEventListener('resize', update, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
    };
  }, []);

  return {
    width: size.width,
    height: size.height,
    isMobile: size.width < 768,
    isTablet: size.width >= 768 && size.width < 1100,
    isDesktop: size.width >= 1100
  };
}
