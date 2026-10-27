import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useDemoNotice(duration = 3000) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const showNotice = useCallback(
    (nextMessage: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setMessage(nextMessage);
      AccessibilityInfo.announceForAccessibility(nextMessage);
      timeoutRef.current = setTimeout(() => setMessage(null), duration);
    },
    [duration],
  );

  return { message, showNotice };
}
