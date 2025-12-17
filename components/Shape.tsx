
import React from 'react';
import { ShapeData } from '../types.ts';

interface ShapeProps {
  shape: ShapeData;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent, shape: ShapeData) => void;
}

export const Shape: React.FC<ShapeProps> = ({ shape, isSelected, onMouseDown }) => {
  const borderStyle = shape.isChallengeShape ? '2px dashed rgba(255,255,255,0.4)' : isSelected ? '2px solid white' : 'none';
  const zIndex = isSelected ? 50 : 20;

  return (
    <div
      className="absolute cursor-grab active:cursor-grabbing hover:brightness-110 transition-all shadow-md"
      onMouseDown={(e) => onMouseDown(e, shape)}
      style={{
        left: shape.x,
        top: shape.y,
        width: shape.width,
        height: shape.height,
        backgroundColor: shape.color,
        zIndex: zIndex,
        border: borderStyle,
        filter: `saturate(${shape.saturation}) drop-shadow(0 4px 6px rgba(0,0,0,0.4))`,
        borderRadius: '4px',
        transform: isSelected ? 'scale(1.02)' : 'scale(1)',
      }}
    />
  );
};
