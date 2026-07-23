'use client';

import React, { useRef, useState, useEffect } from 'react';
import gameBridge from '../game/systems/GameBridge';

interface JoystickProps {
  type: 'left' | 'right';
  label: string;
}

export default function Joystick({ type, label }: JoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const touchIdRef = useRef<number | null>(null);

  const handleStart = (clientX: number, clientY: number, touchId: number | null = null) => {
    if (!containerRef.current) return;
    setIsActive(true);
    touchIdRef.current = touchId;
    updatePosition(clientX, clientY);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isActive) return;
    updatePosition(clientX, clientY);
  };

  const handleEnd = () => {
    setIsActive(false);
    touchIdRef.current = null;
    setStickPos({ x: 0, y: 0 });
    
    // Send zero vector when touch ends
    gameBridge.emit(`joystick_${type}`, { x: 0, y: 0 });
  };

  const updatePosition = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Distance from center
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const maxRadius = rect.width / 2;

    // Normalize and clamp to boundary
    if (distance > maxRadius) {
      dx = (dx / distance) * maxRadius;
      dy = (dy / distance) * maxRadius;
    }

    setStickPos({ x: dx, y: dy });

    // Emit normalized vector to Phaser (-1.0 to 1.0)
    const normX = dx / maxRadius;
    const normY = dy / maxRadius;
    gameBridge.emit(`joystick_${type}`, { x: normX, y: normY });
  };

  // Touch handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (isActive) return;
    const touch = e.changedTouches[0];
    handleStart(touch.clientX, touch.clientY, touch.identifier);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isActive) return;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === touchIdRef.current) {
        handleMove(e.touches[i].clientX, e.touches[i].clientY);
        break;
      }
    }
  };

  // Mouse handlers (for desktop testing)
  const onMouseDown = (e: React.MouseEvent) => {
    handleStart(e.clientX, e.clientY);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isActive && touchIdRef.current === null) {
        handleMove(e.clientX, e.clientY);
      }
    };

    const onMouseUp = () => {
      if (isActive && touchIdRef.current === null) {
        handleEnd();
      }
    };

    if (isActive) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={handleEnd}
      onMouseDown={onMouseDown}
      className="relative flex items-center justify-center w-28 h-28 rounded-full border-2 border-zinc-700 bg-black/40 backdrop-blur-md cursor-pointer touch-none select-none active:border-purple-500 transition-colors duration-200"
    >
      {/* Label */}
      <span className="absolute -top-6 text-[10px] tracking-wider text-zinc-500 font-bold uppercase select-none">
        {label}
      </span>
      
      {/* Inner Stick knob */}
      <div
        className="w-12 h-12 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 border border-zinc-500 shadow-md shadow-black/50 pointer-events-none transition-all duration-75"
        style={{
          transform: `translate(${stickPos.x}px, ${stickPos.y}px)`,
        }}
      />
    </div>
  );
}
