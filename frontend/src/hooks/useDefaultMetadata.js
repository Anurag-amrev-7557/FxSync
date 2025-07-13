import { useState, useEffect } from 'react';
import metadataCache from '../utils/metadataCache';

export function useDefaultMetadata() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadDefaultMetadata = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get the backend URL
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        
        // Fetch all available tracks
        const response = await fetch(`${backendUrl}/audio/all-tracks`);
        if (!response.ok) {
          throw new Error('Failed to fetch tracks');
        }
        
        const tracks = await response.json();
        
        // Preload metadata for all tracks
        const trackUrls = tracks.map(track => track.url).filter(Boolean);
        await metadataCache.preloadMetadata(trackUrls);
        
        setIsLoading(false);
      } catch (err) {
        setError(err.message);
        setIsLoading(false);
      }
    };

    loadDefaultMetadata();
  }, []);

  return { isLoading, error };
} 