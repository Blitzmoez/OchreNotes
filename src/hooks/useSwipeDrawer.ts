import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

export interface UseSwipeDrawerOptions {
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  direction?: 'left';
  /** Width of the left-edge drawer in px (e.g. 288 or 300) */
  width?: number;
  /** Left-edge activation zone when closed in px */
  edgeZonePx?: number;
  /** Alias for edgeZonePx */
  edgeThreshold?: number;
  /** Optional guard returning false if swipe should not begin at target/event */
  canStart?: (e: TouchEvent | React.TouchEvent) => boolean;
  /** Attach global window touch listeners automatically (ideal for left-edge drawers across modules) */
  globalWindow?: boolean;
  /** Disable hook behavior (e.g. desktop viewports) */
  disabled?: boolean;
  /** Inverse alias for disabled */
  enabled?: boolean;
}

interface SwipeSession {
  startX: number;
  startY: number;
  wasOpen: boolean;
  lockedAxis: 'x' | 'y' | null;
  lastX: number;
  lastMoveTs: number;
  prevSampleX: number;
  prevSampleTs: number;
  vx: number; // px / ms
  hapticFired: boolean;
  maxAbsDx: number;
}

function triggerSubtleHaptic(ms = 10) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore on unsupported browsers
  }
}

export function useSwipeDrawer({
  isOpen: controlledIsOpen,
  defaultOpen = false,
  onOpen,
  onClose,
  width = 296,
  edgeZonePx,
  edgeThreshold,
  canStart,
  globalWindow = false,
  disabled,
  enabled,
}: UseSwipeDrawerOptions = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const effectiveEdgeZonePx = edgeZonePx ?? edgeThreshold ?? 42;
  const effectiveDisabled = disabled ?? (enabled !== undefined ? !enabled : false);

  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const sessionRef = useRef<SwipeSession | null>(null);
  const dragOffsetRef = useRef<number | null>(null);

  const open = useCallback(() => {
    if (controlledIsOpen === undefined) setInternalIsOpen(true);
    onOpen?.();
  }, [controlledIsOpen, onOpen]);

  const close = useCallback(() => {
    if (controlledIsOpen === undefined) setInternalIsOpen(false);
    onClose?.();
  }, [controlledIsOpen, onClose]);

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const onOpenRef = useRef(open);
  onOpenRef.current = open;
  const onCloseRef = useRef(close);
  onCloseRef.current = close;
  const canStartRef = useRef(canStart);
  canStartRef.current = canStart;

  const toggle = useCallback(() => {
    if (isOpenRef.current) {
      onCloseRef.current();
    } else {
      onOpenRef.current();
    }
  }, []);

  const setOffset = useCallback((val: number | null) => {
    dragOffsetRef.current = val;
    setDragOffset(val);
  }, []);

  const handleTouchStartRaw = useCallback(
    (e: TouchEvent | React.TouchEvent) => {
      if (effectiveDisabled) return;
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-no-swipe]')) return;
      if (!isOpenRef.current) {
        if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      }
      if (canStartRef.current && !canStartRef.current(e)) return;

      const t = e.touches[0];
      if (!isOpenRef.current && t.clientX > effectiveEdgeZonePx) return;

      const now = performance.now();
      sessionRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        wasOpen: isOpenRef.current,
        lockedAxis: null,
        lastX: t.clientX,
        lastMoveTs: now,
        prevSampleX: t.clientX,
        prevSampleTs: now,
        vx: 0,
        hapticFired: false,
        maxAbsDx: 0,
      };
    },
    [effectiveDisabled, effectiveEdgeZonePx]
  );

  const handleTouchMoveRaw = useCallback(
    (e: TouchEvent | React.TouchEvent) => {
      const s = sessionRef.current;
      if (!s || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;
      s.maxAbsDx = Math.max(s.maxAbsDx, Math.abs(dx));

      if (!s.lockedAxis) {
        if (Math.abs(dy) > Math.abs(dx) + 8 && Math.abs(dy) > 10) {
          sessionRef.current = null;
          setOffset(null);
          return;
        }
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) + 2) {
          if (!s.wasOpen && dx < 0) {
            sessionRef.current = null;
            return;
          }
          if (s.wasOpen && dx > 12) {
            sessionRef.current = null;
            return;
          }
          s.lockedAxis = 'x';
        } else {
          return;
        }
      }

      const now = performance.now();
      const dt = Math.max(4, now - s.prevSampleTs);
      const instantVx = (t.clientX - s.prevSampleX) / dt;
      s.vx = s.vx * 0.45 + instantVx * 0.55;
      if (now - s.lastMoveTs > 16) {
        s.prevSampleX = s.lastX;
        s.prevSampleTs = s.lastMoveTs;
      }
      s.lastX = t.clientX;
      s.lastMoveTs = now;

      let nextOffset: number;
      if (s.wasOpen) {
        nextOffset = Math.max(-width, Math.min(0, dx));
      } else {
        nextOffset = Math.max(-width, Math.min(0, -width + Math.max(0, dx)));
      }

      // Subtle detent haptic when crossing midpoint
      const progress = 1 + nextOffset / width; // 0 = closed, 1 = open
      if (!s.hapticFired && ((s.wasOpen && progress < 0.65) || (!s.wasOpen && progress > 0.35))) {
        s.hapticFired = true;
        triggerSubtleHaptic(10);
      }

      setOffset(nextOffset);
    },
    [setOffset, width]
  );

  const handleTouchEndRaw = useCallback(() => {
    const s = sessionRef.current;
    sessionRef.current = null;
    if (!s) {
      setOffset(null);
      return;
    }

    const offset = dragOffsetRef.current;
    setOffset(null);
    if (offset === null || s.lockedAxis !== 'x') return;

    const now = performance.now();
    const idleMs = now - s.lastMoveTs;
    const progress = 1 + offset / width; // 0 = fully closed, 1 = fully open
    const isMovingRightFling = s.vx >= 0.28 && idleMs < 130 && s.maxAbsDx >= 16;
    const isMovingLeftFling = s.vx <= -0.28 && idleMs < 130 && s.maxAbsDx >= 16;

    // If finger stopped / paused without reaching strong open commit -> disappear/close
    const stoppedWithoutMovement = idleMs >= 135 || Math.abs(s.vx) < 0.06;

    let shouldOpen: boolean;
    if (isMovingRightFling) {
      shouldOpen = true;
    } else if (isMovingLeftFling) {
      shouldOpen = false;
    } else if (stoppedWithoutMovement) {
      // Stopped midway -> closes cleanly ("wieder verschwinden") unless pulled practically all the way
      shouldOpen = s.wasOpen ? progress > 0.86 : progress > 0.72;
    } else {
      shouldOpen = s.wasOpen ? progress > 0.62 : progress > 0.42;
    }

    if (shouldOpen !== s.wasOpen) {
      triggerSubtleHaptic(12);
    }

    if (shouldOpen) {
      onOpenRef.current();
    } else {
      onCloseRef.current();
    }
  }, [setOffset, width]);

  useEffect(() => {
    if (!globalWindow || effectiveDisabled) return;
    window.addEventListener('touchstart', handleTouchStartRaw, { passive: true });
    window.addEventListener('touchmove', handleTouchMoveRaw, { passive: true });
    window.addEventListener('touchend', handleTouchEndRaw, { passive: true });
    window.addEventListener('touchcancel', handleTouchEndRaw, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStartRaw);
      window.removeEventListener('touchmove', handleTouchMoveRaw);
      window.removeEventListener('touchend', handleTouchEndRaw);
      window.removeEventListener('touchcancel', handleTouchEndRaw);
    };
  }, [globalWindow, effectiveDisabled, handleTouchStartRaw, handleTouchMoveRaw, handleTouchEndRaw]);

  return {
    isOpen,
    open,
    close,
    toggle,
    dragOffset,
    isDragging: dragOffset !== null,
    triggerHaptic: triggerSubtleHaptic,
    bind: globalWindow
      ? {}
      : {
          onTouchStart: handleTouchStartRaw,
          onTouchMove: handleTouchMoveRaw,
          onTouchEnd: handleTouchEndRaw,
          onTouchCancel: handleTouchEndRaw,
        },
  };
}
