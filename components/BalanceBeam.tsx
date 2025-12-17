import React from 'react';

interface BalanceBeamProps {
  tiltAngle: number;
}

export const BalanceBeam: React.FC<BalanceBeamProps> = ({ tiltAngle }) => {
  // Clamp visually to avoid looking broken
  const visualTilt = Math.max(-25, Math.min(25, tiltAngle));
  
  // Status text logic
  let statusText = "Balanced";
  let statusColor = "text-green-400"; // Light green for dark mode
  
  if (visualTilt > 0.5) {
    statusText = "Tipped Right";
    statusColor = "text-red-400"; // Light red for dark mode
  } else if (visualTilt < -0.5) {
    statusText = "Tipped Left";
    statusColor = "text-red-400";
  }

  return (
    <div className="absolute bottom-[100px] left-[10%] right-[10%] h-[60px] flex justify-center items-end z-10 pointer-events-none">
      {/* Pivot point (Triangle) */}
      <div 
        className="absolute bottom-[-55px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[30px] border-l-transparent border-r-[30px] border-r-transparent border-b-[50px] border-b-slate-600 drop-shadow-lg z-[9]"
      />
      
      {/* Pivot Circle */}
      <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-5 h-5 bg-slate-500 rounded-full z-[11] shadow-inner" />

      {/* The Beam */}
      <div 
        className="w-full h-4 bg-slate-300 rounded-full shadow-lg transition-transform duration-500 ease-out origin-center"
        style={{ transform: `rotate(${visualTilt}deg)` }}
      />

      {/* Status Label */}
      <div className="absolute bottom-[-90px] left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-xl border border-slate-700">
        <span className={`text-xl font-bold ${statusColor} transition-colors duration-300`}>
          {statusText}
        </span>
      </div>
    </div>
  );
};